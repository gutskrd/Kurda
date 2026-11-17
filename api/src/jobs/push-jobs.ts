import { z } from 'zod';
import type { Notification, PushService } from '../push/service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import { NOTIFICATION_CATEGORIES } from '../notifications/prefs.js';
import type { JobQueue } from './queue.js';
import { defineJob, type JobDefinition } from './registry.js';

export const PUSH_SEND_JOB_NAME = 'push-send';

const payloadSchema = z.object({
  userId: z.uuid(),
  notification: z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(500),
    data: z.record(z.string(), z.string()).optional(),
  }),
  /** already in the inbox, written with the change it tells of: only pushed */
  recorded: z.boolean().optional(),
  /** held back by quiet hours until now: sent only if what it tells of is still waiting (`PushJobOptions.stillNews`) */
  held: z.boolean().optional(),
});

export type PushSendPayload = z.infer<typeof payloadSchema>;

/** What a push held back by quiet hours needs: a way to come back when they end, and to ask whether it is still worth sending. */
export interface PushJobOptions {
  /** queues the same push again to run in `delayMs`, once, under `key` */
  later?: (payload: PushSendPayload, delayMs: number, key: string) => Promise<void>;
  /** whether a held push still tells of something waiting (a letter not yet read or landed); without it a held push always goes */
  stillNews?: (userId: string, notification: Notification) => Promise<boolean>;
}

/**
 * Queued push fan-out (KUR-094). Delivery goes through the job queue so a burst
 * of notifications is batched and retried off the request path; the handler is
 * safe to re-run because providers de-duplicate per token and pruning is a
 * delete. Constructed as a factory (like the GDPR jobs) so the worker can inject
 * a DB-backed PushService.
 */
export function makePushSendJob(service: PushService, inbox?: InboxService, opts: PushJobOptions = {}): JobDefinition<PushSendPayload> {
  return defineJob({
    name: PUSH_SEND_JOB_NAME,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      // record to the in-app inbox (KUR-097) regardless of push delivery, so the
      // notification is there to catch up on even if push is muted/suppressed
      if (inbox && !payload.recorded) await inbox.record(payload.userId, payload.notification);
      // a push that waited for the morning is not sent for a letter already read or seen at the window meanwhile
      if (payload.held && opts.stillNews && !(await opts.stillNews(payload.userId, payload.notification))) {
        ctx.log.info({ userId: payload.userId }, 'held push no longer news');
        return;
      }
      const report = await service.deliver(payload.userId, payload.notification);
      // a push quiet hours held back (push/service.ts HELD_IN_QUIET) comes back when they end; its key makes a retry of
      // this job queue it once, and the end it waits for is in the key, so holding it again later is a new job
      if (report.heldUntil && opts.later) {
        const about = payload.notification.data?.letterId ?? payload.notification.data?.threadId ?? 'push';
        const key = `push-held-${payload.userId}-${about}-${report.heldUntil.getTime()}`;
        await opts.later({ ...payload, recorded: true, held: true }, Math.max(0, report.heldUntil.getTime() - Date.now()), key);
      }
      ctx.log.info({ userId: payload.userId, ...report }, 'push delivered');
    },
  });
}

/**
 * Push a notification whose line is already in the person's notifications,
 * written in the same transaction as the change it tells of so the two can
 * never disagree: through the queue when there is one (the worker only
 * pushes it), at once when there is not. Without a queue there is nowhere to
 * keep a push until quiet hours end, so one they hold back is not sent.
 */
export function pushRecorded(push: PushService, jobs?: JobQueue | null): (userId: string, notification: Notification) => Promise<void> {
  return async (userId, notification) => {
    if (jobs) {
      await jobs.enqueue(makePushSendJob(push), { userId, notification, recorded: true });
      return;
    }
    await push.deliver(userId, notification);
  };
}
