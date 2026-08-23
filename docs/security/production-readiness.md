# MyKurda — Production Security & Readiness

This document is the single reference for MyKurda's security architecture and its
mapping to the production requirements checklist. It is kept in sync with the
implementation; when a control changes, update the relevant section here.

**Scope note.** `Demo-MyKurda/` is a static HTML/CSS/JS marketing prototype with
no backend, auth, or database. It is a product/design/content reference only and
must **never** be used as a security reference or have code copied from it.

**Guiding principle.** Never trust the client. Validate input. Authenticate
identity. Authorize every protected operation. Minimize data exposure. Protect
secrets. Limit resources. Log important security events. Fail safely.

---

## 1. Authentication (`api/src/auth/`)

- Passwords hashed with **argon2id** (OWASP params); login is timing-equalized so
  latency never reveals whether an account exists.
- **Refresh-token rotation** with reuse/theft detection: presenting a rotated
  token revokes the whole family.
- **Progressive lockout** (per account + per IP) before any password work.
- **Risk scoring** on signup/login (per-device/IP caps, graceful degradation).
- **Captcha** (Turnstile) + disposable-email blocking on signup.
- **Email ownership** proven by a 6-digit code (hashed, user-bound, TTL + attempt
  cap); a hard gate blocks the app until verified. Legacy link flow retained.
- **OAuth** (Google + Apple) verified against provider JWKS with an audience
  allowlist (`GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS`).
- Access tokens are short-lived JWTs signed with `JWT_SECRET` (**required in
  production**, min 32 chars); `token_version` bump = forced logout everywhere.

There is one authentication system. Do not add a second.

## 2. Authorization (`api/src/plugins/auth.ts`, `api/src/admin/`)

Enforced **server-side** and centrally. The `onRequest` hook resolves the caller
to `req.user = { id, roles, familyId }` from a verified bearer token; guards are
applied per route:

- `requireAuth` — logged-in, active (non-deleted/banned) user.
- `requireRoles(...roles)` — function-level authorization.
- `requireAdmin(totp, ...roles)` — admin role **plus a confirmed TOTP (MFA)**.

Object-level authorization (BOLA/IDOR) is enforced in each handler by scoping
queries to `req.user.id` (e.g. PATCH/DELETE `/me` act only on the caller; resource
reads verify ownership). Knowing an ID never implies access.

**Never** rely on the client to hide a control — the backend independently
rejects unauthorized calls (guest → ranked, normal user → admin, user A → user B).

## 3. Guest state

Authentication state is derived only from the verified session/token, never from
a client-supplied `isGuest` flag or request body. A guest cannot escalate by
editing local storage, cookies, headers, or payloads — the server decides.

## 4. Input validation & mass-assignment (`zod` + KUR-005 guard)

- Every route declares a `zod` schema; a startup guard (**KUR-005**) refuses to
  boot if a route lacks `schema.body` (or an explicit `config.skipValidation` for
  genuinely bodyless/raw endpoints). Type/format/length/range/enum enforced.
- **No mass assignment**: mutation endpoints use explicit field allowlists.
  Sensitive properties (roles, XP, Zêr, verification/premium status, ownership)
  are changed only through dedicated server-side logic, never client-set.

## 5. Economy integrity — XP, Zêr, game results (`append-only ledgers`)

- The client never declares rewards. XP/Zêr are written through **append-only
  ledgers** keyed by `(source, ref_id)` for **idempotency** — replays, duplicate
  claims, and concurrent double-awards collapse to a single credit.
- Ranked/game results are validated against trusted server state; scores and
  winners are not taken on the client's word.
- Concurrency is handled with DB transactions, atomic updates, and unique
  constraints — two simultaneous requests cannot duplicate a reward.

## 6. SQL injection

All database access uses **parameterized `pg` queries** (`$1` placeholders) — no
string concatenation of user input. Dynamic identifiers (sort/filter columns) use
allowlists. Applies to users, search, chat, games, rankings, admin tools, and
pagination alike.

## 7. Rate limiting (`api/src/ratelimit/`)

**Per-route** limits keyed by IP and/or account (not one global limit), sized to
endpoint risk/cost: login, register, password reset, email/code verification,
username changes, OAuth, and other sensitive endpoints each have their own budget.
Progressive lockout backs the auth flow.

## 8. Data exposure & error handling

- Responses are explicit DTOs — password hashes, tokens, private email, and
  internal/moderation fields are never serialized to clients. Public profiles omit
  private data.
- Errors return a safe envelope with a `requestId`; stack traces, SQL, paths, and
  internal details never reach clients (they go to server logs only).
