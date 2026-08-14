# Deploying Kurda

The mobile app can't sign in until the API is reachable at a public HTTPS URL.
This is the fastest path to one, using the committed [`render.yaml`](render.yaml)
Blueprint. (Any host that runs the `Dockerfile` with Postgres + Redis works —
Railway and Fly.io are fine alternatives; the env vars below are the same.)

## 1. Bring up the API on Render

1. Go to [render.com](https://render.com) and **sign in with GitHub** (grant it
   access to the `gutskrd/Kurda` repo).
2. **New → Blueprint**, select the `gutskrd/Kurda` repo. Render reads
   `render.yaml` and shows the plan: a Postgres DB, a Key Value (Redis) store,
   the **kurda-api** web service, and the **kurda-worker** background worker.
3. Click **Apply**. Render will:
   - provision Postgres + Redis,
   - build the Docker image,
   - start the API — which runs the database migrations at container startup
     (before it listens; see `dockerCommand` in `render.yaml`) — and the worker.
4. When it finishes, open the **kurda-api** service — its URL looks like
   `https://kurda-api-XXXX.onrender.com`. Visit `…/health`; you should get
   `{"status":"ok",...}` with `db` and `redis` reporting healthy.

`APPLE_CLIENT_IDS=app.kurda.mobile` and a generated `JWT_SECRET` are already set
by the Blueprint — nothing else is required for sign-in to work.

> **Free-tier notes:** free web services sleep after ~15 min idle (the next
> request wakes them, slowly) and free Postgres is time-limited. For an
> always-on, durable App Store backend, change the three `plan: free` lines in
> `render.yaml` to `starter` and re-apply.

## 2. Point the mobile app at that URL

The build reads `EXPO_PUBLIC_API_URL`; unset, it falls back to
`http://localhost:3000`, which a real device can't reach. Add your Render URL to
the `preview` and `production` build profiles in [`eas.json`](eas.json):

```jsonc
"preview": {
  "distribution": "internal",
  "env": { "EXPO_PUBLIC_API_URL": "https://kurda-api-XXXX.onrender.com" }
},
"production": {
  "autoIncrement": true,
  "env": { "EXPO_PUBLIC_API_URL": "https://kurda-api-XXXX.onrender.com" }
}
```

Then rebuild and reinstall:

```bash
eas build --platform ios --profile preview
```

Sign in with Apple (and email) will now reach the API.

## 3. Optional — Expo web client (CORS)

Native apps don't send an `Origin`, so they're unaffected by CORS. If you also
run the browser build, set `CORS_ORIGINS` on the **kurda-api** service to the
web origin (e.g. `http://localhost:8081`).

## Rollback

Every merge to `main` also publishes an image to GHCR. To redeploy a previous
build, use Render's **Manual Deploy → pick a previous commit**, or the existing
workflow: `gh workflow run deploy.yml -f image_tag=sha-<old-sha>`.
