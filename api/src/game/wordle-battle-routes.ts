import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { WordleBattleService } from './wordle-battle-service.js';
import type { XpService } from '../xp/service.js';

const createBody = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
});
const guessBody = z.object({ word: z.string().min(1).max(64) });
const idParam = z.object({ id: z.uuid() });

/**
 * Wordle Battle routes (KUR-306) — server-authoritative multiplayer. All
 * authenticated; the guess endpoint is rate-limited (#010). State/results are
 * poll-safe; the realtime gateway (#049) pushing opponent progress is an additive
 * transport on top of these same endpoints.
 */
export function registerWordleBattleRoutes(app: FastifyInstance, deps: { xp?: XpService } = {}): void {
  const battles = new WordleBattleService(app.db, deps);

  /** Create a battle lobby (creator auto-joins); pick difficulty + player cap. */
  app.post('/wordle/battles', { schema: { body: createBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth }, async (req, reply) => {
    const body = req.body as z.infer<typeof createBody>;
    const res = await battles.create(req.user!.id, body);
    if (!res.ok) return reply.code(503).send({ code: 'EMPTY_POOL', message: 'no words available for play' });
    return reply.code(201).send(res.battle);
  });

  /** Join an open lobby. */
  app.post('/wordle/battles/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await battles.join((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.battle;
    switch (res.reason) {
      case 'not-found':
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such battle' });
      case 'not-open':
        return reply.code(409).send({ code: 'NOT_OPEN', message: 'this battle already started' });
      case 'full':
        return reply.code(409).send({ code: 'BATTLE_FULL', message: 'this battle is full' });
      case 'already-joined':
        return reply.code(409).send({ code: 'ALREADY_JOINED', message: 'you are already in this battle' });
    }
  });

  /** Creator starts the match (needs ≥2 players). */
  app.post('/wordle/battles/:id/start', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await battles.start((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.battle;
    switch (res.reason) {
      case 'not-found':
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such battle' });
      case 'forbidden':
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'only the host can start the match' });
      case 'not-lobby':
        return reply.code(409).send({ code: 'NOT_LOBBY', message: 'this battle already started' });
      case 'need-two':
        return reply.code(409).send({ code: 'NEED_TWO', message: 'at least two players are needed' });
    }
  });

  /** Submit one guess (scored server-side; own feedback + opponent progress back). */
  app.post(
    '/wordle/battles/:id/guesses',
    { schema: { params: idParam, body: guessBody }, config: { rateLimit: { max: 60, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const { word } = req.body as z.infer<typeof guessBody>;
      const res = await battles.guess((req.params as { id: string }).id, req.user!.id, word);
      if (res.ok) return res.battle;
      return guessError(reply, res.reason);
    },
  );

  /** The caller's live match view (own guesses + opponents' progress only). */
  app.get('/wordle/battles/:id', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const state = await battles.state((req.params as { id: string }).id, req.user!.id).catch(() => null);
    if (!state) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such battle' });
    return state;
  });

  /** Post-match results: all guess histories + the word + placement + XP. */
  app.get('/wordle/battles/:id/results', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const results = await battles.results((req.params as { id: string }).id, req.user!.id);
    if (!results) return reply.code(409).send({ code: 'NOT_FINISHED', message: 'results are available once the match ends' });
    return results;
  });
}

function guessError(reply: FastifyReply, reason: 'wrong-length' | 'not-a-word' | 'not-found' | 'not-active' | 'finished' | 'not-in-match'): FastifyReply {
  switch (reason) {
    case 'not-found':
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such battle' });
    case 'not-in-match':
      return reply.code(403).send({ code: 'NOT_IN_MATCH', message: 'you are not in this battle' });
    case 'not-active':
      return reply.code(409).send({ code: 'NOT_ACTIVE', message: 'this battle is not in play' });
    case 'finished':
      return reply.code(409).send({ code: 'GAME_OVER', message: 'you have already finished' });
    case 'wrong-length':
      return reply.code(422).send({ code: 'WRONG_LENGTH', message: 'guess is the wrong length' });
    case 'not-a-word':
      return reply.code(422).send({ code: 'NOT_A_WORD', message: 'not a valid Kurdish word' });
  }
}
