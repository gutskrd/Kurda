import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { MatchmakingService } from './matchmaking.js';

export function registerMatchmakingRoutes(
  app: FastifyInstance,
  matchmaking: MatchmakingService,
): void {
  app.post(
    '/matchmaking/queue',
    {
      config: {
        skipValidation: true, // no body
        rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const },
      },
      preHandler: requireAuth,
    },
    async (req) => matchmaking.enqueue(req.user!.id),
  );

  app.post(
    '/matchmaking/cancel',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ cancelled: await matchmaking.cancel(req.user!.id) }),
  );

  app.get('/matchmaking/status', { preHandler: requireAuth }, async (req) =>
    matchmaking.status(req.user!.id),
  );
}
