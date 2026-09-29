/**
 * Wîkîferheng (Kurdish Wiktionary) → the lexicon format `import-lexicon.ts` reads.
 *
 *   tsx scripts/convert-ferheng.ts <in.json> <out.json> [--dialect kurmanji]
 *
 * Source is one of the pre-chunked files published by the Ferheng project
 * (`public/data/ku/*.json`), each an array of:
 *
 *   { word, pos, pos_title, glosses: [...], synonyms?, arabic_equivalents?, ... }
 *
 * Two things about that data decide everything this script does.
 *
 * **The glosses are Kurdish.** This is Kurmancî explained in Kurmancî, not a
 * bilingual dictionary — so every definition goes to `definitionKu` and none to
 * `definitionEn`. Putting them in the English field would read as English in
 * both apps and be wrong in all nine languages at once. Senses with no English
 * are why `1751000113000` exists.
 *
 * **Its parts of speech are not ours.** `adj`, `name`, `proverb`, `abbrev`,
 * `character`, `unknown` — mapped below, and anything unrecognised becomes
 * `other` rather than being dropped: a headword with a vague label is still a
 * word the games should accept.
 *
 * Licence: the data is Wiktionary's, CC BY-SA 4.0 + GFDL. Attribution belongs
 * wherever the dictionary is shown — see docs/admin/dictionary-import.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SourceEntry {
  word?: unknown;
  pos?: unknown;
  glosses?: unknown;
  synonyms?: unknown;
}

/** Their label → ours. Anything missing falls through to 'other'. */
const POS: Record<string, string> = {
  noun: 'noun',
  name: 'noun', // a proper noun is still a noun to us
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  conj: 'conjunction',
  intj: 'particle',
  particle: 'particle',
  prefix: 'particle',
  suffix: 'particle',
  num: 'numeral',
  phrase: 'phrase',
  proverb: 'phrase',
};

const MAX_DEFINITION = 1000; // the importer's limit
const MAX_HEADWORD = 200;

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}

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

  /*
   * Grouped by headword + part of speech, not by headword.
   *
   * The source lists a word once per part of speech and sometimes more than
   * once for the same one. The importer reconciles by headword + POS, so two
   * senses sharing both would arrive as a conflict with themselves — the same
   * word reported against itself, thousands of times. Merging their glosses
   * here is what the entry means anyway: several readings of one word.
   */
  const byWord = new Map<string, Map<string, Set<string>>>();
  const synonyms = new Map<string, Set<string>>();
  let skipped = 0;

  for (const item of raw as SourceEntry[]) {
    const word = typeof item.word === 'string' ? item.word.trim() : '';
    const glosses = asStrings(item.glosses);
    if (!word || word.length > MAX_HEADWORD || glosses.length === 0) {
      skipped += 1;
      continue;
    }
    const pos = POS[String(item.pos ?? '').toLowerCase()] ?? 'other';

    const senses = byWord.get(word) ?? new Map<string, Set<string>>();
    const texts = senses.get(pos) ?? new Set<string>();
    for (const g of glosses) texts.add(g);
    senses.set(pos, texts);
    byWord.set(word, senses);

    const syn = asStrings(item.synonyms);
    if (syn.length > 0) {
      const set = synonyms.get(word) ?? new Set<string>();
      for (const s of syn) set.add(s);
      synonyms.set(word, set);
    }
  }

  const entries = [...byWord].map(([headword, senses]) => ({
    headword,
    dialect,
    senses: [...senses].map(([pos, texts]) => ({
      pos,
      // several readings of one word, in the order the source gave them
      definitionKu: [...texts].join('; ').slice(0, MAX_DEFINITION),
    })),
    ...(synonyms.has(headword)
      ? {
          xrefs: [...synonyms.get(headword)!]
            .filter((s) => s.length <= MAX_HEADWORD)
            .map((s) => ({ headword: s, relation: 'synonym' as const })),
        }
      : {}),
  }));

  writeFileSync(resolve(output), JSON.stringify(entries));

  const senseCount = entries.reduce((n, e) => n + e.senses.length, 0);
  console.log(
    `${entries.length} headwords, ${senseCount} senses` +
      (skipped > 0 ? `, ${skipped} source row(s) skipped (no word or no gloss)` : ''),
  );
}

main();
