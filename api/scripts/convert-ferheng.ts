/**
 * One Wîkîferheng chunk → a lexicon file, for looking at before importing it.
 *
 *   tsx scripts/convert-ferheng.ts <in.json> <out.json> [--dialect kurmanji]
 *
 * The conversion itself lives in `ferheng.ts`; this is the file-at-a-time way
 * in, so the output can be read and a dry-run import tried against it.
 * `import-ferheng.ts` does the whole set without writing intermediate files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toLexicon, type SourceEntry } from '../src/dictionary/ferheng.js';

function main(): void {
  const args = process.argv.slice(2);
  const [input, output] = args.filter((a) => !a.startsWith('--'));
  const dialectFlag = args.indexOf('--dialect');
  const dialect = dialectFlag === -1 ? 'kurmanji' : (args[dialectFlag + 1] ?? 'kurmanji');

  if (!input || !output) {
    console.error('usage: tsx scripts/convert-ferheng.ts <in.json> <out.json> [--dialect kurmanji]');
    process.exit(2);
  }

  const raw = JSON.parse(readFileSync(resolve(input), 'utf8')) as unknown;
  if (!Array.isArray(raw)) {
    console.error('expected an array of entries');
    process.exit(1);
  }

  const entries = toLexicon(raw as SourceEntry[], dialect);
  writeFileSync(resolve(output), JSON.stringify(entries));

  const senses = entries.reduce((n, e) => n + e.senses.length, 0);
  const skipped = (raw as unknown[]).length - entries.reduce((n, e) => n + e.senses.length, 0);
  console.log(
    `${entries.length} headwords, ${senses} senses` +
      (skipped > 0 ? ` (${(raw as unknown[]).length} source rows in)` : ''),
  );
}

main();
