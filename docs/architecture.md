# How Hevalo is put together

A map for anyone changing the code: where a piece of work goes, and the rules
that keep the app fast, cheap to run and safe as it grows. Each rule names the
file that already does it right, so the answer to "how do I…" is usually "the
way that file does".

## The packages

| Package | What it is | Runs on |
|---|---|---|
| `shared/` | Types and pure logic every other package agrees on: Kurdish text folding, lesson rules, badge and league maths, the characters' art. No I/O. | everywhere |
| `api/` | The one backend: Fastify, raw SQL over `pg`, Redis, background jobs. | Render (one Docker service) |
| `web/` | The website and web app (Vite + React), served by a Cloudflare Worker (`web/src/worker.ts`). | Cloudflare |
| `admin/` | The staff console (Vite + React). | Cloudflare Pages |
| `mobile/` | The phone app (React Native / Expo). | iOS, Android |

`shared` is consumed from source (`shared/package.json` points `main` at
`src/index.ts`), so a change there is live in every package at once, and a
type changed there is checked in every package by `npm run typecheck`.

## Where a feature goes

A feature usually touches, in this order:

1. **`shared/src/`** — the types the API returns and the apps read, and any
   rule both sides must apply the same way (how an answer is graded, how a
   name is folded for search). Export it from `shared/src/index.ts`.
2. **`api/src/<domain>/`** — one folder per domain (`friends/`, `feed/`,
   `leagues/`…), usually holding:
   - `routes.ts`: paths, validation schemas (zod), `preHandler` guards
     (`requireAuth`, `requireRoles` in `plugins/auth.ts`), rate limits. No SQL.
   - `service.ts`: the work, taking a `pg.Pool`. Errors are `AppError`
     (`plugins/errors.ts`) with a code the apps can translate; routes never
     look at Postgres error codes.
   - `*.test.ts` for pure logic, `*.integration.test.ts` for anything that
     touches Postgres or Redis (skipped without `DATABASE_URL`).
   - Wire the service and routes in `api/src/app.ts`.
