/**
 * Worker entrypoint — runs as its own process, separate from the API:
 *   npm run worker --workspace api
 */
import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { createWorker } from '../jobs/worker.js';

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

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down worker (finishing in-flight jobs)');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
