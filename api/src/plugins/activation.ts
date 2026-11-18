import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * An account that has not confirmed its address cannot do anything; email confirmation is what makes a throwaway
 * account cost something. Reading stays open, since guests can read without an account; everything that does
 * something (writing, buying, messaging, befriending, ranked play) is refused.
 *
 * One deny-by-default hook rather than a guard per mutating route, like the admin 2FA gate, so a route added later is
 * covered without anyone remembering. The exemptions are what someone needs to get through the gate or to leave, each
 * an exact `METHOD /path`:
 *
 *   POST /auth/verify-email…            confirm the address
 *   POST /auth/resend-verification…     ask for another code
 *   POST /auth/change-pending-email     correct a mistyped address
 *   POST /auth/login, /refresh, /oauth  sign in and stay signed in
 *   POST /auth/logout                   sign out
 *   POST /auth/register                 (no token yet, so the gate never fires)
 *   POST /auth/request-password-reset   a password can be forgotten
 *   POST /auth/reset-password           before the address is confirmed
 *   POST /auth/claim                    a guest claims the account (auth/guest.ts); guests are never unconfirmed, but an
 *                                       account that already claimed should hear NOT_A_GUEST from the route
 *   DELETE /me                          leave; being unverified must not trap an account
 *   DELETE /me/sessions                 sign out everywhere
 *   POST /me/heartbeat                  presence, pinged while on the verify screen
 *
 * None writes content or spends anything. They are listed by method and path, not an `/auth/` prefix, because
 * `POST /auth/phone/send` is under /auth/ and sends a paid SMS: a new /auth/ route is refused until someone decides it
 * belongs here, and a future `PATCH /me` cannot inherit what `DELETE /me` was given.
 */

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Exact `METHOD /path` pairs that must work before an address is confirmed. */
const EXEMPT = new Set([
  // getting in, and staying in long enough to confirm
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/oauth',
  'POST /auth/logout',
  // confirming, which is the gate itself
  'POST /auth/verify-email',
  'POST /auth/verify-email-code',
  'POST /auth/resend-verification',
  'POST /auth/resend-verification-code',
  // putting a mistyped address right, which only an unconfirmed account can do
  'POST /auth/change-pending-email',
  // a password can be forgotten before an address is confirmed
  'POST /auth/request-password-reset',
  'POST /auth/reset-password',
  // claiming a guest account, which the route itself refuses to anyone else
  'POST /auth/claim',
  // leaving, and being present while you decide
  'DELETE /me',
  'DELETE /me/sessions',
  'POST /me/heartbeat',
]);

/**
 * Whether this request would be refused for an unconfirmed account. Separate from the hook so the rule can be tested
 * for routes that do not exist yet.
 */
export function blockedBeforeActivation(method: string, url: string): boolean {
  if (!WRITES.has(method)) return false;
  const path = url.split('?')[0] ?? '';
  return !EXEMPT.has(`${method} ${path}`);
}

export function installActivationGate(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Not signed in: the route's own guard answers. A verified account costs one comparison.
    const user = req.user;
    if (!user || user.emailVerified) return;
    if (!blockedBeforeActivation(req.method, req.url)) return;

    await reply.code(403).send({
      code: 'ACCOUNT_NOT_ACTIVATED',
      message: 'confirm your email address to use Hevalo',
      requestId: req.id,
    });
  });
}
