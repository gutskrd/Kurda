import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { PracticeService } from './service.js';
import type { XpService } from '../xp/service.js';

const answerBody = z.object({
  exerciseId: z.uuid(),
  answer: z.unknown(),
});

export function registerPracticeRoutes(app: FastifyInstance, xp?: XpService): void {
  const practice = new PracticeService(app.db, { xp });

  /** One-tap: generate a review session (or an empty-state suggestion). */
  app.post(
    '/practice/session',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => practice.start(req.user!.id),
  );

  /** Grade one review answer; updates SM-2 strength. */
  app.post(
    '/practice/sessions/:id/answers',
    { schema: { params: z.object({ id: z.uuid() }), body: answerBody }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof answerBody>;
      return practice.submitAnswer(id, req.user!.id, body.exerciseId, body.answer);
    },
  );

  /** Finish the review and get the summary (reduced XP + streak). */
  app.post(
    '/practice/sessions/:id/complete',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => practice.complete((req.params as { id: string }).id, req.user!.id),
  );
}
