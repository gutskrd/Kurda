import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { BLOCKS_PAGE_MAX, FRIENDS_PAGE_MAX, type FriendService } from './service.js';

const targetParam = z.object({ userId: z.uuid() });

// Tighter than the global default: friend requests are a spam and harassment vector, and suggestions are expensive.
const REQUEST_LIMIT = { max: 20, windowMs: 60_000, per: 'user-or-ip' as const };
const SUGGESTIONS_LIMIT = { max: 30, windowMs: 60_000, per: 'user-or-ip' as const };
const BLOCKS_LIMIT = { max: 40, windowMs: 60_000, per: 'user-or-ip' as const };

/** Tells someone's apps their friends or requests changed. It carries nothing, so the apps read their lists again. */
const FRIENDS_CHANGED = 'friends_changed';

/** Friend routes: request, accept, decline, block, unblock, and the lists of each. */
export function registerFriendRoutes(app: FastifyInstance, friends: FriendService): void {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
  // Pings the other person when a request reaches them, is accepted or is withdrawn, so their apps need not poll for it;
  // never for a block, which is silent. The gateway is looked up when used, since it is set up after these routes.
  const tell = (userId: string): void => {
    void app.realtime.notifyUser(userId, { type: FRIENDS_CHANGED }).catch((err: unknown) => app.log.warn({ err }, 'friends ping not sent'));
  };

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
      preHandler: requireAccount,
    },
    async (req) => {
      const { limit, offset } = req.query as { limit?: number; offset?: number };
      return friends.list(req.user!.id, publicUrl, limit, offset);
    },
  );

  /** Incoming pending requests. */
  app.get('/friends/requests', { preHandler: requireAccount }, async (req) => ({
    requests: await friends.incomingRequests(req.user!.id, publicUrl),
  }));

  /** Requests you have sent that are still unanswered. */
  app.get('/friends/requests/outgoing', { preHandler: requireAccount }, async (req) => ({
    requests: await friends.outgoingRequests(req.user!.id, publicUrl),
  }));

  /** People-you-may-know (friends-of-friends, ranked by mutual count). */
  app.get(
    '/friends/suggestions',
    { config: { rateLimit: SUGGESTIONS_LIMIT }, preHandler: requireAccount },
    async (req) => ({ suggestions: await friends.suggestions(req.user!.id, publicUrl) }),
  );

  /** Send a friend request (auto-accepts a mutual pending request). */
  app.post(
    '/friends/requests',
    { schema: { body: z.object({ userId: z.uuid() }) }, config: { rateLimit: REQUEST_LIMIT }, preHandler: [requireAccount, requireBirthMonth] },
    async (req) => {
      const to = (req.body as { userId: string }).userId;
      const outcome = await friends.request(req.user!.id, to);
      if (outcome === 'requested' || outcome === 'accepted') tell(to);
      return { outcome };
    },
  );

  /** Accept / decline a request from :userId. */
  app.post(
    '/friends/requests/:userId/accept',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: [requireAccount, requireBirthMonth] },
    async (req) => {
      const from = (req.params as { userId: string }).userId;
      const result = await friends.respond(req.user!.id, from, true);
      tell(from);
      return { result };
    },
  );
  app.post(
    '/friends/requests/:userId/decline',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req) => ({ result: await friends.respond(req.user!.id, (req.params as { userId: string }).userId, false) }),
  );

  /** Withdraw a request you sent. */
  app.delete(
    '/friends/requests/:userId',
    { schema: { params: targetParam }, preHandler: requireAccount },
    async (req) => {
      const to = (req.params as { userId: string }).userId;
      if (await friends.cancelRequest(req.user!.id, to)) tell(to);
      return { ok: true };
    },
  );

  /** Remove a friend. */
  app.delete(
    '/friends/:userId',
    { schema: { params: targetParam }, preHandler: requireAccount },
    async (req) => {
      await friends.unfriend(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );

  /**
   * Who you have blocked. Scoped to `blocker_id`, so it can never answer who blocked you; limited a little tighter
   * than the default because it joins and counts on every call.
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
      preHandler: requireAccount,
    },
    async (req) => {
      const { limit, offset = 0 } = req.query as { limit?: number; offset?: number };
      return friends.blocked(req.user!.id, publicUrl, limit, offset);
    },
  );

  /** Block / unblock (silent + absolute). */
  app.post(
    '/friends/:userId/block',
    { schema: { params: targetParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req) => {
      await friends.block(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
  app.delete(
    '/friends/:userId/block',
    { schema: { params: targetParam }, preHandler: requireAccount },
    async (req) => {
      await friends.unblock(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );
}
