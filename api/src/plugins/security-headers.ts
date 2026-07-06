import type { FastifyInstance } from 'fastify';

/**
 * Baseline security headers on every response (KUR-111).
 *
 * The API serves JSON only, so the CSP is maximally strict — nothing may
 * load, embed or frame it. The admin panel (KUR-099) is a separate app
 * and will carry its own nonce-based CSP; do NOT loosen this one for it.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export function setupSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(header, value);
    }
  });
}
