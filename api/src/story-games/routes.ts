import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  GAME_ACCESS,
  QUESTION_COUNTS,
  STORY_DIALECTS,
  STORY_GAME_MODES,
  STORY_LENGTHS,
  STORY_LEVELS,
  TEXT_DURING_OPTIONS,
  TIMER_PRESETS,
} from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import type { RoomBus } from '../realtime/bus.js';
import type { XpService } from '../xp/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import type { FriendService } from '../friends/service.js';
import { StoryGameNotifier } from './notifier.js';
import { StoryGamesService } from './service.js';

const idParam = z.object({ id: z.uuid() });
const STATUSES = ['lobby', 'reading', 'question', 'reveal', 'finished', 'cancelled'] as const;

const createBody = z.object({
  mode: z.enum(STORY_GAME_MODES),
  storyId: z.uuid().optional(),
  dialect: z.enum(STORY_DIALECTS).optional(),
  length: z.enum(STORY_LENGTHS).optional(),
  level: z.literal(STORY_LEVELS).optional(),
  questionCount: z.literal(QUESTION_COUNTS),
  timerSeconds: z.literal(TIMER_PRESETS),
  textDuring: z.enum(TEXT_DURING_OPTIONS).default('visible'),
  access: z.enum(GAME_ACCESS).default('friends'),
  skipReading: z.boolean().optional(),
  extraTime: z.boolean().optional(),
});

const joinBody = z.union([
  z.object({ code: z.string().min(1).max(40), extraTime: z.boolean().optional() }),
  z.object({ id: z.uuid(), extraTime: z.boolean().optional() }),
]);

const settingsBody = z.object({
  storyId: z.uuid().optional(),
  questionCount: z.literal(QUESTION_COUNTS).optional(),
  timerSeconds: z.literal(TIMER_PRESETS).optional(),
  textDuring: z.enum(TEXT_DURING_OPTIONS).optional(),
  access: z.enum(GAME_ACCESS).optional(),
});

const pollQuery = z.object({ v: z.coerce.number().int().min(0).max(2_147_483_647).optional() });
const answerBody = z.object({ index: z.number().int().min(0).max(9), choice: z.number().int().min(0).max(3) });
const indexBody = z.object({ index: z.number().int().min(0).max(9) });
const advanceBody = z.object({
  from: z.object({ status: z.enum(STATUSES), index: z.number().int().min(0).max(9) }),
});
const removeBody = z.object({ seat: z.number().int().min(1).max(100) });
const extraTimeBody = z.object({ on: z.boolean() });

/** The rate limits of the design: create 20/min, join 10/min, answers 60/min, the long-poll 120/min, other controls 60/min. */
const perMinute = (max: number) => ({ rateLimit: { max, windowMs: 60_000 } });

export interface StoryGameRouteDeps {
  /** the realtime room bus: wakes a game's long-polls on every instance */
  bus: RoomBus | null;
  xp: XpService;
  milestones?: Pick<MilestoneRecorder, 'recordStreak'>;
  /** blocks part a blocked pair in the lobbies they share */
  friends?: FriendService;
}

/**
 * Story games (contract §A3). Members only on every route — anyone else, and
 * a player the host removed, gets the same 404 as for a game that does not
 * exist. Creating and joining need the birth month, like everything else that
 * puts people together.
 *
 * `GET /story-games/:id?v=` is a long-poll: it answers at once when the game
 * has moved past version `v`, else when it does (or after 20 s). Every action
 * answers with the caller's new view, so a solo game never polls at all.
 *
 * Whether the setup screen offers "Open" is `GET /story-games/options`
 * (`canHostOpen`), rather than a field on the profile: it is a rule of this
 * feature, read only by its setup screen.
 */
