import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireRoles } from '../plugins/auth.js';
import type { LeaderboardService } from './service.js';
import { isBoardScope, isBoardType } from './rank.js';

/**
 * Leaderboards (KUR-063): one page of a board plus the caller's own rank.
 *
 * `scope` picks who the board covers — everyone, your friends, or your country —
 * and the caller's rank is always computed within that same board, so the number
 * beside your name means what the list around it means.
 */
export function registerLeaderboardRoutes(app: FastifyInstance, boards: LeaderboardService): void {
  const query = z.object({
    scope: z.string().max(12).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).max(100_000).optional(),
  });

  /**
   * A leaderboard. Readable without an account — a scoreboard that only members
   * can see is not much of a scoreboard — though `me` and the friends and
   * country scopes need one, since they are about a particular person.
   */
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
