import { z } from 'zod';
import type { GdprService } from '../gdpr/service.js';
import { defineJob, type JobDefinition } from './registry.js';

/**
 * Closing the guest accounts nobody has touched for two months (auth/guest.ts,
 * gdpr/service.ts `purgeIdleGuests`). Scheduled with the other housekeeping
 * (jobs/maintenance.ts) and run by whichever process consumes the queue
 * (jobs/worker.ts). Twice a day, like the grace-period close: a guest a day
 * late is no worse off, and a backlog is worked off a batch per run.
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
    },
  });
}
