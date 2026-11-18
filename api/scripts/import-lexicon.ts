/**
 * Validates and imports lexicon data, de-duplicating by normalized headword and part of speech.
 *
 *   tsx scripts/import-lexicon.ts <file.json> [--dry-run]
 *
 * --dry-run writes nothing and prints the conflict report: the same headword and part of speech with a different
 * definition goes to manual review, never merged silently.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
        `${res.duplicatesSkipped} duplicate(s) skipped, ${res.definitionsFilled} definition(s) filled in, ${res.conflicts.length} conflict(s)` +
        (res.dryRun ? ' (dry run — nothing written)' : ''),
    );
        // Summarised, with the full list written to a file: the normalized headword folds diacritics, so about 7% of a
        // real lexicon arrives as conflicts, far too many lines for a terminal.
    if (res.conflicts.length > 0) {
      const SHOWN = 10;
      console.log(`\n${res.conflicts.length} conflict(s) — flagged for review, NOT merged:`);
      for (const c of res.conflicts.slice(0, SHOWN)) {
        console.log(`  ${c.headword} [${c.pos}]: existing "${c.existingDefinition}" ≠ incoming "${c.incomingDefinition}"`);
      }
      if (res.conflicts.length > SHOWN) {
        const report = resolve(`${file}.conflicts.json`);
        writeFileSync(report, JSON.stringify(res.conflicts, null, 2));
        console.log(`  … and ${res.conflicts.length - SHOWN} more — all of them written to ${report}`);
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
