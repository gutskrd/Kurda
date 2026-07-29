import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { AchievementsService, type ActivityPublisher, type GemGranter } from './service.js';

export function registerAchievementRoutes(app: FastifyInstance, gems?: GemGranter, activity?: ActivityPublisher): void {
  const achievements = new AchievementsService(app.db, gems, activity);

  /** All achievements with earned state (profile display). */
  app.get('/me/achievements', { preHandler: requireAuth }, async (req) => {
    return { achievements: await achievements.listEarned(req.user!.id) };
  });

  /** Earned-but-unseen — the client shows a toast then acks. */
  app.get('/me/achievements/unseen', { preHandler: requireAuth }, async (req) => {
    return { unseen: await achievements.unseen(req.user!.id) };
  });

  app.post(
    '/me/achievements/seen',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await achievements.markSeen(req.user!.id);
      return { seen: true };
    },
  );
}
