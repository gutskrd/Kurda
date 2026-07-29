# Redis HA + cache stampede protection (KUR-116)

## High availability / failover
- **Managed HA or Sentinel** provides a primary with automatic failover. Point
  `REDIS_URL` at the managed endpoint (or configure ioredis with `sentinels` +
  `name` for self-hosted Sentinel).
- `createRedis` (`api/src/cache/redis.ts`) reconnects transparently:
  - `retryStrategy` backs off and keeps retrying after a drop.
  - `reconnectOnError` forces a reconnect on a `READONLY` error — the signature
    of talking to a demoted old primary after failover — so the client
    re-resolves and follows the promoted node without app restarts.
  - `enableOfflineQueue: false` + `maxRetriesPerRequest: 1` keep the app fast
    while a node is down: the `Cache` layer treats every failure as a miss
    (graceful degradation, KUR-006), so requests fall through to the origin
    rather than hanging.
- **Chaos test**: kill the primary under load and assert error rate stays within
  budget and recovers on promotion (runbook lives with the load-testing suite,
  KUR-118).

## Stampede protection
When a hot key (shop catalog, active events, leaderboards) expires, a naive
cache lets every concurrent request miss and hammer the origin at once. Two
independent defenses, both in `api/src/cache/`:

1. **In-process single-flight** — `Cache.withCache` collapses concurrent misses
   of the same key on one node into a **single** origin computation; the rest
   await that promise. (`cache.ts`)
2. **TTL jitter (global)** — every `Cache.set` applies ±10% random jitter
   (`applyJitter`) so keys written together don't expire in lockstep.
3. **Probabilistic early recompute (XFetch)** — `shouldEarlyRecompute` lets a
   request refresh a still-valid hot key slightly early, with probability rising
   as expiry nears, so one request refreshes *ahead* of the herd. Available for
   callers that track a value's build cost. (`stampede.ts`)

Single-flight handles the per-node herd; jitter + XFetch handle the
cross-node/at-expiry herd.

## Edge case — failover during a live game
Live game state must **not** depend solely on cache. Game state is snapshotted in
the realtime KV / state store (KUR-051), so a cache/Redis failover mid-game
recovers from the snapshot rather than losing the match. Treat cache purely as an
acceleration layer for game state, never the source of truth.
