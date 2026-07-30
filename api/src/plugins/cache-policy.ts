import type { FastifyInstance } from 'fastify';
import { cachePolicy, isEdgeCacheable } from '../http/cache-policy.js';

/**
 * Stamps `Cache-Control` on API responses per the edge-cache policy (KUR-117).
 * Conservative by design: it only sets a header when the response is
 * authenticated (→ `private, no-store`, the safety invariant so a CDN can never
 * cache one user's data) or the route is explicitly edge-cacheable. Dynamic
 * public routes and routes that already set their own Cache-Control (media,
 * KUR-013) are left untouched.
 */
export function setupCachePolicy(app: FastifyInstance): void {
  app.addHook('onSend', async (req, reply, payload) => {
    const routeUrl = req.routeOptions?.url;
    // hijacked/upgraded responses (e.g. the WebSocket gateway, KUR-049) have
    // already flushed their headers — writing another would throw HEADERS_SENT.
    if (!routeUrl || reply.raw.headersSent || reply.getHeader('cache-control')) return payload;

    const authenticated = !!req.user;
    if (!authenticated && !isEdgeCacheable(routeUrl)) return payload;

    const policy = cachePolicy(routeUrl, req.method, authenticated);
    reply.header('cache-control', policy.cacheControl);
    if (policy.vary) reply.header('vary', policy.vary);
    return payload;
  });
}
