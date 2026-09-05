import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isPrivileged } from './roles.js';
import type { AdminTotpService } from './totp-service.js';

/**
 * Mandatory 2FA on everything under /admin.
 *
 * The TOTP machinery already existed, but only four routes used the guard that
 * checks it — `requireAdmin`. Everything else (analytics, economy, moderation,
 * users, shop, game content, config, …) was behind `requireRoles('admin')`,
 * which never looks at 2FA. So a password alone reached almost the whole panel.
 *
 * This is deliberately ONE hook keyed off the URL prefix rather than a change to
 * forty route definitions. Every admin route lives under /admin, so a new one is
 * covered the day it is written — the failure mode of per-route guards is that
 * somebody forgets, and nothing tells them.
 *
 * Two distinct refusals, so the panel can show the right screen:
 *   TOTP_ENROLLMENT_REQUIRED — no confirmed secret yet; set one up
 *   TOTP_REQUIRED            — enrolled, but this session has not entered a code
 */

/**
 * Paths that must stay reachable, or an admin could never get through the gate.
 * Each still requires an admin role of its own, so this is not an open door.
 */
const EXEMPT = new Set([
  '/admin/session', // tells the panel which screen to show
  '/admin/2fa/enroll',
  '/admin/2fa/confirm',
  '/admin/auth/verify',
  '/admin/session/end', // signing out must work even once the window has expired
]);

async function refuse(reply: FastifyReply, req: FastifyRequest, code: string, message: string): Promise<void> {
  await reply.code(403).send({ code, message, requestId: req.id });
}

export function installAdminGate(app: FastifyInstance, totp: AdminTotpService): void {
  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (!path.startsWith('/admin/') && path !== '/admin') return;
    if (EXEMPT.has(path)) return;

    // Not signed in, or not staff at all: say nothing about 2FA. The route's own
    // guard answers 401/403, so this never reveals that a path exists or hints
    // at what a non-admin would need to reach it.
    if (!req.user || !isPrivileged(req.user.roles)) return;

    const state = await totp.state(req.user.id, req.user.familyId);
    if (!state.enrolled) {
      await refuse(reply, req, 'TOTP_ENROLLMENT_REQUIRED', 'set up admin 2FA to continue');
      return;
    }
    if (!state.verified) {
      await refuse(reply, req, 'TOTP_REQUIRED', 'enter your 2FA code to continue');
    }
  });
}
