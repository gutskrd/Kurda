import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAINTENANCE_CODE, MAINTENANCE_LIMITS, MAINTENANCE_POLL_SECONDS, type StatusResponse } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { isPrivileged } from '../admin/roles.js';
import type { MaintenanceService } from './service.js';

/**
 * What stays open while Hevalo is offline: host and app health checks, the admin console with its sign-in, and
 * session upkeep, so nobody is signed out and staff can check the app before reopening.
 */
const OPEN = new Set(['/health', '/metrics', '/version', '/status', '/auth/login', '/auth/refresh', '/auth/logout']);

function isOpen(path: string): boolean {
  return OPEN.has(path) || path.startsWith('/admin/');
}

/**
 * While offline, every other request gets 503 MAINTENANCE with the notice the apps show (@kurda/shared
 * maintenance.ts). Staff are let through. Installed after the session is read and before any route.
 */
export function installMaintenanceGate(app: FastifyInstance, maintenance: MaintenanceService): void {
  app.addHook('onRequest', async (req, reply) => {
    const at = req.url.indexOf('?');
    if (isOpen(at === -1 ? req.url : req.url.slice(0, at))) return;
    if (req.user && isPrivileged(req.user.roles)) return;
    // a database that cannot say keeps Hevalo open: the routes have their own answer for that
    const notice = await maintenance.notice().catch(() => null);
    if (!notice) return;
    const untilBack = notice.backBy ? Math.ceil((Date.parse(notice.backBy) - Date.now()) / 1000) : 0;
    return reply
      .code(503)
      .header('retry-after', String(Math.max(MAINTENANCE_POLL_SECONDS, untilBack || 300)))
      .header('cache-control', 'no-store')
      .send({ code: MAINTENANCE_CODE, message: 'Hevalo is offline for a while; try again later', maintenance: notice, requestId: req.id });
  });
}

const iso = z.string().datetime({ offset: true }).nullable();
const settingsBody = z.object({
  enabled: z.boolean(),
  title: z.string().max(MAINTENANCE_LIMITS.title + 20).nullable(),
  message: z.string().max(MAINTENANCE_LIMITS.message + 20).nullable(),
  assetKey: z.string().min(1).max(200).nullable(),
  startsAt: iso,
  endsAt: iso,
  reopenAtEnd: z.boolean(),
});

/**
 * `GET /status` is public, polled by the apps' offline screen. The setting is for superadmins only, since it takes
 * the app away from everyone; changes are audited, and going offline or back is in the security log.
 */
export function registerMaintenanceRoutes(app: FastifyInstance, maintenance: MaintenanceService): void {
  app.get('/status', { config: { skipValidation: true } }, async (_req, reply): Promise<StatusResponse> => {
    reply.header('cache-control', 'no-store');
    return { maintenance: await maintenance.notice() };
  });

  const superadmins = [requireAuth, requireRoles('superadmin')];

  app.get('/admin/maintenance', { config: { skipValidation: true }, preHandler: superadmins }, async () => maintenance.state());

  app.put('/admin/maintenance', { schema: { body: settingsBody }, preHandler: superadmins }, async (req, reply) => {
    const res = await maintenance.set(req.user!.id, req.body as z.infer<typeof settingsBody>);
    if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message, requestId: req.id });
    return res.state;
  });
}
