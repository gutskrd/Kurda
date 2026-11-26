import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAuth } from '../plugins/auth.js';
import { RhymeService } from './rhyme-service.js';
import { RHYME_MIN_PROMPTS } from './rhyme-words.js';
import type { MilestoneRecorder } from '../achievements/service.js';

const startBody = z.object({
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
});

const guessBody = z.object({
  word: z.string().min(1).max(64),
});

/** Rhyme training (solo) routes. Authenticated, server-scored, and the guess endpoint is rate-limited against abuse. */
export function registerRhymeRoutes(
  app: FastifyInstance,
  deps: { milestones?: Pick<MilestoneRecorder, 'recordSoloGame'> } = {},
): void {
  const rhyme = new RhymeService(app.db, deps);

  /**
   * Which dialects rhyme rounds are offered in, with their curated prompt count and whether it reaches
   * RHYME_MIN_PROMPTS. Both apps show the others as coming soon, for training and matches.
   */
  app.get('/rhyme/availability', { config: { skipValidation: true }, preHandler: requireAuth }, async () => ({
    dialects: await rhyme.availability(),
    minimum: RHYME_MIN_PROMPTS,
  }));

  /** Start a solo training round with a random prompt of the chosen dialect. */
  app.post(
    '/rhyme/training',
    // a round is a row and several reads: thirty a minute is more than anyone plays
    { schema: { body: startBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const { dialect } = req.body as z.infer<typeof startBody>;
      const res = await rhyme.startTraining(req.user!.id, dialect);
      if (!res.ok) {
        return reply.code(503).send({ code: 'EMPTY_LEXICON', message: 'no words available for play' });
      }
      return res.game;
    },
  );

  /** Submit one rhyme; scored server-side against the prompt + dictionary. */
  app.post(
    '/rhyme/training/:id/guesses',
    {
      schema: { params: z.object({ id: lowerUuid() }), body: guessBody },
      config: { rateLimit: { max: 60, windowMs: 60_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { word } = req.body as z.infer<typeof guessBody>;
      const res = await rhyme.submit(req.user!.id, id, word);
      if (res.ok) return { game: res.game, result: res.result };
      return res.reason === 'not-found'
        ? reply.code(404).send({ code: 'NOT_FOUND', message: 'no such game' })
        : reply.code(409).send({ code: 'GAME_OVER', message: 'this game has ended' });
    },
  );

  /** End the round early; awards XP for the rhymes found. */
  app.post(
    '/rhyme/training/:id/end',
    {
      schema: { params: z.object({ id: lowerUuid() }) },
      config: { skipValidation: true },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const res = await rhyme.end(req.user!.id, id);
      if (res.ok) return { game: res.game };
      return res.reason === 'not-found'
        ? reply.code(404).send({ code: 'NOT_FOUND', message: 'no such game' })
        : reply.code(409).send({ code: 'GAME_OVER', message: 'this game has ended' });
    },
  );
}
