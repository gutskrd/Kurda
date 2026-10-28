import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { ROUTE_NOT_FOUND_MESSAGE, isScannerProbe } from '@kurda/shared';
import { networkHashOf } from '../net/network-key.js';

/** How many probes from one network, within the window, shut it out. */
export const SHIELD = { windowSeconds: 10 * 60, probes: 20, blockSeconds: 60 * 60 } as const;

const EXEMPT = new Set(['/health', '/metrics']);

/**
 * What somebody already signed in does to stay signed in, which carries no
 * session of its own: renewing the access token with the refresh token, and
 * signing out. The block is for strangers on a network that has been probing;
 * whoever is signed in on it (a school, a carrier's shared address) is meant
 * to carry on, and without these they were signed out the next time their
 * fifteen minutes ran out, for the rest of the hour. Each still has its own
 * rate limit, and a refresh token is the credential either way.
 */
const SESSION_KEEPING = new Set(['/auth/refresh', '/auth/logout']);

/** Where the counts are kept: Redis when there is one, so every instance sees them, else this process's memory. */
interface ShieldStore {
  /** count one probe; how many there have been in the window */
  probe(network: string): Promise<number>;
  block(network: string): Promise<void>;
  /** seconds left of a block, or 0 */
  blockedFor(network: string): Promise<number>;
}

function redisStore(redis: Redis): ShieldStore {
  return {
    async probe(network) {
      const key = `shield:probes:${network}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, SHIELD.windowSeconds);
      return n;
    },
    async block(network) {
      await redis.set(`shield:block:${network}`, '1', 'EX', SHIELD.blockSeconds);
    },
    async blockedFor(network) {
      return Math.max(0, await redis.ttl(`shield:block:${network}`));
    },
  };
}

function memoryStore(): ShieldStore {
  const probes = new Map<string, { n: number; until: number }>();
  const blocks = new Map<string, number>();
  const sweep = (now: number): void => {
    if (probes.size + blocks.size < 10_000) return;
    for (const [k, v] of probes) if (v.until <= now) probes.delete(k);
    for (const [k, until] of blocks) if (until <= now) blocks.delete(k);
  };
  return {
    async probe(network) {
      const now = Date.now();
      sweep(now);
      const was = probes.get(network);
      const next = was && was.until > now ? { n: was.n + 1, until: was.until } : { n: 1, until: now + SHIELD.windowSeconds * 1000 };
      probes.set(network, next);
      return next.n;
    },
    async block(network) {
      blocks.set(network, Date.now() + SHIELD.blockSeconds * 1000);
    },
    async blockedFor(network) {
      const until = blocks.get(network);
      return until && until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
    },
  };
}

/**
 * The scanner shield, the API's answer to the bots that try every server for
 * PHP scripts, WordPress pages and secrets files (@kurda/shared
 * scanner-paths.ts).
 *
 * - A probe is answered "not found" before anything else runs: no route, no
 *   session lookup, no database. It goes in the security log, once an hour per
 *   network.
 * - A network that sends SHIELD.probes of them within SHIELD.windowSeconds is
 *   shut out for SHIELD.blockSeconds, for every request made without a session:
 *   someone already signed in on the same network (a school, a carrier's
 *   shared address) carries on, and anyone else is told to try later. The
 *   block goes in the security log as a warning.
 *
 * Installed after the session is read and before the rate limiter, so a
 * blocked scanner spends nothing of anyone's limits.
 */
export function installScannerShield(app: FastifyInstance, options: { redis?: Redis } = {}): void {
  const store = options.redis ? redisStore(options.redis) : memoryStore();
  const fallback = memoryStore();
  // a store that cannot be reached must not stop the API: this process's memory stands in
  const safely = async <T>(op: (s: ShieldStore) => Promise<T>): Promise<T> => {
    try {
      return await op(store);
    } catch {
      return op(fallback);
    }
  };

  app.addHook('onRequest', async (req, reply) => {
    const at = req.url.indexOf('?');
    const path = at === -1 ? req.url : req.url.slice(0, at);
    if (EXEMPT.has(path)) return;
    const network = networkHashOf(req.ip);

    if (isScannerProbe(path, at === -1 ? '' : req.url.slice(at))) {
      void app.securityLog.record('request.probe', { details: { path: path.slice(0, 120), method: req.method } });
      if (network) {
        const count = await safely((s) => s.probe(network));
        if (count === SHIELD.probes) {
          await safely((s) => s.block(network));
          void app.securityLog.record('network.scanner_blocked', {
            details: { probes: count, withinMinutes: SHIELD.windowSeconds / 60, blockedMinutes: SHIELD.blockSeconds / 60 },
          });
        }
      }
      return reply.code(404).send({ code: 'NOT_FOUND', message: ROUTE_NOT_FOUND_MESSAGE, requestId: req.id });
    }

    if (req.user || !network || SESSION_KEEPING.has(path)) return;
    const seconds = await safely((s) => s.blockedFor(network));
    if (seconds > 0) {
      return reply
        .code(403)
        .header('retry-after', String(seconds))
        .send({ code: 'NETWORK_BLOCKED', message: 'too many suspicious requests came from this network; try again later', requestId: req.id });
    }
  });
}
