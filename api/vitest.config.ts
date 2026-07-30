import { defineConfig } from 'vitest/config';

/**
 * Integration tests (gated by DATABASE_URL) all share one Postgres + Redis, so
 * running their files in parallel lets them contaminate each other's state
 * (matchmaking queues, rate-limit keys, audit rows, analytics rollups, …).
 * Disable file-level parallelism whenever DATABASE_URL is set so the CI
 * `migrations` job runs the integration suite serially and deterministically.
 *
 * Unit-only runs (no DATABASE_URL — e.g. the CI `check` job, which skips the
 * `describe.skipIf(!DATABASE_URL)` integration suites) keep full parallelism
 * and stay fast.
 */
export default defineConfig({
  test: {
    fileParallelism: !process.env.DATABASE_URL,
    // flush Redis before each integration file to prevent cross-file key leakage
    setupFiles: process.env.REDIS_URL ? ['./vitest.setup.ts'] : [],
  },
});
