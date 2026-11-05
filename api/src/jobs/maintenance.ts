import type pg from 'pg';
import { GdprService } from '../gdpr/service.js';
import { MediaService } from '../media/service.js';
import type { MediaStorage } from '../media/storage.js';
import { CLEANUP_INTERVAL_MS, makeCleanupOrphansJob } from './cleanup-orphans.js';
import { ANONYMIZE_INTERVAL_MS, makeAnonymizeJob } from './gdpr-jobs.js';
import { PURGE_GUESTS_INTERVAL_MS, makePurgeGuestsJob } from './guest-jobs.js';
import { WALLET_RECONCILE_INTERVAL_MS, makeWalletReconcileJob } from './wallet-jobs.js';
import { WalletReconciler } from '../wallet/reconcile.js';
import type { JobQueue } from './queue.js';

/**
 * The recurring housekeeping every deployment needs: closing the accounts
 * whose deletion grace period is over (GDPR erasure), closing the guest
 * accounts nobody has touched for two months (auth/guest.ts), letting go of
 * uploads nothing claimed, and checking once a day that every balance still
 * equals its ledger (wallet/reconcile.ts). Only the definitions' names and payloads are
 * scheduled here; whichever process consumes the queue runs them
 * (jobs/worker.ts registers them all).
 *
 * The dedicated worker scheduled these, and only it did — but it is not
 * deployed, the API consumes the queue itself, and so a deletion that was
 * asked for was never carried out. Both call this now; the schedules have
 * stable ids, so two callers keep one schedule each.
 */
export async function scheduleMaintenance(queue: JobQueue, pool: pg.Pool, storage: MediaStorage | null): Promise<string[]> {
  const gdpr = new GdprService(pool, { storage });
  const anonymize = makeAnonymizeJob(gdpr);
  await queue.scheduleEvery(anonymize, ANONYMIZE_INTERVAL_MS, {});
  const purgeGuests = makePurgeGuestsJob(gdpr);
  await queue.scheduleEvery(purgeGuests, PURGE_GUESTS_INTERVAL_MS, {});
  const reconcile = makeWalletReconcileJob(new WalletReconciler(pool));
  await queue.scheduleEvery(reconcile, WALLET_RECONCILE_INTERVAL_MS, {});
  const scheduled = [anonymize.name, purgeGuests.name, reconcile.name];
  if (storage) {
    const cleanup = makeCleanupOrphansJob(new MediaService(pool, storage));
    await queue.scheduleEvery(cleanup, CLEANUP_INTERVAL_MS, {});
    scheduled.push(cleanup.name);
  }
  return scheduled;
}
