import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { LessonSessionService } from './sessions.js';

const answerBodySchema = z.object({
  exerciseId: z.uuid(),
  /** Shape depends on the exercise type; graded server-side (KUR-027). */
  answer: z.unknown(),
});

export function registerLessonRoutes(app: FastifyInstance): void {
  const sessions = new LessonSessionService(app.db);

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
    async (req) => sessions.complete((req.params as { id: string }).id, req.user!.id),
  );
}
