import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RateLimitStore } from './store.js';
import { networkKey } from '../net/network-key.js';

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  /**
   * 'ip' always keys by client address (pre-auth routes such as login, where there is no user yet); 'user-or-ip', the
   * default, keys by user when signed in, so users behind shared addresses are limited individually.
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
 * An address is limited by its network (net/network-key.ts): itself for IPv4, its /64 for IPv6, so moving within a
 * /64 gives no fresh budget. `req.ip` is the client as net/client-ip.ts resolved it.
 */
function limitKey(req: FastifyRequest, route: string, per: 'ip' | 'user-or-ip'): string {
  const principal =
    per === 'user-or-ip' && req.user?.id ? `user:${req.user.id}` : `ip:${networkKey(req.ip) ?? req.ip}`;
  // Reads and writes at the same address have separate budgets, so reloading a correspondence never uses up the few
  // replies a minute writing to it allows.
  return `ratelimit:${req.method}:${route}:${principal}`;
}

export interface RateLimitHooks {
  /** told of each refusal, without waiting on it (the security log's `request.rate_limited`) */
  onLimited?: (req: FastifyRequest, limit: { max: number; windowSec: number; per: 'ip' | 'user-or-ip' }) => Promise<void> | void;
}

/**
 * Sliding-window rate limiting: 100 requests a minute per user by default; routes override it with
 * `{ config: { rateLimit: { max, windowMs, per } } }`. Exceeding answers the standard envelope with 429 and Retry-After.
 */
export function setupRateLimit(app: FastifyInstance, store: RateLimitStore, hooks: RateLimitHooks = {}): void {
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
      void hooks.onLimited?.(req, { max: opts.max, windowSec: Math.round(opts.windowMs / 1_000), per: opts.per });
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
