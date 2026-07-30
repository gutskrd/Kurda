import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { ChatService } from './service.js';
import { MAX_MESSAGE_LEN } from './service.js';

const userParam = z.object({ userId: z.uuid() });

/** 1:1 direct messages (KUR-083). Send over HTTP; receive/receipts over WS. */
export function registerChatRoutes(app: FastifyInstance, chat: ChatService): void {
  /** Conversation list with last message + unread counts. */
  app.get('/chat/conversations', { preHandler: requireAuth }, async (req) => ({
    conversations: await chat.conversations(req.user!.id),
  }));

  /** Paginated history with a user (marks their messages delivered). */
  app.get(
    '/chat/:userId/messages',
    {
      schema: {
        params: userParam,
        querystring: z.object({ before: z.string().datetime().optional() }),
      },
      preHandler: requireAuth,
    },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const { before } = req.query as { before?: string };
      return { messages: await chat.history(req.user!.id, userId, before) };
    },
  );

  /** Send a message (friends-only; silently dropped if they blocked you). */
  app.post(
    '/chat/:userId/messages',
    {
      schema: { params: userParam, body: z.object({ body: z.string().min(1).max(MAX_MESSAGE_LEN) }) },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { userId } = req.params as { userId: string };
      return chat.send(req.user!.id, userId, (req.body as { body: string }).body);
    },
  );

  /** Mark their messages read (fires a read receipt). */
  app.post(
    '/chat/:userId/read',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ read: await chat.markRead(req.user!.id, (req.params as { userId: string }).userId) }),
  );

  /** Typing indicator (ephemeral). */
  app.post(
    '/chat/:userId/typing',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await chat.typing(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
}
