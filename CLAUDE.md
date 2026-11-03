# Hevalo (Kurda) — working notes for development sessions

Hevalo is a Kurdish-learning app. npm workspaces from the repo root:
`shared` (pure TS: art, lip-sync, catalogues), `api` (Fastify + Postgres +
Redis/BullMQ), `web` (Vite React), `admin` (Vite React, hash router without
react-router), `mobile` (Expo React Native).

## Commands

- Per workspace: `npm run typecheck`, `npm run lint`, `npx vitest run`
  (api, web, admin, mobile, shared).
- Run targeted test files while working; the full suites run in CI on every
  pull request against migrated Postgres 16 + Redis — let CI prove those.
- api integration tests skip without `DATABASE_URL` and `REDIS_URL`.
- Migrations: `npm run migrate:up --workspace api`. Migration files are
  immutable once merged — add a new one instead of editing.

## Conventions

- No prettier. Hand-format: single quotes, lines up to ~160 columns, match
  the neighbouring code.
- Comments say why, in full sentences; each module's header explains its job.
- Test names avoid raw apostrophes (write ’ in the name string).
- This is a public repository: no third-party product or competitor names,
  no personal data or email addresses, and no tooling talk in code,
  comments, tests, or commit messages.
- Kurdish user-facing strings need native-speaker review: collect any new or
  changed ones and list them for the owner at the end of the task.
- i18n: web and mobile each keep 9 locale catalogues; every key must exist
  in all 9, with natural phrasing per language rather than word-for-word.

## Workflow

- Develop on the session's designated branch; never commit to main directly,
  never force-push shared branches.
- Pull requests are squash-merged once CI and the review checks are green;
  afterwards sync the work branch from main.
- Render auto-deploys the api from main; Cloudflare serves the web app and
  the admin console. Production hostnames are not reachable from cloud
  session containers — verify deploys through Render's deploy status and
  logs instead.
- Render access from sessions is read-only: never change service settings,
  environment variables, or databases unless the owner asks for exactly that.
- Verify UI changes with targeted tests and a quick scripted walk of the
  affected page, not full screenshot sweeps of every page.
