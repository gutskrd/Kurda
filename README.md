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

## CI

Every pull request runs lint, typecheck, and tests — only for the packages the PR touches (plus everything when root config changes). The `ci-ok` job is the single required status check; merges to `main` are blocked until it is green.
