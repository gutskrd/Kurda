import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { WordleService } from './wordle-service.js';
import type { XpService } from '../xp/service.js';
import type { StreakService } from '../streaks/service.js';

const difficultyBody = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const guessBody = z.object({
  word: z.string().min(1).max(64),
});

/**
 * Wordle daily & practice routes (KUR-304). All authenticated. The guess
 * endpoint is rate-limited (#010, keyed per-user by default) as an anti-abuse
 * guard on the server-authoritative scoring.
 */
export function registerWordleRoutes(
  app: FastifyInstance,
  deps: { xp?: XpService; streaks?: StreakService } = {},
): void {
  const wordle = new WordleService(app.db, deps);

  /** Start (or resume) today's shared daily puzzle. */
  app.post(
    '/wordle/daily',
    { schema: { body: difficultyBody }, preHandler: requireAuth },
    async (req, reply) => {
      const { difficulty } = req.body as z.infer<typeof difficultyBody>;
      const res = await wordle.startDaily(req.user!.id, difficulty);
      if (!res.ok) {
        return reply.code(503).send({ code: 'EMPTY_POOL', message: 'no words available for play' });
      }
      return res.game;
    },
  );

  /** Start an unlimited practice game (random word, reduced XP, no streak). */
  app.post(
    '/wordle/practice',
    { schema: { body: difficultyBody }, preHandler: requireAuth },
    async (req, reply) => {
      const { difficulty } = req.body as z.infer<typeof difficultyBody>;
      const res = await wordle.startPractice(req.user!.id, difficulty);
      if (!res.ok) {
        return reply.code(503).send({ code: 'EMPTY_POOL', message: 'no words available for play' });
      }
      return res.game;
    },
  );

  /** Submit one guess; scored server-side, answer withheld until game over. */
  app.post(
    '/wordle/games/:id/guesses',
    {
      schema: { params: z.object({ id: z.uuid() }), body: guessBody },
      config: { rateLimit: { max: 30, windowMs: 60_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { word } = req.body as z.infer<typeof guessBody>;
      const res = await wordle.guess(req.user!.id, id, word);
      if (res.ok) return res.game;
      switch (res.reason) {
        case 'not-found':
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such game' });
        case 'finished':
          return reply.code(409).send({ code: 'GAME_OVER', message: 'this game is already finished' });
        case 'wrong-length':
          return reply.code(422).send({ code: 'WRONG_LENGTH', message: 'guess is the wrong length' });
        case 'not-a-word':
          return reply.code(422).send({ code: 'NOT_A_WORD', message: 'not a valid Kurdish word' });
      }
    },
  );

  /** The player's aggregate stats (streak, win %, fastest, XP). */
  app.get(
    '/wordle/stats',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => wordle.stats(req.user!.id),
  );
}
