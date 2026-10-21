import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RateLimitStore } from './store.js';
import { networkKey } from '../net/network-key.js';

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  /**
   * 'ip' — always key by client IP (pre-auth routes like login, where the
   *        attacker has no user identity yet)
   * 'user-or-ip' (default) — key by userId when authenticated, else IP.
   *        Users behind shared IPs (schools, mobile carriers) are limited
   *        individually, not collectively.
   */
  per?: 'ip' | 'user-or-ip';
}

export const DEFAULT_RATE_LIMIT: Required<RateLimitOptions> = {
  max: 100,
  windowMs: 60_000,
  per: 'user-or-ip',
};

const EXEMPT_ROUTES = new Set(['/health', '/metrics']);

/**
 * An address is limited by its network (net/network-key.ts): the address itself
 * for IPv4, the /64 for IPv6, so a caller cannot get a fresh budget by moving to
 * another address in its own /64. `req.ip` is the client as net/client-ip.ts
 * resolved it, not the proxy in front.
 */
function limitKey(req: FastifyRequest, route: string, per: 'ip' | 'user-or-ip'): string {
  const principal =
    per === 'user-or-ip' && req.user?.id ? `user:${req.user.id}` : `ip:${networkKey(req.ip) ?? req.ip}`;
  return `ratelimit:${route}:${principal}`;
}

/**
 * Sliding-window rate limiting (KUR-010). Global default of
 * 100 req/min/user; routes override via
 *   { config: { rateLimit: { max, windowMs, per } } }
 * Exceeding returns the standard envelope with 429 + Retry-After.
 */
export function setupRateLimit(app: FastifyInstance, store: RateLimitStore): void {
  app.addHook('onRequest', async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url;
    if (EXEMPT_ROUTES.has(route)) return;

    const override = (req.routeOptions?.config as { rateLimit?: RateLimitOptions } | undefined)
      ?.rateLimit;
    const opts = { ...DEFAULT_RATE_LIMIT, ...override };

    const now = Date.now();
    let result;
    try {
      result = await store.hit(limitKey(req, route, opts.per), opts.windowMs, now);
    } catch (err) {
      // limiter outage must not take the API down — log and let through
      req.log.warn({ err }, 'rate limit store failed; allowing request');
      return;
    }

    if (result.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((result.oldestMs + opts.windowMs - now) / 1_000));
      return reply
        .code(429)
        .header('retry-after', String(retryAfterSec))
        .send({
          code: 'RATE_LIMITED',
          message: 'too many requests',
          requestId: req.id,
        });
    }
  });
}
