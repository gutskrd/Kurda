import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAuth } from '../plugins/auth.js';
import { PlacementService } from './service.js';
import { SkillStrengthService } from './strength-service.js';

const startBody = z.object({ restart: z.boolean().optional() });
const answerBody = z.object({ exerciseId: lowerUuid(), answer: z.unknown() });

export function registerPlacementRoutes(app: FastifyInstance): void {
  const placement = new PlacementService(app.db);
  const strength = new SkillStrengthService(app.db);

  /** Start (or resume) the placement test for a course. */
  app.post(
    '/courses/:courseId/placement',
    { schema: { params: z.object({ courseId: lowerUuid() }), body: startBody }, preHandler: requireAuth },
    async (req) => {
      const { courseId } = req.params as { courseId: string };
      const { restart } = req.body as z.infer<typeof startBody>;
      return placement.start(req.user!.id, courseId, restart ?? false);
    },
  );

  /** Answer the current placement question; get the next one or the result. */
  app.post(
    '/placement/:sessionId/answer',
    { schema: { params: z.object({ sessionId: lowerUuid() }), body: answerBody }, preHandler: requireAuth },
    async (req) => {
      const { sessionId } = req.params as { sessionId: string };
      const body = req.body as z.infer<typeof answerBody>;
      return placement.answer(sessionId, req.user!.id, body.exerciseId, body.answer);
    },
  );

  /** Per-skill strength (0–100) + unlock state for a course. */
  app.get(
    '/courses/:courseId/skill-strength',
    { schema: { params: z.object({ courseId: lowerUuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { courseId } = req.params as { courseId: string };
      return { skills: await strength.forCourse(req.user!.id, courseId) };
    },
  );
}
