/**
 * The dictionary's side of a rhyme round, shared by training and matches:
 * whether a typed word is a word of the round's dialect, which rhymes a player
 * missed, and which dialects have enough prompts to be offered at all.
 *
 * A word counts when it is the dictionary's own in that dialect, letter for
 * letter (`rhymeWordKey`: ê is not e), and is a word a rhyme is made of: a
 * lemma with a part of speech worth rhyming (as the Last Letter takes them),
 * or a curated game word, which an admin chose as a word. A Kurmancî headword
 * written with a capital is a name, and does not count. The words the course
 * teaches count too (published word cards): a learner may rhyme with what a
 * lesson gave them whether or not the dictionary has it yet.
 *
 * Words somebody chose by hand — a curated word or a course word — are also
 * reported as `chosen`, which keeps the engine's inflection check off them:
 * baran is a word, not bar with an ending.
 */
import type pg from 'pg';
import { dictionaryDialect, dictionaryKey, lookupSpellings, wordKey } from '@kurda/shared';
import {
  classifyRhyme,
  inflectionStems,
  InMemoryLexicon,
  letterDialectOf,
  normalizeWord,
  rhymePattern,
  rhymeWordKey,
  type Dialect,
  type RhymeScorerDeps,
} from './rhyme.js';
import { meaningsOf, type WordMeanings } from './word-meanings.js';
import { filterText } from '../moderation/filter.js';

type Executor = Pick<pg.Pool, 'query'>;

/** The parts of speech a rhyme may be (a dictionary entry with only "other" or "phrase" senses is not one word to rhyme with). */
export const RHYME_PARTS_OF_SPEECH: ReadonlySet<string> = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral']);

/**
 * A dialect is offered once it has this many curated prompts (`is_rhyme_prompt`).
 * Fewer, and a player meets the same few words round after round; none, and a
 * round cannot start at all — which is how Soranî used to look offered while
 * every match failed to open.
 */
export const RHYME_MIN_PROMPTS = 40;

/** How many rhymes the end of a round shows that the player did not find. */
export const MISSED_RHYMES_SHOWN = 10;

interface EntryRow {
  headword: string;
  in_games: boolean;
  senses: Array<{ pos: string }> | null;
}

/** What the dictionary says about a typed word and the stems it could be an inflection of. */
export interface RhymeWordFacts {
  /** the given keys that are words of the dialect */
  words: Set<string>;
  /** of those, the ones somebody chose by hand */
  chosen: Set<string>;
}

function isName(dialect: Dialect, headword: string): boolean {
  return dialect === 'kurmanci' && /^\p{Lu}/u.test(headword.normalize('NFC').trim());
}

/**
 * Which of `keys` (words in the dialect's letters, as `rhymeWordKey` gives
 * them) are words a rhyme round takes. One indexed lookup over the folded
 * spellings the dictionary may hold them under; every hit is then compared in
 * the dialect's own letters, so a spelling without its marks only ever finds
 * the word it actually is.
 */
export async function lookupRhymeWords(db: Executor, dialect: Dialect, keys: readonly string[]): Promise<RhymeWordFacts> {
  const ld = letterDialectOf(dialect);
  const wanted = new Set(keys.filter(Boolean));
  const words = new Set<string>();
  const chosen = new Set<string>();
  if (wanted.size === 0) return { words, chosen };

  const folded = [...new Set([...wanted].flatMap((k) => lookupSpellings(ld, k)).map((s) => dictionaryKey(s)))];
  const entries = await db.query<EntryRow>(
    `SELECT e.headword, e.in_games,
            (SELECT json_agg(json_build_object('pos', s.pos)) FROM dict_senses s WHERE s.entry_id = e.id) AS senses
       FROM dict_entries e
      WHERE e.headword_folded = ANY($1::text[]) AND e.dialect = $2
      LIMIT 200`,
    [folded, dictionaryDialect(ld)],
  );
  for (const e of entries.rows) {
    const key = rhymeWordKey(e.headword, dialect);
    if (!wanted.has(key) || isName(dialect, e.headword)) continue;
    const senses = e.senses ?? [];
    const lemma = senses.length === 0 ? e.in_games : senses.some((s) => RHYME_PARTS_OF_SPEECH.has(s.pos));
    if (lemma || e.in_games) words.add(key);
    if (e.in_games) chosen.add(key);
  }

  // a card holds the word as its author wrote it (a Soranî h as ه, say), so it is looked for under every such spelling
  const spellings = [...new Set([...wanted].flatMap((k) => lookupSpellings(ld, k)))];
  const cards = await db.query<{ word: string }>(
    `SELECT payload->>'word' AS word FROM game_content
      WHERE kind = 'word_card' AND dialect = $1 AND status = 'published' AND review_status = 'approved'
        AND lower(payload->>'word') = ANY($2::text[])`,
    [ld, spellings],
  );
  for (const c of cards.rows) {
    if (typeof c.word !== 'string' || isName(dialect, c.word)) continue;
    const key = rhymeWordKey(c.word, dialect);
    if (!wanted.has(key)) continue;
    words.add(key);
    chosen.add(key);
  }
  return { words, chosen };
}

