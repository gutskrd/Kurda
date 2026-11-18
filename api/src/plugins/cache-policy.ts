import type { FastifyInstance } from 'fastify';
import { cachePolicy, isEdgeCacheable } from '../http/cache-policy.js';

/**
 * Stamps `Cache-Control` per the edge-cache policy. It sets a header only for authenticated responses (`private,
 * no-store`, so a CDN never caches one user's data) or explicitly edge-cacheable routes; other public routes are left
 * alone, and a route setting its own header overrides it. Set in `preHandler`, before the route runs or a hijacked
 * response (the WebSocket gateway) flushes headers, so it never fires after the response is committed.
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
