/**
 * The Stories' riddles and proverbs for learners. Riddles are open to everyone; the auth hook sets `req.user` when a
 * bearer is sent, and only then is anything kept or paid.
 *
 *   GET  /riddles?dialect=kmr|ckb          { riddles, daily, solved, total }, with no hints, answers or explanations
 *   GET  /riddles/daily?dialect=           { slug } of the viewer's daily riddle
 *   GET  /riddles/:slug                    { riddle }: its card and the hints this learner has taken
 *   POST /riddles/:slug/hint               { index }: one hint (kept in order for a signed-in learner)
 *   POST /riddles/:slug/guess              { guess, locale? }: { correct: false, near? } or { correct: true, answer, xp }
 *   POST /riddles/:slug/reveal             { answer } (a signed-in learner's riddle is revealed from now on)
 *   GET  /proverbs?dialect=&theme=         { proverbs, themes, today }
 *   GET  /proverbs/:slug                   { proverb }
 *
 * The proverb round is a solo round, so it needs an account (a guest's counts):
 *   POST /proverbs/rounds                  { dialect, mode: 'meaning' | 'situation' | 'complete' }: five items, no answers (20 a minute)
 *   GET  /proverbs/rounds/open?dialect=&mode=   { id } of the unfinished round of that mode, or null
 *   GET  /proverbs/rounds/:id              the round as it stands
 *   POST /proverbs/rounds/:id/answers      { index, answer: { choice }, attempt? }: one try
 *   POST /proverbs/rounds/:id/finish       close and count it (no XP)
 * Its id is a solo round's, so the games' session routes answer for it too.
 *
 * Hints, guesses and reveals are capped at thirty a minute per learner (or address when signed out), so a looping
 * client cannot try the dictionary against a riddle.
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
  isAppLocale,
  type AppLocale,
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
// the interface language, so a guess that is the answer in it can be told to say it in Kurdish
const guessBody = z.object({ guess: z.string().trim().min(1).max(LORE_LIMITS.answer * 2), locale: z.string().max(8).optional() });
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

/** Proverbs have no difficulty, but the solo round table requires one, so rounds are filed under the middle one. */
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
    riddles.guess(
      (req.params as z.infer<typeof slugParam>).slug,
      (req.body as z.infer<typeof guessBody>).guess,
      viewer(req),
      isAppLocale((req.body as z.infer<typeof guessBody>).locale) ? ((req.body as z.infer<typeof guessBody>).locale as AppLocale) : null,
    ),
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
