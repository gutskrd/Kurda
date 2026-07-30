import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { ActivityService } from './service.js';

/** Friend activity feed + congratulate reactions (KUR-087). */
export function registerActivityRoutes(app: FastifyInstance, activity: ActivityService): void {
  /** The caller's feed of friends' milestones. */
  app.get(
    '/me/feed',
    {
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
      preHandler: requireAuth,
    },
    async (req) => ({ feed: await activity.feed(req.user!.id, (req.query as { limit?: number }).limit ?? 30) }),
  );

  /** Congratulate a friend's milestone (idempotent). */
  app.post(
    '/activity/:eventId/congrats',
    { schema: { params: z.object({ eventId: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ congrats: await activity.congratulate(req.user!.id, (req.params as { eventId: string }).eventId) }),
  );
}
