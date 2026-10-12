/**
 * Story import CLI.
 *
 *   npm run stories:import --workspace api -- <file.json> [--dry-run] [--publish] [--starter]
 *
 * Reads a file in the import format (`{ stories: [...] }`, as in
 * api/content/stories), checks every story with the same `validateStory` the
 * admin panel uses, and imports them all or none: a new slug becomes a draft,
 * a draft whose content changed is updated, and a story in review, published
 * or archived is left alone. --dry-run reports what would happen and writes
 * nothing. --publish also publishes every story it created or that is a draft,
 * after the full check (meant for a local or test database: on the real one,
 * a person publishes from the admin panel, which is also what audits it).
 * --starter marks new stories as starter content (written by Claude, waiting
 * for a native speaker), as the API's own seeding does.
 *
 * The API caches the published list for five minutes, so a story published
 * here appears in the app within five minutes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { importStories } from '../src/stories/import.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const publish = args.includes('--publish');
  const starter = args.includes('--starter');

  if (!file) {
    console.error('usage: tsx scripts/import-stories.ts <file.json> [--dry-run] [--publish] [--starter]');
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
    const result = await importStories(pool, raw, { dryRun, publish, source: starter ? 'starter' : 'admin' });

    if (!result.ok) {
      console.error(`✗ ${result.issues.length} problem(s), nothing imported:`);
      for (const issue of result.issues) console.error(`  ${issue.path}: ${issue.message}`);
      process.exit(1);
    }

    for (const warning of result.warnings) console.warn(`! ${warning.path}: ${warning.message}`);
    for (const s of result.stories) {
      console.log(`  ${s.slug}: ${s.outcome}${s.note ? ` (${s.note})` : ''}${s.published ? ', published' : ''}`);
    }
    const count = (o: string) => result.stories.filter((s) => s.outcome === o).length;
    console.log(
      `✓ ${result.dryRun ? 'would import' : 'imported'}: ${count('created')} new, ${count('updated')} updated, ` +
        `${count('unchanged')} unchanged, ${count('kept')} left as they are` +
        (result.dryRun ? ' (dry run — nothing written)' : ''),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
