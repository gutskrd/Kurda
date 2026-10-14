import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { weekStart } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { LeagueService } from './service.js';

const weekQuery = z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const runBody = z.object({ force: z.boolean().optional() }).optional();

/**
 * Learning Leagues (KUR-062, contract 4 §L): the caller's week, and the admin's
 * view of the groups and the weekly runs.
 */
export function registerLeagueRoutes(app: FastifyInstance, leagues: LeagueService): void {
  /**
   * The caller's week (`LeagueView` in @kurda/shared): their group and its
   * zones, or personal mode. Reading it never joins anyone — learning XP does.
   */
  app.get('/me/league', { preHandler: requireAuth }, async (req) => leagues.standings(req.user!.id));

  /** Admin: a week's groups (this week by default), the tier spread, and the settle and merge runs. */
  app.get(
    '/admin/leagues',
    { schema: { querystring: weekQuery }, preHandler: requireRoles('admin') },
    async (req) => {
      const { week } = req.query as z.infer<typeof weekQuery>;
      return leagues.adminOverview(week ? weekStart(new Date(`${week}T12:00:00Z`)) : weekStart(new Date()));
    },
  );

  /** Admin: one group's table, with names, and what the week would mean for each member now. */
  app.get(
    '/admin/leagues/groups/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireRoles('admin') },
    async (req) => {
      const group = await leagues.adminGroup((req.params as { id: string }).id);
      if (!group) throw new AppError('NOT_FOUND', 404, 'no such league group');
      return group;
    },
  );

  /**
   * Admin: run the weekly settle now. It does nothing a week's run has done
   * already; `force` runs its steps again (each is idempotent, so nobody moves
   * or is paid twice), for a run that finished with something left over.
   */
  app.post(
    '/admin/leagues/settle',
    { schema: { body: runBody }, preHandler: requireRoles('admin') },
    async (req) => leagues.settleDue(new Date(), { force: (req.body as z.infer<typeof runBody>)?.force ?? false }),
  );

  /** Admin: run Wednesday's merge of small groups now (from Wednesday 00:00 UTC on). */
  app.post(
    '/admin/leagues/merge',
    { schema: { body: runBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const run = await leagues.mergeSmallGroups(new Date(), { force: (req.body as z.infer<typeof runBody>)?.force ?? false });
      if (!run) throw new AppError('TOO_EARLY', 409, 'small groups are merged from Wednesday 00:00 UTC');
      return run;
    },
  );
}
