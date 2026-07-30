# CDN + client caching audit (KUR-117)

## Static / media assets — immutable, content-hashed
Media objects are stored under **content-hashed keys** (`mediaKey`), so identical
bytes always map to the same URL and a URL's bytes never change. They're served
with **`public, max-age=31536000, immutable`** (`IMMUTABLE_CACHE_CONTROL`,
KUR-013) — a 1-year immutable cache. New content = new hash = new URL, so there's
never a stale-asset problem and no invalidation needed. Front with
`CDN_BASE_URL`.

## API response classification (`api/src/http/cache-policy.ts`)
`cachePolicy(routeTemplate, method, authenticated)` decides edge-cacheability:

| Response | Cache-Control |
|----------|---------------|
| **Authenticated (any route)** | `private, no-store` — **never edge-cached** |
| Anonymous GET, public resource (dictionary entry / word-of-day / search) | `public, max-age=…, s-maxage=…` + `Vary: Authorization, Accept-Encoding` |
| Non-GET, or unclassified public GET | `no-store` |

The `setupCachePolicy` hook stamps these (conservatively — it never overrides a
route that set its own `Cache-Control`, e.g. media).

### The invariant (edge case)
An **authenticated response is `private, no-store` for every route** — so a CDN
can never serve one user's data to another. Belt-and-suspenders: cacheable
entries also `Vary: Authorization`. This is unit-tested (`cache-policy.test.ts`)
and is exactly the "two users through the CDN" case the issue calls out — verify
in staging by requesting an authed endpoint as two users through the CDN and
confirming both get uncached, distinct responses.

## Hit-ratio monitoring
- **Media cache-hit ratio target: ≥ 90%.** Export the CDN's hit/miss metrics
  (edge logs or provider API) to the dashboards (KUR-106) and alert if the media
  hit ratio drops below 90% (usually a sign of churning URLs or a misconfigured
  `Cache-Control`).
- Track edge hit ratio for the cacheable API routes too; a low ratio there means
  the `s-maxage` is too short or `Vary` is over-fragmenting.
