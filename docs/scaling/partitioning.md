# Hot-table partitioning (KUR-115)

> **Status: IN PROGRESS — decisions settled, executing structurally.**
>
> **Decisions (approved):**
> - **A — `xp_ledger`: left UNPARTITIONED.** Its `UNIQUE(source, ref_id)` DB-level
>   double-award guard stays intact; revisit only if it becomes a real bottleneck.
> - **B — do the cheap STRUCTURAL partitioning now** while the tables are empty/tiny;
>   **no** large/production-scale backfill in `migrate:up`. The online/backfill
>   procedure below is kept for when there's real volume.
> - **Lifecycle — in-repo `ensure_partitions()`** (this file), **no** `pg_partman` /
>   `pg_cron` dependency; called on a daily interval from the API process.
>
> **Done (structural scope):** `notifications` + `rhyme_games` partitioned by month
> (structural twin + bounded copy + swap; composite PK, no guarantee weakened) +
> `ensure_partitions()` + EXPLAIN-pruning/retention tests. **`xp_ledger` and
> `wordle_games` are deliberately left unpartitioned** to protect their DB-level
> unique guarantees (double-award; one-daily-per-day) — revisit only if either
> becomes a real bottleneck. The at-scale online-backfill procedure below stays
> documented for when there's production volume (not executed — no data yet).

## TL;DR

- The issue names `xp_ledger`, `game_results`, and `notifications`. **`game_results`
  does not exist** — the real high-write "results" tables are `wordle_games`,
  `rhyme_games`, `lesson_sessions`/`session_answers`, and `practice_sessions`/
  `practice_answers`.
- **`notifications` is the clean, low-risk candidate** — partition + auto-retention
  first, prove the tooling there.
- **`xp_ledger` has a real blocker**: its `UNIQUE (source, ref_id)` double-award
  guard would have to absorb the partition key and become `UNIQUE (source, ref_id,
  created_at)`, which **weakens the guarantee**. That needs a decision (Decision A).
- The **answer** tables (`session_answers`, `practice_answers`) are FK-entangled
  with composite PKs that have no time column — **defer them**; partition only the
  self-contained per-game tables (`wordle_games`, `rhyme_games`) in the game slice.
- **Scale check:** the app is pre-launch; these tables are ~empty. Partitioning now
  is trivial and safe. The acceptance criterion "online migration on production-
  sized synthetic data" is about proving the *procedure* for later, not a present
  need. **Recommendation: do the cheap structural work now on empty tables; keep
  the online-backfill runbook for when volume actually arrives (Decision B).**

## The overriding constraint: migrations run at deploy

`api/start.sh` runs `npm run migrate:up` **before** the server starts, on every
container boot (Render). So any migration placed in the normal `migrations/` flow
runs inline during a deploy, holding whatever locks it takes while the old
container is already gone or the new one isn't serving yet.

- On **empty/tiny** tables that's fine (sub-second, no rows to move).
- On a **large populated** table, a create-twin + copy-all-rows + swap migration in
  that path would **block the deploy for minutes and take an `ACCESS EXCLUSIVE`
  lock** — the exact downtime the AC forbids.

**Rule for this work:** the *structural* migration (create partitioned table +
attach) may live in `migrations/` **only while the table is empty**. Any
**backfill of a non-trivial table is an out-of-band, resumable operation**, never
an inline `migrate:up` step. See the online procedure below.

## Postgres partitioning mechanics (and the rule that bites us)

We'd use **declarative range partitioning** on the timestamp column, one partition
per month:

```
PARTITION BY RANGE (created_at)   -- monthly: _2026_08, _2026_09, …
```

**The rule:** every `UNIQUE` constraint / `PRIMARY KEY` on a partitioned table
**must include the partition key column.** Consequences per table:

| Table | Today's PK / unique | After partitioning by time | Cost |
|---|---|---|---|
| `notifications` | PK `id` | PK `(id, created_at)` | none — `id` still unique in practice (uuid); no other unique constraint |
| `xp_ledger` | PK `id`, **`UNIQUE (source, ref_id)`** | PK `(id, created_at)`, **`UNIQUE (source, ref_id, created_at)`** | **weakens dedup** — see Decision A |
| `wordle_games` | PK `id`, partial `UNIQUE (user_id, day_index) WHERE mode='daily'` | must fold `started_at` into that partial unique index | the "one daily game per day" guard gets more complex |

