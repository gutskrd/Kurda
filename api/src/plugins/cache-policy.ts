import type { FastifyInstance } from 'fastify';
import { cachePolicy, isEdgeCacheable } from '../http/cache-policy.js';

/**
 * Stamps `Cache-Control` on API responses per the edge-cache policy (KUR-117).
 * Conservative by design: it only sets a header when the response is
 * authenticated (→ `private, no-store`, the safety invariant so a CDN can never
 * cache one user's data) or the route is explicitly edge-cacheable. Dynamic
 * public routes are left untouched, and any route that sets its own
 * Cache-Control later (media, KUR-013) overrides this default.
 *
 * The header is set in `preHandler` — before the route runs and before any
 * hijacked/upgraded response (the WebSocket gateway, KUR-049) flushes its
 * headers — so it can never fire after the response is committed
 * (ERR_HTTP_HEADERS_SENT).
 */
export function setupCachePolicy(app: FastifyInstance): void {
  app.addHook('preHandler', async (req, reply) => {
    const routeUrl = req.routeOptions?.url;
    if (!routeUrl) return;

    const authenticated = !!req.user;
    if (!authenticated && !isEdgeCacheable(routeUrl)) return;

    const policy = cachePolicy(routeUrl, req.method, authenticated);
    reply.header('cache-control', policy.cacheControl);
    if (policy.vary) reply.header('vary', policy.vary);
  });
}
