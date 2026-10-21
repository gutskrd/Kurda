import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import { daysBefore } from './dashboards.js';
import type { DashboardService } from './dashboard-service.js';

// a real calendar day, not just its shape: Postgres refuses 2026-13-45 with an error
const DAY = z.iso.date();
const rangeQuery = z.object({
  from: DAY.optional(),
  to: DAY.optional(),
});

function range(q: { from?: string; to?: string }): { from: string; to: string } {
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? daysBefore(to, 29);
  return { from, to };
}

/** Core analytics dashboards (KUR-106), admin-only. */
export function registerDashboardRoutes(app: FastifyInstance, dashboards: DashboardService): void {
  app.get(
    '/admin/analytics/activity',
    { schema: { querystring: rangeQuery }, preHandler: requireRoles('admin') },
    async (req) => {
      const { from, to } = range(req.query as z.infer<typeof rangeQuery>);
      return { from, to, points: await dashboards.activity(from, to) };
    },
  );

  app.get(
    '/admin/analytics/retention',
    { schema: { querystring: rangeQuery }, preHandler: requireRoles('admin') },
    async (req) => {
      const { from, to } = range(req.query as z.infer<typeof rangeQuery>);
      return { from, to, cohorts: await dashboards.retention(from, to) };
    },
  );

  app.get(
    '/admin/analytics/funnel',
    { schema: { querystring: rangeQuery.extend({ name: z.enum(['onboarding', 'lesson']) }) }, preHandler: requireRoles('admin') },
    async (req) => {
      const q = req.query as z.infer<typeof rangeQuery> & { name: string };
      const { from, to } = range(q);
      return { name: q.name, from, to, steps: await dashboards.funnel(q.name, from, to) };
    },
  );

  /** Ops/manual rollup refresh for a specific day (defaults to yesterday). */
  app.post(
    '/admin/analytics/refresh',
    {
      schema: { querystring: z.object({ day: DAY.optional() }) },
      config: { skipValidation: true },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const day = (req.query as { day?: string }).day;
      await dashboards.refreshDay(day);
      return { ok: true };
    },
  );
}
