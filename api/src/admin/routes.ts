import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles, markPrivileged } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { capabilitiesFor, hasCapability, isAdmin, isAdminRole, PRIVILEGED_ROLES, type AdminRole, type Capability } from './roles.js';
import type { AdminTotpService } from './totp-service.js';

const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Code attempts per person, whichever of the two code routes they go through. */
const CODE_RATE_LIMIT = { max: 10, windowMs: 5 * 60_000, per: 'user-or-ip' as const };

/** Too many wrong codes: the second factor is locked for a while (AdminTotpService). */
function codeLocked(retryAfterSec: number): AppError {
  return new AppError('TOTP_LOCKED', 429, 'too many wrong codes — try again later', { retryAfterSec });
}

/**
 * Refuse, and wait until the refusal has gone out. A guard that only sent it
 * let the route's handler run as well: the app's onSend hooks are async, so
 * the reply is not finished when the guard returns, and Fastify goes on to the
 * handler unless the hook waits for the reply (or returns it). A moderator
 * asking to change a balance was told 403 — and the balance changed.
 */
async function forbid(reply: FastifyReply, req: FastifyRequest, code: string, message: string): Promise<void> {
  await reply.code(403).send({ code, message, requestId: req.id });
}

/**
 * Guard for admin routes (KUR-099): an admin role (optionally a specific one)
 * AND a confirmed TOTP enrollment — 2FA is mandatory. Roles are re-read from the
 * DB on every request by `setupAuth`, so an admin demoted mid-session loses
 * access on their very next call (no cached authority).
 */
export function requireAdmin(totp: AdminTotpService, ...roles: AdminRole[]) {
  return markPrivileged(async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userRoles = req.user?.roles ?? [];
    const roleOk = roles.length > 0 ? roles.some((r) => userRoles.includes(r)) : isAdmin(userRoles);
    if (!req.user || !roleOk) {
      await forbid(reply, req, 'FORBIDDEN', 'insufficient permissions');
      return;
    }
    if (!(await totp.isConfirmed(req.user.id))) {
      await forbid(reply, req, 'TOTP_REQUIRED', 'admin 2FA enrollment required');
    }
  });
}

/**
 * Guard for a capability rather than a role list, so the role table in
 * `roles.ts` is the one place that says who may do what. Marked privileged, so
 * the 2FA gate covers every route using it. Put `requireAuth` before it: a
 * signed-out caller gets 401 there, not a 403 here.
 */
export function requireCapability(capability: Capability) {
  return markPrivileged(async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user || !hasCapability(req.user.roles, capability)) {
      await forbid(reply, req, 'FORBIDDEN', 'insufficient permissions');
    }
  });
}

