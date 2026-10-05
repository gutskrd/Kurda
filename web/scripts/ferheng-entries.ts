/**
 * The published corpus, read as dictionary entries.
 *
 * There is already a converter for this data — `toLexicon` in @kurda/shared —
 * and it is the wrong one for this job. It exists to feed the importer, so it
 * answers the database's questions: which of thirteen parts of speech is this,
 * is the gloss short enough for the column. On the way through it drops
 * `pos_title`, `sorani_equivalents` and `arabic_equivalents`, which is right
 * for a table of senses and wrong for a page someone reads.
 *
 * So this is the reader's converter. The two want genuinely different things
 * from the same rows, and the first attempt at serving both from one function
 * produced a build that read every chunk twice.
 *
 * ── what the corpus turned out to contain ────────────────────────────────
 *
 * Measured over 39,397 rows from eight chunks spread across the set:
 *
 * **55% of it is inflected forms.** `pos_title` is "Formeke navdêrê" — a form
 * of a noun — and the gloss describes the inflection: "Rewşa çemandî ya
 * pirjimar a binavkirî ya sabat." The importer maps those to plain `noun`,
 * which is the one thing a dictionary must not do: `sabatan` is not a noun, it
 * is the oblique plural of one. The source's own label says which, so the
 * source's own label is what gets printed.
 *
 * **4% of words have no meaning written.** Their only gloss is "Maneya vê
 * madeyê hê nehatiye nivîsîn. Heke hûn maneya wê bizanin, kerem bikin
 * binivîsin." — Wiktionary asking a reader to fill it in. Printing ~15,000 of
 * those as if they were definitions is not a dictionary, and it tells a search
 * engine the site is mostly empty pages. The sentences are removed, and a word
 * left with nothing is dropped.
 *
 * **1.5% of glosses hold more than one statement**, newline-separated, because
 * the extraction flattened a list into one string. Those become separate
 * senses, which is what they were.
 */

/** A row as the published JSON has it. Every field is suspect. */
export interface SourceRow {
  word?: unknown;
  pos_title?: unknown;
  glosses?: unknown;
  synonyms?: unknown;
  sorani_equivalents?: unknown;
  arabic_equivalents?: unknown;
}

export interface Sense {
  /** the part of speech as the source names it, in Kurdish: "Navdêr", "Lêker" */
  pos: string;
  definition: string;
}

export interface Entry {
  headword: string;
  senses: Sense[];
  /** words the source states this one means the same as */
  synonyms: string[];
  /** the same word in Soranî, in either script */
  sorani: string[];
  /** the same word in Arabic */
  arabic: string[];
}

/** Longer than this is extraction noise, not a headword or a definition. */
const MAX_HEADWORD = 200;
const MAX_DEFINITION = 2000;

/**
 * At most this many definitions under one part of speech.
 *
 * Not a correctness limit — a page limit. One word carrying four hundred
 * glosses would be most of a page on its own, and nobody reads past thirty.
 */
const MAX_DEFINITIONS = 30;

/** Whether a sense is a form of another word rather than a word in its own right. */
export function isInflected(pos: string): boolean {
  return pos.startsWith('Formeke ');
}

/**
 * The word an inflected form is a form of, from the source's own description.
 *
 * Half the corpus is entries like `dadana` — "Rewşa îzafeyî ya yekjimar a
 * binavkirî ya dadan." — and verb forms like "Kesê yekem yekjimar dema niha ji
 * lêkera dan derzîkirin." The base is the last word after `ya`/`a`, or what
 * follows `ji lêkera`, which holds for 98% of them. The rest return null and
 * are shown as the source wrote them.
 */
export function formOf(definition: string): string | null {
  const text = definition.trim();
  const verb = /\sji\slêkera?\s(.+?)(?:\s*\([^)]*\))?\.?$/u.exec(text);
  if (verb) return verb[1]!.trim();
  const noun = /\s(?:ya|a)\s([^\s.]+)\.?$/u.exec(text);
  return noun ? noun[1]! : null;
}

/**
 * The strings in a list field, with the ones that are not words taken out.
 *
 * 25 cross-reference values in 5,208 contain no letter at all: a lone comma, a
 * stray bracket, "(2)", "..". They are the wreckage of whatever split the
 * source's prose into a list, and printed as written they appear on the page as
 * a synonym that is a comma. Anything without a letter in it is not a word this
 * dictionary can point at.
 */
