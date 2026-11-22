import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MemoryRateLimitStore, type RateLimitStore } from './store.js';
import { networkKey, siteKey } from '../net/network-key.js';

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  /**
   * 'ip' always keys by client address (pre-auth routes such as login, where there is no user yet); 'user-or-ip', the
   * default, keys by user when signed in, so users behind shared addresses are limited individually.
   */
  per?: 'ip' | 'user-or-ip';
  /**
   * An address is counted by its IPv6 /56 (net/network-key.ts `siteKey`) rather than its /64: for sign-ups and routes
   * that send email, where one customer's block of /64s must not be 256 budgets.
   */
  wideNetwork?: boolean;
  /**
   * What happens while the shared store cannot be reached. 'allow', the default, lets requests through so an outage
   * does not take the API down; 'local' counts in this process instead, for sign-in, sign-up and routes that send
   * email or texts, where letting everything through is what an attacker would wait for.
   */
  onStoreDown?: 'allow' | 'local';
}

export const DEFAULT_RATE_LIMIT: Required<Omit<RateLimitOptions, 'wideNetwork' | 'onStoreDown'>> = {
  max: 100,
  windowMs: 60_000,
  per: 'user-or-ip',
};

const EXEMPT_ROUTES = new Set(['/health', '/metrics']);

/**
 * The one budget every address no route answers shares. Keyed by the address itself, each made-up path had a budget
 * of its own, so a stream of them was never limited and left a counter behind for each.
 */
const NO_ROUTE = '(no route)';

/**
 * An address is limited by its network (net/network-key.ts): itself for IPv4, its /64 for IPv6 (its /56 where the route
 * asks), so moving within one gives no fresh budget. `req.ip` is the client as net/client-ip.ts resolved it.
 */
function limitKey(req: FastifyRequest, route: string, opts: RateLimitOptions): string {
  const network = opts.wideNetwork ? siteKey(req.ip) : networkKey(req.ip);
  const principal = opts.per === 'user-or-ip' && req.user?.id ? `user:${req.user.id}` : `ip:${network ?? req.ip}`;
  // Reads and writes at the same address have separate budgets, so reloading a correspondence never uses up the few
  // replies a minute writing to it allows.
  return `ratelimit:${req.method}:${route}:${principal}`;
}

export interface RateLimitHooks {
  /** told of each refusal, without waiting on it (the security log's `request.rate_limited`) */
  onLimited?: (req: FastifyRequest, limit: { max: number; windowSec: number; per: 'ip' | 'user-or-ip' }) => Promise<void> | void;
  /** where 'local' routes count while the shared store is down; one per process by default */
  fallback?: RateLimitStore;
}

/**
 * Sliding-window rate limiting: 100 requests a minute per user by default; routes override it with
 * `{ config: { rateLimit: { max, windowMs, per, wideNetwork, onStoreDown } } }`. Exceeding answers the standard envelope
 * with 429 and Retry-After.
 */
export function setupRateLimit(app: FastifyInstance, store: RateLimitStore, hooks: RateLimitHooks = {}): void {
  const fallback = hooks.fallback ?? new MemoryRateLimitStore();
  app.addHook('onRequest', async (req, reply) => {
    const route = req.routeOptions?.url ?? NO_ROUTE;
    if (EXEMPT_ROUTES.has(route)) return;

    const override = (req.routeOptions?.config as { rateLimit?: RateLimitOptions } | undefined)
      ?.rateLimit;
    const opts = { ...DEFAULT_RATE_LIMIT, ...override };

    const now = Date.now();
    const key = limitKey(req, route, opts);
    let result;
    try {
      result = await store.hit(key, opts.windowMs, now, opts.max);
    } catch (err) {
      if (opts.onStoreDown !== 'local') {
        // limiter outage must not take the API down — log and let through
        req.log.warn({ err }, 'rate limit store failed; allowing request');
        return;
      }
      req.log.warn({ err }, 'rate limit store failed; counting this request in this process');
      result = await fallback.hit(key, opts.windowMs, now, opts.max);
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
