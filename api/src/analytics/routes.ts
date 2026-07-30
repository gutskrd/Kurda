import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { AnalyticsService, RawEvent } from './service.js';

const trackBody = z.object({
  events: z
    .array(
      z.object({
        eventId: z.uuid(),
        type: z.string().min(1).max(60),
        payload: z.record(z.string(), z.unknown()).default({}),
        clientTs: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** Batched behavioral-event ingest (KUR-105). */
export function registerAnalyticsRoutes(app: FastifyInstance, analytics: AnalyticsService): void {
  app.post('/events/track', { schema: { body: trackBody }, preHandler: requireAuth }, async (req) => {
    const { events } = req.body as z.infer<typeof trackBody>;
    return analytics.ingest(req.user!.id, events as RawEvent[]);
  });
}
