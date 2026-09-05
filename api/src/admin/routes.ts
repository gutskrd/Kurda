import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { capabilitiesFor, isAdmin, isAdminRole, PRIVILEGED_ROLES, type AdminRole } from './roles.js';
import type { AdminTotpService } from './totp-service.js';

const codeBody = z.object({ code: z.string().regex(/^\d{6}$/) });

function forbid(reply: FastifyReply, req: FastifyRequest, code: string, message: string): void {
  void reply.code(403).send({ code, message, requestId: req.id });
}

/**
 * Guard for admin routes (KUR-099): an admin role (optionally a specific one)
 * AND a confirmed TOTP enrollment — 2FA is mandatory. Roles are re-read from the
 * DB on every request by `setupAuth`, so an admin demoted mid-session loses
 * access on their very next call (no cached authority).
 */
export function requireAdmin(totp: AdminTotpService, ...roles: AdminRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userRoles = req.user?.roles ?? [];
    const roleOk = roles.length > 0 ? roles.some((r) => userRoles.includes(r)) : isAdmin(userRoles);
    if (!req.user || !roleOk) {
      forbid(reply, req, 'FORBIDDEN', 'insufficient permissions');
      return;
    }
    if (!(await totp.isConfirmed(req.user.id))) {
      forbid(reply, req, 'TOTP_REQUIRED', 'admin 2FA enrollment required');
    }
  };
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
    return {
      roles: req.user!.roles.filter(isAdminRole),
      needsEnrollment: !state.enrolled,
      needsVerification: state.enrolled && !state.verified,
      capabilities: state.enrolled && state.verified ? capabilitiesFor(req.user!.roles) : [],
    };
  });

  /** Confirm enrollment by entering a live code. */
  app.post(
    '/admin/2fa/confirm',
    { schema: { body: codeBody }, preHandler: adminOnly },
    async (req, reply) => {
      const ok = await totp.confirm(req.user!.id, (req.body as z.infer<typeof codeBody>).code);
      if (!ok) return reply.code(400).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      // confirming proves possession right now, so it also clears the gate for
      // this session — otherwise enrollment would end by asking for a second code
      await totp.verify(req.user!.id, (req.body as z.infer<typeof codeBody>).code, req.user!.familyId);
      return { confirmed: true };
    },
  );

  /** Login 2FA step: verify a code against the confirmed secret. */
  app.post(
    '/admin/auth/verify',
    { schema: { body: codeBody }, preHandler: adminOnly },
    async (req, reply) => {
      // no family id means nothing can be recorded, so the gate would refuse
      // straight after a "successful" check — fail loudly instead
      if (!req.user!.familyId) {
        return reply.code(400).send({ code: 'SESSION_UNVERIFIABLE', message: 'sign in again, then enter your code' });
      }
      const ok = await totp.verify(req.user!.id, (req.body as z.infer<typeof codeBody>).code, req.user!.familyId);
      if (!ok) return reply.code(401).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
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
