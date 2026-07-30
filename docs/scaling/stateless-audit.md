# Load balancer + stateless API audit (KUR-113)

The API runs as **≥3 stateless replicas behind an LB**. Any replica can serve any
request; killing one drops no state. This audit records where state lives, the
one violation found, and the LB / WS-scaling setup.

## State is externalized ✅
| Concern | Where it lives | Not in-process |
|---------|----------------|----------------|
| Auth | Stateless JWT access tokens (`auth/tokens.ts`); refresh tokens in Postgres (`refresh_tokens`) | ✅ |
| Sessions / "logout everywhere" | `users.token_version` in Postgres, re-checked per request | ✅ |
| Rate limiting | `RedisRateLimitStore` (Redis) | ✅ |
| Cache | `Cache` over Redis (`KUR-006`), best-effort | ✅ |
| Realtime fan-out | `RedisRoomBus` pub/sub (`KUR-049`) — cross-node WS delivery | ✅ |
| Live game / room state | `RedisKV` snapshots (`KUR-051`) | ✅ |
| Matchmaking queue | `RedisMatchQueue` (atomic, Redis) | ✅ |
| Jobs | BullMQ on Redis (`KUR-007`) | ✅ |

The `Memory*` variants (`MemoryRateLimitStore`, `MemoryMatchQueue`,
`LocalRoomBus`, `MemoryKV`) are **single-node dev fallbacks** used only when
`REDIS_URL` is unset — production always runs the Redis-backed versions, so no
in-process state leaks across the fleet.

## Violation found — per-replica schedulers ⚠️ (ticketed)
`buildApp` starts several `setInterval` timers (dashboard refresh KUR-106, season
settle KUR-065, matchmaking sweep, leaderboard rebuild). With N replicas these
run **N times**, doing duplicate work. They're **idempotent** (upserts / due-time
guards), so it's a *correctness-safe* inefficiency, not a data hazard — but it
should be fixed.

- **Recommendation (ticketed):** move these to **BullMQ repeatable jobs** (single
  execution fleet-wide via the `repeat` scheduler, `JobQueue.scheduleEvery`
  already exists) or gate them behind a Redis leader-election lock. Until then,
  they are safe to leave running.

No other in-process state (caches, sessions, timers holding request state) was
found.

## Load balancer
- **≥3 replicas** behind the LB; health-check `GET /health` (returns component
  health, `KUR-002`).
- **Rolling deploys, zero dropped requests**: the app registers `onClose` hooks
  that drain the DB pool and close the job queue; run with connection draining +
  `preStop` grace so in-flight requests finish before a replica exits.
- **No sticky sessions** anywhere — JWT auth + Redis-backed shared state mean any
  replica handles any request.

## WS gateway scales horizontally
`RealtimeGateway` + `RedisRoomBus` (`KUR-049`) fan events out across nodes: a
player can connect to **any** replica, and room broadcasts reach players on other
replicas via Redis pub/sub. Cross-node games work because room state is in
`RedisKV`, not the socket's node.

### Edge case — kill a node mid-game
No sticky sessions required: when a replica dies mid-game, its players' sockets
drop and **reconnect (via the LB) to another replica**, re-authenticate, and
**rejoin the room** — state is recovered from `RedisKV`, and the bus keeps
delivering events. Verify in staging: kill a node during a live game and confirm
both players reconnect elsewhere and the game continues.

## Verification checklist (staging, under load — KUR-118)
- [ ] 3+ replicas; round-robin LB; `/health` checks.
- [ ] Rolling deploy under load → 0 failed requests (connection draining works).
- [ ] Cross-node game (players pinned to different replicas) plays through.
- [ ] Kill a replica mid-game → players reconnect to another, game continues.
