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
   and the **kurda-api** web service.
3. Click **Apply**. Render will:
   - provision Postgres + Redis,
   - build the Docker image,
   - start the API — which runs the database migrations at container startup
     (before it listens; see `dockerCommand` in `render.yaml`).
4. When it finishes, open the **kurda-api** service — its URL looks like
   `https://kurda-api-XXXX.onrender.com`. Visit `…/health`; you should get
   `{"status":"ok",...}` with `db` and `redis` reporting healthy.

`APPLE_CLIENT_IDS=app.kurda.mobile` and a generated `JWT_SECRET` are already set
by the Blueprint — nothing else is required for sign-in to work.

> **Free-tier notes:** free web services sleep after ~15 min idle (the next
> request wakes them, slowly) and free Postgres is time-limited. For an
> always-on, durable App Store backend, bump the `plan: free` lines in
> `render.yaml` to `starter` and re-apply.
>
> The background **worker is disabled** on free tier (Render offers no free
> workers). Sign-in and the core API are unaffected; only background jobs (push
> notifications, streak reminders, scheduled rollups, queue processing) don't
> run until you move to paid hosting and uncomment the `kurda-worker` block in
> `render.yaml`.

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

## Media storage — profile photos (Cloudflare R2 or S3)

Profile-photo upload (KUR-177/180) needs an S3-compatible bucket. Without it
the API returns `503 MEDIA_UNAVAILABLE` and the app shows an error. Cloudflare
**R2** is the cheapest fit (no egress fees) and is S3-compatible.

**One-time setup (your side — I can't create buckets or hold credentials):**
1. Create an R2 bucket, e.g. `mykurda-media`.
2. Create an R2 **API token** (Object Read & Write) → note the Access Key ID +
   Secret Access Key, and your account's S3 endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Make objects publicly readable: enable the bucket's **public r2.dev URL**, or
   connect a **custom domain** (e.g. `media.mykurda.app`). That public base is
   `CDN_BASE_URL`.
4. On the **kurda-api** Render service → Environment, set:

   | Variable | Value |
   |---|---|
   | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | `mykurda-media` |
   | `S3_ACCESS_KEY_ID` | *(R2 token access key id)* |
   | `S3_SECRET_ACCESS_KEY` | *(R2 token secret — mark as secret)* |
   | `CDN_BASE_URL` | `https://<public-r2.dev-or-custom-domain>` |

   (These are declared, commented, on the `kurda-api` service in `render.yaml`.)
5. Redeploy the API. `/health` stays green; profile-photo upload now works.

Notes: the app uploads **through the API** (bytes are validated, resized to
≤512 px, and re-encoded as WebP ≤250 KB server-side — the client's declared type
is never trusted); only the **public GET** at `CDN_BASE_URL` must be reachable.
The media-orphan job cleans up replaced/unconfirmed objects automatically.

### Cost-safety (stay inside R2's free tier)

All limits are env-driven (sensible defaults; raise them to scale). They're
application-level guards — **Cloudflare's dashboard is the source of truth** for
real billing, and **Class B reads (public image views) bypass the API entirely,
so only Cloudflare can see them.**

| Variable | Default | Purpose |
|---|---|---|
| `MEDIA_MAX_UPLOAD_MB` | 5 | reject raw uploads bigger than this |
| `MEDIA_MAX_STORED_KB` | 250 | hard cap on the stored (processed) object |
| `MEDIA_MAX_DIMENSION` | 512 | longest edge of the processed image |
| `MEDIA_STORAGE_LIMIT_GB` | 9 | **hard** app-level total-storage kill switch (below R2's free 10 GB) |
| `MEDIA_MONTHLY_CLASS_A_LIMIT` | 900000 | monthly write/list op ceiling (below Cloudflare's 1M) |
| `MEDIA_MONTHLY_CLASS_B_LIMIT` | 9000000 | monthly read op ceiling (below Cloudflare's 10M) |
| `MEDIA_UPLOAD_RATE_MAX` / `_WINDOW_MIN` | 10 / 60 | per-user upload rate limit |
| `MEDIA_ALLOWED_TYPES` | jpeg,png,webp | accepted source types (sniffed, not declared) |

At the storage limit the API returns `MEDIA_STORAGE_LIMIT_REACHED` and stores
nothing new; **existing photos keep working and are never auto-deleted**. If
storage usage can't be read, it **fails closed**. Monitor via
`GET /admin/media/usage` (admin) → stored bytes/objects + our own Class A/B op
counts vs. the limits.

## Rollback

Every merge to `main` also publishes an image to GHCR. To redeploy a previous
build, use Render's **Manual Deploy → pick a previous commit**, or the existing
workflow: `gh workflow run deploy.yml -f image_tag=sha-<old-sha>`.
