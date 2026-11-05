import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { KINGDOM_BUILDINGS, KINGDOM_MAX_LEVEL } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import type { KingdomService } from './service.js';

const seenBody = z.object({
  levels: z
    .array(z.object({ building: z.enum(KINGDOM_BUILDINGS), level: z.number().int().min(1).max(KINGDOM_MAX_LEVEL) }))
    .max(KINGDOM_BUILDINGS.length * KINGDOM_MAX_LEVEL)
    .optional(),
  intro: z.boolean().optional(),
});

/**
 * The Village ("kingdom" in code) over HTTP: the learner's village (shared `KingdomView`) and
 * the celebrations they were shown. Open to a guest, whose learning builds the
 * village like anyone's; what a guest is not paid is decided in the service.
 * Nothing here takes a count or an amount from the client.
 */
export function registerKingdomRoutes(app: FastifyInstance, kingdom: KingdomService): void {
  /** Each building's level, how far to the next and where to grow it; the levels to celebrate; the first visit's line. */
  app.get(
    '/kingdom',
    { config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAuth },
    async (req) => kingdom.view(req.user!.id),
  );

  /** These celebrations (and the first visit's line) were shown: they are not shown again. */
  app.post(
    '/kingdom/seen',
    { schema: { body: seenBody }, config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAuth },
    async (req) => {
      await kingdom.markSeen(req.user!.id, req.body as z.infer<typeof seenBody>);
      return { seen: true };
    },
  );
}
