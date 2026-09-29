/**
 * Wîkîferheng (Kurdish Wiktionary) → the lexicon format the importer reads.
 *
 * One implementation, used by both `convert-ferheng.ts` (a file at a time, for
 * looking at the output) and `import-ferheng.ts` (the whole thing, in memory).
 *
 * Two things about that data decide everything here.
 *
 * **The glosses are Kurdish.** This is Kurmancî explained in Kurmancî, not a
 * bilingual dictionary — so every definition goes to `definitionKu` and none to
 * `definitionEn`. Putting them in the English field would read as English in
 * both apps and be wrong in all nine languages at once. Senses with no English
 * are why migration 1751000113000 exists.
 *
 * **Its parts of speech are not ours.** `adj`, `name`, `proverb`, `abbrev`,
 * `character`, `unknown` — mapped below, and anything unrecognised becomes
 * `other` rather than being dropped: a headword with a vague label is still a
 * word the games should accept.
 */

export interface SourceEntry {
  word?: unknown;
  pos?: unknown;
  glosses?: unknown;
  synonyms?: unknown;
}

export interface ConvertedEntry {
  headword: string;
  dialect: string;
  senses: Array<{ pos: string; definitionKu: string }>;
  xrefs?: Array<{ headword: string; relation: 'synonym' }>;
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

/**
 * Group by headword **and** part of speech.
 *
 * The source lists a word once per part of speech and sometimes more than once
 * for the same one — 53 such pairs in a single chunk of 9,767. The importer
 * reconciles by headword + POS, so two senses sharing both would arrive as a
 * conflict of a word with itself. Merging their glosses here is what the entry
 * means anyway: several readings of one word.
 */
export function toLexicon(rows: readonly SourceEntry[], dialect = 'kurmanji'): ConvertedEntry[] {
  const byWord = new Map<string, Map<string, Set<string>>>();
  const synonyms = new Map<string, Set<string>>();

  for (const item of rows) {
    const word = typeof item.word === 'string' ? item.word.trim() : '';
    const glosses = asStrings(item.glosses);
    if (!word || word.length > MAX_HEADWORD || glosses.length === 0) continue;

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

  return [...byWord].map(([headword, senses]) => {
    const xrefs = [...(synonyms.get(headword) ?? [])]
      .filter((s) => s.length <= MAX_HEADWORD)
      .map((s) => ({ headword: s, relation: 'synonym' as const }));
    return {
      headword,
      dialect,
      senses: [...senses].map(([pos, texts]) => ({
        pos,
        // several readings of one word, in the order the source gave them
        definitionKu: [...texts].join('; ').slice(0, MAX_DEFINITION),
      })),
      ...(xrefs.length > 0 ? { xrefs } : {}),
    };
  });
}
