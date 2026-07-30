import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireAdmin } from './routes.js';
import type { AdminTotpService } from './totp-service.js';
import { AuditService } from './audit-service.js';
import { auditActionName, isAuditableAdminMutation } from './audit-action.js';

const searchQuery = z.object({
  adminId: z.uuid().optional(),
  action: z.string().max(120).optional(),
  targetId: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * Wires automatic audit logging (KUR-104): an onResponse hook records every
 * successful admin mutation — no per-route opt-in, so nothing can be exempt —
 * plus a superadmin-only search endpoint. The append-only DB trigger guarantees
 * the trail can't be altered afterward.
 */
export function registerAuditLog(app: FastifyInstance, audit: AuditService, totp: AdminTotpService): void {
  app.addHook('onResponse', async (req, reply) => {
    const routeUrl = req.routeOptions?.url ?? req.url;
    if (!req.user || !isAuditableAdminMutation(req.method, routeUrl, reply.statusCode)) return;
    const params = req.params as { id?: string } | undefined;
    const body = req.body as { reason?: string } | undefined;
    try {
      await audit.record(app.db, {
        adminId: req.user.id,
        action: auditActionName(req.method, routeUrl),
        targetId: params?.id ?? null,
        reason: body?.reason ?? null,
        requestId: String(req.id),
      });
    } catch (err) {
      // never break the response over an audit write; surface it loudly instead
      app.log.error({ err, action: routeUrl }, 'admin audit write failed');
    }
  });

  app.get(
    '/admin/audit',
    { schema: { querystring: searchQuery }, preHandler: [requireAuth, requireAdmin(totp, 'superadmin')] },
    async (req) => ({ entries: await audit.search(req.query as z.infer<typeof searchQuery>) }),
  );
}
