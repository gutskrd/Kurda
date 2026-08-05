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
  across its line, so navigation is a tiny hash-based switch (`src/nav.ts`).
- `src/api.ts` — bearer-token fetch client (`ApiError` envelope).

## Pages

- **Moderation** — the unified queue (KUR-102): claim + one-click resolve
  (dismiss / warn / mute / ban / remove) with the SLA metric.

### Next

Config approval (#103), tags (#286), user management (#101), analytics
dashboards (#106) — each is a page over an existing admin API. Fetch `/me` on
load to restore the username after a refresh.
