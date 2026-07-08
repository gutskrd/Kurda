import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { DailyGoalService, GOAL_OPTIONS } from './service.js';

const setGoalBody = z.object({
  goal: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
});

export function registerDailyGoalRoutes(app: FastifyInstance): void {
  const goals = new DailyGoalService(app.db);

  /** Today's goal + progress ring data. */
  app.get('/me/daily-goal', { preHandler: requireAuth }, async (req) => {
    const tz = await app.db.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [
      req.user!.id,
    ]);
    return goals.status(req.user!.id, tz.rows[0]?.timezone ?? 'UTC');
  });

  /** Pick a new daily goal (10/20/30/50). */
  app.put(
    '/me/daily-goal',
    { schema: { body: setGoalBody }, preHandler: requireAuth },
    async (req) => {
      const { goal } = req.body as z.infer<typeof setGoalBody>;
      const tz = await app.db.query<{ timezone: string }>(
        `SELECT timezone FROM users WHERE id = $1`,
        [req.user!.id],
      );
      return goals.setGoal(req.user!.id, tz.rows[0]?.timezone ?? 'UTC', goal);
    },
  );
}

export { GOAL_OPTIONS };