function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed.length > MAX_HEADWORD) continue;
    if (!/\p{L}/u.test(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/**
 * Wiktionary's "somebody please write this" boilerplate, taken out sentence by
 * sentence rather than gloss by gloss.
 *
 * Almost always the gloss is nothing but those two sentences and the whole
 * thing goes. But one row in 39,397 reads "Gotineke pêşiyan a kurdî. Maneya vê
 * madeyê hê nehatiye nivîsîn. …" — it does say something first, and that
 * sentence is worth keeping. Matching sentences keeps it without needing a
 * special case for it.
 */
const BOILERPLATE = /nehatiye nivîsîn|kerem bikin binivîsin/i;

/**
 * One gloss, as the statements it actually contains.
 *
 * Splits on newlines because the extraction flattened lists into them, drops
 * the boilerplate, and collapses the runs of whitespace that leaves behind.
 * Returns nothing at all when there was nothing but boilerplate.
 */
export function definitionsOf(gloss: string): string[] {
  const out: string[] = [];
  for (const line of gloss.split(/\r?\n/)) {
    const kept = line
      .split(/(?<=\.)\s+/)
      .filter((sentence) => !BOILERPLATE.test(sentence))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (kept !== '' && kept.length <= MAX_DEFINITION) out.push(kept);
  }
  return out;
}

/**
 * Rows in, entries out: one entry per headword, senses grouped by the part of
 * speech the source named, words in their own right before forms of words.
 *
 * The source lists a word once per part of speech and sometimes twice for the
 * same one — `samoayî` arrives as Navdêr, Navdêr, Rengdêr — so glosses are
 * merged into the group they belong to and repeats dropped.
 */
export function toEntries(rows: readonly SourceRow[]): Entry[] {
  interface Building {
    headword: string;
    byPos: Map<string, Set<string>>;
    synonyms: Set<string>;
    sorani: Set<string>;
    arabic: Set<string>;
  }
  const byWord = new Map<string, Building>();

  for (const row of rows) {
    const headword = typeof row.word === 'string' ? row.word.trim() : '';
    if (headword === '' || headword.length > MAX_HEADWORD) continue;

    const pos = typeof row.pos_title === 'string' ? row.pos_title.trim() : '';
    const definitions = asStrings(row.glosses).flatMap((g) => definitionsOf(g));

    const at = byWord.get(headword) ?? {
      headword,
      byPos: new Map<string, Set<string>>(),
      synonyms: new Set<string>(),
      sorani: new Set<string>(),
      arabic: new Set<string>(),
    };
    byWord.set(headword, at);

    if (definitions.length > 0) {
      // "Mane" — meaning — is what the source itself calls a sense it could not
      // label, so a row that arrives with no label at all joins them
      const label = pos === '' ? 'Mane' : pos;
      const texts = at.byPos.get(label) ?? new Set<string>();
      for (const d of definitions) {
        if (texts.size >= MAX_DEFINITIONS) break;
        texts.add(d);
      }
      at.byPos.set(label, texts);
    }

    for (const s of asStrings(row.synonyms)) at.synonyms.add(s);
    for (const s of asStrings(row.sorani_equivalents)) at.sorani.add(s);
    for (const s of asStrings(row.arabic_equivalents)) at.arabic.add(s);
  }

  const entries: Entry[] = [];
  for (const b of byWord.values()) {
    /*
     * A headword with nothing under it is not an entry. That is the 4% whose
     * only gloss was the boilerplate, plus the handful the source lists with
     * no gloss at all.
     */
    if (b.byPos.size === 0) continue;

    const order = [...b.byPos].sort(([a], [c]) => {
      // a word that is both a noun and the plural of another noun leads with
      // the noun; past that the source gives no order worth preserving
      const byKind = Number(isInflected(a)) - Number(isInflected(c));
      return byKind !== 0 ? byKind : a.localeCompare(c, 'ku');
    });
    const senses: Sense[] = [];
    for (const [pos, texts] of order) {
      for (const definition of texts) senses.push({ pos, definition });
    }

    // a word is not its own synonym, and the source says it is often enough
    b.synonyms.delete(b.headword);
    entries.push({
      headword: b.headword,
      senses,
      synonyms: [...b.synonyms],
      sorani: [...b.sorani],
      arabic: [...b.arabic],
    });
  }
  return entries;
}
