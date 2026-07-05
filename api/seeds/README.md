# Seeds

`.sql` files here run in lexicographic order via `npm run db:seed --workspace api`.

Rules:
- **Idempotent only** — the runner executes every file on every invocation. Use `INSERT ... ON CONFLICT DO NOTHING` or guarded upserts.
- Name files `NNN_description.sql` (e.g. `010_dev-users.sql`) to control order.
- Dev/staging convenience data only; production data changes go through migrations or admin tooling.

First real seed content arrives with the Kurmanji course import (KUR-041, #41).
