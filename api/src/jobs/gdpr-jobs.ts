import { z } from 'zod';
import type { GdprService } from '../gdpr/service.js';
import { defineJob, type JobDefinition } from './registry.js';

export const ANONYMIZE_JOB_NAME = 'anonymize-deleted-accounts';
export const ANONYMIZE_INTERVAL_MS = 12 * 3_600_000; // twice daily

export function makeAnonymizeJob(service: GdprService): JobDefinition<Record<string, never>> {
  return defineJob({
    name: ANONYMIZE_JOB_NAME,
    schema: z.object({}),
    handler: async (_payload, ctx) => {
      const anonymized = await service.anonymizeExpired();
      ctx.log.info({ anonymized }, 'grace-period anonymization finished');
    },
  });
}

export const EXPORT_JOB_NAME = 'export-user-data';

export function makeExportJob(service: GdprService): JobDefinition<{ exportId: string }> {
  return defineJob({
    name: EXPORT_JOB_NAME,
    schema: z.object({ exportId: z.uuid() }),
    handler: async (payload, ctx) => {
      await service.fulfillExport(payload.exportId);
      ctx.log.info({ exportId: payload.exportId }, 'user data export fulfilled');
    },
  });
}
