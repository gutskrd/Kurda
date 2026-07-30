import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { SeasonService } from './service.js';

/** Season history + admin settle (KUR-065). */
export function registerSeasonRoutes(app: FastifyInstance, seasons: SeasonService): void {
  /** The caller's season history for their profile. */
  app.get('/me/seasons', { preHandler: requireAuth }, async (req) => ({
    seasons: await seasons.history(req.user!.id),
  }));

  /** Admin/ops: settle the previous season now (idempotent). */
  app.post(
    '/admin/seasons/end',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ processed: await seasons.endDueSeasons() }),
  );
}
