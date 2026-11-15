/**
 * The Stories' riddles and proverbs, for learners. Reading and playing a
 * riddle are open to everyone, signed in or not: the auth hook sets
 * `req.user` when a bearer is sent, and only then is anything kept or paid.
 *
 *   GET  /riddles?dialect=kmr|ckb          { riddles, daily, solved, total }: the variety's riddles, no hint, answer or explanation in it
 *   GET  /riddles/daily?dialect=           { slug }: the riddle of the viewer's day
 *   GET  /riddles/:slug                    { riddle }: its card, and the hints this learner has taken
 *   POST /riddles/:slug/hint               { index }: one hint (kept, in order, for a signed-in learner)
 *   POST /riddles/:slug/guess              { guess }: { correct: false } or { correct: true, answer, xp }
 *   POST /riddles/:slug/reveal             { answer }: the answer, asked for (a signed-in learner's riddle is revealed from now on)
 *   GET  /proverbs?dialect=&theme=         { proverbs, themes, today }
 *   GET  /proverbs/:slug                   { proverb }
 *
 * The round on the proverbs is a solo round, so it needs an account (a
 * guest's counts), as every game played alone does:
 *   POST /proverbs/rounds                  { dialect, mode: 'meaning' | 'situation' }: a round of five, without its answers (20 a minute)
 *   GET  /proverbs/rounds/open?dialect=&mode=   { id }: the round of that mode left unfinished, to come back to, or null
 *   GET  /proverbs/rounds/:id              the round as it stands
 *   POST /proverbs/rounds/:id/answers      { index, answer: { choice }, attempt? }: one try, checked here
 *   POST /proverbs/rounds/:id/finish       close it, count it, say how it went (no XP)
 * The round's id is a solo round's, so the games' own session routes answer
 * for it too.
 *
 * A hint, a guess and a reveal are capped at thirty a minute per learner (or
 * per address, signed out): riddles are thought about, and a client in a
 * loop must not be able to try the dictionary against one.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  GAME_SLUG_PATTERN,
  LORE_COUNTS,
  LORE_LIMITS,
  PROVERB_ROUND_GAMES,
  PROVERB_ROUND_ITEMS,
  PROVERB_ROUND_MODES,
  PROVERB_THEMES,
  SOLO_MAX_ATTEMPTS,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import type { SoloService } from '../games/solo.js';
import type { XpService } from '../xp/service.js';
import { RiddleService } from './riddles.js';
import { ProverbService } from './proverbs.js';

const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);
const dialectQuery = z.object({ dialect: z.enum(GAME_DIALECTS) });
const proverbQuery = z.object({ dialect: z.enum(GAME_DIALECTS), theme: z.preprocess(absentIfEmpty, z.enum(PROVERB_THEMES).optional()) });
const slugParam = z.object({ slug: z.string().regex(GAME_SLUG_PATTERN) });
const hintBody = z.object({ index: z.number().int().min(0).max(LORE_COUNTS.hints.max - 1) });
const guessBody = z.object({ guess: z.string().trim().min(1).max(LORE_LIMITS.answer * 2) });
const idParam = z.object({ id: z.uuid() });
const roundBody = z.object({ dialect: z.enum(GAME_DIALECTS), mode: z.enum(PROVERB_ROUND_MODES) });
const openQuery = roundBody;
const answerBody = z.object({
  index: z.number().int().min(0).max(PROVERB_ROUND_ITEMS - 1),
  answer: z.unknown(),
  attempt: z.number().int().min(1).max(SOLO_MAX_ATTEMPTS).optional(),
});

const TRIES = { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } };
const ROUNDS = { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } };

/**
 * The proverbs are not graded by difficulty — every round draws on all of a
 * variety's — and a solo round's table insists on one, so a proverb round is
 * filed under the middle one.
 */
const PROVERB_ROUND_DIFFICULTY = 'intermediate';

const viewer = (req: FastifyRequest): string | null => req.user?.id ?? null;

export interface LoreDeps {
  xp: XpService;
  solo: SoloService;
}

export function registerLoreRoutes(app: FastifyInstance, deps: LoreDeps): { riddles: RiddleService; proverbs: ProverbService } {
  const riddles = new RiddleService(app.db, deps.xp);
  const proverbs = new ProverbService(app.db);

  app.get('/riddles', { schema: { querystring: dialectQuery } }, async (req) => riddles.list((req.query as z.infer<typeof dialectQuery>).dialect, viewer(req)));

  app.get('/riddles/daily', { schema: { querystring: dialectQuery } }, async (req) =>
    riddles.daily((req.query as z.infer<typeof dialectQuery>).dialect, viewer(req)),
  );

  app.get('/riddles/:slug', { schema: { params: slugParam } }, async (req) => riddles.detail((req.params as z.infer<typeof slugParam>).slug, viewer(req)));

  app.post('/riddles/:slug/hint', { schema: { params: slugParam, body: hintBody }, config: TRIES }, async (req) =>
    riddles.hint((req.params as z.infer<typeof slugParam>).slug, (req.body as z.infer<typeof hintBody>).index, viewer(req)),
  );

  app.post('/riddles/:slug/guess', { schema: { params: slugParam, body: guessBody }, config: TRIES }, async (req) =>
    riddles.guess((req.params as z.infer<typeof slugParam>).slug, (req.body as z.infer<typeof guessBody>).guess, viewer(req)),
  );

  app.post('/riddles/:slug/reveal', { schema: { params: slugParam }, config: { ...TRIES, skipValidation: true } }, async (req) =>
    riddles.reveal((req.params as z.infer<typeof slugParam>).slug, viewer(req)),
  );

  app.get('/proverbs', { schema: { querystring: proverbQuery } }, async (req) => {
    const q = req.query as z.infer<typeof proverbQuery>;
    return proverbs.list(q.dialect, q.theme, viewer(req));
  });

  app.get('/proverbs/:slug', { schema: { params: slugParam } }, async (req) => proverbs.detail((req.params as z.infer<typeof slugParam>).slug));

  app.post('/proverbs/rounds', { schema: { body: roundBody }, config: ROUNDS, preHandler: requireAuth }, async (req, reply) => {
    const b = req.body as z.infer<typeof roundBody>;
    return reply.code(201).send(await deps.solo.create(req.user!.id, PROVERB_ROUND_GAMES[b.mode], b.dialect, PROVERB_ROUND_DIFFICULTY));
  });

  app.get('/proverbs/rounds/open', { schema: { querystring: openQuery }, preHandler: requireAuth }, async (req) => {
    const q = req.query as z.infer<typeof openQuery>;
    return { id: await deps.solo.open(req.user!.id, PROVERB_ROUND_GAMES[q.mode], q.dialect) };
  });

  app.get('/proverbs/rounds/:id', { schema: { params: idParam }, preHandler: requireAuth }, async (req) =>
    deps.solo.view((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  app.post('/proverbs/rounds/:id/answers', { schema: { params: idParam, body: answerBody }, preHandler: requireAuth }, async (req) => {
    const b = req.body as z.infer<typeof answerBody>;
    return deps.solo.answer((req.params as z.infer<typeof idParam>).id, req.user!.id, b.index, b.answer, b.attempt);
  });

  app.post('/proverbs/rounds/:id/finish', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req) =>
    deps.solo.finish((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  return { riddles, proverbs };
}
