/**
 * The published corpus read as dictionary entries. Shared `toLexicon` feeds the importer and drops `pos_title` and the
 * Soranî and Arabic equivalents, which a reader wants, so this is the reader's converter.
 *
 * Measured over 39,397 rows: 55% are inflected forms ("Formeke navdêrê"), printed with the source's own label rather
 * than as plain nouns; 4% have only a "meaning not yet written" placeholder, which is removed, dropping words left
 * empty; and 1.5% of glosses hold several newline-separated statements, which become separate senses.
 */

/** A row as the published JSON has it; every field is suspect. */
export interface SourceRow {
  word?: unknown;
  pos_title?: unknown;
  glosses?: unknown;
  synonyms?: unknown;
  sorani_equivalents?: unknown;
  arabic_equivalents?: unknown;
}

export interface Sense {
  /** The source's Kurdish part of speech: "Navdêr", "Lêker". */
  pos: string;
  definition: string;
}

export interface Entry {
  headword: string;
  senses: Sense[];
  /** Words the source states mean the same. */
  synonyms: string[];
  /** The same word in Soranî, in either script. */
  sorani: string[];
  /** The same word in Arabic. */
  arabic: string[];
}

/** Longer than this is extraction noise, not a headword or a definition. */
const MAX_HEADWORD = 200;
const MAX_DEFINITION = 2000;

/** At most this many definitions under one part of speech: a page limit, since nobody reads past thirty. */
const MAX_DEFINITIONS = 30;

/** Whether a sense is a form of another word rather than a word in its own right. */
export function isInflected(pos: string): boolean {
  return pos.startsWith('Formeke ');
}

/**
 * The word an inflected form is a form of, from the source's description: the last word after `ya`/`a`, or what follows
 * `ji lêkera`, which holds for 98%; the rest return null and are shown as written.
 */
export function formOf(definition: string): string | null {
  const text = definition.trim();
  const verb = /\sji\slêkera?\s(.+?)(?:\s*\([^)]*\))?\.?$/u.exec(text);
  if (verb) return verb[1]!.trim();
  const noun = /\s(?:ya|a)\s([^\s.]+)\.?$/u.exec(text);
  return noun ? noun[1]! : null;
}

/** A list field's strings without the ones containing no letter (a lone comma, "(2)", ".."), left over from splitting prose. */
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
 * Wiktionary's "please write this" boilerplate, removed sentence by sentence, so the rare gloss that says something first
 * keeps it.
 */
const BOILERPLATE = /nehatiye nivîsîn|kerem bikin binivîsin/i;

/** One gloss as the statements it contains: split on newlines, boilerplate dropped, whitespace collapsed; empty when it was only boilerplate. */
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
 * Rows in, entries out: one entry per headword with senses grouped by the source's part of speech, words in their own
 * right before forms. A word can arrive more than once for one part of speech, so glosses merge and repeats drop.
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
      // "Mane" is the source's own name for an unlabelled sense, so a row with no label joins them.
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
    /* A headword with nothing under it is not an entry. */
    if (b.byPos.size === 0) continue;

    const order = [...b.byPos].sort(([a], [c]) => {
      // A word that is both a noun and another noun's plural leads with the noun; otherwise the source's order is arbitrary.
      const byKind = Number(isInflected(a)) - Number(isInflected(c));
      return byKind !== 0 ? byKind : a.localeCompare(c, 'ku');
    });
    const senses: Sense[] = [];
    for (const [pos, texts] of order) {
      for (const definition of texts) senses.push({ pos, definition });
    }

    // A word is not its own synonym, though the source often says so.
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
