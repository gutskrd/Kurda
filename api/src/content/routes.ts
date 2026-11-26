import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { ContentRepository } from './repository.js';
import { LessonSessionService, type EarnGranter } from './sessions.js';
import type { XpService } from '../xp/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';

const answerBodySchema = z.object({
  exerciseId: lowerUuid(),
  /** Shape depends on the exercise type; graded server-side. */
  answer: z.unknown(),
});

export function registerLessonRoutes(
  app: FastifyInstance,
  earn?: EarnGranter,
  xp?: XpService,
  milestones?: MilestoneRecorder,
): void {
  // perfect first completions ask for their Zêr inside `complete`; the rule is switched off, so none is paid unless an admin switches it on
  const sessions = new LessonSessionService(app.db, { xp, earn, milestones });
  const content = new ContentRepository(app.db);

  /** A skill's markdown grammar note for the "Tips" tab, and the words its lessons bring in, for its guide. */
  app.get(
    '/skills/:id/grammar',
    { schema: { params: z.object({ id: lowerUuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const grammarMd = await content.grammarForSkill(id);
      if (grammarMd === null) throw new AppError('GRAMMAR_NOT_FOUND', 404, 'no grammar note for this skill');
      return { skillId: id, grammarMd, words: await content.newWordsForSkill(id) };
    },
  );

  /** Start (or resume) a session for a published lesson. */
  app.get(
    '/lessons/:id/session',
    { schema: { params: z.object({ id: lowerUuid() }) }, preHandler: requireAuth },
    async (req) => sessions.startOrResume(req.user!.id, (req.params as { id: string }).id),
  );

  /** Reconnect / refresh a session (resume). */
  app.get(
    '/sessions/:id',
    { schema: { params: z.object({ id: lowerUuid() }) }, preHandler: requireAuth },
    async (req) => sessions.view((req.params as { id: string }).id, req.user!.id),
  );

  /** Submit one answer — graded server-side, idempotent per exercise. */
  app.post(
    '/sessions/:id/answers',
    {
      schema: { params: z.object({ id: lowerUuid() }), body: answerBodySchema },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof answerBodySchema>;
      return sessions.submitAnswer(id, req.user!.id, body.exerciseId, body.answer);
    },
  );

  /**
   * A second try at an item already answered in this session (the re-ask a client makes a few exercises after a miss).
   * Graded like an answer but records nothing, so no score, XP, review or Zêr move (see `retry`).
   */
  app.post(
    '/sessions/:id/retry',
    {
      schema: { params: z.object({ id: lowerUuid() }), body: answerBodySchema },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof answerBodySchema>;
      return sessions.retry(id, req.user!.id, body.exerciseId, body.answer);
    },
  );

  /**
   * Finish the session and get the results summary. A perfect first completion pays Zêr while its rule is on; a replay never does (see
   * `complete`).
   */
  app.post(
    '/sessions/:id/complete',
    {
      schema: { params: z.object({ id: lowerUuid() }) },
      config: { skipValidation: true },
      preHandler: requireAuth,
    },
    async (req) => sessions.complete((req.params as { id: string }).id, req.user!.id),
  );
}
