import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ROUTE_NOT_FOUND_MESSAGE } from '@kurda/shared';
import { routeIsPrivileged } from '../plugins/auth.js';
import type { AdminAccess } from './owner-access.js';
import { isPrivileged } from './roles.js';
import type { AdminTotpService } from './totp-service.js';

/**
 * Mandatory 2FA on every staff-only route, as one hook rather than per-route guards, because a per-route guard fails
 * silently when someone forgets it.
 *
 * A route is staff surface when its guard requires a role: `requireRoles` and `requireAdmin` mark themselves, the route
 * table is read once at boot, and staff routes anywhere in the app are covered (the shop, Zêr pack and tournament
 * writes live outside /admin). The /admin prefix is honoured on top, so nothing reaching the panel another way falls
 * through.
 *
 * Before 2FA, the gate checks the account may use the console at all (owner-access.ts). To any other signed-in account
 * every staff route answers like a missing route, so nothing reveals it exists. A request with no session still gets
 * the route's own 401 so the console can renew an expired session.
 *
 * Two refusals for the owner, so the panel shows the right screen:
 *   TOTP_ENROLLMENT_REQUIRED — no confirmed secret yet; set one up
 *   TOTP_REQUIRED            — enrolled, but this session has not entered a code
 */

/**
 * Paths that must stay reachable or nobody could get through the gate. Each still requires an admin role of its own.
 */
const EXEMPT = new Set([
  '/admin/session', // tells the panel which screen to show
  '/admin/2fa/enroll',
  '/admin/2fa/confirm',
  '/admin/auth/verify',
  '/admin/session/end', // signing out must work even once the window has expired
]);

/**
 * The staff route patterns each app found at boot, so the audit log records staff writes outside /admin too. Keyed by
 * app because a test suite builds several.
 */
const staffRoutes = new WeakMap<FastifyInstance, Set<string>>();

/** Whether a route pattern's guard asks for a staff role (see `installAdminGate`). */
export function isStaffRoute(app: FastifyInstance, pattern: string): boolean {
  return staffRoutes.get(app)?.has(pattern) ?? false;
}

/** What each app's gate asks a staff account, kept for `staffCleared`. Keyed by the app, as `staffRoutes` is. */
const clearance = new WeakMap<FastifyInstance, { totp: AdminTotpService; access: AdminAccess }>();

/**
 * Whether the staff account on this request may use a staff power outside the console: editing or removing someone
 * else's post, picture or comment through the member routes (library/routes.ts, images/routes.ts and their comments),
 * which grant more to staff.
 *
 * Those routes answer anyone signed in, so they ask what the console asks: the account may use the console
 * (owner-access.ts) and this session has entered its code. Without both, the account is an ordinary member. With no
 * gate (no database) nothing is cleared.
 */
export async function staffCleared(app: FastifyInstance, req: FastifyRequest): Promise<boolean> {
  const gate = clearance.get(app);
  if (!gate || !req.user || !isPrivileged(req.user.roles)) return false;
  if (!(await gate.access.allows(req.user.id))) return false;
  const state = await gate.totp.state(req.user.id, req.user.familyId);
  return state.enrolled && state.verified;
}

async function refuse(reply: FastifyReply, req: FastifyRequest, code: string, message: string): Promise<void> {
  await reply.code(403).send({ code, message, requestId: req.id });
}

/** Word for word what the API answers for a route it does not have (plugins/errors.ts). */
async function notFound(reply: FastifyReply, req: FastifyRequest): Promise<void> {
  await reply.code(404).send({ code: 'NOT_FOUND', message: ROUTE_NOT_FOUND_MESSAGE, requestId: req.id });
}

/** The console's own sign-in: open to everyone, and answering everyone alike (auth/routes.ts). */
const SIGN_IN = '/admin/auth/login';

export function installAdminGate(app: FastifyInstance, totp: AdminTotpService, access: AdminAccess): void {
  /**
   * Route patterns (`/tournaments/:id/start`, not `/tournaments/abc/start`) whose guards mark them staff surface.
   * Collected at boot and matched exactly, so URL spelling or normalisation cannot bypass it.
   */
  const privileged = new Set<string>();
  staffRoutes.set(app, privileged);
  clearance.set(app, { totp, access });

  app.addHook('onRoute', (route) => {
    if (routeIsPrivileged(route.preHandler)) privileged.add(route.url);
  });

  app.addHook('preHandler', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const pattern = req.routeOptions?.url;
    const staffSurface =
      path.startsWith('/admin/') || path === '/admin' || (pattern !== undefined && privileged.has(pattern));
    if (!staffSurface || path === SIGN_IN) return;
    // anyone signed in who is not the console's owner: as if the route were not there
    // (and the security log hears of it, once an hour per account)
    if (req.user && !(await access.allows(req.user.id))) {
      void app.securityLog?.record('console.probe', { userId: req.user.id, staff: isPrivileged(req.user.roles) });
      await notFound(reply, req);
      return;
    }
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
