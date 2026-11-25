import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { weekStart } from '@kurda/shared';
import { requireAccount, requireRoles } from '../plugins/auth.js';
import { PROGRESS_TOOL_ROLES } from '../admin/roles.js';
import { AppError } from '../plugins/errors.js';
import type { LeagueService } from './service.js';

// A real calendar date, so a well-shaped 2026-13-45 is a 400.
const weekQuery = z.object({ week: z.iso.date().optional() });
const runBody = z.object({ force: z.boolean().optional() }).optional();

/** Learning League routes: the caller's week, and the admin's view of groups and weekly runs. */
export function registerLeagueRoutes(app: FastifyInstance, leagues: LeagueService): void {
  /** The caller's week (`LeagueView`): their group and its zones, or personal mode. Reading never joins; learning XP does. */
  app.get('/me/league', { preHandler: requireAccount }, async (req) => leagues.standings(req.user!.id));

  /** Admin: a week's groups (this week by default), the tier spread, and the settle and merge runs. */
  app.get(
    '/admin/leagues',
    { schema: { querystring: weekQuery }, preHandler: requireRoles(...PROGRESS_TOOL_ROLES) },
    async (req) => {
      const { week } = req.query as z.infer<typeof weekQuery>;
      return leagues.adminOverview(week ? weekStart(new Date(`${week}T12:00:00Z`)) : weekStart(new Date()));
    },
  );

  /** Admin: one group's table, with names, and what the week would mean for each member now. */
  app.get(
    '/admin/leagues/groups/:id',
    { schema: { params: z.object({ id: lowerUuid() }) }, preHandler: requireRoles(...PROGRESS_TOOL_ROLES) },
    async (req) => {
      const group = await leagues.adminGroup((req.params as { id: string }).id);
      if (!group) throw new AppError('NOT_FOUND', 404, 'no such league group');
      return group;
    },
  );

  /**
   * Admin: runs the weekly settle now. It repeats nothing a week's run has done; `force` reruns its idempotent steps
   * for a run that left something over.
   */
  app.post(
    '/admin/leagues/settle',
    { schema: { body: runBody }, preHandler: requireRoles(...PROGRESS_TOOL_ROLES) },
    async (req) => leagues.settleDue(new Date(), { force: (req.body as z.infer<typeof runBody>)?.force ?? false }),
  );

  /** Admin: runs Wednesday's merge of small groups now (from Wednesday 00:00 UTC on). */
  app.post(
    '/admin/leagues/merge',
    { schema: { body: runBody }, preHandler: requireRoles(...PROGRESS_TOOL_ROLES) },
    async (req) => {
      const run = await leagues.mergeSmallGroups(new Date(), { force: (req.body as z.infer<typeof runBody>)?.force ?? false });
      if (!run) throw new AppError('TOO_EARLY', 409, 'small groups are merged from Wednesday 00:00 UTC');
      return run;
    },
  );
}
