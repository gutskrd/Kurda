/**
 * Build a Kurdish Sentence: the ladder of structures a learner climbs, how a
 * sentence finds its rung, and how a wrong order is answered.
 *
 * The sentences are approved ones — published lessons' translations and
 * conversation lines, and published `sentence` rows — so nothing here writes
 * Kurdish. What is decided here is only where on the ladder an approved
 * sentence sits, read from its shape: a question, a "not", the ezafe linking
 * two words, a longer statement with its verb at the end, two clauses. Most of
 * that is read off the English meaning, which says it plainly ("not", "my",
 * "because"), and the rest off the Kurdish punctuation and word count. A
 * sentence put on a neighbouring rung is a step slightly easier or harder than
 * meant, never a wrong sentence.
 *
 * The ladder is one path for both varieties: Kurmancî and Soranî alike put the
 * verb last, mark "not" on the verb and link with the ezafe.
 */
import { foldForDialect, gameWords, type GameDialect } from '../dialect.js';
import type { GameLevel, Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';

/** The rungs, from the first. */
export const SENTENCE_RUNGS = ['short', 'question', 'negation', 'ezafe', 'verb-final', 'two-clauses'] as const;
export type SentenceRung = (typeof SENTENCE_RUNGS)[number];

export function isSentenceRung(v: unknown): v is SentenceRung {
  return (SENTENCE_RUNGS as readonly unknown[]).includes(v);
}

/** A rung's place on the ladder, from 1. */
export function rungStep(rung: SentenceRung): number {
  return SENTENCE_RUNGS.indexOf(rung) + 1;
}

/** The rung at a step (clamped to the ladder). */
export function rungAt(step: number): SentenceRung {
  return SENTENCE_RUNGS[Math.min(SENTENCE_RUNGS.length, Math.max(1, Math.round(step))) - 1]!;
}

/** Which rungs each difficulty climbs: beginner = levels 1–2, intermediate = 3, advanced = 4–5. */
export const DIFFICULTY_RUNGS: Readonly<Record<GameDifficulty, readonly SentenceRung[]>> = {
  beginner: ['short', 'question', 'negation', 'ezafe'],
  intermediate: ['verb-final'],
  advanced: ['two-clauses'],
};

const NEGATION = /\b(not|no|never|nothing|nobody|none|nowhere|neither|nor|cannot)\b|n['’]t\b/i;
const POSSESSIVE = /\b(my|your|his|her|its|our|their)\b|['’]s\b|\bof (the|my|your|his|her|our|their)\b/i;
const CLAUSE_WORD = /\b(because|when|while|if|but|until|although|unless|whereas|before|after|so that|and then)\b/i;
const QUESTION_MARK = /[?؟]\s*$/u;

/** A Kurmancî ezafe ending on a word that has another after it: mala min, xwişka wî, sêva sor. */
const KMR_EZAFE = /(a|ê|ên|ya|yê|yên)$/u;
/** A Soranî ezafe on a word that has another after it: ماڵی من, کچەکەی. */
const CKB_EZAFE = /ی$/u;

/** A comma between clauses: not one right after the first word (a greeting, a name called). */
function clauseComma(en: string): boolean {
  const at = en.indexOf(',');
  if (at < 0) return false;
  return en.slice(0, at).trim().split(/\s+/).length >= 2 && en.slice(at + 1).trim().split(/\s+/).length >= 2;
}

function hasEzafe(ku: string, dialect: GameDialect): boolean {
  const words = gameWords(ku).map((w) => foldForDialect(w, dialect));
  const ending = dialect === 'ckb' ? CKB_EZAFE : KMR_EZAFE;
  return words.slice(0, -1).some((w) => w.length >= 3 && ending.test(w));
}

/** A sentence's place on the ladder, read from its shape (see the module note). */
export interface SentenceShape {
  rung: SentenceRung;
  level: GameLevel;
  words: number;
}

export function sentenceShape(ku: string, en: string, dialect: GameDialect): SentenceShape {
  const words = gameWords(ku).length;
  const question = QUESTION_MARK.test(ku) || QUESTION_MARK.test(en);
  let rung: SentenceRung;
  if (words >= 5 && (CLAUSE_WORD.test(en) || clauseComma(en))) rung = 'two-clauses';
  else if (question && words <= 7) rung = 'question';
  else if (NEGATION.test(en) && words <= 8) rung = 'negation';
  else if (POSSESSIVE.test(en) && hasEzafe(ku, dialect) && words <= 8) rung = 'ezafe';
  else if (words >= 5) rung = 'verb-final';
  else rung = 'short';
  return { rung, level: rungLevel(rung, words), words };
}

/** The content level a rung's sentence counts at (two long clauses are the last level). */
export function rungLevel(rung: SentenceRung, words: number): GameLevel {
  switch (rung) {
    case 'short':
    case 'question':
      return 1;
    case 'negation':
    case 'ezafe':
      return 2;
    case 'verb-final':
      return 3;
    case 'two-clauses':
      return words >= 9 ? 5 : 4;
  }
}

/** Tiles that are not the sentence's words, by difficulty: a wider choice is a harder one. */
export const DECOYS: Readonly<Record<GameDifficulty, number>> = { beginner: 2, intermediate: 3, advanced: 4 };
/** No more tiles than this in all. */
export const MAX_TILES = 13;

/** A round passed this well on its rung opens the next one. */
export const STEP_UP_FIRST_TRY = 6;

/**
 * The ladder after a round: a round on the learner's own rung (or above it),
 * with at least STEP_UP_FIRST_TRY of its items right on the first try, opens
 * the rung after the one it was played on. Nothing ever closes a rung again.
 */
export function stepAfterRound(step: number, played: SentenceRung, firstTry: number): number {
  const at = rungStep(played);
  if (firstTry < STEP_UP_FIRST_TRY || at < step) return step;
  return Math.min(SENTENCE_RUNGS.length, Math.max(step, at + 1));
}

/**
 * The rung a round of a difficulty is played on: the highest of its rungs the
 * learner has opened, among those with enough sentences; the difficulty's
 * first such rung when the learner has not reached it yet. Null when none of
 * its rungs has enough.
 */
export function roundRung(difficulty: GameDifficulty, step: number, enough: (rung: SentenceRung) => boolean): SentenceRung | null {
  const rungs = DIFFICULTY_RUNGS[difficulty].filter(enough);
  if (rungs.length === 0) return null;
  const open = rungs.filter((r) => rungStep(r) <= step);
  return open.at(-1) ?? rungs[0]!;
}

/**
 * Where a wrong line first goes astray: the first place where it differs from
 * the accepted order it shares the longest beginning with. Null when it is
 * one of them; `answer.length` when it is right as far as it goes and stops
 * short, so the place marked is the one after its last word.
 */
export function firstMisplaced(answer: readonly string[], orders: readonly string[], dialect: GameDialect): number | null {
  const given = answer.map((w) => foldForDialect(w, dialect));
  let best = -1;
  for (const order of orders) {
    const want = gameWords(order).map((w) => foldForDialect(w, dialect));
    if (want.length === given.length && want.every((w, i) => w === given[i])) return null;
    let same = 0;
    while (same < given.length && same < want.length && given[same] === want[same]) same++;
    best = Math.max(best, same);
  }
  return Math.max(0, best);
}

// ---------- what the apps are sent ----------

/** One sentence to build: its meaning, and the tiles (its words and a few that are not), shuffled. */
export interface SentenceItemView {
  index: number;
  /** stable for the sentence, whichever lesson it came from */
  key: string;
  meaning: Meanings;
  tiles: string[];
  rung: SentenceRung;
  level: GameLevel;
}

/** An answer: the tiles laid on the line, by their places among `tiles`, in order. */
export interface SentenceAnswer {
  order: number[];
}

/** After a wrong first try: where the line goes astray, as a place on the player's own line. */
export interface SentenceHint {
  firstWrong: number | null;
}

/** Once an item is done: the sentence the right way round, every word with what it means where that is known. */
export interface SentenceCorrection {
  answer: string;
  /** each word with its meanings by interface language, when an approved source gives one (`meaningIn` picks the reader's) */
  words: Array<{ word: string; meanings: Partial<Meanings> | null }>;
  /** the place on the player's last line where it first went astray, null when it was right */
  firstWrong: number | null;
}

/** The ladder as the intro shows it: every rung, how many sentences it has, and how far this learner has climbed. */
export interface SentenceLadderView {
  dialect: GameDialect;
  /** the highest rung opened, from 1 */
  step: number;
  rungs: Array<{ rung: SentenceRung; level: GameLevel; sentences: number; open: boolean }>;
  /** a round left unfinished, to come back to */
  open: string | null;
}
