/**
 * Imports all of Wîkîferheng, one published chunk at a time, by walking its `index.json` manifest of about 105
 * letter files.
 *
 *   tsx scripts/import-ferheng.ts [--lang ku|sor|zza] [--dry-run] [--from N] [--limit N]
 *
 * One chunk at a time on purpose: the Kurmancî set is 65 MB and about 447,000 entries, and holding it all in memory
 * kills a long import with nothing written. An interrupted run keeps what it did, a re-run skips what it has seen,
 * and `--from N` resumes at the file the progress line last printed.
 *
 * Licence: the data is Wiktionary's, CC BY-SA 4.0 and GFDL; attribution belongs wherever the dictionary is shown
 * (docs/admin/dictionary-import.md).
 */
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { DictionaryRepository } from '../src/dictionary/repository.js';
import { importLexicon, type LexiconEntry } from '../src/dictionary/import.js';
import { plan, toLexicon, FERHENG_LANGS as LANGS, publishedFerheng } from '@kurda/shared';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  const lang = flag('lang') ?? 'ku';
  const dialect = LANGS[lang];
  const dryRun = args.includes('--dry-run');
  const limit = Number(flag('limit') ?? Number.POSITIVE_INFINITY);
  const from = Number(flag('from') ?? 1);

  if (!dialect) {
    console.error(`unknown --lang ${lang}; expected one of ${Object.keys(LANGS).join(', ')}`);
    process.exit(2);
  }

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  console.log(`reading the manifest for ${lang} (${dialect})…`);
  const manifest = await publishedFerheng.manifest(lang);
  const files = manifest.files;
  const { skipped, chunks: planned } = plan(files, { from, limit });

  console.log(
    `${manifest.totalWords?.toLocaleString() ?? '?'} words across ${files.length} files` +
      (planned.length < files.length ? ` — importing ${planned.length} of them, from file ${skipped + 1}` : '') +
      (dryRun ? ' (dry run — nothing written)' : ''),
  );

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const repo = new DictionaryRepository(pool);
  const totals = { entries: 0, senses: 0, duplicates: 0, filled: 0, conflicts: 0, invalid: 0 };
  const started = Date.now();

  try {
    for (const [i, chunk] of planned.entries()) {
      const source = await publishedFerheng.chunk(lang, chunk.file);
      const entries: LexiconEntry[] = toLexicon(source, dialect) as LexiconEntry[];
      const res = await importLexicon(repo, entries, { dryRun });

      totals.entries += res.entriesCreated;
      totals.senses += res.sensesAdded;
      totals.duplicates += res.duplicatesSkipped;
      totals.filled += res.definitionsFilled;
      totals.conflicts += res.conflicts.length;
      totals.invalid += res.issues.length;

      const done = i + 1;
      const elapsed = (Date.now() - started) / 1000;
      const eta = Math.round((elapsed / done) * (planned.length - done));
            // Numbered against the whole manifest, not this run, so the printed number is the one to pass to --from.
      console.log(
        `[${String(skipped + done).padStart(3)}/${files.length}] ${chunk.file.padEnd(12)} ` +
          `+${String(res.entriesCreated).padStart(6)} entries  ` +
          `${totals.entries.toLocaleString()} total` +
          (done < planned.length ? `  ~${Math.floor(eta / 60)}m left` : ''),
      );
    }
  } finally {
    await pool.end();
  }

  const mins = Math.round((Date.now() - started) / 60000);
  console.log(
    `\n${dryRun ? 'would import' : 'imported'}: ${totals.entries.toLocaleString()} entries, ` +
      `${totals.senses.toLocaleString()} senses, ${totals.filled.toLocaleString()} definitions filled in, ` +
      `${totals.duplicates.toLocaleString()} duplicates, ${totals.conflicts.toLocaleString()} conflicts, ` +
      `${totals.invalid.toLocaleString()} invalid — in ${mins}m`,
  );
  if (totals.conflicts > 0) {
    console.log(
      'Conflicts are mostly diacritics: `headword_folded` folds them, so zabit and zabît\n' +
        'are one identity to this schema. See docs/admin/dictionary-import.md.',
    );
  }
  if (!dryRun) {
    console.log('Nothing imported is in the games — promote words in Admin → Games → Word pool.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
