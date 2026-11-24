import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ChatUnread } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import { parentalAllows, requireSwitchOn } from '../parental/supervision.js';
import type { ChatService } from './service.js';
import { MAX_MESSAGE_LEN } from './service.js';
import type { TrustService } from '../trust/service.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { GroupChatService } from '../groups/chat-service.js';

const userParam = z.object({ userId: z.uuid() });

/** Direct messages: sent over HTTP, received and acknowledged over the WebSocket. */
export function registerChatRoutes(
  app: FastifyInstance,
  chat: ChatService,
  trust?: TrustService,
  aiMod?: AiModerationService,
): void {
  /** Conversation list with last message + unread counts; not while a parent has messages switched off. */
  app.get('/chat/conversations', { preHandler: [requireAccount, requireSwitchOn('chat')] }, async (req) => ({
    conversations: await chat.conversations(req.user!.id, (k) => (app.storage ? app.storage.publicUrl(k) : null)),
  }));

  /** Paginated history with a user; marks their messages delivered. */
  app.get(
    '/chat/:userId/messages',
    {
      schema: {
        params: userParam,
        querystring: z.object({ before: z.string().datetime().optional() }),
      },
      preHandler: [requireAccount, requireSwitchOn('chat')],
    },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const { before } = req.query as { before?: string };
      const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
      return { messages: await chat.history(req.user!.id, userId, before, 30, publicUrl) };
    },
  );

  /** Send a message (friends-only; silently dropped if they blocked you). */
  app.post(
    '/chat/:userId/messages',
    {
      schema: { params: userParam, body: z.object({ body: z.string().min(1).max(MAX_MESSAGE_LEN) }) },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('chat')],
    },
    async (req, reply) => {
      const { userId } = req.params as { userId: string };
      const body = (req.body as { body: string }).body;
      if (trust) {
        // Per-trust-level velocity cap: new accounts are throttled tighter.
        const gate = await trust.checkAction(req.user!.id, 'message');
        if (!gate.allowed) {
          return reply
            .code(429)
            .send({ code: 'TRUST_VELOCITY', message: 'you are messaging too fast — slow down for new accounts' });
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
        // Automated moderation after the word list: a high-confidence hit blocks the send, lower ones are flagged.
        const verdict = await aiMod.moderate({ surface: 'chat', text: body, authorId: req.user!.id, contentType: 'dm' });
        if (verdict.blocked) {
          return reply.code(422).send({ code: 'CONTENT_BLOCKED', message: 'this message was blocked by moderation' });
        }
      }
      const msg = await chat.send(req.user!.id, userId, body, (k) =>
        app.storage ? app.storage.publicUrl(k) : null,
      );
      if (trust) await trust.recordAction(req.user!.id, 'message');
      return msg;
    },
  );

  if (trust) {
    /** Current trust level + per-action caps (transparency for the client). */
    app.get('/me/trust', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
      const level = await trust.getLevel(req.user!.id);
      return { level, caps: trust.capsFor(level) };
    });
  }

  /** Mark their messages read (fires a read receipt). */
  app.post(
    '/chat/:userId/read',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req) => ({ read: await chat.markRead(req.user!.id, (req.params as { userId: string }).userId) }),
  );

  /** Typing indicator. Rate limited, because otherwise it is a free way to spam events at another user. */
  app.post(
    '/chat/:userId/typing',
    {
      schema: { params: userParam },
      config: {
        skipValidation: true,
        rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const },
      },
      preHandler: requireAccount,
    },
    async (req) => {
      await chat.typing(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
}

/**
 * `GET /chat/unread`: what the badges show, direct and group, without the conversation list. Only conversations with
 * something unread are listed, a group's count stopping at GROUP_UNREAD_CAP (shared/src/chat-unread.ts).
 */
export function registerChatUnreadRoute(app: FastifyInstance, chat: ChatService, groupChat: GroupChatService): void {
  app.get('/chat/unread', { preHandler: requireAccount }, async (req): Promise<ChatUnread> => {
    // nothing to read while a parent has messages switched off, so no badge either
    if (!(await parentalAllows(app.db, req.user!.id, 'chat'))) return { direct: [], groups: [] };
    const [direct, groups] = await Promise.all([chat.unread(req.user!.id), groupChat.unread(req.user!.id)]);
    return { direct, groups: groups.filter((g) => g.unread > 0) };
  });
}
