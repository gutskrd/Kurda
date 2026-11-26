import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import type { Notification, PushService } from '../push/service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import { NOTIFICATION_CATEGORIES } from '../notifications/prefs.js';
import type { JobQueue } from './queue.js';
import { defineJob, type JobDefinition } from './registry.js';

export const PUSH_SEND_JOB_NAME = 'push-send';

const payloadSchema = z.object({
  userId: lowerUuid(),
  notification: z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(500),
    data: z.record(z.string(), z.string()).optional(),
  }),
  /** already in the inbox, written with the change it tells of: only pushed */
  recorded: z.boolean().optional(),
  /** Held back by quiet hours until now: sent only if what it tells of is still waiting (`PushJobOptions.stillNews`). */
  held: z.boolean().optional(),
});

export type PushSendPayload = z.infer<typeof payloadSchema>;

/** What a push held by quiet hours needs: a way to come back when they end, and a check that it is still worth sending. */
export interface PushJobOptions {
  /** queues the same push again to run in `delayMs`, once, under `key` */
  later?: (payload: PushSendPayload, delayMs: number, key: string) => Promise<void>;
  /** Whether a held push still tells of something waiting (a letter not yet read or landed); without it a held push always goes. */
  stillNews?: (userId: string, notification: Notification) => Promise<boolean>;
}

/**
 * Queued push delivery, batched and retried off the request path. Safe to re-run: providers deduplicate per token,
 * and pruning is a delete. A factory, so the worker can pass a database-backed PushService.
 */
export function makePushSendJob(service: PushService, inbox?: InboxService, opts: PushJobOptions = {}): JobDefinition<PushSendPayload> {
  return defineJob({
    name: PUSH_SEND_JOB_NAME,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      // Record to the in-app inbox whatever happens to the push, so it can be caught up on even when push is muted.
      if (inbox && !payload.recorded) await inbox.record(payload.userId, payload.notification);
      // A push that waited for the morning is dropped if its letter was read or seen at the window meanwhile.
      if (payload.held && opts.stillNews && !(await opts.stillNews(payload.userId, payload.notification))) {
        ctx.log.info({ userId: payload.userId }, 'held push no longer news');
        return;
      }
      const report = await service.deliver(payload.userId, payload.notification);
      // A push quiet hours held back (push/service.ts HELD_IN_QUIET) comes back when they end; the key, which includes that
      // end, makes a retry queue it once while a later hold is a new job.
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
 * Pushes a notification already written in the same transaction as its change: through the queue when there is one,
 * at once when not. Without a queue nothing can wait for quiet hours to end, so a held push is not sent.
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
