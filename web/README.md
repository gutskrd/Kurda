# @kurda/web — MyKurda web app

The browser-first MyKurda web application (React + TypeScript + Vite + React
Router). This is a purpose-built site for **mykurda.com**, not the Expo mobile
web export.

## Develop

```bash
npm run -w web dev        # http://localhost:5174
npm run -w web typecheck
npm run -w web lint
npm run -w web test
npm run -w web build      # → web/dist
```

The app talks to the existing Render API. Configure the base URL with
`VITE_API_URL` (defaults to `https://kurda-api.onrender.com`); see `.env.example`.

## Deployment

Deployed as **static assets on the `mykurda` Cloudflare Worker** (no Worker
script — see [`wrangler.toml`](./wrangler.toml)). The Worker serves the built
`web/dist` files; SPA deep links resolve to `index.html` via
`not_found_handling = "single-page-application"`. Security headers/CSP come from
`public/_headers`.

Cloudflare Git integration settings:

| Setting | Value |
| --- | --- |
| Root directory | `/` (repo root — required for npm workspaces) |
| Build command | `npm ci && npm run build --workspace=@kurda/web` |
| Deploy command | `npx wrangler deploy -c web/wrangler.toml` |
| Build variable | `VITE_API_URL=https://kurda-api.onrender.com`, `NODE_VERSION=22` |

The API (Render), admin, and mobile apps are deployed separately and are
unaffected by this app.
