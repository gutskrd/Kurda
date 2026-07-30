import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { DailyRewardService } from './service.js';

/** Daily Zêr reward claims + calendar (KUR-067). */
export function registerDailyRewardRoutes(app: FastifyInstance, rewards: DailyRewardService): void {
  /** Cycle progress + next reward for the login calendar. */
  app.get('/rewards/daily', { preHandler: requireAuth }, async (req) => rewards.status(req.user!.id));

  /** Claim today's reward (once per tz-local day). */
  app.post(
    '/rewards/daily/claim',
    {
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => rewards.claim(req.user!.id),
  );
}
