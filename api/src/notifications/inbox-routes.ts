import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { InboxService } from './inbox-service.js';

const idParam = z.object({ id: z.uuid() });

/** In-app notification inbox: list, unread badge, mark-read (KUR-097). */
export function registerInboxRoutes(app: FastifyInstance, inbox: InboxService): void {
  /** Last 50 notifications, newest first. */
  app.get('/me/notifications', { preHandler: requireAuth }, async (req) => ({
    notifications: await inbox.list(req.user!.id),
  }));

  /** Unread count for the bell badge. */
  app.get('/me/notifications/unread-count', { preHandler: requireAuth }, async (req) => ({
    count: await inbox.unreadCount(req.user!.id),
  }));

  /** Mark one read (idempotent — 404 only if it isn't the caller's). */
  app.post(
    '/me/notifications/:id/read',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => {
      const changed = await inbox.markRead(req.user!.id, (req.params as z.infer<typeof idParam>).id);
      // already-read is fine; only a foreign/nonexistent id 404s
      if (!changed) {
        const still = await inbox.unreadCount(req.user!.id);
        return reply.code(200).send({ ok: true, unread: still });
      }
      return { ok: true, unread: await inbox.unreadCount(req.user!.id) };
    },
  );

  /** Mark all read. */
  app.post('/me/notifications/read-all', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    marked: await inbox.markAllRead(req.user!.id),
  }));
}
