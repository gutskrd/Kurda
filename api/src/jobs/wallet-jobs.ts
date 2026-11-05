import { z } from 'zod';
import type { ReconcileReport } from '../wallet/reconcile.js';
import { defineJob, type JobDefinition } from './registry.js';

/**
 * The daily check that every balance still equals its ledger
 * (wallet/reconcile.ts). Scheduled with the other housekeeping
 * (jobs/maintenance.ts) and run by whichever process consumes the queue
 * (jobs/worker.ts). It only reads and only reports: a mismatch is logged at
 * error level, with the accounts it found, for someone to look at — nothing
 * here moves money to make the two agree, because which of the two is wrong is
 * a question for a person.
 */

export const WALLET_RECONCILE_JOB_NAME = 'wallet-reconcile';
export const WALLET_RECONCILE_INTERVAL_MS = 24 * 3_600_000;

export interface Reconciler {
  check(opts?: { limit?: number }): Promise<ReconcileReport>;
}

export function makeWalletReconcileJob(reconciler: Reconciler): JobDefinition<Record<string, never>> {
  return defineJob({
    name: WALLET_RECONCILE_JOB_NAME,
    schema: z.object({}),
    handler: async (_payload, ctx) => {
      const report = await reconciler.check({ limit: 50 });
      if (report.mismatched > 0) {
        // ALERT: a balance no longer equals the sum of its ledger
        ctx.log.error(
          { checked: report.checked, mismatched: report.mismatched, mismatches: report.mismatches },
          'wallet reconciliation found balances that differ from their ledger',
        );
        return;
      }
      ctx.log.info({ checked: report.checked }, 'wallet reconciliation: every balance equals its ledger');
    },
  });
}
