import { z } from 'zod';
import type { MediaService } from '../media/service.js';
import { defineJob, type JobDefinition } from './registry.js';

export const CLEANUP_ORPHANS_JOB_NAME = 'cleanup-orphan-uploads';
export const CLEANUP_INTERVAL_MS = 6 * 3_600_000; // every 6h

export function makeCleanupOrphansJob(service: MediaService): JobDefinition<Record<string, never>> {
  return defineJob({
    name: CLEANUP_ORPHANS_JOB_NAME,
    schema: z.object({}),
    handler: async (_payload, ctx) => {
      const cleaned = await service.cleanupOrphans();
      ctx.log.info({ cleaned }, 'orphan upload cleanup finished');
    },
  });
}
