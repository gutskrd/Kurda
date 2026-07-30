/**
 * Edge/CDN cache policy for API responses (KUR-117). Classifies which endpoints
 * a CDN may cache and derives their `Cache-Control`. The load-bearing invariant:
 * an AUTHENTICATED response is NEVER edge-cacheable (always `private, no-store`),
 * so one user's data can never be served to another from an edge — regardless of
 * the route. Only anonymous GETs of explicitly public, shareable resources get a
 * shared-cache max-age.
 */

/** Public, anonymously-shareable GET routes → their edge max-age (seconds). */
const EDGE_CACHEABLE: Record<string, number> = {
  '/dictionary/entries/:id': 86_400, // an entry rarely changes
  '/dictionary/word-of-day': 3_600, // rotates daily; short edge TTL is safe
  '/dictionary/search': 300, // query results; brief edge cache
};

export interface CachePolicy {
  cacheControl: string;
  vary?: string;
}

/**
 * The cache policy for a request. `routeUrl` is the route TEMPLATE
 * (e.g. `/dictionary/entries/:id`), not the raw URL.
 */
export function cachePolicy(routeUrl: string, method: string, authenticated: boolean): CachePolicy {
  // Authenticated → never edge-cacheable. This is the invariant (edge case):
  // it holds for EVERY route, including otherwise-public ones.
  if (authenticated) return { cacheControl: 'private, no-store' };

  if (method.toUpperCase() !== 'GET') return { cacheControl: 'no-store' };

  const maxAge = EDGE_CACHEABLE[routeUrl];
  if (maxAge === undefined) return { cacheControl: 'no-store' };

  return {
    cacheControl: `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    // vary on Authorization so an anonymous cache entry is never served to an
    // authenticated request (defense in depth alongside the auth check above)
    vary: 'Authorization, Accept-Encoding',
  };
}

/** Whether a route is edge-cacheable for anonymous GETs (for the audit/docs). */
export function isEdgeCacheable(routeUrl: string): boolean {
  return routeUrl in EDGE_CACHEABLE;
}
