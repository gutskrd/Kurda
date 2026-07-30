import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { ContentRepository } from './repository.js';
import { LessonSessionService } from './sessions.js';
import type { XpService } from '../xp/service.js';

const answerBodySchema = z.object({
  exerciseId: z.uuid(),
  /** Shape depends on the exercise type; graded server-side (KUR-027). */
  answer: z.unknown(),
});

/** Grants Gems for a rule/refId; injected so content stays decoupled (KUR-068). */
interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

export function registerLessonRoutes(app: FastifyInstance, gems?: GemGranter, xp?: XpService): void {
  const sessions = new LessonSessionService(app.db, xp);
  const content = new ContentRepository(app.db);

  /** A skill's markdown grammar note for the "Tips" tab (KUR-038). */
  app.get(
    '/skills/:id/grammar',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const grammarMd = await content.grammarForSkill(id);
      if (grammarMd === null) throw new AppError('GRAMMAR_NOT_FOUND', 404, 'no grammar note for this skill');
      return { skillId: id, grammarMd };
    },
  );

  /** Start (or resume) a session for a published lesson. */
  app.get(
    '/lessons/:id/session',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => sessions.startOrResume(req.user!.id, (req.params as { id: string }).id),
  );

  /** Reconnect / refresh a session (resume). */
  app.get(
    '/sessions/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => sessions.view((req.params as { id: string }).id, req.user!.id),
  );

  /** Submit one answer — graded server-side, idempotent per exercise. */
  app.post(
    '/sessions/:id/answers',
    {
      schema: { params: z.object({ id: z.uuid() }), body: answerBodySchema },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof answerBodySchema>;
      return sessions.submitAnswer(id, req.user!.id, body.exerciseId, body.answer);
    },
  );

  /** Finish the session and get the results summary. */
  app.post(
    '/sessions/:id/complete',
    {
      schema: { params: z.object({ id: z.uuid() }) },
      config: { skipValidation: true },
      preHandler: requireAuth,
    },
    async (req) => {
      const sessionId = (req.params as { id: string }).id;
      const results = await sessions.complete(sessionId, req.user!.id);
      // perfect lesson → Gems (KUR-068); first completion only (xpAwarded > 0),
      // idempotent per session. Best-effort: never fails the completion.
      if (gems && results.accuracy === 1 && results.xpAwarded > 0) {
        await gems.grant(req.user!.id, 'perfect_lesson', sessionId).catch(() => undefined);
      }
      return results;
    },
  );
}
