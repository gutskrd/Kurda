/**
 * Content import CLI (KUR-041).
 *
 *   tsx scripts/import-content.ts <file.json> [--dry-run] [--publish]
 *
 * Validates a course-content JSON document (structure + every exercise
 * payload) and imports it. --dry-run writes nothing and reports every
 * validation error with its path. --publish marks each imported lesson
 * version published (so a seed loads as playable). Re-import creates new
 * draft versions; published lessons are never mutated.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { ContentRepository } from '../src/content/repository.js';
import { importCourse } from '../src/content/import.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const publish = args.includes('--publish');

  if (!file) {
    console.error('usage: tsx scripts/import-content.ts <file.json> [--dry-run] [--publish]');
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(resolve(file), 'utf8'));

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  try {
    const repo = new ContentRepository(pool);
    const result = await importCourse(repo, raw, { dryRun, publish });

    if (result.issues.length > 0) {
      console.error(`✗ ${result.issues.length} validation error(s):`);
      for (const issue of result.issues) console.error(`  ${issue.path}: ${issue.message}`);
      process.exit(1);
    }

    const s = result.summary;
    const verb = result.dryRun ? 'would import' : 'imported';
    console.log(
      `✓ ${verb}: ${s.units} unit(s), ${s.skills} skill(s), ${s.lessons} lesson(s), ${s.exercises} exercise(s)` +
        (result.dryRun ? ' (dry run — nothing written)' : publish ? ' (published)' : ' (draft)'),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
