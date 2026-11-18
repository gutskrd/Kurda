import { z } from 'zod';
import type { GdprService } from '../gdpr/service.js';
import { defineJob, type JobDefinition } from './registry.js';

/**
 * Closes guest accounts nobody has touched for two months (gdpr/service.ts `purgeIdleGuests`), and in the same run
 * ends email sign-ups never confirmed (`purgeUnconfirmedSignups`). Scheduled with the other housekeeping
 * (jobs/maintenance.ts), twice a day, working off any backlog a batch per run.
 */

export const PURGE_GUESTS_JOB_NAME = 'purge-idle-guests';
export const PURGE_GUESTS_INTERVAL_MS = 12 * 3_600_000;

export function makePurgeGuestsJob(service: GdprService): JobDefinition<Record<string, never>> {
  return defineJob({
    name: PURGE_GUESTS_JOB_NAME,
    schema: z.object({}),
    handler: async (_payload, ctx) => {
      const closed = await service.purgeIdleGuests();
      ctx.log.info({ closed }, 'idle guest purge finished');
      // And the sign-ups nobody confirmed within the week (auth/pending-signups.ts).
      const ended = await service.purgeUnconfirmedSignups();
      ctx.log.info({ ended }, 'unconfirmed sign-up purge finished');
    },
  });
}