No table **is referenced by an inbound FK** on the columns we'd repackage
(verified: nothing `REFERENCES xp_ledger`, `notifications`, `wordle_games`, or
`rhyme_games`), so we don't have to rebuild foreign keys pointing *at* these
tables — a major simplifier. FKs pointing *out* (e.g. `user_id → users`) are fine
on partitioned tables.

## Per-table analysis

### `notifications` — recommended first (clean)

- PK `id` only; **no secondary unique constraint**; `created_at` is immutable
  (only `read_at` is updated in place, which never changes the partition).
- Reads are "last 50 per user, newest first" + an unread-count partial index —
  both are **naturally time-bounded and retention-friendly**.
- **Retention is a genuine win**: old notifications can be dropped wholesale
  (`DROP PARTITION`) instead of a slow `DELETE`. Propose keeping ~90 days.
- Indexes `(user_id, created_at)` and the partial unread index become
  per-partition local indexes automatically.

### `xp_ledger` — needs Decision A

- Append-only (immutability trigger), PK `id`, `UNIQUE (source, ref_id)` is the
  **idempotency gate that stops an award being granted twice** (e.g. the same
  lesson session paying out twice).
- Query shape is ideal for pruning: leagues/leaderboards/goals/quests all filter
  `WHERE user_id = ? AND created_at >= ? [AND created_at < ?]` and `SUM(amount)`
  (`api/src/leagues/service.ts`, `leaderboards/service.ts`, `goals/service.ts`,
  `events/quest-service.ts`). Monthly partitions prune to the 1–2 months a window
  touches.
