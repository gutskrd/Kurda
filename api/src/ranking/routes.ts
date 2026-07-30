import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { RatingService } from './rating-service.js';

/** Skill-rating reads (KUR-061). Writes happen only on ranked game finish. */
export function registerRatingRoutes(app: FastifyInstance, rating: RatingService): void {
  /** Current rating + games played, plus whether still in placement. */
  app.get('/me/rating', { preHandler: requireAuth }, async (req) => {
    const summary = await rating.summary(req.user!.id);
    return { ...summary, placement: summary.gamesPlayed < 10 };
  });

  /** Recent rating changes for a rating graph (newest first). */
  app.get(
    '/me/rating/history',
    {
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { limit } = req.query as { limit?: number };
      return { history: await rating.history(req.user!.id, limit ?? 20) };
    },
  );
}
