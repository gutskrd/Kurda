import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { XpService } from '../xp/service.js';
import { RaceService, RaceTextService } from './race-service.js';

/**
 * Typing race: a solo time trial over an admin-curated text.
 *
 * Speed is server-authoritative. The start endpoint records when it handed the
 * text over and the finish endpoint measures against that, so a client cannot
 * report its own time — the leaderboard would be worthless if it could.
 */

const startBody = z.object({
  /** 1 short, 3 long; omitted means any */
  difficulty: z.coerce.number().int().min(1).max(3).optional(),
});

const finishBody = z.object({
  /** what the racer typed; capped well above the longest allowed text */
  typed: z.string().max(4000),
});

const textBody = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(20).max(2000),
  language: z.string().min(2).max(8).default('kmr'),
  difficulty: z.number().int().min(1).max(3),
  active: z.boolean().default(true),
});

export function registerRaceRoutes(app: FastifyInstance, deps: { xp?: XpService } = {}): void {
  const race = new RaceService(app.db, deps);
  const texts = new RaceTextService(app.db);
  const canEdit = [requireAuth, requireRoles('admin', 'superadmin', 'content_editor')];

  /** Start a race; 503 when an admin has not added any texts yet. */
  app.post('/race', { schema: { body: startBody }, preHandler: requireAuth }, async (req, reply) => {
    const { difficulty } = req.body as z.infer<typeof startBody>;
    const game = await race.start(req.user!.id, difficulty);
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

  /** Your best runs. */
  app.get('/race/best', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    races: await race.best(req.user!.id),
  }));

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