- No account enumeration: signup/username/reset use uniform "unavailable"/"sent"
  responses.

## 9. Output / XSS

The API returns JSON only. User-generated content (usernames, posts, comments,
chat) is stored raw and escaped at render time by the clients; any server-side
HTML handling uses a sanitizer allowlist. Usernames additionally reject control
characters and Unicode confusables (`api/src/users/username.ts`,
`reserved-usernames.ts`), and the format is DB-enforced (see §11).

## 10. Transport, CORS & security headers

- **Security headers** on every response (`plugins/security-headers.ts`): HSTS
  (2y, includeSubDomains), `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy:
  cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **CORS** (`plugins/cors.ts`): an explicit `CORS_ORIGINS` allowlist — never a
  wildcard for credentialed requests. Native apps send no Origin and are
  unaffected. Set production origins (e.g. the web app's domain) via config.
- Production is HTTPS-only; do not ship config pointing clients at HTTP APIs.

## 11. Database integrity (`api/migrations/`)

- `citext` columns for **case-insensitive** email/username uniqueness; **partial
  unique indexes** (`WHERE deleted_at IS NULL`) make uniqueness race-safe across
  concurrent claims. Usernames also carry a `CHECK` format constraint (incl.
  Kurdish letters) and a 30-day change cooldown.
- Foreign keys, unique constraints, and idempotency keys enforce invariants at the
  database — not only in the app.

## 12. File uploads (`api/src/media/`)

Presigned direct-to-storage (R2/S3) uploads with size + MIME limits, randomized
object keys (never the client filename), per-user upload rate limits, and access
control. Uploads cannot become server-executable code.

## 13. Privacy & GDPR (`api/src/gdpr/`)

Data-export and anonymize/delete flows with a deletion grace period; versioned
consent; iOS privacy manifests. Public and private data are separated so one user
cannot retrieve another's private fields.

## 14. Async, scalability & observability

- Expensive work (email, push, GDPR export, media cleanup) runs on the **BullMQ**
  worker, never synchronously in the request path.
- Postgres connection pooling; Redis for rate limits/caching/queues; **partitioned
  hot tables** (`notifications`, `rhyme_games`) via an in-repo `ensure_partitions()`
  lifecycle; pagination on list endpoints.
- Observability: structured `pino` logs with request IDs, `prom-client` metrics,
  Sentry, audit routes for admin actions. Secrets are never logged.

## 15. Secrets

`api/src/config/env.ts` is the **only** module permitted to read `process.env`
(enforced by lint). Secrets come from the environment, never from source, never
from frontend bundles (`EXPO_PUBLIC_*` values are public by definition and hold no
secrets). No `.env` has ever been committed (verified in git history). `.env.example`
and the compose `${VAR:-…}` placeholders hold non-secret defaults only.

---

## 16. Database least privilege — IMPLEMENTED

The runtime application connects as **`kurda_app`**, a role with **DML only**
(`SELECT/INSERT/UPDATE/DELETE`), plus `USAGE,SELECT` on sequences and `EXECUTE`
on functions. It has **no** `CREATE/DROP/ALTER`, no role management, and no
superuser. Administrative ownership stays with the `postgres` role, which the
**migrate** service uses (DDL/owner). The two are separate.

- Role + grants: `docker/postgres-init/10-app-role.sql` (runs once, as superuser,
  before migrations). `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` makes every
  object migrations create afterwards — and every runtime partition — auto-grant
  DML to `kurda_app`, so no re-grant step is needed.
- Partition maintenance keeps working because `ensure_partitions()` is
  `SECURITY DEFINER` with a pinned `search_path` (migration `1751000087000`): it
  runs the `CREATE TABLE` as its owner while `kurda_app` only needs `EXECUTE`.
- Compose wiring: `api`/`worker` use `${APP_DATABASE_URL:-…kurda_app…}`; `migrate`
  uses the superuser. Override `APP_DATABASE_URL` in production with a real
  app-role URL whose password comes from secrets management.

**Verified** (`docker compose down -v && up`, then `psql` as `kurda_app`):

| Operation | Result |
|---|---|
| read users / partitioned tables, transactions, register+`/me` (real writes) | **allowed** |
| `SELECT ensure_partitions(...)` | **allowed** (runs as owner) |
| `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE` | denied (`permission denied` / `must be owner`) |
| `CREATE ROLE` / `ALTER ROLE … SUPERUSER` / alter another role | denied |
| `TRUNCATE`, `CREATE EXTENSION`, `COPY … TO file` | denied |
| `SELECT rolpassword FROM pg_authid` | denied |

---

## Residual gaps & remediation

1. **Admin SPA CSP.** The API's CSP is strict, but the admin web app ships no
   app-level CSP — add one at the static host (a `_headers`/host config with a
   locked-down policy) once the admin's production hosting is fixed. A `<meta>` CSP
   can't set `frame-ancestors` and breaks Vite dev HMR, so this belongs at the
   host, not in the SPA. Admin is already behind auth + role + TOTP.

### Least-privilege role — the applied SQL (see `docker/postgres-init/10-app-role.sql`)

```sql
-- 1) Make partition creation run as the function owner, not the caller.
--    (Applied via migration; SET search_path pins it against hijacking.)
CREATE OR REPLACE FUNCTION ensure_partitions(tbl regclass, months_ahead int DEFAULT 3, retain_months int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ /* … existing body … */ $$;

-- 2) A least-privilege application role (DML only; no DDL/superuser).
CREATE ROLE kurda_app LOGIN PASSWORD '<from env/secrets>';
GRANT CONNECT ON DATABASE kurda TO kurda_app;
GRANT USAGE ON SCHEMA public TO kurda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kurda_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kurda_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kurda_app;
-- future migrator-created objects auto-grant to the app role:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kurda_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kurda_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO kurda_app;
```

The **migrate** service keeps a DDL-capable role; **api** and **worker** connect
as `kurda_app`.

---

## Scalability findings

Reviewed the hot read paths (leaderboards, rankings, chat, notifications, game
results). The architecture scales without rework: pooling, Redis caching of
boards, BullMQ for expensive/async work, `notifications`/`rhyme_games`
partitioned, list endpoints paginated, `player_ratings(rating)` indexed for the
rating board, and per-user `xp_ledger(user_id, created_at)` for profile totals.
No client-declared rewards; XP/Zêr via idempotent append-only ledgers.

**Acted on — weekly XP-leaderboard index** (migration `1751000088000`). The
weekly board rebuild aggregates `xp_ledger` filtered by `created_at >= weekStart`,
but the only index led with `user_id`, forcing a `Seq Scan` over the entire
append-only ledger each rebuild. Added a partial index
`xp_ledger (created_at) WHERE amount > 0`. Validated with `EXPLAIN (ANALYZE,
BUFFERS)` on a 50k-row bench: `Seq Scan` (cost 1568, 9.2 ms, 568 buffers) →
`Bitmap Index Scan` (cost 907, 3.1 ms); the margin grows with total ledger size
(seq scan tracks all rows; index scan tracks only the week's). Write cost: one
partial single-column index on a high-write table; the `amount > 0` predicate
limits it to credits. Board results are Redis-cached, so this runs on periodic
rebuilds, not per request.

**Watch (no action needed yet).** High-write tables — `xp_ledger`, game results,
chat, notifications — are append-only/partitioned and currently well within
limits. Scaling path if volume grows: a maintained per-user XP rollup for
all-time boards, and partitioning `xp_ledger` by month (the `ensure_partitions()`
lifecycle already exists). Do not pre-partition an empty table.

---

## Production deployment hardening gate

Verify before every production deploy. Production must **not** run with:

- `NODE_ENV` other than `production`, or debug/verbose stack traces enabled.
- `IAP_ALLOW_STUB=true` (dev-only stub receipt verifier — never on a store deploy).
- The compose placeholder `JWT_SECRET` — set a real ≥32-char secret from secrets
  management.
- Wildcard/empty `CORS_ORIGINS` for the web app — set the real origins.
- The Postgres **superuser** as the app DB user (use `kurda_app`, above).
- Publicly reachable Postgres/Redis, seeded test accounts, or debug/test routes.
- Email/OAuth/storage credentials absent where the feature is enabled
  (`RESEND_API_KEY`/`SMTP_*`, `GOOGLE_CLIENT_IDS`, R2 keys) — see
  [email-delivery](email-delivery.md) and [google-signin](google-signin.md).

## SSRF posture

The backend performs **no** fetch of user-supplied URLs. Outbound requests go only
to fixed provider hosts (Google/Apple JWKS, Resend) and to **server-generated**
presigned storage URLs. If a user-URL fetch is ever added, it must use a strict
allowlist and block localhost, private ranges, and cloud metadata endpoints.

## Incident-response basics

- Every response carries a `requestId`; correlate client reports to server logs.
- `token_version` bump force-logs-out a compromised account everywhere; refresh
  families can be revoked.
- Admin actions are audit-logged. Rotate `JWT_SECRET` and provider keys on
  suspected compromise; a `JWT_SECRET` rotation invalidates all access tokens.
