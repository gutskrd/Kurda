# Postgres read replicas + connection pooling (KUR-114)

Offload read-heavy traffic (dictionary, leaderboards, profiles) to replicas so
the primary survives spikes, while keeping correctness and flat connection counts.

## Connection pooling — PgBouncer
- Run **PgBouncer** in front of both the primary and each replica; point
  `DATABASE_URL` / `DATABASE_REPLICA_URL` at the pooler, not Postgres directly.
- Transaction-pooling mode keeps **connection counts flat as API replicas scale**:
  dozens of app instances multiplex onto a small, fixed server-side pool. Verify
  with `SELECT count(*) FROM pg_stat_activity` under the load suite (KUR-118) —
  it should stay flat as you add API replicas.

## Read/write routing — `DbRouter`
`api/src/db/router.ts` routes **writes to the primary** and **reads to a replica**
(`createReplicaPool`, from `DATABASE_REPLICA_URL`). With no replica configured it
uses the primary only — a safe default, so nothing breaks before replicas exist.

Adopt it by resolving read queries in the read-heavy services through
`router.read(userId, sql, params)` and writes through `router.write(...)`.

## Read-after-write safety (replica-lag guard)
A user who just wrote must not read stale data from a lagging replica.
`router.write(userId, ...)` records the write; for
`READ_AFTER_WRITE_WINDOW_MS` (3s) afterward, **that user's reads pin to the
primary** (`WritePinTracker`). Pinning is per-user and self-expiring, so it costs
nothing once replication has caught up. Other users keep hitting the replica.

## Replica failure (edge case)
A failed replica read **falls back to the primary transparently** and fires
`onReplicaError` (alert) — a replica outage degrades to primary-only latency, it
is **never a user-facing error**. Pair with a replica health check + alerting so
ops know to investigate.

## Tests
`db/router.test.ts` — replica routing when unpinned, primary pin after a write
(other users unaffected), primary-only with no replica, and **fallback-to-primary
+ alert** on replica failure.
