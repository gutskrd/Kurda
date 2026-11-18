import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initSentry } from './observability/sentry.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // The config is invalid and the logger config may be too, so write to stderr and exit non-zero.
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  initSentry(config);
  const app = buildApp(config);
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown on SIGTERM or SIGINT: stop accepting connections, drain in-flight requests and run onClose hooks
  // (database pool, Redis, sweepers) before exiting.
  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'error during graceful shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