export function registerStoryGameRoutes(app: FastifyInstance, deps: StoryGameRouteDeps): StoryGamesService {
  const notifier = new StoryGameNotifier(deps.bus, app.log);
  const games = new StoryGamesService(app.db, {
    notifier,
    xp: deps.xp,
    milestones: deps.milestones,
    log: app.log,
    publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
  });

  // a block parts the pair in the lobbies they share — after it commits
  deps.friends?.onBlocked((blocker, blocked) => games.onBlock(blocker, blocked));

  // On shutdown Fastify waits for requests in flight before it closes; a
  // waiting poll would hold that up for 20 s. They are answered first.
  app.addHook('preClose', async () => games.close());

  // housekeeping: every 6 hours, and once 5 minutes after boot, like the other sweeps
  const sweep = () =>
    void games
      .housekeeping()
      .then((stats) => app.log.info({ ...stats }, 'story game sweep'))
      .catch((err) => app.log.warn({ err }, 'story game sweep failed'));
  const firstSweep = setTimeout(sweep, 5 * 60 * 1000);
  const sweeps = setInterval(sweep, 6 * 60 * 60 * 1000);
  firstSweep.unref?.();
  app.addHook('onClose', async () => {
    clearTimeout(firstSweep);
    clearInterval(sweeps);
  });

  app.get('/story-games/options', { preHandler: requireAuth }, async (req) => games.options(req.user!.id));

  app.get('/story-games/active', { preHandler: requireAuth }, async (req) => ({ games: await games.active(req.user!.id) }));

  app.get('/story-games/history', { preHandler: requireAuth }, async (req) => ({
    progress: await games.history(req.user!.id),
  }));

  app.post(
    '/story-games',
    { schema: { body: createBody }, config: perMinute(20), preHandler: requireBirthMonth },
    async (req, reply) => {
      const view = await games.create(req.user!.id, req.body as z.infer<typeof createBody>);
      return reply.code(201).send(view);
    },
  );

  app.post(
    '/story-games/join',
    { schema: { body: joinBody }, config: perMinute(10), preHandler: requireBirthMonth },
    async (req) => {
      const body = req.body as z.infer<typeof joinBody>;
      const target = 'code' in body ? { code: body.code } : { id: body.id };
      return games.join(req.user!.id, target, { extraTime: body.extraTime });
    },
  );

  app.get(
    '/story-games/:id',
    { schema: { params: idParam, querystring: pollQuery }, config: perMinute(120), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const { v } = req.query as z.infer<typeof pollQuery>;
      // the client giving up (closed tab, aborted request) frees its slot at once
      const view = await games.poll(id, req.user!.id, v, (stop) => req.raw.once('close', stop));
      return view ?? {};
    },
  );

  app.get(
    '/story-games/:id/story',
    { schema: { params: idParam }, config: perMinute(60), preHandler: requireAuth },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const { story, frozen } = await games.story(id, req.user!.id);
      // The game's own copy never changes: the browser may keep it for the
      // game. Before there is one (the lobby) the host can still pick another
      // story at this same address, so the live one is fetched afresh each time.
      reply.header('cache-control', frozen ? 'private, max-age=3600' : 'private, no-cache');
      return story;
    },
  );

  app.patch(
    '/story-games/:id/settings',
    { schema: { params: idParam, body: settingsBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      return games.updateSettings(id, req.user!.id, req.body as z.infer<typeof settingsBody>);
    },
  );

  // a POST with nothing to send: the id in the path is all there is to check
  const bodiless = () => ({
    config: { ...perMinute(60), skipValidation: true },
    schema: { params: idParam },
    preHandler: requireAuth,
  });

  app.post('/story-games/:id/start', bodiless(), async (req) =>
    games.start((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  app.post('/story-games/:id/done-reading', bodiless(), async (req) =>
    games.doneReading((req.params as z.infer<typeof idParam>).id, req.user!.id),
  );

  app.post('/story-games/:id/leave', bodiless(), async (req) => {
    await games.leave((req.params as z.infer<typeof idParam>).id, req.user!.id);
    return { ok: true };
  });

  app.post(
    '/story-games/:id/answers',
    { schema: { params: idParam, body: answerBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      // when the answer arrived, before anything is awaited
      const receipt = Date.now();
      const { id } = req.params as z.infer<typeof idParam>;
      const { index, choice } = req.body as z.infer<typeof answerBody>;
      return games.answer(id, req.user!.id, index, choice, receipt);
    },
  );

  app.post(
    '/story-games/:id/continue',
    { schema: { params: idParam, body: indexBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      return games.continueAfter(id, req.user!.id, (req.body as z.infer<typeof indexBody>).index);
    },
  );

  app.post(
    '/story-games/:id/advance',
    { schema: { params: idParam, body: advanceBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      return games.advanceByHost(id, req.user!.id, (req.body as z.infer<typeof advanceBody>).from);
    },
  );

  app.post(
    '/story-games/:id/remove',
    { schema: { params: idParam, body: removeBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      return games.remove(id, req.user!.id, (req.body as z.infer<typeof removeBody>).seat);
    },
  );

  app.post(
    '/story-games/:id/extra-time',
    { schema: { params: idParam, body: extraTimeBody }, config: perMinute(60), preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      return games.setExtraTime(id, req.user!.id, (req.body as z.infer<typeof extraTimeBody>).on);
    },
  );

  return games;
}
