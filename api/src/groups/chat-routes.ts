import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import type { GroupChatService } from './chat-service.js';
import { MAX_GROUP_MESSAGE_LEN } from './chat-service.js';
import type { TrustService } from '../trust/service.js';
import { AppError } from '../plugins/errors.js';
import { secondsToUtcMidnight, takeDaily } from '../limits/counters.js';

const idParam = z.object({ id: z.uuid() });

/** Group messages one account may send a day (UTC), over every group: a very talkative day, never a flood. */
export const GROUP_MESSAGES_PER_DAY = 2_000;

/**
 * Group chat channel and its moderation. A message meets what a direct message does first (trust/service.ts): the
 * hourly cap for the sender's trust level, shared with direct messages, and the duplicate and burst spam check; then
 * `GROUP_MESSAGES_PER_DAY`. Without Redis those counts read empty, and only the route's rate limit applies.
 */
export function registerGroupChatRoutes(app: FastifyInstance, chat: GroupChatService, trust?: TrustService): void {
  /** Send to the group channel (member-only, blocked if muted). */
  app.post(
    '/groups/:id/chat',
    {
      schema: { params: idParam, body: z.object({ body: z.string().min(1).max(MAX_GROUP_MESSAGE_LEN) }) },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      // No requireUnrestricted('chat') here: `send` checks it first (`assertCanPost`) with the same 403 MUTED, and a
      // second check would cost a query per message.
      preHandler: [requireAccount, requireBirthMonth],
    },
    async (req, reply) => {
      const userId = req.user!.id;
      const body = (req.body as { body: string }).body;
      if (trust) {
        const gate = await trust.checkAction(userId, 'message');
        if (!gate.allowed) {
          return reply.code(429).send({ code: 'TRUST_VELOCITY', message: 'you are messaging too fast — slow down for new accounts' });
        }
        if (!(await takeDaily(app.redis, 'group-chat', userId, GROUP_MESSAGES_PER_DAY, app.log))) {
          throw new AppError('RATE_LIMITED', 429, 'too many messages today; try again tomorrow', { retryAfterSec: secondsToUtcMidnight() });
        }
        // duplicate/burst spam → auto-mute/suspend before the message lands
        const spam = await trust.assessContent(userId, body);
        if (spam.enforced) {
          return reply.code(403).send({ code: 'AUTO_MODERATED', message: 'your account has been restricted for spam-like activity' });
        }
      }
      const message = await chat.send(userId, (req.params as { id: string }).id, body, (k) => (app.storage ? app.storage.publicUrl(k) : null));
      if (trust) await trust.recordAction(userId, 'message');
      return message;
    },
  );

  /** Channel history and what the reader has cleared; membership is checked on every fetch, so removal revokes access at once. */
  app.get(
    '/groups/:id/chat',
    { schema: { params: idParam, querystring: z.object({ before: z.string().datetime().optional() }) }, preHandler: requireAccount },
    async (req) => {
      const { id } = req.params as { id: string };
      const { before } = req.query as { before?: string };
      const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
      return chat.history(req.user!.id, id, before, 30, publicUrl);
    },
  );

  /**
   * Clears the chat for oneself (any member) or for everyone (owner or admin). Rate limited, because clearing for
   * everyone updates every member's open view.
   */
  app.post(
    '/groups/:id/chat/clear',
    {
      schema: { params: idParam, body: z.object({ for: z.enum(['me', 'everyone']) }) },
      config: { rateLimit: { max: 10, windowMs: 60 * 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => ({
      cleared: await chat.clear(req.user!.id, (req.params as { id: string }).id, (req.body as { for: 'me' | 'everyone' }).for),
    }),
  );

  /** Mark the channel read. */
  app.post(
    '/groups/:id/chat/read',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req) => {
      await chat.markRead(req.user!.id, (req.params as { id: string }).id);
      return { ok: true };
    },
  );

  /** Typing indicator, rate limited harder than sending so it cannot flood the room. */
  app.post(
    '/groups/:id/chat/typing',
    {
      schema: { params: idParam },
      config: {
        skipValidation: true,
        rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const },
      },
      preHandler: requireAccount,
    },
    async (req) => {
      await chat.typing(req.user!.id, (req.params as { id: string }).id);
      return { ok: true };
    },
  );

  /** Delete a message (staff any, author own). */
  app.delete(
    '/groups/:id/chat/:messageId',
    { schema: { params: z.object({ id: z.uuid(), messageId: z.uuid() }) }, preHandler: requireAccount },
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
      preHandler: requireAccount,
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
    { schema: { params: z.object({ id: z.uuid(), userId: z.uuid() }) }, preHandler: requireAccount },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await chat.unmute(req.user!.id, id, userId);
      return { ok: true };
    },
  );

  /** Unread counts across the caller's groups. */
  app.get('/me/groups/unread', { preHandler: requireAccount }, async (req) => ({
    unread: await chat.unread(req.user!.id),
  }));
}
