import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { ADMIN_ROLES, capabilitiesFor, isAdmin, isAdminRole, type AdminRole } from './roles.js';
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
  const adminOnly = [requireAuth, requireRoles(...ADMIN_ROLES)];

  /** Start 2FA enrollment: returns the secret + otpauth URI (show once as QR). */
  app.post('/admin/2fa/enroll', { config: { skipValidation: true }, preHandler: adminOnly }, async (req) =>
    totp.enroll(req.user!.id),
  );

  /** Confirm enrollment by entering a live code. */
  app.post(
    '/admin/2fa/confirm',
    { schema: { body: codeBody }, preHandler: adminOnly },
    async (req, reply) => {
      const ok = await totp.confirm(req.user!.id, (req.body as z.infer<typeof codeBody>).code);
      if (!ok) return reply.code(400).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      return { confirmed: true };
    },
  );

  /** Login 2FA step: verify a code against the confirmed secret. */
  app.post(
    '/admin/auth/verify',
    { schema: { body: codeBody }, preHandler: adminOnly },
    async (req, reply) => {
      const ok = await totp.verify(req.user!.id, (req.body as z.infer<typeof codeBody>).code);
      if (!ok) return reply.code(401).send({ code: 'INVALID_CODE', message: 'invalid or expired code' });
      return { ok: true, capabilities: capabilitiesFor(req.user!.roles) };
    },
  );

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
