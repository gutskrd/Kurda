import { z } from 'zod';
import type { PushService } from '../push/service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import { defineJob, type JobDefinition } from './registry.js';

export const PUSH_SEND_JOB_NAME = 'push-send';

const payloadSchema = z.object({
  userId: z.uuid(),
  notification: z.object({
    category: z.enum(['streak', 'friends', 'games', 'events', 'marketing']),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(500),
    data: z.record(z.string(), z.string()).optional(),
  }),
});

export type PushSendPayload = z.infer<typeof payloadSchema>;

/**
 * Queued push fan-out (KUR-094). Delivery goes through the job queue so a burst
 * of notifications is batched and retried off the request path; the handler is
 * safe to re-run because providers de-duplicate per token and pruning is a
 * delete. Constructed as a factory (like the GDPR jobs) so the worker can inject
 * a DB-backed PushService.
 */
export function makePushSendJob(service: PushService, inbox?: InboxService): JobDefinition<PushSendPayload> {
  return defineJob({
    name: PUSH_SEND_JOB_NAME,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      // record to the in-app inbox (KUR-097) regardless of push delivery, so the
      // notification is there to catch up on even if push is muted/suppressed
      if (inbox) await inbox.record(payload.userId, payload.notification);
      const report = await service.deliver(payload.userId, payload.notification);
      ctx.log.info({ userId: payload.userId, ...report }, 'push delivered');
    },
  });
}
