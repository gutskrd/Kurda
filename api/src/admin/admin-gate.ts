import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { routeIsPrivileged } from '../plugins/auth.js';
import { isPrivileged } from './roles.js';
import type { AdminTotpService } from './totp-service.js';

/**
 * Mandatory 2FA on every staff-only route.
 *
 * The TOTP machinery already existed, but only four routes used the guard that
 * checks it — `requireAdmin`. Everything else (analytics, economy, moderation,
 * users, shop, game content, config, …) was behind `requireRoles('admin')`,
 * which never looks at 2FA. So a password alone reached almost the whole panel.
 *
 * This is deliberately ONE hook rather than a change to forty route
 * definitions: the failure mode of per-route guards is that somebody forgets,
 * and nothing tells them.
 *
 * It used to decide what counted as staff surface from the URL — anything under
 * /admin. That was the same failure in a different place. Six routes just as
 * privileged as anything in the panel did not live under that prefix:
 *
 *   POST  /shop/items                              define a catalogue item
 *   PATCH /shop/items/:sku/stock                   pull an item in or out of stock
 *   POST  /iap/packs                               define a real-money gem pack
 *   POST  /tournaments                             schedule a tournament
 *   POST  /tournaments/:id/start                   seed and generate the bracket
 *   POST  /tournaments/:id/matches/:matchId/result declare a winner
 *
 * Each one asked for an admin role and each one skipped the gate, so a stolen
 * password — with no second factor — could price the shop, mint gem packs, and
 * decide who won a tournament.
 *
 * So the question the gate asks is no longer "where does this URL live" but
 * "does this route require a role", which is what actually makes a route staff
 * surface. `requireRoles` and `requireAdmin` mark themselves, the route table is
 * read once at boot, and a staff route added anywhere in the app is covered on
 * the day it is written. The /admin prefix is still honoured on top of that, so
 * a route that reaches the panel some other way does not fall through.
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
  /**
   * Route patterns — `/tournaments/:id/start`, not `/tournaments/abc/start` —
   * whose guards say they are staff surface. Collected at boot, matched exactly,
   * so nothing here depends on how a URL is spelled or normalised.
   */
  const privileged = new Set<string>();

  app.addHook('onRoute', (route) => {
    if (routeIsPrivileged(route.preHandler)) privileged.add(route.url);
  });

  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const pattern = req.routeOptions?.url;
    const staffSurface =
      path.startsWith('/admin/') || path === '/admin' || (pattern !== undefined && privileged.has(pattern));
    if (!staffSurface) return;
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
