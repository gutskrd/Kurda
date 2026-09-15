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

> **The blueprint is on `starter`** — always-on API, durable Postgres, no idle
> sleep and no time limit. Keep it in step with the dashboard: a blueprint that
> still said `free` would try to move a paid database back down the next time it
> is applied.
>
> **Email is what signup actually depends on.** The API enqueues the verification
> code and a worker sends it. There is a worker either way — `app.ts` runs one
> in-process unless `RUN_WORKER_IN_API=false` — so the queue has a consumer on a
> single-service deploy. What it does *not* have without configuration is a way
> to send: with no `RESEND_API_KEY` (or `SMTP_URL` / `SMTP_HOST`) the provider is
> a stub that delivers nothing, and **nobody can finish signing up**, because an
> unconfirmed account is refused every write.
>
> The API says so at boot, loudly, in production:
>
> ```
> EMAIL IS NOT CONFIGURED: set RESEND_API_KEY (or SMTP_URL / SMTP_HOST).
> ```
>
> That one log line is worth reading after any deploy. It also tells you what the
> API decided about `TRUST_PROXY`, which matters because rate limits are per-IP
> and behind Render's proxy everyone shares one address if it is wrong.
>
> The **dedicated worker service stays commented out**, on purpose — the
> in-process one already does the work. Split it out when job volume starts
> competing with request latency, and read the note above the block in
> `render.yaml` first: it has to be done together with `RUN_WORKER_IN_API=false`
> *and* the mail credentials, or mail silently stops.

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

## Scraping metrics (`METRICS_TOKEN`)

`/metrics` is not served in production unless `METRICS_TOKEN` is set, and a
scraper must then present it as `Authorization: Bearer <token>`. The registry
names the Node version, the process's memory and uptime, and every route with
its traffic and error rates — worth having, not worth handing to strangers.

Set a long random value on the **kurda-api** service and give the same value to
whatever scrapes it. Without one nothing is exposed and nothing breaks; the
endpoint stays open in local development.

## Checking `TRUST_PROXY` after a deploy

`req.ip` is what the rate limiter on `/auth/login` counts against, what the
captcha is told the caller's address is, and what signup and login risk scoring
reasons about. Behind a proxy it has to be worked out from `X-Forwarded-For`,
and `TRUST_PROXY` is how far to walk back along that header from the connection.

The default is `1`, which is safe everywhere: proxies append to the header, so
anything a client writes ends up furthest to the left, and counting from the
right can only ever reach an address a proxy wrote. Counting **too far** is the
dangerous direction — it reaches the client's own text — so production refuses
`TRUST_PROXY=true` outright.

To confirm the number is right for this deployment, read the first log line the
API writes after a restart:

```
proxy chain as seen on the first request — set TRUST_PROXY to the number of
addresses a proxy wrote
  trustProxy: "1"
  socket: "10.x.x.x"
  forwardedFor: "203.0.113.9, 172.71.x.x"
  resolvedIp: "172.71.x.x"
```

Count the addresses in `forwardedFor` that a proxy wrote — every one of them
unless a leading entry is obviously a reader's own invention — and set
`TRUST_PROXY` to that. In the example above the answer is `2`, and `resolvedIp`
would then be `203.0.113.9`. If the API is reached directly with no proxy in
front of it, set `false`.

## Store listing — category and developer name

**Neither lives in this repo.** Both stores read them from their own dashboard,
and a build will not change either one:

| what | where | note |
| --- | --- | --- |
| App Store category | App Store Connect → your app → **App Information** → Category | primary + optional secondary |
| Play Store category | Play Console → **Grow** → Store presence → Main store listing → Category | |
| Developer / seller name | Apple: Developer account **Membership** details. Google: Play Console → **Settings → Developer account → Developer name** | |

The developer name is the one that catches people out. An Apple **Individual**
account publishes under the account holder's legal name and cannot simply be
renamed to the app's name — showing a brand there means an **Organization**
account, which needs a D-U-N-S number and is a migration, not a setting. Google
lets a personal account set any developer name.

`app.json` does declare the intent, so the repo and the listing agree and the
binary carries it:

```jsonc
"ios": { "infoPlist": { "LSApplicationCategoryType": "public.app-category.entertainment" } }
```

That key is a hint used by system surfaces, **not** what the App Store lists the
app under — App Store Connect wins. Android has no equivalent worth setting:
`android:appCategory` has no "entertainment" value (its list is accessibility,
game, audio, video, image, social, news, maps, productivity) and it drives
system grouping like Digital Wellbeing rather than the Play listing.

> Entertainment is a choice, not a default. A language-learning app is a natural
> fit for **Education** too, and the categories are not interchangeable at
> review time — Education invites questions about younger users and the Kids
> category rules. Worth knowing which argument you would rather have.

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
   connect a **custom domain** (e.g. `media.mykurda.com`). That public base is
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
| `MEDIA_UPLOAD_RATE_MAX` / `_WINDOW_MIN` | 10 / 60 | per-user profile-photo upload rate limit |
| `MEDIA_ALLOWED_TYPES` | jpeg,png,webp,heic,avif,tiff | accepted source types (sniffed, not declared); all are re-encoded to WebP. avif and tiff decode with the stock sharp build; **heic needs an HEVC decoder the prebuilt binaries do not ship** (patent-encumbered), so a HEIC is admitted, fails to decode, and returns `HEIC_UNSUPPORTED` with advice. A custom libvips with libde265 would make it work. |
| `MEDIA_IMAGE_MAX_DIMENSION` | 1280 | longest edge of a processed image/meme post |
| `MEDIA_IMAGE_MAX_STORED_KB` | 500 | hard cap on a stored image/meme (processed WebP) |
| `MEDIA_IMAGE_UPLOAD_RATE_MAX` / `_WINDOW_MIN` | 20 / 60 | per-user image/meme upload rate limit |
| `MEDIA_AUDIO_MAX_UPLOAD_MB` | 3 | hard cap on a voice note (stored as-is, no transcode) |
| `MEDIA_AUDIO_MAX_SECONDS` | 120 | advisory max recording length (client-enforced) |
| `MEDIA_AUDIO_ALLOWED_TYPES` | mpeg,mp4,webm | accepted audio types (sniffed, not declared; webm is what a browser records) |
| `MEDIA_AUDIO_UPLOAD_RATE_MAX` / `_WINDOW_MIN` | 20 / 60 | per-user voice-note upload rate limit |

Image/meme posts (KUR-291) upload the same way as avatars — `POST /images/upload`
takes raw bytes, the server sniffs/resizes/WebP-compresses/moderates them, then
`POST /images` creates a post that can only reference a media key that cleared that
pipeline. They share the storage/op ceilings above (one R2 budget).

At the storage limit the API returns `MEDIA_STORAGE_LIMIT_REACHED` and stores
nothing new; **existing photos keep working and are never auto-deleted**. If
storage usage can't be read, it **fails closed**. Monitor via
`GET /admin/media/usage` (admin) → stored bytes/objects + our own Class A/B op
counts vs. the limits.

## Rollback

Every merge to `main` also publishes an image to GHCR. To redeploy a previous
build, use Render's **Manual Deploy → pick a previous commit**, or the existing
workflow: `gh workflow run deploy.yml -f image_tag=sha-<old-sha>`.
