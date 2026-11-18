import type { FastifyInstance } from 'fastify';

/**
 * Baseline security headers on every response. The API serves only JSON, so the CSP is as strict as possible: nothing
 * may load, embed or frame it. The admin panel carries its own CSP; do not loosen this one for it.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  // 'cross-origin', not 'same-origin': browser clients on other origins call this API. CORS still gates who may read a
  // response; same-origin CORP would block the read entirely.
  'cross-origin-resource-policy': 'cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export function setupSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(header, value);
    }
  });
}
