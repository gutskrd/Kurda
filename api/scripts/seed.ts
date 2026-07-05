/**
 * Runs every .sql file in api/seeds/ in lexicographic order against
 * DATABASE_URL. Seeds must be idempotent (INSERT ... ON CONFLICT DO
 * NOTHING or equivalent) — this runner executes all of them on every
 * invocation.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is not set — nothing to seed against.');
    process.exit(1);
  }

  const seedsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
  const files = readdirSync(seedsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No seed files found in api/seeds — done.');
    return;
  }

  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(join(seedsDir, file), 'utf8');
      console.log(`Seeding ${file}...`);
      await client.query(sql);
    }
    console.log(`Seeded ${files.length} file(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
