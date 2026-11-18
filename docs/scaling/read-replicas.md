# Postgres read replicas and connection pooling

Not built yet. This is the plan for when one Postgres primary stops being enough for the read-heavy routes
(dictionary, leaderboards, profiles).

## Connection pooling
Put a transaction-mode pooler in front of the primary and each replica and point the connection URLs at it, so the
number of server-side connections stays flat as API instances are added. Check it with
`SELECT count(*) FROM pg_stat_activity` under the load suite.

## Routing reads
Send writes to the primary and the read-heavy services' reads to a replica. With no replica configured, or when a
replica read fails, read from the primary instead and raise an alert, so a replica outage costs latency, never an
error. For a few seconds after a user writes, keep that user's reads on the primary, so nobody reads their own
change back stale from a lagging replica.

A router that did this was written but never wired in, and was removed as unused; it can be restored from the
history of `api/src/db/router.ts` when replicas are added.
