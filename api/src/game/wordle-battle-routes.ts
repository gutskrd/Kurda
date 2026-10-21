import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { WordleBattleService, type WordleBattleDeps } from './wordle-battle-service.js';

const createBody = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  // who may join: the host's friends (default), or any adult with the link
  access: z.enum(['friends', 'open']).optional(),
  // Rated or Friendly (Game Ranks); left out, the host's last choice
  rated: z.boolean().optional(),
});
const guessBody = z.object({ word: z.string().min(1).max(64) });
const removeBody = z.object({ seat: z.number().int().min(1).max(64) });
const idParam = z.object({ id: z.uuid() });

const notFound = (reply: FastifyReply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'no such battle' });

/**
 * Peyvok Battle routes (KUR-306) — server-authoritative multiplayer. All
 * authenticated; the guess endpoint is rate-limited (#010). State/results are
 * poll-safe; the realtime gateway (#049) pushing opponent progress is an additive
 * transport on top of these same endpoints.
 *
 * Creating and joining reach other people, so they need a birth month on
 * record like every other social write. Only members get a battle's state or
 * results; to anyone else it does not exist (the join rule, play/access.ts).
 */
export function registerWordleBattleRoutes(app: FastifyInstance, deps: Omit<WordleBattleDeps, 'publicUrl'> = {}): void {
  const battles = new WordleBattleService(app.db, {
    ...deps,
    publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
  });

  /** Create a battle lobby (creator auto-joins); pick difficulty + player cap. */
  app.post('/wordle/battles', { schema: { body: createBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireBirthMonth }, async (req, reply) => {
    const body = req.body as z.infer<typeof createBody>;
    const res = await battles.create(req.user!.id, body);
    if (!res.ok) {
      if (res.reason === 'open-needs-adult') {
        return reply.code(403).send({ code: 'OPEN_GAMES_ADULTS_ONLY', message: 'only adults can open a game to everyone' });
      }
      return reply.code(503).send({ code: 'EMPTY_POOL', message: 'no words available for play' });
    }
    return reply.code(201).send(res.battle);
  });

  /** Join an open lobby. */
  app.post('/wordle/battles/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireBirthMonth }, async (req, reply) => {
    const res = await battles.join((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.battle;
    switch (res.reason) {
      case 'not-found':
        return notFound(reply);
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
        return notFound(reply);
      case 'forbidden':
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'only the host can start the match' });
      case 'not-lobby':
        return reply.code(409).send({ code: 'NOT_LOBBY', message: 'this battle already started' });
      case 'need-two':
        return reply.code(409).send({ code: 'NEED_TWO', message: 'at least two players are needed' });
    }
  });

  /**
   * Leave: out of a lobby (the host leaving calls it off), or out of a battle
   * under way (finished where you stand; the others stop waiting for you).
   */
  app.post('/wordle/battles/:id/leave', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await battles.leave((req.params as { id: string }).id, req.user!.id);
    if (!res.ok) return notFound(reply);
    return { ok: true };
  });

  /** The host takes a player out of the lobby, by seat. */
  app.post('/wordle/battles/:id/remove', { schema: { params: idParam, body: removeBody }, preHandler: requireAuth }, async (req, reply) => {
    const { seat } = req.body as z.infer<typeof removeBody>;
    const res = await battles.remove((req.params as { id: string }).id, req.user!.id, seat);
    if (res.ok) return res.battle;
    switch (res.reason) {
      case 'not-found':
        return notFound(reply);
      case 'forbidden':
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'only the host can remove a player' });
      case 'not-lobby':
        return reply.code(409).send({ code: 'NOT_LOBBY', message: 'players can only be removed before the start' });
      case 'no-seat':
        return reply.code(404).send({ code: 'NO_SUCH_SEAT', message: 'nobody is in that seat' });
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

  /**
   * The caller's live match view (own guesses + opponents' progress only).
   * Someone who may join sees the lobby first; a latecomer is told the battle
   * already started (409 GAME_STARTED) rather than shown a game they are not in.
   */
  app.get('/wordle/battles/:id', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await battles.read((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.battle;
    if (res.reason === 'started') {
      return reply.code(409).send({ code: 'GAME_STARTED', message: 'this battle has already started' });
    }
    return notFound(reply);
  });

  /** Post-match results: all guess histories + the word + placement + XP. */
  app.get('/wordle/battles/:id/results', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const results = await battles.results(id, req.user!.id);
    if (results) return results;
    // members are told it is not over yet; anyone else, that it does not exist
    if (!(await battles.isMember(id, req.user!.id))) return notFound(reply);
    return reply.code(409).send({ code: 'NOT_FINISHED', message: 'results are available once the match ends' });
  });
}

function guessError(reply: FastifyReply, reason: 'wrong-length' | 'not-a-word' | 'not-found' | 'not-active' | 'finished' | 'not-in-match'): FastifyReply {
  switch (reason) {
    case 'not-found':
      return notFound(reply);
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