/** Admin auth: TOTP enrollment + login 2FA + an identity probe (KUR-099). */
export function registerAdminRoutes(app: FastifyInstance, totp: AdminTotpService): void {
  // The legacy 'admin' role is included on purpose. Most admin routes are still
  // guarded by requireRoles('admin'), so an account holding only that role can
  // reach the panel — and without this it could never enroll in the 2FA the gate
  // now demands, locking it out of everything with no way back.
  const adminOnly = [requireAuth, requireRoles(...PRIVILEGED_ROLES)];

  /**
   * Start 2FA enrollment: returns the secret + otpauth URI (show once as QR).
   *
   * Refused once a secret is confirmed, unless this session has already passed
   * 2FA. Enrolling regenerates the secret and clears confirmation, so leaving it
   * open would have made the whole gate pointless: anyone with the password
   * could re-enroll to a secret they control and walk straight in. Recovering a
   * lost device is deliberately an out-of-band action (another admin, or
   * clearing the row) rather than something a password alone can do.
   */
  app.post('/admin/2fa/enroll', { config: { skipValidation: true }, preHandler: adminOnly }, async (req, reply) => {
    const state = await totp.state(req.user!.id, req.user!.familyId);
    if (state.enrolled && !state.verified) {
      return reply.code(403).send({
        code: 'TOTP_ALREADY_ENROLLED',
        message: 'this account already has 2FA — enter a code, or ask another admin to reset it',
        requestId: req.id,
      });
    }
    return totp.enroll(req.user!.id);
  });

  /**
   * What the admin panel needs before showing anything: whether this account has
   * 2FA set up, and whether THIS session has cleared it. Exempt from the gate —
   * it is how the panel knows which screen to show.
   */
  app.get('/admin/session', { config: { skipValidation: true }, preHandler: adminOnly }, async (req) => {
    const state = await totp.state(req.user!.id, req.user!.familyId);
    const cleared = state.enrolled && state.verified;
    return {
      roles: req.user!.roles.filter(isAdminRole),
      needsEnrollment: !state.enrolled,
      needsVerification: state.enrolled && !state.verified,
      capabilities: cleared ? capabilitiesFor(req.user!.roles) : [],
      /**
       * Every staff role the account holds, the legacy `admin` and `founder`
       * included, which `roles` leaves out. Many routes are still guarded by a
       * role list rather than a capability (analytics, the economy, the shop,
       * tags…), so the panel needs these to show only the pages it can open.
       * Empty until 2FA is done, like the capabilities.
       */
      staffRoles: cleared ? req.user!.roles.filter((r) => PRIVILEGED_ROLES.includes(r)) : [],
    };
  });

  /**
   * Confirm enrollment by entering a live code.
   *
   * Both code routes are limited per person on top of the count of wrong codes
   * the service keeps (AdminTotpService.checkCode): a burst is stopped here,
   * and guessing over a longer time is stopped there.
   */
  app.post(
    '/admin/2fa/confirm',
    { schema: { body: codeBody }, config: { rateLimit: CODE_RATE_LIMIT }, preHandler: adminOnly },
    async (req, reply) => {
      // confirming proves possession right now, so it also clears the gate for
      // this session — otherwise enrollment would end by asking for a second code
      const res = await totp.confirm(req.user!.id, (req.body as z.infer<typeof codeBody>).code, req.user!.familyId);
      if (!res.ok) {
        if (res.reason === 'locked') throw codeLocked(res.retryAfterSec);
        return reply.code(400).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      }
      return { confirmed: true };
    },
  );

  /** Login 2FA step: verify a code against the confirmed secret. */
  app.post(
    '/admin/auth/verify',
    { schema: { body: codeBody }, config: { rateLimit: CODE_RATE_LIMIT }, preHandler: adminOnly },
    async (req, reply) => {
      // no family id means nothing can be recorded, so the gate would refuse
      // straight after a "successful" check — fail loudly instead
      if (!req.user!.familyId) {
        return reply.code(400).send({ code: 'SESSION_UNVERIFIABLE', message: 'sign in again, then enter your code' });
      }
      const res = await totp.verify(req.user!.id, (req.body as z.infer<typeof codeBody>).code, req.user!.familyId);
      if (!res.ok) {
        if (res.reason === 'locked') throw codeLocked(res.retryAfterSec);
        return reply.code(401).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      }
      return { ok: true, capabilities: capabilitiesFor(req.user!.roles) };
    },
  );

  /**
   * Sign out of the admin panel: forget this login's 2FA so the next visit has
   * to enter a code again. Exempt from the gate, so signing out still works once
   * the window has expired.
   */
  app.post('/admin/session/end', { config: { skipValidation: true }, preHandler: adminOnly }, async (req) => {
    await totp.clearVerification(req.user!.id, req.user!.familyId);
    return { ok: true };
  });

  /** Admin identity + effective capabilities (requires role + confirmed 2FA). */
  app.get(
    '/admin/me',
    { config: { skipValidation: true }, preHandler: [requireAuth, requireAdmin(totp)] },
    async (req) => ({
      userId: req.user!.id,
      roles: req.user!.roles.filter(isAdminRole),
      capabilities: capabilitiesFor(req.user!.roles),
    }),
  );
}
