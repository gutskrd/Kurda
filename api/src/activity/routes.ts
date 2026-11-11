import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../plugins/auth.js';
import type { ActivityService } from './service.js';

/** Friend activity feed + congratulate reactions (KUR-087). */
export function registerActivityRoutes(app: FastifyInstance, activity: ActivityService): void {
  /** The caller's feed of friends' milestones. */
  app.get(
    '/me/feed',
    {
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
      preHandler: requireAccount,
    },
    async (req) => ({ feed: await activity.feed(req.user!.id, (req.query as { limit?: number }).limit ?? 30) }),
  );

  /** Congratulate a friend's milestone (idempotent). */
  app.post(
    '/activity/:eventId/congrats',
    { schema: { params: z.object({ eventId: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req, reply) => {
      const congrats = await activity.congratulate(req.user!.id, (req.params as { eventId: string }).eventId);
      // not one of the caller's friends' events: answered as an id that is nobody's
      if (congrats === null) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'no such event' } });
      return { congrats };
    },
  );
}
