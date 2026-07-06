# Kurda

**Jiyan bi kurdî xweştire.**

Mobile-first Kurdish language learning platform — Duolingo-style lessons, Kahoot-style multiplayer games, a social layer, and avatars. Kurmanji first, more dialects later.

Roadmap: [issues](https://github.com/mohamadkrd/Kurda/issues) · [milestones](https://github.com/mohamadkrd/Kurda/milestones)

## Repository layout

| Package | Purpose |
|---|---|
| [`shared/`](shared) | Cross-package TypeScript utilities (e.g. Kurdish text normalization) |
| [`api/`](api) | Backend API service (bootstrapped in [#2](https://github.com/mohamadkrd/Kurda/issues/2)) |
| [`admin/`](admin) | Admin panel web app (bootstrapped in [#99](https://github.com/mohamadkrd/Kurda/issues/99)) |
| [`mobile/`](mobile) | Mobile app (bootstrapped in [#11](https://github.com/mohamadkrd/Kurda/issues/11)) |

## Local setup

1. Install [Node.js 20+](https://nodejs.org) (includes npm).
2. `git clone https://github.com/mohamadkrd/Kurda.git`
3. `cd Kurda`
4. `npm install`
5. `npm test` — run all package tests
6. `npm run lint` — lint all packages
7. `npm run typecheck` — typecheck all packages

Per-package commands: `npm run test --workspace shared` (same for `lint` / `typecheck`).

### Mobile app

```bash
npm run dev --workspace mobile   # Expo dev server; scan QR with Expo Go, or press a/i for emulator
```

### Database (optional for most work)

The API uses PostgreSQL. Easiest local setup is Docker:

```bash
docker run -d --name kurda-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kurda -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/kurda
npm run migrate:up --workspace api
npm run db:seed --workspace api
```

Without `DATABASE_URL` the API still boots; `/health` reports the db as `not_configured`. Migration conventions: [api/MIGRATIONS.md](api/MIGRATIONS.md).

## Running with Docker

```bash
docker compose up
```

Brings up Postgres 16, Redis 7, runs migrations (a failure aborts the stack), then starts the API on `:3000` and the worker.

## Deploys

Every merge to `main` publishes `ghcr.io/mohamadkrd/kurda:sha-<commit>` (+ `:latest`) via the [Deploy workflow](.github/workflows/deploy.yml), then deploys to staging **if** `STAGING_SSH_HOST`/`STAGING_SSH_KEY` secrets are set (hosting decision tracked in [#8](https://github.com/mohamadkrd/Kurda/issues/8)). Migrations run before switchover; a failure keeps the old version serving.

**Rollback (one command):**

```bash
gh workflow run deploy.yml -f image_tag=sha-<previous-commit>
```

## CI

Every pull request runs lint, typecheck, and tests — only for the packages the PR touches (plus everything when root config changes). The `ci-ok` job is the single required status check; merges to `main` are blocked until it is green.
