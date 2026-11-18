/**
 * The Kurdish Wiktionary converted to the lexicon format the importer reads, shared by `convert-ferheng.ts` (a file at a
 * time) and `import-ferheng.ts` (everything, in memory). Its glosses are Kurmancî explained in Kurmancî, so every
 * definition goes to `definitionKu` and none to `definitionEn`, where both apps would show it as English. Its parts of
 * speech are mapped to ours, and anything unknown becomes `other` rather than being dropped: a vaguely labelled headword
 * is still a word the games should accept.
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

/** Their label to ours; anything missing becomes 'other'. */
const POS: Record<string, string> = {
  noun: 'noun',
  name: 'noun', // a proper noun is still a noun here
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

/** One published source file, as the manifest lists it. */
export interface Chunk {
  file: string;
  count: number;
}

/**
 * Which published files this run reads. The full Kurmancî set is 105 files and about an hour and a half, longer than a
 * hosting dashboard's shell reliably stays open, so `from` resumes cheaply: it is the number the progress line prints, so
 * a run that died at `[41/105]` restarts with `--from 41`. Redoing a file costs nothing, since the importer skips what it
 * has seen, while starting one late would leave an unnoticed gap.
 */
export function plan(files: readonly Chunk[], opts: { from?: number; limit?: number } = {}): {
  skipped: number;
  chunks: Chunk[];
} {
  const from = Math.max(1, Math.floor(opts.from ?? 1));
  const skipped = Math.min(from - 1, files.length);
  const rest = files.slice(skipped);
  const limit = opts.limit;
  const chunks = limit !== undefined && Number.isFinite(limit) ? rest.slice(0, Math.max(0, limit)) : [...rest];
  return { skipped, chunks };
}

const MAX_DEFINITION = 1000; // the importer's limit
const MAX_HEADWORD = 200;

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}

/**
 * Groups by headword and part of speech. The source sometimes lists a word more than once for the same part of speech,
 * which the importer (reconciling by both) would see as a word conflicting with itself, so their glosses are merged into
 * one entry: several readings of one word.
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
        // Several readings of one word, in the source's order.
        definitionKu: [...texts].join('; ').slice(0, MAX_DEFINITION),
      })),
      ...(xrefs.length > 0 ? { xrefs } : {}),
    };
  });
}
