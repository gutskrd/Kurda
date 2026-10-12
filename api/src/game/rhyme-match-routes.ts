import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { RhymeMatchService, type RhymeMatchDeps } from './rhyme-match-service.js';

const createBody = z.object({
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  windowMs: z.number().int().min(30_000).max(180_000).optional(),
  // who may join: the host's friends (default), or any adult with the link
  access: z.enum(['friends', 'open']).optional(),
});
const submitBody = z.object({ word: z.string().min(1).max(64) });
const removeBody = z.object({ seat: z.number().int().min(1).max(64) });
const idParam = z.object({ id: z.uuid() });

const notFound = (reply: FastifyReply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'no such match' });

/**
 * Rhyme multiplayer routes (KUR-299) — 1v1 / free-for-all, server-authoritative.
 * All authenticated; submit is rate-limited (#010). State/results are poll-safe;
 * the realtime scoreboard push (#049) + matchmaking (#050) layer onto these
 * endpoints. Solo training stays on the existing /rhyme routes.
 *
 * As for Wordle Battle: creating and joining need a birth month on record,
 * and only members get a match's state or results.
 */
export function registerRhymeMatchRoutes(app: FastifyInstance, deps: Omit<RhymeMatchDeps, 'publicUrl'> = {}): void {
  const matches = new RhymeMatchService(app.db, {
    ...deps,
    publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
  });

  /** Create a match lobby (creator auto-joins). */
  app.post('/rhyme/matches', { schema: { body: createBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireBirthMonth }, async (req, reply) => {
    const res = await matches.create(req.user!.id, req.body as z.infer<typeof createBody>);
    if (!res.ok) {
      if (res.reason === 'open-needs-adult') {
        return reply.code(403).send({ code: 'OPEN_GAMES_ADULTS_ONLY', message: 'only adults can open a game to everyone' });
      }
      return reply.code(503).send({ code: 'EMPTY_LEXICON', message: 'no words available for play' });
    }
    return reply.code(201).send(res.match);
  });

  /** Join an open lobby. */
  app.post('/rhyme/matches/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireBirthMonth }, async (req, reply) => {
    const res = await matches.join((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.match;
    switch (res.reason) {
      case 'not-found':
        return notFound(reply);
      case 'not-open':
        return reply.code(409).send({ code: 'NOT_OPEN', message: 'this match already started' });
      case 'full':
        return reply.code(409).send({ code: 'MATCH_FULL', message: 'this match is full' });
      case 'already-joined':
        return reply.code(409).send({ code: 'ALREADY_JOINED', message: 'you are already in this match' });
    }
  });

  /** Creator starts the match (needs ≥2 players). */
  app.post('/rhyme/matches/:id/start', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await matches.start((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.match;
    switch (res.reason) {
      case 'not-found':
        return notFound(reply);
      case 'forbidden':
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'only the host can start the match' });
      case 'not-lobby':
        return reply.code(409).send({ code: 'NOT_LOBBY', message: 'this match already started' });
      case 'need-two':
        return reply.code(409).send({ code: 'NEED_TWO', message: 'at least two players are needed' });
    }
  });

  /** Leave: a lobby (the host leaving calls it off), or a match under way (your score stands). */
  app.post('/rhyme/matches/:id/leave', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await matches.leave((req.params as { id: string }).id, req.user!.id);
    if (!res.ok) return notFound(reply);
    return { ok: true };
  });

  /** The host takes a player out of the lobby, by seat. */
  app.post('/rhyme/matches/:id/remove', { schema: { params: idParam, body: removeBody }, preHandler: requireAuth }, async (req, reply) => {
    const { seat } = req.body as z.infer<typeof removeBody>;
    const res = await matches.remove((req.params as { id: string }).id, req.user!.id, seat);
    if (res.ok) return res.match;
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

  /** Submit a rhyme (scored server-side); returns the result + live scoreboard. */
  app.post(
    '/rhyme/matches/:id/submissions',
    { schema: { params: idParam, body: submitBody }, config: { rateLimit: { max: 120, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const { word } = req.body as z.infer<typeof submitBody>;
      const res = await matches.submit((req.params as { id: string }).id, req.user!.id, word);
      if (res.ok) return { match: res.match, result: res.result };
      switch (res.reason) {
        case 'not-found':
          return notFound(reply);
        case 'not-in-match':
          return reply.code(403).send({ code: 'NOT_IN_MATCH', message: 'you are not in this match' });
        case 'not-active':
          return reply.code(409).send({ code: 'NOT_ACTIVE', message: 'this match is not in play' });
      }
    },
  );

  /**
   * The caller's live match view (own words + shared scoreboard + time left).
   * Someone who may join sees the lobby first; a latecomer is told the match
   * already started (409 GAME_STARTED), not that its time is up.
   */
  app.get('/rhyme/matches/:id', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await matches.read((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.match;
    if (res.reason === 'started') {
      return reply.code(409).send({ code: 'GAME_STARTED', message: 'this match has already started' });
    }
    return notFound(reply);
  });

  /** Post-match results: placement + scores + everyone's used words + XP. */
  app.get('/rhyme/matches/:id/results', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const results = await matches.results(id, req.user!.id);
    if (results) return results;
    // members are told it is not over yet; anyone else, that it does not exist
    if (!(await matches.isMember(id, req.user!.id))) return notFound(reply);
    return reply.code(409).send({ code: 'NOT_FINISHED', message: 'results are available once the match ends' });
  });
}