- **Spanning boundaries** (the issue's edge case): the weekly league window
  `[weekKey, weekKey+7d)` can straddle a month end → the planner prunes to exactly
  **two** partitions, not a full scan. Benchmarked in the EXPLAIN tests below.
- **The problem:** `UNIQUE (source, ref_id)` must become `UNIQUE (source, ref_id,
  created_at)`. Two awards with the same `(source, ref_id)` in *different* months
  would no longer collide, so the DB-level double-award guard is weakened to
  "within the same partition."

  **Decision A — how to preserve award-dedup under partitioning:**
  1. **Don't partition `xp_ledger`** (do `notifications` + game tables only).
     Simplest; keeps the guarantee intact. Given ledger rows are one-per-award and
     pruning is nice-to-have, this is the **low-risk default**.
  2. **Partition and move the guarantee up a layer** — rely on the existing
     same-transaction write path (it already maintains `users.xp` atomically) plus
     an app-level idempotency check, accepting the DB no longer enforces global
     uniqueness. More scalable, weaker DB guarantee.
  3. **Partition by a key derived from the dedup identity** (e.g. hash-partition on
     `user_id`) instead of time — preserves per-user locality but **loses time-
     based retention/pruning**, which is the point of the issue.

  My recommendation: **Option 1 now**, revisit if the ledger actually becomes a
  scan bottleneck (it's a lean `integer amount` table; hundreds of millions of
  rows are far off).

### Game tables — partition the self-contained ones, defer the answer tables

- **`wordle_games`, `rhyme_games`**: one row per game, self-contained, no inbound
  FK. Partition by `started_at`; fold the partial daily-uniqueness index to include
  it. Feasible.
- **`session_answers`, `practice_answers`**: **defer.** Composite PK
  `(session_id, exercise_id)` with **no time column**, and an FK to their parent
  session table (`ON DELETE CASCADE`). Partitioning these means partitioning the
  parent in lockstep and rebuilding cross-partition FKs — high effort, low current
  value. Not in this slice.

## Safe online migration procedure (for populated tables, out-of-band)

Used **only** when a table is large enough that in-place conversion would lock too
long. Never inside `migrate:up`.

1. **Create the partitioned twin** `t_part` (`PARTITION BY RANGE (ts)`) with this
   month + next month pre-created. Structural, fast, in `migrations/`.
2. **Dual-write** (or logical-replication copy): application writes go to both the
   old table and `t_part`, or a trigger mirrors inserts. New rows land partitioned.
3. **Backfill** old rows in **batches by time range** (a resumable script /
   one-off worker with a `LIMIT`/watermark), off the deploy path, throttled to
   respect replica lag (`docs/scaling/read-replicas.md`).
4. **Verify** row counts + checksums match per range.
5. **Cutover** inside one short transaction: `ALTER TABLE … RENAME`, swap the twin
   into place, point reads at it. Sub-second `ACCESS EXCLUSIVE` on the rename only.
6. **Drop** the old table after a soak period.

On empty/tiny tables (current reality) steps 2–4 collapse to nothing and the whole
thing is a plain structural migration.

## Automated partition lifecycle

Two ways to get "create-ahead + retention drop":

- **`pg_partman`** (extension) + `pg_cron`/`run_maintenance()` — batteries-included,
  but requires the extension to be installable on the managed Postgres (Render's
  managed PG: **needs verification** — this is an infra dependency).
- **In-repo function + scheduler** (no extension, **chosen**): a `plpgsql`
  `ensure_partitions(tbl, months_ahead, retain_months)` that creates the current +
  `months_ahead` monthly partitions (idempotent `CREATE … IF NOT EXISTS`) and, when
  `retain_months` is set, drops well-formed `<tbl>_YYYY_MM` partitions older than the
  cutoff (never the DEFAULT). Called **daily from the API process** (`app.ts`), so it
  works even though the worker is disabled on free tier (`DEPLOY.md`), and is safe to
  run on every replica because it's idempotent. Retention is left **off**
  (`retain_months` NULL) so no data is auto-deleted until we choose a window.

## Verifying partition pruning (AC: "EXPLAIN in tests")

Integration test (`notifications/partition.integration.test.ts`, Postgres, the
`migrations` CI job):

- Confirms the table is `RANGE`-partitioned (`pg_partitioned_table`).
- Seeds rows across three monthly partitions, then `EXPLAIN (FORMAT JSON)` a
  `created_at`-bounded query and asserts the plan scans **only** the target month's
  partition — not the neighbouring months, not the DEFAULT. Pruning proven, not
  assumed. (The inbox's "newest 50 per user" query has no time bound, so its main
  win is **retention**, not pruning; a bounded query is what prunes.)
- Exercises `ensure_partitions()`: creates ahead, and with a `retain_months` window
  drops a long-past partition while never touching DEFAULT.

## Risks

- **Deploy-path lock (highest):** a heavy migration in `migrate:up` blocks a deploy.
  Mitigated by the out-of-band procedure — structural-only in `migrations/`.
- **Weakened `xp_ledger` dedup** (Decision A) — the reason not to partition it by
  time without a deliberate choice.
- **Managed-PG feature support** — `pg_partman`/`pg_cron` availability on Render is
  unconfirmed; the in-repo lifecycle function avoids the dependency.
- **Worker disabled on free tier** — lifecycle automation needs the worker; pre-
  create partitions until then.
- **Over-engineering for current scale** — real risk of spending effort now for
  volume that's far off; hence the "structural-now, backfill-runbook-later" split.

## Rollback

- **Structural migration** (`down`): detach partitions, `INSERT … SELECT` back into
  a plain table, drop the partitioned parent. Cheap while empty; a data-move once
  populated (so post-scale, prefer roll-*forward*).
- **Online cutover**: keep the old table for a soak window; rollback = point reads
  back at it and stop dual-writing. No data lost because both were written.
- **Lifecycle function**: `DROP FUNCTION` + unschedule; partitions remain, only
  auto-maintenance stops.

## Decisions (settled)

- **A — `xp_ledger`: NOT partitioned.** Keep the DB-level `UNIQUE(source, ref_id)`
  double-award guard; revisit only if it becomes a real bottleneck.
- **B — cheap structural partitioning NOW** (empty/tiny tables); no large backfill
  in `migrate:up`. The online/backfill procedure above stays for real volume.
- **Lifecycle: in-repo `ensure_partitions()`** — no `pg_partman`/`pg_cron`. Since the
  worker is disabled on free tier, it's called on a **daily interval from the API
  process** (idempotent → safe across replicas); retention (partition drops) is
  **off by default** (`retain_months` NULL) so nothing is auto-deleted until enabled.

## Rollout

1. **`notifications`** — done (migration `…_partition-notifications.js`): monthly by
   `created_at`, `ensure_partitions()`, EXPLAIN-pruning + retention tests. ✅
2. **`rhyme_games`** — done: clean (PK `id` only), partitioned by `started_at`. ✅
3. **`wordle_games`** — **left unpartitioned (decided).** Its partial
   `UNIQUE(user_id, day_index) WHERE mode='daily'` (one-daily-per-day) would be
   weakened by time-partitioning — the same reason `xp_ledger` was left out. It has
   no time-bounded queries (so no pruning benefit) and no pre-launch retention need,
   so partitioning it (which would require a bespoke `day_index`-range scheme to keep
   the guarantee) isn't worth it now. Revisit with a `day_index` scheme only if game
   history volume ever warrants retention.
