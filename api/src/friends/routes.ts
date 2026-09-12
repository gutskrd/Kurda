import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { BLOCKS_PAGE_MAX, FRIENDS_PAGE_MAX, type FriendService } from './service.js';

const targetParam = z.object({ userId: z.uuid() });

// Tighter than the global default (100/min): sending friend requests is a spam /
// harassment vector, and the friends-of-friends suggestion query is expensive.
const REQUEST_LIMIT = { max: 20, windowMs: 60_000, per: 'user-or-ip' as const };
const SUGGESTIONS_LIMIT = { max: 30, windowMs: 60_000, per: 'user-or-ip' as const };
const BLOCKS_LIMIT = { max: 40, windowMs: 60_000, per: 'user-or-ip' as const };

/** Friend system (KUR-081): request/accept/decline, block/unblock, and the lists of each. */
export function registerFriendRoutes(app: FastifyInstance, friends: FriendService): void {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);

  /** Accepted friends — all of them, unless asked for fewer. */
  app.get(
    '/friends',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(FRIENDS_PAGE_MAX).optional(),
          offset: z.coerce.number().int().min(0).max(FRIENDS_PAGE_MAX).optional(),
        }),
      },
      preHandler: requireAuth,
    },
    async (req) => {
      const { limit, offset } = req.query as { limit?: number; offset?: number };
      return friends.list(req.user!.id, publicUrl, limit, offset);
    },
  );

  /** Incoming pending requests. */
  app.get('/friends/requests', { preHandler: requireAuth }, async (req) => ({
    requests: await friends.incomingRequests(req.user!.id, publicUrl),
  }));

  /** Requests you have sent that are still unanswered. */
  app.get('/friends/requests/outgoing', { preHandler: requireAuth }, async (req) => ({
    requests: await friends.outgoingRequests(req.user!.id, publicUrl),
  }));

  /** People-you-may-know (friends-of-friends, ranked by mutual count). */
  app.get(
    '/friends/suggestions',
    { config: { rateLimit: SUGGESTIONS_LIMIT }, preHandler: requireAuth },
    async (req) => ({ suggestions: await friends.suggestions(req.user!.id, publicUrl) }),
  );

  /** Send a friend request (auto-accepts a mutual pending request). */
  app.post(
    '/friends/requests',
    { schema: { body: z.object({ userId: z.uuid() }) }, config: { rateLimit: REQUEST_LIMIT }, preHandler: requireAuth },
    async (req) => ({ outcome: await friends.request(req.user!.id, (req.body as { userId: string }).userId) }),
  );

  /** Accept / decline a request from :userId. */
  app.post(
    '/friends/requests/:userId/accept',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ result: await friends.respond(req.user!.id, (req.params as { userId: string }).userId, true) }),
  );
  app.post(
    '/friends/requests/:userId/decline',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ result: await friends.respond(req.user!.id, (req.params as { userId: string }).userId, false) }),
  );

  /** Withdraw a request you sent. */
  app.delete(
    '/friends/requests/:userId',
    { schema: { params: targetParam }, preHandler: requireAuth },
    async (req) => {
      await friends.cancelRequest(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );

  /** Remove a friend. */
  app.delete(
    '/friends/:userId',
    { schema: { params: targetParam }, preHandler: requireAuth },
    async (req) => {
      await friends.unfriend(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );

  /**
   * Who you have blocked.
   *
   * Yours alone — the service scopes it to `blocker_id`, so this can only ever
   * answer "who did I block", never "who blocked me". Rate-limited a little
   * tighter than the default because it joins and counts on every call.
   */
  app.get(
    '/friends/blocks',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(BLOCKS_PAGE_MAX).optional(),
          offset: z.coerce.number().int().min(0).max(10_000).optional(),
        }),
      },
      config: { rateLimit: BLOCKS_LIMIT },
      preHandler: requireAuth,
    },
    async (req) => {
      const { limit, offset = 0 } = req.query as { limit?: number; offset?: number };
      return friends.blocked(req.user!.id, publicUrl, limit, offset);
    },
  );

  /** Block / unblock (silent + absolute). */
  app.post(
    '/friends/:userId/block',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await friends.block(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
  app.delete(
    '/friends/:userId/block',
    { schema: { params: targetParam }, preHandler: requireAuth },
    async (req) => {
      await friends.unblock(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
}
