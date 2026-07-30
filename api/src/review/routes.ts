import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { ReviewService } from './service.js';

export function registerReviewRoutes(app: FastifyInstance): void {
  const reviews = new ReviewService(app.db);

  /** Items due for review now, most overdue first, capped at 20. */
  app.get('/review/queue', { preHandler: requireAuth }, async (req) => {
    return reviews.queue(req.user!.id);
  });
}
