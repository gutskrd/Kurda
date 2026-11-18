import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { WordleService } from './wordle-service.js';
import type { StreakService } from '../streaks/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { SavedWordsService, type SavedWordsBadges } from '../dictionary/saved-words-service.js';

const difficultyBody = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const guessBody = z.object({
  word: z.string().min(1).max(64),
});

/**
 * Peyvok daily and practice routes, all authenticated. The guess endpoint is rate-limited (per user by default) to
 * protect server-side scoring.
 */
export function registerWordleRoutes(
  app: FastifyInstance,
  deps: { streaks?: StreakService; milestones?: MilestoneRecorder & Partial<SavedWordsBadges> } = {},
): void {
  // a word saved from a game moves the Gencîne badge, as one saved from the dictionary does
  const onWordSaved = deps.milestones?.onWordSaved?.bind(deps.milestones);
  const savedWords = new SavedWordsService(app.db, undefined, onWordSaved ? { onWordSaved } : undefined);
  const wordle = new WordleService(app.db, { ...deps, savedWords });

  /** Start (or resume) today's shared daily puzzle at a difficulty: one daily word per difficulty. */
  app.post(
    '/wordle/daily',
    // a round is a row and a read of the word pool: thirty a minute is more than anyone plays, and few enough not to be a tap left running
    { schema: { body: difficultyBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
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
    // a round is a row and a read of the word pool: thirty a minute is more than anyone plays, and few enough not to be a tap left running
    { schema: { body: difficultyBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
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

  /**
   * Save a finished game's word to the player's words (the entry its results card names); counts once toward words
   * learned. 404 for someone else's game, 409 while still playing, and 404 NO_ENTRY when the dictionary has no entry to
   * save.
   */
  app.post(
    '/wordle/games/:id/save',
    {
      schema: { params: z.object({ id: z.uuid() }) },
      config: { skipValidation: true, rateLimit: { max: 30, windowMs: 60_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const res = await wordle.saveWord(req.user!.id, id);
      if (res.ok) return { saved: true, scheduled: res.saved.scheduled, wordsLearned: res.wordsLearned };
      switch (res.reason) {
        case 'not-found':
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such game' });
        case 'not-finished':
          return reply.code(409).send({ code: 'GAME_NOT_OVER', message: 'finish the game first' });
        case 'no-entry':
          return reply.code(404).send({ code: 'NO_ENTRY', message: 'this word has no dictionary entry to save' });
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
