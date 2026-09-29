/**
 * Import all of Wîkîferheng, one published chunk at a time.
 *
 *   tsx scripts/import-ferheng.ts [--lang ku|sor|zza] [--dry-run] [--limit N]
 *
 * The Ferheng project publishes the Kurdish Wiktionary extraction as ~105
 * letter-bucketed JSON files plus an `index.json` manifest. This walks that
 * manifest, converting and importing each file in turn.
 *
 * **One chunk at a time on purpose.** The whole Kurmancî set is 65 MB of source
 * JSON and about 447,000 entries; parsing it in one piece and holding both the
 * source and the converted form in memory is how a long import dies three
 * quarters of the way through with nothing written. Chunk-at-a-time also means
 * an interrupted run has kept everything it already did, and re-running is safe
 * — the importer skips what it has seen.
 *
 * Licence: the data is Wiktionary's, CC BY-SA 4.0 + GFDL. Attribution belongs
 * wherever the dictionary is shown — see docs/admin/dictionary-import.md.
 */
import pg from 'pg';
import { loadConfig } from '../src/config/env.js';
import { DictionaryRepository } from '../src/dictionary/repository.js';
import { importLexicon, type LexiconEntry } from '../src/dictionary/import.js';
import { toLexicon, type SourceEntry } from '../src/dictionary/ferheng.js';

const BASE = 'https://raw.githubusercontent.com/kurdish-tech/kurdish-tech.github.io/main/public/data';

/** Their directory → the dialect we store. */
const LANGS: Record<string, string> = { ku: 'kurmanji', sor: 'sorani', zza: 'zazaki' };

interface Manifest {
  total_words?: number;
  letters: Record<string, Array<{ file: string; count: number }>>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

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
  const manifest = await getJson<Manifest>(`${BASE}/${lang}/index.json`);
  const files = Object.values(manifest.letters).flat();
  const planned = files.slice(0, Number.isFinite(limit) ? limit : files.length);

  console.log(
    `${manifest.total_words?.toLocaleString() ?? '?'} words across ${files.length} files` +
      (planned.length < files.length ? ` — importing the first ${planned.length}` : '') +
      (dryRun ? ' (dry run — nothing written)' : ''),
  );

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const repo = new DictionaryRepository(pool);
  const totals = { entries: 0, senses: 0, duplicates: 0, filled: 0, conflicts: 0, invalid: 0 };
  const started = Date.now();

  try {
    for (const [i, chunk] of planned.entries()) {
      const source = await getJson<SourceEntry[]>(`${BASE}/${lang}/${chunk.file}`);
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
      console.log(
        `[${String(done).padStart(3)}/${planned.length}] ${chunk.file.padEnd(12)} ` +
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
      'Conflicts are mostly diacritics: `headword_normalized` folds them, so zabit and zabît\n' +
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
