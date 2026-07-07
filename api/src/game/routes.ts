import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';
import type { GameEngine } from './engine.js';
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

export function registerGameRoutes(app: FastifyInstance, engine: GameEngine): void {
  /** Reconnect snapshot (KUR-051): resume lands here after rejoining. */
  app.get(
    '/games/:roomId/state',
    {
      schema: { params: z.object({ roomId: z.string().max(80) }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { roomId } = req.params as { roomId: string };
      const snapshot = engine.getSnapshot(roomId, req.user!.id);
      if (!snapshot) {
        throw new AppError('GAME_NOT_FOUND', 404, 'no active game for you with that id');
      }
      return snapshot;
    },
  );
}
