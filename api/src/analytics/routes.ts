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
 * Batched behavioral-event ingest (KUR-105), for accounts that agreed to it.
 *
 * `analytics_consent` is off until the person turns it on (and stays off below
 * the age of digital consent, users/routes.ts), and the consent migration said
 * the pipeline must gate on it — but this stored every event it was sent
 * whatever the setting said. Without consent nothing is stored, and the answer
 * says why (`consent: false`), so an app can stop sending until it changes.
 * It is still a 200: a queue of events replayed after the setting was turned
 * off is not an error to retry, it is data to let go of.
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