3. **`api/migrations/`** — schema changes, one new file per change (see
   [Migrations](#migrations)).
4. **`web/src/` and `mobile/src/`** — both apps, kept at parity. Copy goes in
   all nine languages: `web/src/i18n/{en,ku,ckb,ar,tr,de,fr,es,nl}.ts` and
   `mobile/src/i18n/translations.ts`. New Kurmancî and Soranî text is listed
   for a native speaker to check before it is relied on.
5. **`admin/src/`** — when staff need to see or change it.

Configuration is read only through `loadConfig()` (`api/src/config/env.ts`);
lint refuses `process.env` anywhere else in the API.

## Database

Conventions for tables, soft delete and Kurdish text are in
[`api/DATABASE.md`](../api/DATABASE.md). On top of those:

**SQL is parameterised, always.** Values travel as `$1, $2…`. Text built into
a statement with `${…}` may only be a constant, a placeholder number, or an
identifier picked from a fixed list in code — never anything a request
carried. A value used inside a `LIKE`/`ILIKE` pattern goes through
`escapeLike` (`api/src/db/like.ts`) so `%` and `_` mean themselves.

**One query per list, never one per row.** Reading a list and then asking
about each item (its author, its count, whether the reader may see it) is the
most expensive mistake this codebase can make: the database is small and
every round trip is paid for. Instead:

- join what each row needs (`JOIN`, `LEFT JOIN LATERAL`, `EXISTS` in the
  select list — see `SocialService.search` in `api/src/social/service.ts`,
  which reads the friendship in the same pass as the match);
- or fetch everything for a batch in one go with `= ANY($1::uuid[])` and
  group it in code (`attachSenses` in `api/src/dictionary/search-service.ts`);
- write many rows with one `INSERT … SELECT … FROM unnest($1::uuid[], …)`,
  not a loop of inserts;
- use `UPDATE … RETURNING` rather than an update followed by a read.

A loop of `await pool.query(...)` is acceptable only when each step must see
the one before it inside a transaction (and then say so in a comment), or
when the loop is bounded by a small constant. Hot paths are pinned by
query-budget tests, so a change that adds a query per row fails CI rather
than the bill.

**An index serves only the expression it was built on.** A search over
`translate(lower(username::text), 'êîûçş', 'eiucs')` uses an index over
exactly that expression and nothing else. Prefix searches use a btree with
`text_pattern_ops`; searches inside a value, or by similarity, use pg_trgm
GIN indexes (`api/migrations/1751000203000_search-anywhere.js`). Check a new
query with `EXPLAIN ANALYZE` against a realistic number of rows before
relying on it: on a handful of rows every plan looks fine.

**Who may see what is decided in SQL, in one place.** Blocks
(`notBlockedSql`, `api/src/friends/blocked.ts`) and the rules for minors
(`api/src/users/age.ts`) are SQL fragments meant to be included in every
query that lists people or their content. A new list of people includes
them; it does not filter afterwards in code.

### Migrations

- Immutable once merged; CI fails a change to an existing file
  ([`api/MIGRATIONS.md`](../api/MIGRATIONS.md)). Every migration has a
  working `down`.
- Migrations run when the API container starts, while the previous container
  is still serving. Anything that would hold a lock on a busy table for long
  — building an index, rewriting a table — must not. Build indexes with
  `CREATE INDEX CONCURRENTLY`, which needs `pgm.noTransaction()`, one
  statement per `pgm.sql` call, and a `DROP INDEX CONCURRENTLY IF EXISTS`
  first so a failed build can be retried (the search migration above is the
  pattern).

## Search

Every search folds both sides the same way: `foldDiacritics` /
`dictionaryKey` (`shared/src/kurdish-text.ts`) in code, the matching
`translate(lower(…))` expression in SQL, so "sev" finds "şev". Results rank
an exact match first, then a start, then the query anywhere inside, then near
spellings only when nothing else matched. The apps mark the matched part with
`matchedParts` (`shared/src/search-highlight.ts`), which folds the same way.

## Cost

The API, its database and its Redis are small plans, and most of their work
is not people using the app but the app asking on their behalf. Before adding
anything that repeats, ask how often it runs when nobody is looking:

- **Per-request work.** Hooks in `api/src/plugins/` run on every request; a
  query or Redis call added there is multiplied by all traffic. Prefer doing
  it in the one route that needs it.
- **Polling.** The website polls through `pollWhileVisible`
  (`web/src/lib/pollWhileVisible.ts`), which stops while the tab is hidden;
  on the phone, a poll watches `AppState` and rests in the background, as the
  heartbeat does (`mobile/src/auth/useHeartbeat.ts`). Poll only what realtime
  does not already push, and no faster than a person would notice.
- **Caching.** Public, anonymous GETs can be cached at the edge
  (`api/src/http/cache-policy.ts`); signed-in responses never are. Hot,
  expensive reads go through `Cache.withCache` (`api/src/cache/cache.ts`)
  with a TTL; files with content-hashed names are cached for a year
  (`web/public/_headers`).
- **Timers and jobs.** Work that can wait goes on the job queue
  (`api/src/jobs/`). A timer that rebuilds something "just in case" costs the
  same at 3 a.m. as at noon; rebuilding on first read after it goes stale
  (`LeaderboardService.ensureFresh`) costs nothing when nobody reads.
- **Logs.** A line per health check or per poll is most of the log volume;
  quiet routes log at `warn` (`/health` in `api/src/app.ts`).

## Security

- Every route states who may call it (`requireAuth`, `requireRoles`) and
  every service method that takes an id checks that the caller may act on
  that row: owning it, being in the conversation or group, being staff past
  two-step verification.
- Input is validated by the route's schema (`plugins/validation.ts`), with
  every string's length and every number's range bounded.
- Costly or public endpoints carry a rate limit in their route `config`.
- Nothing secret is in a client bundle; tokens and keys live in the API's
  environment.
- `docs/security/` holds the reasoning behind each protection; read the
  relevant one before loosening anything.

## Tests

- Pure logic: plain vitest next to the file. Run a package's tests with
  `npx vitest run` inside it.
- API integration tests need Postgres and Redis: set `DATABASE_URL` and
  `REDIS_URL` (CI's `migrations` job does), then
  `npm run migrate:up && npm run db:seed` in `api/`. Files run one after
  another and Redis is flushed before each, so a test may rely on a clean
  Redis but not on an empty database: name test rows with a unique suffix.
- The apps' tests render components in jsdom (the phone app's through
  react-native-web) against a mocked API.
- Test names never contain an apostrophe.
