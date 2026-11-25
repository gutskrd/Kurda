import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { makePushSendJob } from '../jobs/push-jobs.js';
import { NOTIFICATION_CATEGORIES } from '../notifications/prefs.js';
import type { PushService } from './service.js';
import { isExpoPushToken, type DeviceTokenService } from './tokens-service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import { childRemindersAllowed } from '../family/reminders.js';

// An Expo push token is the only kind phones register; junk is a 400 here rather than a row refused on every send.
const pushToken = z.string().min(1).max(4096).refine(isExpoPushToken, 'must be an Expo push token');
const registerBody = z.object({
  platform: z.enum(['ios', 'android']),
  token: pushToken,
});
const tokenBody = z.object({ token: pushToken });

const testBody = z.object({
  userId: z.uuid().optional(),
  category: z.enum(NOTIFICATION_CATEGORIES).default('events'),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

/**
 * Device token lifecycle and a staging test send. Registration is an idempotent upsert that also refreshes; the test
 * send goes through the same queued pipeline as real notifications, or inline without a queue.
 */
export function registerPushRoutes(
  app: FastifyInstance,
  tokens: DeviceTokenService,
  push: PushService,
  inbox?: InboxService,
): void {
  app.post(
    '/me/devices',
    { schema: { body: registerBody }, preHandler: requireAuth },
    async (req, reply) => {
      const { platform, token } = req.body as z.infer<typeof registerBody>;
      // A child's phone keeps a token only while their parent allows learning reminders, and is checked against nobody.
      const child = req.user!.child === true;
      if (child && !(await childRemindersAllowed(app.db, req.user!.id))) {
        return reply.code(403).send({ code: 'CHILD_REMINDERS_OFF', message: 'reminders are off for this profile', requestId: req.id });
      }
      // Under the session it was registered from, so it ends when that session does.
      await tokens.register(req.user!.id, platform, token, req.user!.familyId ?? null);
      // a phone a banned person's account had is a strong sign it is theirs again (moderation/returns.ts)
      if (!child && app.hasDecorator('returns')) await app.returns.assess({ userId: req.user!.id, event: 'push', pushToken: token });
      return reply.code(201).send({ ok: true });
    },
  );

  app.post(
    '/me/devices/heartbeat',
    { schema: { body: tokenBody }, preHandler: requireAuth },
    async (req, reply) => {
      const found = await tokens.touch(req.user!.id, (req.body as z.infer<typeof tokenBody>).token);
      if (!found) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such device' });
      return { ok: true };
    },
  );

  app.post(
    '/me/devices/remove',
    { schema: { body: tokenBody }, preHandler: requireAuth },
    async (req, reply) => {
      const found = await tokens.remove(req.user!.id, (req.body as z.infer<typeof tokenBody>).token);
      if (!found) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such device' });
      return { ok: true };
    },
  );

  /** Admin/ops: send a test notification (to a user, or the caller). */
  app.post(
    '/admin/push/test',
    { schema: { body: testBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const { userId, category, title, body } = req.body as z.infer<typeof testBody>;
      const target = userId ?? req.user!.id;
      const notification = { category, title, body };
      if (app.jobs) {
        // The worker's job handler records to the inbox and delivers.
        await app.jobs.enqueue(makePushSendJob(push), { userId: target, notification });
        return { queued: true };
      }
      // no queue configured (single-node dev): record + deliver inline
      if (inbox) await inbox.record(target, notification);
      const report = await push.deliver(target, notification);
      return { queued: false, ...report };
    },
  );
}
