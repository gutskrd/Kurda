import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireRoles } from '../plugins/auth.js';
import type { LeaderboardService } from './service.js';
import { isBoardScope, isBoardType } from './rank.js';

/**
 * Leaderboards: one page of a board plus the caller's own rank. `:type` is `weekly_xp`, `zer` or `gewher`
 * (rank.ts); `scope` is everyone, friends or country, and the caller's rank is computed within that same board.
 */
export function registerLeaderboardRoutes(app: FastifyInstance, boards: LeaderboardService): void {
  const query = z.object({
    scope: z.string().max(12).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).optional(),
  });

  /** A leaderboard, readable without an account; `me` and the friends and country scopes need one. */
  app.get(
    '/leaderboards/:type',
    { schema: { params: z.object({ type: z.string().max(20) }), querystring: query } },
    async (req) => {
      const { type } = req.params as { type: string };
      const { scope, limit, offset } = req.query as z.infer<typeof query>;
      if (!isBoardType(type)) throw new AppError('BAD_BOARD', 400, 'unknown leaderboard');
      if (scope !== undefined && !isBoardScope(scope)) {
        throw new AppError('BAD_SCOPE', 400, 'unknown leaderboard scope');
      }
      return boards.board(type, req.user?.id ?? null, { scope, limit, offset });
    },
  );

  /**
   * Admin: rebuilds every board's sorted set from Postgres, one after another, with how many each lists; the console
   * shows the weekly count.
   */
  app.post(
    '/admin/leaderboards/rebuild',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({
      weekly_xp: await boards.rebuild('weekly_xp'),
      zer: await boards.rebuild('zer'),
      gewher: await boards.rebuild('gewher'),
    }),
  );
}
