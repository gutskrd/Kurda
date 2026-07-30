import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { LeaderboardService } from './service.js';
import { isBoardType } from './rank.js';

/** Leaderboards (KUR-063): top 50 + the caller's own rank. */
export function registerLeaderboardRoutes(app: FastifyInstance, boards: LeaderboardService): void {
  app.get(
    '/leaderboards/:type',
    { schema: { params: z.object({ type: z.string().max(20) }) }, preHandler: requireAuth },
    async (req) => {
      const { type } = req.params as { type: string };
      if (!isBoardType(type)) throw new AppError('BAD_BOARD', 400, 'unknown leaderboard');
      return boards.board(type, req.user!.id);
    },
  );

  /** Admin/ops: rebuild the sorted sets from Postgres (cache is not truth). */
  app.post(
    '/admin/leaderboards/rebuild',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({
      rating: await boards.rebuild('rating'),
      weekly_xp: await boards.rebuild('weekly_xp'),
    }),
  );
}
