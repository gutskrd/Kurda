# Kurda Admin (web)

The internal admin panel (KUR-099) — a Vite + React SPA over the api's
`/admin/*` endpoints. Sign in with an admin-role account; the app stores the
bearer token and calls the api same-origin via the Vite dev proxy.

## Run locally

```bash
# 1. api + Postgres/Redis must be running (see repo root)
DATABASE_URL=… REDIS_URL=… PORT=3000 CORS_ORIGINS=http://localhost:5173 npm run -w api dev

# 2. the admin SPA (proxies /admin, /auth, … → http://localhost:3000)
npm run -w admin dev            # http://localhost:5173
```

Override the proxy target with `VITE_API_TARGET`.

## Stack

- **Vite 6 + React 19** (rollup dev server — Vite 7/rolldown + react-refresh is
  currently incompatible).
- **No router dependency** — react-router 7.x carries high-severity advisories
  across its line, so navigation is a small hash router: `src/navigation.ts`
  (every page, its group and the API guard it needs) and `src/nav.ts`.
  Addresses are real links: `#/users/<id>`, `#/stories/<id>`,
  `#/audio/lessons?show=missing`; old names (`#/config`, `#/ops`, …) still land.
- `src/api.ts` — bearer-token fetch client (`ApiError` keeps the server's code,
  details and request id).
- `src/ui/` — the component kit every page is built from: PageHeader, Section,
  Table (sortable, loading/empty/error rows, paging, cards on a phone), Drawer,
  Dialog/ConfirmDialog (with typed confirmation) and `useDialogs()` in place of
  the browser's alert/confirm/prompt, Toast, EmptyState/ErrorState, Badge,
  Tabs, Field/Select/Textarea/Checkbox, UserLink, Time, ActionMenu, `useLoad`.

## Pages

The nav shows a page only to roles the API lets in (`GET /admin/session`), and
everyone starts on the first page their role opens.

- **Overview** — Dashboard (what waits, by role), Analytics
- **Record audio** — the alphabet, lesson sentences, story sentences, and the
  characters who say them (who says each recording, and its mouth timeline)
- **People** — Users
- **Moderation** — Queue, Automated flags, Bot flags
- **Content** — Lessons, Stories, Tags & badges, Live events
- **Games** — Words & dictionary, Wordle, Rhyme, Race texts
- **Economy** — Overview, Shop, Gem rules, Fraud, Approvals
- **Settings** — Feature flags, Audit log, My security, System

## Tests

`npm test -w admin` — Testing Library (dom + user-event) on jsdom, with a fake
`fetch` (`src/test/fetch.ts`): the kit, the navigation's gating, and each page.
