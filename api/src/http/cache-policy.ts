/**
 * Edge cache policy for API responses. An authenticated response is never edge-cacheable (`private, no-store`) on
 * any route, so one user's data can never be served to another; only anonymous GETs of explicitly public resources
 * get a shared max-age.
 */

/** Public, anonymously-shareable GET routes → their edge max-age (seconds). */
const EDGE_CACHEABLE: Record<string, number> = {
  '/dictionary/entries/:id': 86_400, // an entry rarely changes
  '/dictionary/word-of-day': 3_600, // rotates daily; short edge TTL is safe
  '/dictionary/search': 300, // query results; brief edge cache
  '/art/overrides': 300, // pictures put in place of the built-in art; a change shows within minutes
};

export interface CachePolicy {
  cacheControl: string;
  vary?: string;
}

/** The cache policy for a request; `routeUrl` is the route template (e.g. `/dictionary/entries/:id`), not the raw URL. */
export function cachePolicy(routeUrl: string, method: string, authenticated: boolean): CachePolicy {
  // Authenticated responses are never edge-cacheable, on every route.
  if (authenticated) return { cacheControl: 'private, no-store' };

  if (method.toUpperCase() !== 'GET') return { cacheControl: 'no-store' };

  const maxAge = EDGE_CACHEABLE[routeUrl];
  if (maxAge === undefined) return { cacheControl: 'no-store' };

  return {
    cacheControl: `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    // Vary on Authorization so an anonymous entry is never served to an authenticated request.
    vary: 'Authorization, Accept-Encoding',
  };
}

/** Whether a route is edge-cacheable for anonymous GETs (for the audit/docs). */
export function isEdgeCacheable(routeUrl: string): boolean {
  return routeUrl in EDGE_CACHEABLE;
}
