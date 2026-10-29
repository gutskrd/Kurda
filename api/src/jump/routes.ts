import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { PathJumpService } from './service.js';

const params = z.object({ courseId: z.uuid() });
const body = z.object({ unitId: z.uuid() });

/**
 * Jumping ahead on the lesson path (jump/service.ts). Starting is all there is
 * here: the test is then answered and finished as a practice session
 * (`/practice/sessions/:id/answers`, `/retry`, `/complete`), and finishing it
 * says whether the unit opened.
 */
export function registerPathJumpRoutes(app: FastifyInstance): void {
  const jumps = new PathJumpService(app.db);

  /** Start a test that opens `unitId`, or open the one left unfinished today. */
  app.post(
    '/courses/:courseId/jump',
    {
      schema: { params, body },
      // each start reads the whole course map; the daily tries per unit are the real limit
      config: { rateLimit: { max: 30, windowMs: 60 * 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { courseId } = req.params as z.infer<typeof params>;
      const { unitId } = req.body as z.infer<typeof body>;
      return jumps.start(req.user!.id, courseId, unitId);
    },
  );
}
