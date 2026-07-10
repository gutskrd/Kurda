import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { TournamentService } from './service.js';
import { MAX_CAPACITY, MIN_CAPACITY } from './service.js';

const createBody = z.object({
  name: z.string().min(1).max(80),
  capacity: z.number().int().min(MIN_CAPACITY).max(MAX_CAPACITY),
  startsAt: z.coerce.date(),
  rewardZer: z.number().int().min(0).max(1_000_000).optional(),
  rewardGems: z.number().int().min(0).max(1_000_000).optional(),
});

const idParam = z.object({ id: z.uuid() });
const matchParam = z.object({ id: z.uuid(), matchId: z.uuid() });

/** Tournaments (KUR-060): admin scheduling + player registration + bracket view. */
export function registerTournamentRoutes(app: FastifyInstance, tournaments: TournamentService): void {
  /** Admin: schedule a tournament. */
  app.post(
    '/tournaments',
    { schema: { body: createBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const body = req.body as z.infer<typeof createBody>;
      return tournaments.create(req.user!.id, body);
    },
  );

  /** Anyone signed in: browse tournaments (optionally by status). */
  app.get(
    '/tournaments',
    {
      schema: { querystring: z.object({ status: z.string().max(20).optional() }) },
      preHandler: requireAuth,
    },
    async (req) => ({ tournaments: await tournaments.list((req.query as { status?: string }).status) }),
  );

  /** Live bracket view. */
  app.get(
    '/tournaments/:id',
    { schema: { params: idParam }, preHandler: requireAuth },
    async (req) => tournaments.bracket((req.params as { id: string }).id),
  );

  /** Register the caller. */
  app.post(
    '/tournaments/:id/register',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await tournaments.register((req.params as { id: string }).id, req.user!.id);
      return { registered: true };
    },
  );

  /** Admin: seed + generate the bracket (fewer than two entrants → cancelled). */
  app.post(
    '/tournaments/:id/start',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async (req) => {
      await tournaments.start((req.params as { id: string }).id);
      return tournaments.bracket((req.params as { id: string }).id);
    },
  );

  /** Confirm presence for a ready match (guards the no-show forfeit). */
  app.post(
    '/tournaments/:id/matches/:matchId/check-in',
    { schema: { params: matchParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      const { id, matchId } = req.params as { id: string; matchId: string };
      await tournaments.checkIn(id, matchId, req.user!.id);
      return { checkedIn: true };
    },
  );

  /** Admin/system: record a match result and advance the bracket. */
  app.post(
    '/tournaments/:id/matches/:matchId/result',
    {
      schema: { params: matchParam, body: z.object({ winnerId: z.uuid() }) },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { id, matchId } = req.params as { id: string; matchId: string };
      const { winnerId } = req.body as { winnerId: string };
      return tournaments.reportResult(id, matchId, winnerId);
    },
  );
}
