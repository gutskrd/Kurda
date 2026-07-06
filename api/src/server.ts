import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initSentry } from './observability/sentry.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // config is invalid — logger config itself may be unusable, so
    // write directly to stderr and exit non-zero
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
}

void main();
