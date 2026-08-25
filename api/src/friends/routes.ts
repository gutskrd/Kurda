import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { FriendService } from './service.js';

const targetParam = z.object({ userId: z.uuid() });

/** Friend system (KUR-081): request/accept/decline, block, list. */
export function registerFriendRoutes(app: FastifyInstance, friends: FriendService): void {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);

  /** Accepted friends. */
  app.get('/friends', { preHandler: requireAuth }, async (req) => ({ friends: await friends.list(req.user!.id, publicUrl) }));

  /** Incoming pending requests. */
  app.get('/friends/requests', { preHandler: requireAuth }, async (req) => ({
    requests: await friends.incomingRequests(req.user!.id, publicUrl),
  }));

  /** Send a friend request (auto-accepts a mutual pending request). */
  app.post(
    '/friends/requests',
    { schema: { body: z.object({ userId: z.uuid() }) }, preHandler: requireAuth },
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

  /** Remove a friend. */
  app.delete(
    '/friends/:userId',
    { schema: { params: targetParam }, preHandler: requireAuth },
    async (req) => {
      await friends.unfriend(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
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
