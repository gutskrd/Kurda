import type pg from 'pg';
import { GdprService } from '../gdpr/service.js';
import { MediaService } from '../media/service.js';
import type { MediaStorage } from '../media/storage.js';
import { CLEANUP_INTERVAL_MS, makeCleanupOrphansJob } from './cleanup-orphans.js';
import { ANONYMIZE_INTERVAL_MS, makeAnonymizeJob } from './gdpr-jobs.js';
import { PURGE_GUESTS_INTERVAL_MS, makePurgeGuestsJob } from './guest-jobs.js';
import { WALLET_RECONCILE_INTERVAL_MS, makeWalletReconcileJob } from './wallet-jobs.js';
import { WalletReconciler } from '../wallet/reconcile.js';
import { DashboardService } from '../analytics/dashboard-service.js';
import { EconomyService } from '../economy/service.js';
import { ROLLUP_INTERVAL_MS, ROLLUP_WINDOW_DAYS, makeAnalyticsRollupJob, makeEconomyRollupJob } from './rollup-jobs.js';
import type { JobQueue } from './queue.js';

/**
 * The recurring housekeeping every deployment needs: closing accounts whose deletion grace period is over, closing
 * idle guest accounts, releasing uploads nothing claimed, a daily check that every balance equals its ledger, and the
 * dashboards' rollups. Only names and payloads are scheduled here; whichever process consumes the queue runs them
 * (jobs/worker.ts). Both the API and the worker call this, and stable schedule ids keep one schedule each.
 */
export async function scheduleMaintenance(queue: JobQueue, pool: pg.Pool, storage: MediaStorage | null): Promise<string[]> {
  const gdpr = new GdprService(pool, { storage });
  const anonymize = makeAnonymizeJob(gdpr);
  await queue.scheduleEvery(anonymize, ANONYMIZE_INTERVAL_MS, {});
  const purgeGuests = makePurgeGuestsJob(gdpr);
  await queue.scheduleEvery(purgeGuests, PURGE_GUESTS_INTERVAL_MS, {});
  const reconcile = makeWalletReconcileJob(new WalletReconciler(pool));
  await queue.scheduleEvery(reconcile, WALLET_RECONCILE_INTERVAL_MS, {});
  const analytics = makeAnalyticsRollupJob(new DashboardService(pool));
  await queue.scheduleEvery(analytics, ROLLUP_INTERVAL_MS, { days: ROLLUP_WINDOW_DAYS });
  const economy = makeEconomyRollupJob(new EconomyService(pool));
  await queue.scheduleEvery(economy, ROLLUP_INTERVAL_MS, { days: ROLLUP_WINDOW_DAYS });
  const scheduled = [anonymize.name, purgeGuests.name, reconcile.name, analytics.name, economy.name];
  if (storage) {
    const cleanup = makeCleanupOrphansJob(new MediaService(pool, storage));
    await queue.scheduleEvery(cleanup, CLEANUP_INTERVAL_MS, {});
    scheduled.push(cleanup.name);
  }
  return scheduled;
}
