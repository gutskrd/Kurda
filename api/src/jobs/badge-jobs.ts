import { z } from 'zod';
import type { BadgeNotices, BadgeService } from '../badges/service.js';
import type { PushService } from '../push/service.js';
import type { JobQueue } from './queue.js';
import { defineJob, type JobDefinition } from './registry.js';

/**
 * Badge work on the job queue (contract 4 §B2): the nightly rarity, and the
 * one push a day that bundles a learner's unlocks.
 */

export const BADGE_RARITY_JOB = 'badge-rarity';
export const BADGE_PUSH_JOB = 'badge-push';
/** 02:30 UTC, a quiet hour everywhere Hevalo is used much. */
export const BADGE_RARITY_CRON = '30 2 * * *';
/** How long after the day's first unlock its push waits, so the rest of a session's unlocks go in it too. */
export const BADGE_PUSH_DELAY_MS = 20 * 60_000;

const rarityPayload = z.object({});
export type BadgeRarityPayload = z.infer<typeof rarityPayload>;

export function makeBadgeRarityJob(badges: BadgeService): JobDefinition<BadgeRarityPayload> {
  return defineJob({
    name: BADGE_RARITY_JOB,
    schema: rarityPayload,
    handler: async (_payload, ctx) => {
      const { activeUsers } = await badges.computeRarity();
      ctx.log.info({ activeUsers }, 'badge rarity computed');
    },
  });
}

const pushSchema = z.object({ userId: z.uuid(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type BadgePushPayload = z.infer<typeof pushSchema>;

/** The day's bundled push; gated by the learner's settings and quiet hours at delivery, like every push. */
export function makeBadgePushJob(badges: BadgeService, push: PushService): JobDefinition<BadgePushPayload> {
  return defineJob({
    name: BADGE_PUSH_JOB,
    schema: pushSchema,
    handler: async (payload, ctx) => {
      const notification = await badges.dayPush(payload.userId, payload.day);
      if (!notification) return;
      const report = await push.deliver(payload.userId, notification);
      ctx.log.info({ userId: payload.userId, ...report }, 'badge push delivered');
    },
  });
}

/**
 * The badge notices for a process: the list, the live channel, and the day's
 * push — queued with a delay (and deduplicated per learner and day) when there
 * is a queue, sent at once when there is not.
 */
export function badgeNotices(deps: {
  inbox: { record: BadgeNotices['record'] };
  realtime: (userId: string, event: Record<string, unknown> & { type: string }) => Promise<void>;
  badges: () => BadgeService;
  push: PushService;
  jobs?: JobQueue | null;
}): BadgeNotices {
  return {
    record: (userId, n) => deps.inbox.record(userId, n),
    realtime: (userId, event) => deps.realtime(userId, event as unknown as Record<string, unknown> & { type: string }),
    pushLater: async (userId, day) => {
      if (deps.jobs) {
        await deps.jobs.enqueue(
          makeBadgePushJob(deps.badges(), deps.push),
          { userId, day },
          { idempotencyKey: `${BADGE_PUSH_JOB}-${userId}-${day}`, delayMs: BADGE_PUSH_DELAY_MS },
        );
        return;
      }
      const notification = await deps.badges().dayPush(userId, day);
      if (notification) await deps.push.deliver(userId, notification);
    },
  };
}

export async function scheduleBadgeJobs(queue: JobQueue, badges: BadgeService): Promise<void> {
  await queue.scheduleCron(makeBadgeRarityJob(badges), BADGE_RARITY_CRON, {});
}
