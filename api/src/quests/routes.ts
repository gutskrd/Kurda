import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { DailyQuestService } from './service.js';

/** A quest's id, '2026-10-29:lessons'; one that names no quest is answered 404 by the service. */
const idParams = z.object({ id: z.string().min(1).max(40) });

/** Daily quests and their chests of Zêr. */
export function registerDailyQuestRoutes(app: FastifyInstance, quests: DailyQuestService): void {
  /** Today's three quests in the learner's day, this month's finished count, and earlier chests still waiting (QuestDay). */
  app.get('/me/quests', { preHandler: requireAuth }, async (req) => quests.today(req.user!.id));

  /**
   * Opens a finished quest's chest for its Zêr, once: 409 QUEST_CLAIMED when already open, 409 QUEST_NOT_DONE before
   * it is done, 404 for a quest not the learner's or past the waiting days.
   */
  app.post(
    '/me/quests/:id/claim',
    {
      schema: { params: idParams },
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => quests.claim(req.user!.id, (req.params as z.infer<typeof idParams>).id),
  );
}
