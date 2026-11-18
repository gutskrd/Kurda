import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { StreakService } from './service.js';

/** What a learner can do to their own streak: GET /me reads it, and the one action is restoring the streak that ended. */
export function registerStreakRoutes(app: FastifyInstance, streaks: StreakService): void {
  /**
   * Restores the ended streak. No body: which streak, whether it can be restored and the cost are decided by the
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
