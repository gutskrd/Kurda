import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { ModerationQueueService } from './queue-service.js';

/**
 * Unified moderation queue admin API (KUR-102). All admin-guarded. The queue GET
 * syncs the sources first so the view is current; claim/resolve are the
 * one-click moderator actions; SLA exposes median time-to-resolution.
 */
export function registerModerationQueueRoutes(app: FastifyInstance, queue: ModerationQueueService): void {
  app.get(
    '/admin/moderation/queue',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => {
      const added = await queue.sync();
      return { added, cases: await queue.queue() };
    },
  );

  app.post(
    '/admin/moderation/cases/:id/claim',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const ok = await queue.claim(id, req.user!.id);
      if (!ok) return reply.code(409).send({ code: 'ALREADY_CLAIMED', message: 'this case is already claimed or resolved' });
      return { claimed: true };
    },
  );

  app.post(
    '/admin/moderation/cases/:id/resolve',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ resolution: z.enum(['dismiss', 'warn', 'mute', 'ban']) }),
      },
      preHandler: requireRoles('admin'),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { resolution } = req.body as { resolution: 'dismiss' | 'warn' | 'mute' | 'ban' };
      const ok = await queue.resolve(id, req.user!.id, resolution);
      if (!ok) return reply.code(409).send({ code: 'ALREADY_RESOLVED', message: 'this case is already resolved' });
      return { resolved: true, resolution };
    },
  );

  app.get(
    '/admin/moderation/sla',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => queue.sla(),
  );
}
