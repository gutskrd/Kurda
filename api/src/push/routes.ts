import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { makePushSendJob } from '../jobs/push-jobs.js';
import type { PushService } from './service.js';
import type { DeviceTokenService } from './tokens-service.js';

const registerBody = z.object({
  platform: z.enum(['ios', 'android']),
  token: z.string().min(1).max(4096),
});
const tokenBody = z.object({ token: z.string().min(1).max(4096) });

const testBody = z.object({
  userId: z.uuid().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

/**
 * Device token lifecycle + a staging test-send (KUR-094). Registration is an
 * idempotent upsert (also serves as refresh); the test endpoint routes through
 * the same queued pipeline real notifications use, or delivers inline when the
 * queue isn't configured (single-node dev).
 */
export function registerPushRoutes(
  app: FastifyInstance,
  tokens: DeviceTokenService,
  push: PushService,
): void {
  app.post(
    '/me/devices',
    { schema: { body: registerBody }, preHandler: requireAuth },
    async (req, reply) => {
      const { platform, token } = req.body as z.infer<typeof registerBody>;
      await tokens.register(req.user!.id, platform, token);
      return reply.code(201).send({ ok: true });
    },
  );

  app.post(
    '/me/devices/heartbeat',
    { schema: { body: tokenBody }, preHandler: requireAuth },
    async (req, reply) => {
      const found = await tokens.touch(req.user!.id, (req.body as z.infer<typeof tokenBody>).token);
      if (!found) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'no such device' } });
      return { ok: true };
    },
  );

  app.post(
    '/me/devices/remove',
    { schema: { body: tokenBody }, preHandler: requireAuth },
    async (req, reply) => {
      const found = await tokens.remove(req.user!.id, (req.body as z.infer<typeof tokenBody>).token);
      if (!found) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'no such device' } });
      return { ok: true };
    },
  );

  /** Admin/ops: send a test notification (to a user, or the caller). */
  app.post(
    '/admin/push/test',
    { schema: { body: testBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const { userId, title, body } = req.body as z.infer<typeof testBody>;
      const target = userId ?? req.user!.id;
      const notification = { title, body };
      if (app.jobs) {
        await app.jobs.enqueue(makePushSendJob(push), { userId: target, notification });
        return { queued: true };
      }
      // no queue configured (single-node dev): deliver inline
      const report = await push.deliver(target, notification);
      return { queued: false, ...report };
    },
  );
}
