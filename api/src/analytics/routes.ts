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

/**
 * Batched event ingest for accounts that agreed to analytics. Without consent nothing is stored and the answer
 * says `consent: false`, so the app can stop sending; it is still a 200, because a replayed queue is data to drop,
 * not an error to retry.
 */
export function registerAnalyticsRoutes(app: FastifyInstance, analytics: AnalyticsService): void {
  app.post('/events/track', { schema: { body: trackBody }, preHandler: requireAuth }, async (req) => {
    const { events } = req.body as z.infer<typeof trackBody>;
    if (!(await analytics.hasConsent(req.user!.id))) {
      return { accepted: 0, dropped: 0, duplicates: 0, consent: false };
    }
    return { ...(await analytics.ingest(req.user!.id, events as RawEvent[])), consent: true };
  });
}
