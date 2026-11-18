import { z } from 'zod';
import { weekMergeAt, weekStart } from '@kurda/shared';
import type { LeagueService } from '../leagues/service.js';
import type { JobQueue } from './queue.js';
import { defineJob, type JobDefinition } from './registry.js';

/**
 * The league week's two moments on the job queue: the settle at Monday 00:00 UTC and the merge at Wednesday 00:00
 * UTC. Each starting process also enqueues a catch-up of whatever is due, so a deploy or a host waking from idle
 * settles the week at once. Both handlers are idempotent and record their run per week, so schedule, catch-up and
 * retries together still settle a week once.
 */

export const LEAGUE_SETTLE_JOB = 'league-settle';
export const LEAGUE_MERGE_JOB = 'league-merge';
/** Monday 00:00 UTC: the week closes. */
export const LEAGUE_SETTLE_CRON = '0 0 * * 1';
/** Wednesday 00:00 UTC: groups still under eight are merged. */
export const LEAGUE_MERGE_CRON = '0 0 * * 3';

const payloadSchema = z.object({});
export type LeaguePayload = z.infer<typeof payloadSchema>;

export function makeLeagueSettleJob(leagues: LeagueService): JobDefinition<LeaguePayload> {
  return defineJob({
    name: LEAGUE_SETTLE_JOB,
    schema: payloadSchema,
    handler: async (_payload, ctx) => {
      const run = await leagues.settleDue(new Date());
      ctx.log.info({ week: run.weekKey, result: run.result }, 'league week settled');
    },
  });
}

export function makeLeagueMergeJob(leagues: LeagueService): JobDefinition<LeaguePayload> {
  return defineJob({
    name: LEAGUE_MERGE_JOB,
    schema: payloadSchema,
    handler: async (_payload, ctx) => {
      const run = await leagues.mergeSmallGroups(new Date());
      if (run) ctx.log.info({ week: run.weekKey, result: run.result }, 'small league groups merged');
    },
  });
}

/** The two schedules, and a catch-up of whatever is due now, deduplicated per week. */
export async function scheduleLeagueJobs(queue: JobQueue, leagues: LeagueService, now: Date = new Date()): Promise<void> {
  const settle = makeLeagueSettleJob(leagues);
  const merge = makeLeagueMergeJob(leagues);
  await queue.scheduleCron(settle, LEAGUE_SETTLE_CRON, {});
  await queue.scheduleCron(merge, LEAGUE_MERGE_CRON, {});
  const week = weekStart(now);
  await queue.enqueue(settle, {}, { idempotencyKey: `${LEAGUE_SETTLE_JOB}-${week}` });
  if (now.getTime() >= weekMergeAt(week).getTime()) {
    await queue.enqueue(merge, {}, { idempotencyKey: `${LEAGUE_MERGE_JOB}-${week}` });
  }
}
