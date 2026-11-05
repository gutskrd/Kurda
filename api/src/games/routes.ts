/**
 * The learning games' routes: playing them, and writing their content.
 *
 * For learners (any signed-in learner, a guest included: these are learning,
 * as lessons and practice are):
 *   GET  /games/availability?dialect=kmr|ckb          which games have enough approved content, per level (no account needed)
 *   GET  /games/build-sentence/ladder?dialect=         the ladder, how far this learner has climbed, a round to come back to
 *   GET  /games/solo/open?game=&dialect=               the round of a game left unfinished, if any
 *   POST /games/solo/sessions                          { game, dialect, difficulty }: a new round, without its answers
 *   GET  /games/solo/sessions/:id                      a round as it stands
 *   POST /games/solo/sessions/:id/answers              { index, answer, attempt? }: one try, checked here
 *   POST /games/solo/sessions/:id/finish               pay it once and say how it went
 *   POST /games/who-am-i/sessions/:id/ask              { index, question }: Who Am I?'s answer from the identity's facts
 *
 * For the people who edit lessons and stories (content.edit), and who publish
 * them (content.publish), behind the admin 2FA gate like every staff route:
 *   GET    /admin/game-content?game&kind&dialect&level&status&review&source&q&limit&offset
 *   GET    /admin/game-content/readiness                each game's approved content per variety, and every row's state
 *   GET    /admin/game-content/:id
 *   POST   /admin/game-content                          { kind, dialect, level, payload }: a new draft
 *   PUT    /admin/game-content/:id                      { level, payload, lockVersion }
 *   POST   /admin/game-content/:id/submit               { lockVersion }
 *   POST   /admin/game-content/:id/(publish|unpublish|archive)  { lockVersion }   (content.publish)
 *   POST   /admin/game-content/:id/review               { approved, note?, lockVersion }   (content.publish)
 *   DELETE /admin/game-content/:id?lockVersion=
 *   POST   /admin/game-content/import                   { from: 'lessons' | 'stories', dialect, limit? }: drafts from approved content
 *   GET    /admin/game-content/words?dialect&q&from      approved words to make a card of (word-cards.ts)
 *   POST   /admin/game-content/from-word                { kind, dialect, ref, level, … }: a Bluff card or an identity as a draft, its Kurdish copied
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  GAME_CONTENT_KINDS,
  GAME_CONTENT_REVIEW,
  GAME_CONTENT_REVIEW_NOTE_MAX,
  GAME_CONTENT_SOURCES,
  GAME_CONTENT_STATUSES,
  GAME_DIALECTS,
  GAME_DIFFICULTIES,
  LEARN_GAME_IDS,
  SOLO_MAX_ATTEMPTS,
  SOLO_ROUND_ITEMS,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireCapability } from '../admin/routes.js';
import { pageQuery } from '../http/query.js';
import { XpService } from '../xp/service.js';
import { StreakService } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { TrustedSources } from './sources.js';
import { BuildSentenceGame } from './build-sentence.js';
import { GameAvailabilityService } from './availability.js';
import { SoloService } from './solo.js';
import { GameContentAdminService } from './content-admin.js';
import { WhoAmIGame, registerWhoAmIRoutes } from './who-am-i.js';
import { registerGameWordRoutes } from './word-cards.js';

const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);
const dialectQuery = z.object({ dialect: z.enum(GAME_DIALECTS) });
const openQuery = z.object({ game: z.enum(LEARN_GAME_IDS), dialect: z.enum(GAME_DIALECTS) });
const idParam = z.object({ id: z.uuid() });
const createBody = z.object({ game: z.enum(LEARN_GAME_IDS), dialect: z.enum(GAME_DIALECTS), difficulty: z.enum(GAME_DIFFICULTIES) });
const answerBody = z.object({
  index: z.number().int().min(0).max(SOLO_ROUND_ITEMS * 4),
  answer: z.unknown(),
  attempt: z.number().int().min(1).max(SOLO_MAX_ATTEMPTS).optional(),
});

const listQuery = z.object({
  game: z.preprocess(absentIfEmpty, z.enum(LEARN_GAME_IDS).optional()),
  kind: z.preprocess(absentIfEmpty, z.enum(GAME_CONTENT_KINDS).optional()),
  dialect: z.preprocess(absentIfEmpty, z.enum(GAME_DIALECTS).optional()),
  level: z.preprocess(absentIfEmpty, z.coerce.number().int().min(1).max(5).optional()),
  status: z.preprocess(absentIfEmpty, z.enum(GAME_CONTENT_STATUSES).optional()),
  review: z.preprocess(absentIfEmpty, z.enum(GAME_CONTENT_REVIEW).optional()),
  source: z.preprocess(absentIfEmpty, z.enum(GAME_CONTENT_SOURCES).optional()),
  q: z.preprocess(absentIfEmpty, z.string().max(80).optional()),
  ...pageQuery,
});
const lockBody = z.object({ lockVersion: z.number().int().min(0) });
const createContentBody = z.object({
  kind: z.enum(GAME_CONTENT_KINDS),
  dialect: z.enum(GAME_DIALECTS),
  level: z.number().int().min(1).max(5),
  payload: z.unknown(),
});
const updateContentBody = lockBody.extend({ level: z.number().int().min(1).max(5), payload: z.unknown() });
const reviewBody = lockBody.extend({ approved: z.boolean(), note: z.string().max(GAME_CONTENT_REVIEW_NOTE_MAX).nullish() });
const deleteQuery = z.object({ lockVersion: z.coerce.number().int().min(0) });
const importBody = z.object({ from: z.enum(['lessons', 'stories']), dialect: z.enum(GAME_DIALECTS), limit: z.number().int().min(1).max(2000).optional() });

function context(req: FastifyRequest): { adminId: string; requestId: string } {
  return { adminId: req.user!.id, requestId: req.id };
}

export interface LearnGameDeps {
  xp: XpService;
  milestones?: MilestoneRecorder;
}

/** Everything the learning games need, made once, for the routes and for the tests. */
export function learnGameServices(app: FastifyInstance, deps: LearnGameDeps) {
  const cache = app.hasDecorator('cache') ? app.cache : null;
  const sources = new TrustedSources(app.db, cache);
  const sentences = new BuildSentenceGame(sources);
  const availability = new GameAvailabilityService(app.db, sources, sentences, cache);
  const solo = new SoloService(app.db, {
    xp: deps.xp,
    streaks: new StreakService(app.db),
    goals: new DailyGoalService(app.db),
    milestones: deps.milestones,
    log: app.log,
  });
  solo.register(sentences);
  const whoAmI = new WhoAmIGame(sources);
  solo.register(whoAmI);
  const content = new GameContentAdminService(app.db, sources, availability, cache);
  return { sources, sentences, availability, solo, content, whoAmI };
}

