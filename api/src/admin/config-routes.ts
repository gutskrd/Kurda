import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { ConfigService } from './config-service.js';

const proposeBody = z.object({
  target: z.enum(['shop_item', 'event']),
  payload: z.record(z.string(), z.unknown()),
});
const rejectBody = z.object({ reason: z.string().max(500).optional() });
const idParam = z.object({ id: z.uuid() });

/**
 * Shop + event configuration with dual-admin approval (KUR-103). Admin-only.
 * Proposing a low-impact change applies it immediately; a sensitive one queues
 * for a *different* admin to approve/reject. Applied changes bust the cache via
 * the underlying Shop/Event services.
 */
export function registerConfigRoutes(app: FastifyInstance, config: ConfigService): void {
  app.post(
    '/admin/config/changes',
    { schema: { body: proposeBody }, preHandler: requireRoles('admin', 'superadmin') },
    async (req, reply) => {
      const { target, payload } = req.body as z.infer<typeof proposeBody>;
      const res = await config.propose(req.user!.id, target, payload);
      if (res.ok) return reply.code(res.status === 'applied' ? 200 : 202).send({ status: res.status, id: res.id });
      return reply.code(422).send({ code: res.reason.toUpperCase().replace(/-/g, '_'), message: 'invalid config change' });
    },
  );

  app.get(
    '/admin/config/changes',
    { config: { skipValidation: true }, preHandler: requireRoles('admin', 'superadmin') },
    async () => ({ pending: await config.pending() }),
  );

  app.post(
    '/admin/config/changes/:id/approve',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireRoles('admin', 'superadmin') },
    async (req, reply) => {
      const res = await config.approve(req.user!.id, (req.params as { id: string }).id);
      if (res.ok) return { status: res.status };
      const code = res.reason === 'not-found' ? 404 : res.reason === 'self-approve' ? 403 : 409;
      return reply.code(code).send({ code: res.reason.toUpperCase().replace(/-/g, '_'), message: 'cannot approve' });
    },
  );

  app.post(
    '/admin/config/changes/:id/reject',
    { schema: { params: idParam, body: rejectBody }, preHandler: requireRoles('admin', 'superadmin') },
    async (req, reply) => {
      const { reason } = req.body as z.infer<typeof rejectBody>;
      const res = await config.reject(req.user!.id, (req.params as { id: string }).id, reason);
      if (res.ok) return { status: res.status };
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'no pending change' });
    },
  );
}
