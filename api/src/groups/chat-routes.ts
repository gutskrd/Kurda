import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { GroupChatService } from './chat-service.js';
import { MAX_GROUP_MESSAGE_LEN } from './chat-service.js';

const idParam = z.object({ id: z.uuid() });

/** Group chat channel + moderation (KUR-085). */
export function registerGroupChatRoutes(app: FastifyInstance, chat: GroupChatService): void {
  /** Send to the group channel (member-only, blocked if muted). */
  app.post(
    '/groups/:id/chat',
    {
      schema: { params: idParam, body: z.object({ body: z.string().min(1).max(MAX_GROUP_MESSAGE_LEN) }) },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => chat.send(req.user!.id, (req.params as { id: string }).id, (req.body as { body: string }).body),
  );

  /** Channel history — authorized on fetch, so removal revokes access at once. */
  app.get(
    '/groups/:id/chat',
    { schema: { params: idParam, querystring: z.object({ before: z.string().datetime().optional() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const { before } = req.query as { before?: string };
      return { messages: await chat.history(req.user!.id, id, before) };
    },
  );

  /** Mark the channel read. */
  app.post(
    '/groups/:id/chat/read',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await chat.markRead(req.user!.id, (req.params as { id: string }).id);
      return { ok: true };
    },
  );

  /**
   * Typing indicator (ephemeral). Rate limited harder than sending: it fires
   * while someone is composing, so it must never become a way to flood the room.
   */
  app.post(
    '/groups/:id/chat/typing',
    {
      schema: { params: idParam },
      config: {
        skipValidation: true,
        rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const },
      },
      preHandler: requireAuth,
    },
    async (req) => {
      await chat.typing(req.user!.id, (req.params as { id: string }).id);
      return { ok: true };
    },
  );

  /** Delete a message (staff any, author own). */
  app.delete(
    '/groups/:id/chat/:messageId',
    { schema: { params: z.object({ id: z.uuid(), messageId: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id, messageId } = req.params as { id: string; messageId: string };
      await chat.deleteMessage(req.user!.id, id, messageId);
      return { ok: true };
    },
  );

  /** Mute / unmute a member (staff only). */
  app.post(
    '/groups/:id/mutes',
    {
      schema: { params: idParam, body: z.object({ userId: z.uuid(), duration: z.enum(['1h', '24h', 'perm']) }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { userId, duration } = req.body as { userId: string; duration: '1h' | '24h' | 'perm' };
      await chat.mute(req.user!.id, id, userId, duration);
      return { ok: true };
    },
  );
  app.delete(
    '/groups/:id/mutes/:userId',
    { schema: { params: z.object({ id: z.uuid(), userId: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await chat.unmute(req.user!.id, id, userId);
      return { ok: true };
    },
  );

  /** Unread counts across the caller's groups. */
  app.get('/me/groups/unread', { preHandler: requireAuth }, async (req) => ({
    unread: await chat.unread(req.user!.id),
  }));
}