export function registerLearnGameRoutes(app: FastifyInstance, deps: LearnGameDeps): ReturnType<typeof learnGameServices> {
  const services = learnGameServices(app, deps);
  const { sentences, availability, solo, content, whoAmI } = services;
  // Who Am I?'s questions, asked about an identity of a round; and the admin's cards made from approved words
  registerWhoAmIRoutes(app, whoAmI);
  registerGameWordRoutes(app, services.sources, content);

  // housekeeping: every 6 hours, and once 5 minutes after boot, like the other sweeps
  const sweep = () =>
    void solo
      .housekeeping()
      .then((stats) => app.log.info({ ...stats }, 'learning games sweep'))
      .catch((err) => app.log.warn({ err }, 'learning games sweep failed'));
  const firstSweep = setTimeout(sweep, 5 * 60 * 1000);
  const sweeps = setInterval(sweep, 6 * 60 * 60 * 1000);
  firstSweep.unref?.();
  sweeps.unref?.();
  app.addHook('onClose', async () => {
    clearTimeout(firstSweep);
    clearInterval(sweeps);
  });

  app.get('/games/availability', { schema: { querystring: dialectQuery } }, async (req) =>
    availability.forDialect((req.query as z.infer<typeof dialectQuery>).dialect),
  );

  app.get('/games/build-sentence/ladder', { schema: { querystring: dialectQuery }, preHandler: requireAuth }, async (req) => {
    const { dialect } = req.query as z.infer<typeof dialectQuery>;
    const [ladder, open] = await Promise.all([sentences.ladder(app.db, req.user!.id, dialect), solo.open(req.user!.id, 'build-sentence', dialect)]);
    return { ...ladder, open };
  });

  app.get('/games/solo/open', { schema: { querystring: openQuery }, preHandler: requireAuth }, async (req) => {
    const q = req.query as z.infer<typeof openQuery>;
    return { id: await solo.open(req.user!.id, q.game, q.dialect) };
  });

  app.post('/games/solo/sessions', { schema: { body: createBody }, preHandler: requireAuth }, async (req, reply) => {
    const b = req.body as z.infer<typeof createBody>;
    return reply.code(201).send(await solo.create(req.user!.id, b.game, b.dialect, b.difficulty));
  });

  app.get('/games/solo/sessions/:id', { schema: { params: idParam }, preHandler: requireAuth }, async (req) =>
    solo.view((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  app.post('/games/solo/sessions/:id/answers', { schema: { params: idParam, body: answerBody }, preHandler: requireAuth }, async (req) => {
    const b = req.body as z.infer<typeof answerBody>;
    return solo.answer((req.params as z.infer<typeof idParam>).id, req.user!.id, b.index, b.answer, b.attempt);
  });

  app.post(
    '/games/solo/sessions/:id/finish',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => solo.finish((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  const canEdit = [requireAuth, requireCapability('content.edit')];
  const canPublish = [requireAuth, requireCapability('content.publish')];

  app.get('/admin/game-content', { schema: { querystring: listQuery }, preHandler: canEdit }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return content.list(q);
  });

  app.get('/admin/game-content/readiness', { preHandler: canEdit }, async () => content.readiness());

  app.get('/admin/game-content/:id', { schema: { params: idParam }, preHandler: canEdit }, async (req, reply) => {
    const row = await content.get((req.params as z.infer<typeof idParam>).id);
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such content' });
    return row;
  });

  app.post('/admin/game-content', { schema: { body: createContentBody }, preHandler: canEdit }, async (req, reply) => {
    const b = req.body as z.infer<typeof createContentBody>;
    return reply.code(201).send(await content.create({ kind: b.kind, dialect: b.dialect, level: b.level, payload: b.payload }, context(req)));
  });

  app.put('/admin/game-content/:id', { schema: { params: idParam, body: updateContentBody }, preHandler: canEdit }, async (req) => {
    const b = req.body as z.infer<typeof updateContentBody>;
    return content.update((req.params as z.infer<typeof idParam>).id, { level: b.level, payload: b.payload, lockVersion: b.lockVersion }, context(req));
  });

  app.post('/admin/game-content/:id/submit', { schema: { params: idParam, body: lockBody }, preHandler: canEdit }, async (req) => {
    const { lockVersion } = req.body as z.infer<typeof lockBody>;
    return content.transition((req.params as z.infer<typeof idParam>).id, 'submit', { ...context(req), lockVersion });
  });

  for (const action of ['publish', 'unpublish', 'archive'] as const) {
    app.post(`/admin/game-content/:id/${action}`, { schema: { params: idParam, body: lockBody }, preHandler: canPublish }, async (req) => {
      const { lockVersion } = req.body as z.infer<typeof lockBody>;
      return content.transition((req.params as z.infer<typeof idParam>).id, action, { ...context(req), lockVersion });
    });
  }

  app.post('/admin/game-content/:id/review', { schema: { params: idParam, body: reviewBody }, preHandler: canPublish }, async (req) => {
    const b = req.body as z.infer<typeof reviewBody>;
    return content.review((req.params as z.infer<typeof idParam>).id, { approved: b.approved, note: b.note ?? null }, { ...context(req), lockVersion: b.lockVersion });
  });

  app.delete('/admin/game-content/:id', { schema: { params: idParam, querystring: deleteQuery }, preHandler: canEdit }, async (req) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const { lockVersion } = req.query as z.infer<typeof deleteQuery>;
    await content.delete(id, { ...context(req), lockVersion });
    return { id, deleted: true };
  });

  app.post('/admin/game-content/import', { schema: { body: importBody }, preHandler: canEdit }, async (req) => {
    const b = req.body as z.infer<typeof importBody>;
    return b.from === 'lessons'
      ? content.importLessonSentences(b.dialect, context(req), b.limit)
      : content.importStoryPassages(b.dialect, context(req), b.limit);
  });

  return services;
}
