import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../plugins/auth.js';
import type { ActivityService } from './service.js';

/** Congratulations on a friend's milestone. */
export function registerActivityRoutes(app: FastifyInstance, activity: ActivityService): void {
  /** Congratulate a friend's milestone (idempotent). */
  app.post(
    '/activity/:eventId/congrats',
    { schema: { params: z.object({ eventId: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req, reply) => {
      const congrats = await activity.congratulate(req.user!.id, (req.params as { eventId: string }).eventId);
      // An event the caller is not shown answers like an id that does not exist.
      if (congrats === null) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such event' });
      return { congrats };
    },
  );
}
