# Database conventions

Established in KUR-004 (#4); every new table follows these rules.

## Naming & types
- `snake_case`, plural table names (`users`, `xp_ledger` reads as a ledger — exception allowed for ledger/log tables).
- Primary keys: `id uuid DEFAULT gen_random_uuid()`.
- Case-insensitive unique text (emails, usernames): `citext`.
- Timestamps: `timestamptz`; every table has `created_at`/`updated_at` (maintained by the shared `set_updated_at` trigger — attach it in the table's migration).

## Soft delete
- `deleted_at timestamptz NULL`; application code never hard-deletes (only the GDPR anonymization job, KUR-024, may).
- Repositories extend `SoftDeleteRepository` ([src/db/base-repository.ts](src/db/base-repository.ts)) and must include `activeWhere()` in every read.
- Uniqueness that should be freed on deletion uses **partial unique indexes** (`WHERE deleted_at IS NULL`), not column UNIQUE — see `users_username_active_uniq`.

## Unicode / Kurdish text
- Usernames and any user-visible Kurdish text are **NFC-normalized in the app layer before insert/compare** (`normalizeKurdish` from `@kurda/shared`). Postgres does not normalize; skipping this creates visually-identical duplicate usernames.
- Username charset (DB CHECK `users_username_format`, mirrored by `canonicalUsername`): `A-Za-z0-9_` plus `ê î û ç ş` (both cases), 3–30 chars.

## Errors
- Map PG error codes to domain errors in the repository (see `UsersRepository`): `23505` unique → `EmailTakenError`/`UsernameTakenError`, `23514` check → `InvalidUsernameError`. Route handlers never inspect PG codes.
