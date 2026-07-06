/**
 * Worker entrypoint — runs as its own process, separate from the API:
 *   npm run worker --workspace api
 */
import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { CLEANUP_INTERVAL_MS, makeCleanupOrphansJob } from '../jobs/cleanup-orphans.js';
import { ANONYMIZE_INTERVAL_MS, makeAnonymizeJob } from '../jobs/gdpr-jobs.js';
import { GdprService } from '../gdpr/service.js';
import { JobQueue } from '../jobs/queue.js';
import { createWorker } from '../jobs/worker.js';
import { createPool } from '../db/pool.js';
import { MediaService } from '../media/service.js';
import { createStorage } from '../media/storage.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!config.REDIS_URL) {
    console.error('REDIS_URL is required to run the worker.');
    process.exit(1);
  }

  const log = pino({ level: config.LOG_LEVEL, name: 'kurda-worker' });
  const worker = createWorker(config, log);
  log.info('worker started');

  // recurring maintenance schedules (worker owns them, not the API)
  const storage = createStorage(config);
  if (config.DATABASE_URL) {
    const pool = createPool(config);
    const queue = JobQueue.create(config);
    if (storage) {
      await queue.scheduleEvery(
        makeCleanupOrphansJob(new MediaService(pool, storage)),
        CLEANUP_INTERVAL_MS,
        {},
      );
      log.info('scheduled orphan upload cleanup (every 6h)');
    }
    await queue.scheduleEvery(
      makeAnonymizeJob(new GdprService(pool, { storage })),
      ANONYMIZE_INTERVAL_MS,
      {},
    );
    log.info('scheduled GDPR anonymization (every 12h)');
  }

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down worker (finishing in-flight jobs)');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
