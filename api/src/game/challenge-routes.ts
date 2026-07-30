import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { ChallengeService } from './challenge-service.js';

const userParam = z.object({ userId: z.uuid() });

/** Challenge-a-friend direct 1v1 invites (KUR-088). */
export function registerChallengeRoutes(app: FastifyInstance, challenges: ChallengeService): void {
  /** Send a challenge (auto-matches if they already challenged you). */
  app.post(
    '/challenges',
    {
      schema: { body: z.object({ userId: z.uuid() }) },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => challenges.challenge(req.user!.id, (req.body as { userId: string }).userId),
  );

  /** Accept a challenge → unranked 1v1 room. */
  app.post(
    '/challenges/:userId/accept',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => challenges.accept(req.user!.id, (req.params as { userId: string }).userId),
  );

  /** Decline a challenge (polite — no reason sent). */
  app.post(
    '/challenges/:userId/decline',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await challenges.decline(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );

  /** Withdraw a challenge you sent. */
  app.delete(
    '/challenges/:userId',
    { schema: { params: userParam }, preHandler: requireAuth },
    async (req) => {
      await challenges.cancel(req.user!.id, (req.params as { userId: string }).userId);
      return { ok: true };
    },
  );

  /** Live status between you and another user. */
  app.get(
    '/challenges/:userId',
    { schema: { params: userParam }, preHandler: requireAuth },
    async (req) => challenges.status(req.user!.id, (req.params as { userId: string }).userId),
  );
}
