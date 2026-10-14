import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCENT_MODES, DEFAULT_ACCENT_MODE, TYPING_DIALECTS, type RaceLength } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { XpService } from '../xp/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { RaceService, RaceTextService } from './race-service.js';

/**
 * Typing race: a solo time trial over an admin-curated text.
 *
 * Speed is server-authoritative. The start endpoint records when it handed the
 * text over and the finish endpoint measures against that, so a client cannot
 * report its own time — the leaderboard would be worthless if it could.
 *
 * The shapes are @kurda/shared `RaceStartRequest`, `RaceGameView`,
 * `RaceResultView` and `RaceBestView`.
 */

const raceLength = z.coerce.number().int().min(1).max(3);

const startBody = z.object({
  /** 1 short, 3 long; omitted means any */
  length: raceLength.optional(),
  /** the name this had before it was `length`, still sent by older apps */
  difficulty: raceLength.optional(),
  /** the variety of the text; Kurmancî for apps that do not say */
  dialect: z.enum(TYPING_DIALECTS).default('kurmanci'),
  /** what counts as typed right, stored with the race (personal bests are per mode) */
  accentMode: z.enum(ACCENT_MODES).default(DEFAULT_ACCENT_MODE),
});

const bestQuery = z.object({
  accentMode: z.enum(ACCENT_MODES).optional(),
  dialect: z.enum(TYPING_DIALECTS).optional(),
});

const finishBody = z.object({
  /** what the racer typed; capped well above the longest allowed text */
  typed: z.string().max(4000),
});

/**
 * A text as the admin sends it. It is saved normalised (race-service
 * `normalizeText`) and answered with `untypeable`: the characters nobody could
 * type, for the screen to warn about. The length is checked again after
 * normalising, which can shorten a text.
 */
const textBody = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(20).max(2000),
  language: z.enum(['kmr', 'ckb']).default('kmr'),
  difficulty: z.number().int().min(1).max(3),
  active: z.boolean().default(true),
});

export function registerRaceRoutes(
  app: FastifyInstance,
  deps: { xp?: XpService; milestones?: Pick<MilestoneRecorder, 'recordSoloGame'> } = {},
): void {
  const race = new RaceService(app.db, deps);
  const texts = new RaceTextService(app.db);
  const canEdit = [requireAuth, requireRoles('admin', 'superadmin', 'content_editor')];

  /** Start a race; 503 when an admin has not added a text in that variety (and length) yet. */
  app.post('/race', { schema: { body: startBody }, preHandler: requireAuth }, async (req, reply) => {
    const { length, difficulty, dialect, accentMode } = req.body as z.infer<typeof startBody>;
    const game = await race.start(req.user!.id, {
      length: (length ?? difficulty) as RaceLength | undefined,
      dialect,
      accentMode,
    });
    if (!game) {
      return reply.code(503).send({ code: 'EMPTY_RACE_POOL', message: 'no race texts available yet' });
    }
    return game;
  });

  /** Finish a race and be scored. Rate limited: it writes and awards XP. */
  app.post(
    '/race/:id/finish',
    {
      schema: { params: z.object({ id: z.uuid() }), body: finishBody },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { typed } = req.body as z.infer<typeof finishBody>;
      const res = await race.finish(req.user!.id, id, typed);
      if (res.ok) return res.result;
      return res.reason === 'not-found'
        ? reply.code(404).send({ code: 'NOT_FOUND', message: 'no such race' })
        : reply.code(409).send({ code: 'ALREADY_FINISHED', message: 'that race is already over' });
    },
  );

  /** Your best runs and your personal best, each accent mode on its own (optionally one mode or variety). */
  app.get('/race/best', { schema: { querystring: bestQuery }, preHandler: requireAuth }, async (req) =>
    race.best(req.user!.id, req.query as z.infer<typeof bestQuery>),
  );

  // ---- admin: the texts a race draws from --------------------------------

  app.get('/admin/race/texts', { config: { skipValidation: true }, preHandler: canEdit }, async () => ({
    texts: await texts.list(),
  }));

  app.post('/admin/race/texts', { schema: { body: textBody }, preHandler: canEdit }, async (req, reply) =>
    reply.code(201).send(await texts.create(req.body as z.infer<typeof textBody>)),
  );

  app.put(
    '/admin/race/texts/:id',
    { schema: { params: z.object({ id: z.uuid() }), body: textBody }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      const updated = await texts.update(id, req.body as z.infer<typeof textBody>);
      if (!updated) throw new AppError('NOT_FOUND', 404, 'no such text');
      return updated;
    },
  );

  app.delete(
    '/admin/race/texts/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: canEdit },
    async (req) => {
      const { id } = req.params as { id: string };
      if (!(await texts.remove(id))) throw new AppError('NOT_FOUND', 404, 'no such text');
      return { ok: true };
    },
  );
}
