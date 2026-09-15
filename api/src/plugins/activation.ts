import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * An account that has not confirmed its address cannot do anything.
 *
 * The web app has always held an unverified account at the verify screen, and
 * that is a redirect, not a rule. The server checked `deleted_at` and
 * `banned_at` on every request and never once looked at `email_verified_at` —
 * so a token from a fresh, unconfirmed signup could do everything. Registering
 * and then posting took one request:
 *
 *   POST /library/posts  →  201, status: "published"
 *
 * which is the whole point of email verification gone: it is the control that
 * makes a throwaway account cost something, and it was decoration.
 *
 * Reading stays open. A guest can already read the wall without an account at
 * all, so refusing GETs to somebody who has at least started signing up would
 * be stricter than the product is, and would tell them nothing they can act on.
 * What is refused is everything that *does* something — writing, buying,
 * messaging, befriending, playing a ranked match.
 *
 * One hook rather than a guard on each of two hundred mutating routes, and
 * deny-by-default rather than an opt-in list, for the reason the admin 2FA gate
 * is built the same way: the failure mode of per-route guards is that somebody
 * forgets, and nothing tells them. A route added tomorrow is covered.
 *
 * The exemptions are the things somebody must be able to do in order to get
 * through the gate, or to leave. Every one is an exact `METHOD /path`:
 *
 *   POST /auth/verify-email…            confirm the address
 *   POST /auth/resend-verification…     ask for another code
 *   POST /auth/login, /refresh, /oauth  sign in, and stay signed in while you do
 *   POST /auth/register                 (no token yet, so the gate never fires)
 *   POST /auth/request-password-reset   you can forget a password before
 *   POST /auth/reset-password           you ever confirm the address
 *   DELETE /me                          leave. Being unverified must not trap an account.
 *   DELETE /me/sessions                 sign out everywhere
 *   POST /me/heartbeat                  presence, which the app pings while you sit on
 *                                       the verify screen; refusing it would only fill the log
 *
 * Nothing in that list writes content or spends anything.
 *
 * It used to be a `/auth/` prefix, which is not the same claim. A prefix says
 * "everything filed under authentication is harmless", and `POST
 * /auth/phone/send` is filed under authentication and sends an SMS — a real
 * message, to a real carrier, at a real price, on behalf of somebody who has
 * not yet proved they own the email address they signed up with. The stub
 * sender made that free and therefore invisible; a configured one would not.
 *
 * So they are listed by method *and* path, the way `DELETE /me` always was:
 * a new `/auth/` route is refused until somebody decides it belongs here, and
 * adding `PATCH /me` one day cannot quietly inherit what `DELETE /me` was given.
 */

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Exact `METHOD /path` pairs that must work before an address is confirmed. */
const EXEMPT = new Set([
  // getting in, and staying in long enough to confirm
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/oauth',
  // confirming, which is the gate itself
  'POST /auth/verify-email',
  'POST /auth/verify-email-code',
  'POST /auth/resend-verification',
  'POST /auth/resend-verification-code',
  // a password can be forgotten before an address is confirmed
  'POST /auth/request-password-reset',
  'POST /auth/reset-password',
  // leaving, and being present while you decide
  'DELETE /me',
  'DELETE /me/sessions',
  'POST /me/heartbeat',
]);

/**
 * Would this request be refused, if the account were unconfirmed?
 *
 * Separate from the hook so the rule can be read and tested as a rule. The
 * interesting cases are the ones with no route behind them yet: a `PATCH /me`
 * added next year must be refused by default, and that cannot be shown by
 * calling an endpoint that does not exist.
 */
export function blockedBeforeActivation(method: string, url: string): boolean {
  if (!WRITES.has(method)) return false;
  const path = url.split('?')[0] ?? '';
  return !EXEMPT.has(`${method} ${path}`);
}

export function installActivationGate(app: FastifyInstance): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // not signed in: the route's own guard answers, and says the right thing.
    // A verified account is the normal case and costs one comparison.
    const user = req.user;
    if (!user || user.emailVerified) return;
    if (!blockedBeforeActivation(req.method, req.url)) return;

    await reply.code(403).send({
      code: 'ACCOUNT_NOT_ACTIVATED',
      message: 'confirm your email address to use MyKurda',
      requestId: req.id,
    });
  });
}
