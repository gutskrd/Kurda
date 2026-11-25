import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { StreakService } from './service.js';
import { TodayService } from './today.js';

/** The weekday the apps start a week on (0 Sunday to 6 Saturday, shared `weekStartsOn`); Monday when not given. */
const todayQuery = z.object({ weekStart: z.coerce.number().int().min(0).max(6).optional() });

/**
 * A learner's own streak: GET /me reads it, GET /me/today reads it with this week and last for the daily view, and the
 * one action is a Hevalo+ member's free restore of the streak that ended.
 */
export function registerStreakRoutes(app: FastifyInstance, streaks: StreakService): void {
  const today = new TodayService(app.db, streaks);

  /** The daily view: the streak, fourteen days in the learner's zone, today's Zêr, the latest badge, and a member's new box. */
  app.get('/me/today', { schema: { querystring: todayQuery }, preHandler: requireAuth }, async (req) =>
    today.view(req.user!.id, (req.query as z.infer<typeof todayQuery>).weekStart ?? 1),
  );

  /**
   * A member's free restore of the ended streak. No body: which streak and whether it can be restored are decided by the
   * server's clock and the account's time zone.
   */
  app.post(
    '/me/streak/repair',
    {
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const row = await app.db.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [req.user!.id]);
      return streaks.repair(req.user!.id, row.rows[0]?.timezone ?? 'UTC');
    },
  );
}
