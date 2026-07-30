/**
 * Dictionary lexicon import CLI (KUR-048).
 *
 *   tsx scripts/import-lexicon.ts <file.json> [--dry-run]
 *
 * Validates and imports lexicon data, de-duplicating by normalized headword +
 * part of speech. --dry-run writes nothing and prints the conflict report
 * (same headword+POS with a different definition → manual review, never
 * silently merged).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { DictionaryRepository } from '../src/dictionary/repository.js';
import { importLexicon } from '../src/dictionary/import.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!file) {
    console.error('usage: tsx scripts/import-lexicon.ts <file.json> [--dry-run]');
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
    const repo = new DictionaryRepository(pool);
    const res = await importLexicon(repo, raw, { dryRun });

    if (res.issues.length > 0) {
      console.error(`✗ ${res.issues.length} validation error(s):`);
      for (const i of res.issues) console.error(`  entry[${i.index}]: ${i.message}`);
      process.exit(1);
    }

    const verb = res.dryRun ? 'would import' : 'imported';
    console.log(
      `✓ ${verb}: ${res.entriesCreated} new entrie(s), ${res.sensesAdded} sense(s), ` +
        `${res.duplicatesSkipped} duplicate(s) skipped, ${res.conflicts.length} conflict(s)` +
        (res.dryRun ? ' (dry run — nothing written)' : ''),
    );
    if (res.conflicts.length > 0) {
      console.log('\nConflicts (flagged for manual review — NOT merged):');
      for (const c of res.conflicts) {
        console.log(`  ${c.headword} [${c.pos}]: existing "${c.existingDefinition}" ≠ incoming "${c.incomingDefinition}"`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
