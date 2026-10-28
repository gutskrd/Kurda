import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PRACTICE_MODES } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { PracticeService, PRACTICE_TARGET } from './service.js';
import type { XpService } from '../xp/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';

const answerBody = z.object({
  exerciseId: z.uuid(),
  answer: z.unknown(),
});

/**
 * Optional: practise exactly these exercises ("practise these now", after a
 * lesson), or a kind of practice (`mode`; a unit's review names the unit). No
 * body, or neither, is the ordinary review.
 */
const startBody = z
  .object({
    exerciseIds: z.array(z.uuid()).min(1).max(PRACTICE_TARGET).optional(),
    mode: z.enum(PRACTICE_MODES).optional(),
    unitId: z.uuid().optional(),
  })
  .refine((b) => !(b.exerciseIds && b.mode), { message: 'exerciseIds are a session of their own, without a mode', path: ['mode'] })
  .refine((b) => (b.mode === 'unit') === (b.unitId !== undefined), { message: 'a unit review, and only a unit review, names its unit', path: ['unitId'] })
  .nullish();

export function registerPracticeRoutes(app: FastifyInstance, xp?: XpService, milestones?: MilestoneRecorder): void {
  const practice = new PracticeService(app.db, { xp, milestones });

  /** One-tap: generate a practice session of the kind asked (or an empty-state suggestion). */
  app.post(
    '/practice/session',
    { schema: { body: startBody }, preHandler: requireAuth },
    async (req) => {
      const body = req.body as z.infer<typeof startBody>;
      return practice.start(req.user!.id, body ?? {});
    },
  );

  /** What the practice hub shows before anything starts, in one statement. */
  app.get('/practice/hub', { preHandler: requireAuth }, async (req) => practice.hub(req.user!.id));

  /** Come back to a practice session: its items, and what has been answered (resume). */
  app.get(
    '/practice/sessions/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => practice.view((req.params as { id: string }).id, req.user!.id),
  );

  /** How many items are due, and any review left unfinished, for a "Review" entry to show before one starts. */
  app.get('/practice/due', { preHandler: requireAuth }, async (req) => practice.due(req.user!.id));

  /** A second try at an item already answered here: graded, never recorded. */
  app.post(
    '/practice/sessions/:id/retry',
    { schema: { params: z.object({ id: z.uuid() }), body: answerBody }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof answerBody>;
      return practice.retry(id, req.user!.id, body.exerciseId, body.answer);
    },
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

  /** Finish the review and get the summary: reduced XP, the streak, and the misses with their answers. */
  app.post(
    '/practice/sessions/:id/complete',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => practice.complete((req.params as { id: string }).id, req.user!.id),
  );
}
