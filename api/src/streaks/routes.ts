import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { StreakService } from './service.js';

/**
 * What a learner can do to their own streak. Reading it is GET /me's (and a
 * finished session's); the one thing to ask for is the streak that ended back.
 */
export function registerStreakRoutes(app: FastifyInstance, streaks: StreakService): void {
  /**
   * Restore the streak that ended. No body: which streak, whether it can still
   * be restored and what it costs are the server's to decide, by its own clock
   * and the learner's time zone on the account.
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