/**
 * The engine's view of the dictionary for one submission (already in the
 * dialect's letters): whether it is a word, which of the stems it could be an
 * inflection of are words too, and whether somebody chose it by hand. Training
 * and matches both ask this, so a word scores the same in either.
 */
export async function rhymeLexicon(db: Executor, dialect: Dialect, normalized: string): Promise<Pick<RhymeScorerDeps, 'lexicon' | 'isChosen'>> {
  if (!normalized) return { lexicon: new InMemoryLexicon(), isChosen: () => false };
  const facts = await lookupRhymeWords(db, dialect, [normalized, ...inflectionStems(normalized, dialect).map((s) => s.stem)]);
  return {
    lexicon: new InMemoryLexicon([...facts.words].map((word) => ({ word, dialect }))),
    isChosen: (w) => facts.chosen.has(w),
  };
}

/** A rhyme the player could have found, with what it means. */
export interface RhymeHint {
  word: string;
  /** by interface language; empty when nobody has written one */
  meanings: WordMeanings;
}

/**
 * Up to MISSED_RHYMES_SHOWN perfect rhymes of the prompt from the curated
 * words of its dialect that the player did not find, for the end of a round:
 * finding rhymes is half of it, and seeing the ones you missed, with what they
 * mean, is how the next round goes better. Words with a meaning come first.
 */
export async function missedRhymes(db: Executor, dialect: Dialect, prompt: string, found: readonly string[]): Promise<RhymeHint[]> {
  const promptKey = rhymeWordKey(prompt, dialect);
  // the prompt is a headword, so its letters as stored are the ones the reversed-headword index holds
  const pattern = rhymePattern(normalizeWord(prompt), dialect);
  if (!promptKey || !pattern) return [];
  const ld = letterDialectOf(dialect);
  const rows = await db.query<{ headword: string }>(
    `SELECT headword FROM dict_entries
      WHERE in_games AND dialect = $1 AND rhyme_key LIKE $2 || '%' AND rhyme_key ~ $3
      ORDER BY headword LIMIT 80`,
    [dictionaryDialect(ld), pattern.prefix, pattern.perfect],
  );
  const seen = new Set(found.map((w) => rhymeWordKey(w, dialect) || w));
  seen.add(promptKey);
  const candidates: string[] = [];
  for (const r of rows.rows) {
    const key = wordKey(ld, r.headword);
    if (!key || seen.has(key) || isName(dialect, r.headword) || filterText(key).flagged) continue;
    if (classifyRhyme(promptKey, key, dialect) !== 'perfect') continue;
    seen.add(key);
    candidates.push(key);
  }
  const meanings = await meaningsOf(db, ld, candidates);
  return candidates
    .map((word, i) => ({ word, meanings: meanings.get(word) ?? {}, i }))
    .sort((a, b) => Number(Object.keys(b.meanings).length > 0) - Number(Object.keys(a.meanings).length > 0) || a.i - b.i)
    .slice(0, MISSED_RHYMES_SHOWN)
    .map(({ word, meanings: m }) => ({ word, meanings: m }));
}

export interface RhymeDialectAvailability {
  /** curated prompts a round of this dialect can open on */
  prompts: number;
  available: boolean;
}

/**
 * Which dialects have enough curated prompts to be offered (RHYME_MIN_PROMPTS),
 * for both apps to show the rest as coming soon. One indexed count over the
 * game words.
 */
export async function rhymeAvailability(db: Executor): Promise<Record<Dialect, RhymeDialectAvailability>> {
  const res = await db.query<{ dialect: string; n: number }>(
    `SELECT dialect, count(*)::int AS n FROM dict_entries
      WHERE in_games AND is_rhyme_prompt AND dialect IN ('kurmanji', 'sorani') GROUP BY dialect`,
  );
  const count = (d: string): number => res.rows.find((r) => r.dialect === d)?.n ?? 0;
  const of = (n: number): RhymeDialectAvailability => ({ prompts: n, available: n >= RHYME_MIN_PROMPTS });
  return { kurmanci: of(count('kurmanji')), sorani: of(count('sorani')) };
}
