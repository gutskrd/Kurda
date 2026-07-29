# Kurda

**Jiyan bi kurdî xweştire.**

Mobile-first Kurdish language learning platform — Duolingo-style lessons, Kahoot-style multiplayer games, a social layer, and avatars. Kurmanji first, more dialects later.

Roadmap: [issues](https://github.com/gutskrd/Kurda/issues) · [milestones](https://github.com/gutskrd/Kurda/milestones)

## Repository layout

| Package | Purpose |
|---|---|
| [`shared/`](shared) | Cross-package TypeScript utilities (e.g. Kurdish text normalization) |
| [`api/`](api) | Backend API service (bootstrapped in [#2](https://github.com/gutskrd/Kurda/issues/2)) |
| [`admin/`](admin) | Admin panel web app (bootstrapped in [#99](https://github.com/gutskrd/Kurda/issues/99)) |
| [`mobile/`](mobile) | Mobile app (bootstrapped in [#11](https://github.com/gutskrd/Kurda/issues/11)) |

## Local setup

1. Install [Node.js 20+](https://nodejs.org) (includes npm).
2. `git clone https://github.com/gutskrd/Kurda.git`
3. `cd Kurda`
4. `npm install`
5. `npm test` — run all package tests
6. `npm run lint` — lint all packages
7. `npm run typecheck` — typecheck all packages

Per-package commands: `npm run test --workspace shared` (same for `lint` / `typecheck`).

### See the whole app running locally

Three terminals — the web app talks to the API, the API talks to Postgres:

```bash
# 1) local Postgres (no Docker needed — self-contained embedded Postgres on :5433)
npm run dev:db --workspace api

# 2) API on :3000 (first time, apply migrations against the running db)
DATABASE_URL=postgres://postgres:postgres@localhost:5433/kurda npm run migrate:up --workspace api
DATABASE_URL=postgres://postgres:postgres@localhost:5433/kurda \
  JWT_SECRET=local-dev-secret-least-32-chars-long!! npm run dev --workspace api

# 3) web app on http://localhost:8081
npm run web --workspace mobile
```

The web client calls `http://localhost:3000` by default (override with `EXPO_PUBLIC_API_URL`);
the API allows the `localhost:8081` origin via CORS automatically in development.

### Database with Docker (alternative)

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

Every merge to `main` publishes `ghcr.io/gutskrd/kurda:sha-<commit>` (+ `:latest`) via the [Deploy workflow](.github/workflows/deploy.yml), then deploys to staging **if** `STAGING_SSH_HOST`/`STAGING_SSH_KEY` secrets are set (hosting decision tracked in [#8](https://github.com/gutskrd/Kurda/issues/8)). Migrations run before switchover; a failure keeps the old version serving.

**Rollback (one command):**

```bash
gh workflow run deploy.yml -f image_tag=sha-<previous-commit>
```

## CI

Every pull request runs lint, typecheck, and tests — only for the packages the PR touches (plus everything when root config changes). The `ci-ok` job is the single required status check; merges to `main` are blocked until it is green.
