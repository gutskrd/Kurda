import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { ChatService } from './service.js';
import { MAX_MESSAGE_LEN } from './service.js';
import type { TrustService } from '../trust/service.js';
import type { AiModerationService } from '../moderation/ai-service.js';

const userParam = z.object({ userId: z.uuid() });

/** 1:1 direct messages (KUR-083). Send over HTTP; receive/receipts over WS. */
export function registerChatRoutes(
  app: FastifyInstance,
  chat: ChatService,
  trust?: TrustService,
  aiMod?: AiModerationService,
): void {
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
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const body = (req.body as { body: string }).body;
      if (trust) {
        // per-level velocity cap (KUR-295): new accounts throttled tighter
        const gate = await trust.checkAction(req.user!.id, 'message');
        if (!gate.allowed) {
          return reply
            .code(429)
            .send({ code: 'TRUST_VELOCITY', message: 'you are messaging too fast — slows down for new accounts' });
        }
        // duplicate/burst spam → auto-mute/suspend before the message lands
        const spam = await trust.assessContent(req.user!.id, body);
        if (spam.enforced) {
          return reply
            .code(403)
            .send({ code: 'AUTO_MODERATED', message: 'your account has been restricted for spam-like activity' });
        }
      }
      if (aiMod) {
        // AI-assisted moderation (KUR-293), layered after the #086 wordlist:
        // a high-confidence hit blocks the send; lower hits are flagged (#102).
        const verdict = await aiMod.moderate({ surface: 'chat', text: body, authorId: req.user!.id, contentType: 'dm' });
        if (verdict.blocked) {
          return reply.code(422).send({ code: 'CONTENT_BLOCKED', message: 'this message was blocked by moderation' });
        }
      }
      const msg = await chat.send(req.user!.id, userId, body);
      if (trust) await trust.recordAction(req.user!.id, 'message');
      return msg;
    },
  );

  if (trust) {
    /** Current trust level + per-action caps (transparency for the client). */
    app.get('/me/trust', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
      const level = await trust.getLevel(req.user!.id);
      return { level, caps: trust.capsFor(level) };
    });
  }

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
