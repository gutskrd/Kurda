import { z } from 'zod';
import { defineJob, type JobDefinition } from './registry.js';
import type { DashboardService } from '../analytics/dashboard-service.js';
import type { EconomyService } from '../economy/service.js';

/**
 * Daily rollups behind the Analytics and Economy dashboards.
 *
 * Both dashboards read pre-aggregated tables, and nothing ever populated them —
 * there was no scheduled job at all — so both pages were permanently empty. These
 * jobs are what fill them.
 *
 * Each run re-aggregates a short trailing window rather than only yesterday:
 * today's numbers keep moving as people use the app, and re-running a day is an
 * upsert, so a missed run heals itself on the next one instead of leaving a hole.
 */

/** Re-aggregate this many trailing days on each scheduled run. */
export const ROLLUP_WINDOW_DAYS = 3;

/** Often enough that "today" stays current, cheap enough to be unnoticeable. */
export const ROLLUP_INTERVAL_MS = 3 * 3_600_000; // every 3h

const payloadSchema = z.object({
  /** how many trailing days to re-aggregate; a backfill passes a larger number */
  days: z.number().int().min(1).max(400).default(ROLLUP_WINDOW_DAYS),
});
export type RollupPayload = z.infer<typeof payloadSchema>;

export const ANALYTICS_ROLLUP_JOB = 'analytics-rollup';
export const ECONOMY_ROLLUP_JOB = 'economy-rollup';

/** ISO day strings for the `days` most recent days, oldest first. */
function trailingDays(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function makeAnalyticsRollupJob(dashboards: DashboardService): JobDefinition<RollupPayload> {
  return defineJob({
    name: ANALYTICS_ROLLUP_JOB,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      const days = trailingDays(payload.days);
      for (const day of days) await dashboards.refreshDay(day);
      ctx.log.info({ days: days.length, from: days[0], to: days[days.length - 1] }, 'analytics rollup complete');
    },
  });
}

export function makeEconomyRollupJob(economy: EconomyService): JobDefinition<RollupPayload> {
  return defineJob({
    name: ECONOMY_ROLLUP_JOB,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      const days = trailingDays(payload.days);
      for (const day of days) await economy.aggregateDay(new Date(`${day}T00:00:00.000Z`));
      ctx.log.info({ days: days.length, from: days[0], to: days[days.length - 1] }, 'economy rollup complete');
    },
  });
}
