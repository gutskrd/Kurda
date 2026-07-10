import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { LeagueService } from './service.js';

/** Weekly leagues (KUR-062): the caller's cohort standings + an admin settle. */
export function registerLeagueRoutes(app: FastifyInstance, leagues: LeagueService): void {
  /** This week's cohort standings for the caller (joins them if needed). */
  app.get('/me/league', { preHandler: requireAuth }, async (req) => leagues.standings(req.user!.id));

  /** Admin/ops: settle every closed-week cohort now (idempotent). */
  app.post(
    '/admin/leagues/settle',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ settled: await leagues.settleDueWeeks() }),
  );
}
