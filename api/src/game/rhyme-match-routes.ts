import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { RhymeMatchService } from './rhyme-match-service.js';
import type { XpService } from '../xp/service.js';

const createBody = z.object({
  dialect: z.enum(['kurmanci', 'sorani']).default('kurmanci'),
  maxPlayers: z.number().int().min(2).max(8).optional(),
  windowMs: z.number().int().min(30_000).max(180_000).optional(),
});
const submitBody = z.object({ word: z.string().min(1).max(64) });
const idParam = z.object({ id: z.uuid() });

/**
 * Rhyme multiplayer routes (KUR-299) — 1v1 / free-for-all, server-authoritative.
 * All authenticated; submit is rate-limited (#010). State/results are poll-safe;
 * the realtime scoreboard push (#049) + matchmaking (#050) layer onto these
 * endpoints. Solo training stays on the existing /rhyme routes.
 */
export function registerRhymeMatchRoutes(app: FastifyInstance, deps: { xp?: XpService } = {}): void {
  const matches = new RhymeMatchService(app.db, deps);

  /** Create a match lobby (creator auto-joins). */
  app.post('/rhyme/matches', { schema: { body: createBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth }, async (req, reply) => {
    const res = await matches.create(req.user!.id, req.body as z.infer<typeof createBody>);
    if (!res.ok) return reply.code(503).send({ code: 'EMPTY_LEXICON', message: 'no words available for play' });
    return reply.code(201).send(res.match);
  });

  /** Join an open lobby. */
  app.post('/rhyme/matches/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const res = await matches.join((req.params as { id: string }).id, req.user!.id);
    if (res.ok) return res.match;
    switch (res.reason) {
      case 'not-found':
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such match' });
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
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such match' });
      case 'forbidden':
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'only the host can start the match' });
      case 'not-lobby':
        return reply.code(409).send({ code: 'NOT_LOBBY', message: 'this match already started' });
      case 'need-two':
        return reply.code(409).send({ code: 'NEED_TWO', message: 'at least two players are needed' });
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
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such match' });
        case 'not-in-match':
          return reply.code(403).send({ code: 'NOT_IN_MATCH', message: 'you are not in this match' });
        case 'not-active':
          return reply.code(409).send({ code: 'NOT_ACTIVE', message: 'this match is not in play' });
      }
    },
  );

  /** The caller's live match view (own words + shared scoreboard + time left). */
  app.get('/rhyme/matches/:id', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const state = await matches.state((req.params as { id: string }).id, req.user!.id).catch(() => null);
    if (!state) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such match' });
    return state;
  });

  /** Post-match results: placement + scores + everyone's used words + XP. */
  app.get('/rhyme/matches/:id/results', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const results = await matches.results((req.params as { id: string }).id, req.user!.id);
    if (!results) return reply.code(409).send({ code: 'NOT_FINISHED', message: 'results are available once the match ends' });
    return results;
  });
}
