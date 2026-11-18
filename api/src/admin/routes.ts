import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles, markPrivileged } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { capabilitiesFor, hasCapability, isAdmin, isAdminRole, PRIVILEGED_ROLES, type AdminRole, type Capability } from './roles.js';
import type { AdminTotpService } from './totp-service.js';
import { voicesOf } from '../recording/links.js';

const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });

/** Code attempts per person, whichever of the two code routes they go through. */
const CODE_RATE_LIMIT = { max: 10, windowMs: 5 * 60_000, per: 'user-or-ip' as const };

/** Too many wrong codes: the second factor is locked for a while (AdminTotpService). */
function codeLocked(retryAfterSec: number): AppError {
  return new AppError('TOTP_LOCKED', 429, 'too many wrong codes — try again later', { retryAfterSec });
}

/**
 * Refuse and wait until the refusal has gone out. The app's onSend hooks are async, so the reply is not finished when a
 * guard returns, and Fastify runs the handler unless the hook awaits (or returns) the reply.
 */
async function forbid(reply: FastifyReply, req: FastifyRequest, code: string, message: string): Promise<void> {
  await reply.code(403).send({ code, message, requestId: req.id });
}

/**
 * Guard for admin routes: an admin role (optionally a specific one) AND a confirmed TOTP enrollment. Roles are re-read
 * from the DB on every request by `setupAuth`, so a demotion takes effect on the next call.
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
 * Guard for a capability rather than a role list, so `roles.ts` alone says who may do what. Marked privileged so the
 * 2FA gate covers it. Put `requireAuth` before it so a signed-out caller gets 401, not 403.
 */
export function requireCapability(capability: Capability) {
  return markPrivileged(async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user || !hasCapability(req.user.roles, capability)) {
      await forbid(reply, req, 'FORBIDDEN', 'insufficient permissions');
    }
  });
}

/** Admin auth: TOTP enrollment + login 2FA + an identity probe. */
export function registerAdminRoutes(app: FastifyInstance, totp: AdminTotpService): void {
  // The legacy 'admin' role is included on purpose: an account holding only it reaches the panel, and must be able to
  // enroll in the 2FA the gate demands.
  const adminOnly = [requireAuth, requireRoles(...PRIVILEGED_ROLES)];

  /** A wrong code goes in the security log; a wrong code that locks the codes is critical there. */
  const recordWrongCode = (userId: string, res: { reason: string; retryAfterSec?: number }, step: 'setup' | 'sign-in') =>
    app.securityLog.record(res.reason === 'locked' ? 'console.2fa_locked' : 'console.2fa_failed', {
      userId,
      staff: true,
      details: { step, ...(res.reason === 'locked' ? { retryAfterSec: res.retryAfterSec } : {}) },
    });

  /**
   * Start 2FA enrollment: returns the secret and otpauth URI (shown once as a QR code).
   *
   * Refused once a secret is confirmed unless this session already passed 2FA, because enrolling regenerates the secret
   * and anyone with the password could otherwise re-enroll to a secret they control. Recovering a lost device is
   * deliberately out of band (another admin, or clearing the row).
   */
  app.post('/admin/2fa/enroll', { config: { skipValidation: true }, preHandler: adminOnly }, async (req, reply) => {
    const state = await totp.state(req.user!.id, req.user!.familyId);
    if (state.enrolled && !state.verified) {
      await app.securityLog.record('console.2fa_reset_refused', { userId: req.user!.id, staff: true });
      return reply.code(403).send({
        code: 'TOTP_ALREADY_ENROLLED',
        message: 'this account already has 2FA — enter a code, or ask another admin to reset it',
        requestId: req.id,
      });
    }
    const enrolled = await totp.enroll(req.user!.id);
    // a fresh secret for an account without one; replacing a confirmed one is the "enrolled" event
    if (!state.enrolled) await app.securityLog.record('console.2fa_enroll_started', { userId: req.user!.id, staff: true });
    return enrolled;
  });

  /**
   * What the admin panel needs first: whether this account has 2FA set up and whether THIS session cleared it. Exempt
   * from the gate, since it decides which screen to show.
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
       * Every staff role the account holds, including the legacy `admin` and `founder` that `roles` leaves out, because
       * many routes are still guarded by role lists. Empty until 2FA is done, like the capabilities.
       */
      staffRoles: cleared ? req.user!.roles.filter((r) => PRIVILEGED_ROLES.includes(r)) : [],
      /**
       * The voices this account records (recording/links.ts), so the console opens on that person's lines. A failed
       * read leaves none; the console must still open.
       */
      voices: cleared
        ? await voicesOf(app.db, req.user!.id).catch((err: unknown) => {
            req.log.warn({ err }, 'could not read the voices linked to this account');
            return [];
          })
        : [],
    };
  });

  /**
   * Confirm enrollment with a live code. Both code routes are rate-limited per person on top of the service's
   * wrong-code count (AdminTotpService.checkCode): bursts stop here, slow guessing stops there.
   */
  app.post(
    '/admin/2fa/confirm',
    { schema: { body: codeBody }, config: { rateLimit: CODE_RATE_LIMIT }, preHandler: adminOnly },
    async (req, reply) => {
      // confirming proves possession right now, so it also clears the gate for
      // this session — otherwise enrollment would end by asking for a second code
      const res = await totp.confirm(req.user!.id, (req.body as z.infer<typeof codeBody>).code, req.user!.familyId);
      if (!res.ok) {
        await recordWrongCode(req.user!.id, res, 'setup');
        if (res.reason === 'locked') throw codeLocked(res.retryAfterSec);
        return reply.code(400).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      }
      await app.securityLog.record('console.2fa_enrolled', { userId: req.user!.id, staff: true });
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
        await recordWrongCode(req.user!.id, res, 'sign-in');
        if (res.reason === 'locked') throw codeLocked(res.retryAfterSec);
        return reply.code(401).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      }
      await app.securityLog.record('console.2fa_passed', { userId: req.user!.id, staff: true });
      return { ok: true, capabilities: capabilitiesFor(req.user!.roles) };
    },
  );

  /**
   * Sign out of the admin panel: forget this login's 2FA so the next visit needs a code. Exempt from the gate so
   * sign-out works after the window expires.
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
