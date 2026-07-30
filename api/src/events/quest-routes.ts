import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { QuestService } from './quest-service.js';

const keyParam = z.object({ key: z.string().min(1).max(64) });
const claimParams = z.object({ key: z.string().min(1).max(64), questId: z.string().min(1).max(64) });

const CLAIM_STATUS: Record<string, number> = {
  NO_EVENT: 404,
  NO_QUEST: 404,
  NOT_COMPLETE: 409,
  GRACE_EXPIRED: 410,
};

const CLAIM_MESSAGE: Record<string, string> = {
  NO_EVENT: 'no such event',
  NO_QUEST: 'no such quest',
  NOT_COMPLETE: 'quest not complete',
  GRACE_EXPIRED: 'the claim window has closed',
};

/** Event quest progress + explicit reward claims (KUR-091). */
export function registerQuestRoutes(app: FastifyInstance, quests: QuestService): void {
  /** Progress + claim state for every quest of an event. */
  app.get(
    '/events/:key/quests',
    { schema: { params: keyParam }, preHandler: requireAuth },
    async (req, reply) => {
      const { key } = req.params as z.infer<typeof keyParam>;
      const view = await quests.progress(req.user!.id, key);
      if (!view) return reply.code(404).send({ error: { code: 'NO_EVENT', message: 'no such event' } });
      return view;
    },
  );

  /** Claim one quest's reward (idempotent). */
  app.post(
    '/events/:key/quests/:questId/claim',
    { schema: { params: claimParams }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => {
      const { key, questId } = req.params as z.infer<typeof claimParams>;
      const result = await quests.claim(req.user!.id, key, questId);
      if (!result.ok) {
        return reply
          .code(CLAIM_STATUS[result.code] ?? 400)
          .send({ error: { code: result.code, message: CLAIM_MESSAGE[result.code] ?? 'cannot claim' } });
      }
      return result;
    },
  );
}
