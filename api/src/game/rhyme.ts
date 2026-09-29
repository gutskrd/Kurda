/**
 * Kurdish rhyme-scoring engine (KUR-298) — the pure core behind the Rhyming
 * Words game mode (KUR-299). Given a prompt word and a player's submission it
 * decides: (1) is it a real Kurdish word, (2) does it actually rhyme and how
 * well, and (3) — with the server-timed elapsed — how many points to award.
 *
 * It reuses the #053 scoring model: instead of a boolean `correct`, a rhyme
 * gets a quality tier (perfect / near / none) which scales the same
 * base + speed-decay curve, so scoring feels identical to quiz mode. Pure and
 * deterministic (lexicon + profanity check injected), so it runs server-side
 * and is fully unit-testable.
 */
import { POINTS_BASE, SPEED_BONUS } from './scoring.js';

export type Dialect = 'kurmanci' | 'sorani';

export type RhymeQuality = 'perfect' | 'near' | 'none';

/**
 * Normalize a word for comparison: lowercase, NFC (keeps ê/î/û as single
 * letters), and strip everything that is not a letter — whitespace,
 * punctuation, digits, and Arabic combining marks all go. The result is the
 * pure letter sequence the rhyme logic operates on.
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

/**
 * How many letters two words end with in common, counted from the last letter
 * backwards.
 *
 * `kurdistan` against `baran`: n=n, a=a, t≠r — two. The walk stops at the first
 * letter that differs and never looks past it, so the *last* letter deciding
 * everything is not a special case but the first step of the same loop.
 */
export function sharedEnding(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

/** Two shared letters is a full rhyme; one is a half rhyme. */
const PERFECT_FROM = 2;

/**
 * Classify how well two words rhyme, by their shared ending alone:
 *  - `perfect`: the last two letters or more are the same.
 *  - `near`: exactly the last letter is the same.
 *  - `none`: the last letters differ.
 *
 * A word whose last letter does not match does not rhyme at all, whatever it
 * shares further back — `roj` and `soz` are not a rhyme here even though both
 * run `-o-`. That is a deliberate narrowing of an earlier rule that compared
 * the final vowel and its trailing consonants separately.
 *
 * It is spelling, not phonetics, and it is meant to be: it gives one answer a
 * player can predict, it is the same rule in Latin and in Arabic script so
 * Soranî needs no vowel table of its own, and it decides hundreds of thousands
 * of imported words without anybody ruling on them one at a time. Where it is
 * wrong about a particular pair, a curator's `rhyme_overrides` verdict beats
 * it — in both directions.
 */
export function classifyRhyme(prompt: string, submission: string): RhymeQuality {
  const np = normalizeWord(prompt);
  const ns = normalizeWord(submission);
  if (np === '' || ns === '') return 'none';

  const shared = sharedEnding(np, ns);
  if (shared >= PERFECT_FROM) return 'perfect';
  if (shared === 1) return 'near';
  return 'none';
}

/** Quality → points multiplier applied to the #053 base+speed curve. */
export const RHYME_QUALITY_MULTIPLIER: Record<RhymeQuality, number> = {
  perfect: 1,
  near: 0.5,
  none: 0,
};

export interface RhymePointsInput {
  quality: RhymeQuality;
  /** ms from prompt open to the server-recorded submission */
  elapsedMs: number;
  /** the answer window (round duration) in ms */
  windowMs: number;
}

/**
 * Points for a rhyme: 0 for a non-rhyme, else the #053 base + speed bonus
 * (decaying linearly from instant to the deadline) scaled by the quality
 * multiplier. A stronger rhyme and a faster answer each raise the score.
 */
export function rhymePoints({ quality, elapsedMs, windowMs }: RhymePointsInput): number {
  const mult = RHYME_QUALITY_MULTIPLIER[quality];
  if (mult === 0) return 0;
  const frac = windowMs > 0 ? Math.min(1, Math.max(0, elapsedMs / windowMs)) : 0;
  return Math.round((POINTS_BASE + SPEED_BONUS * (1 - frac)) * mult);
}

/** Injected Kurdish word list — real implementation seeded from the content
 *  corpus (#026) / saved-words store (#047); tests supply a small one. */
export interface KurdishLexicon {
  has(normalizedWord: string, dialect: Dialect): boolean;
}

/** In-memory lexicon; normalizes on insert so lookups are diacritic-safe. */
export class InMemoryLexicon implements KurdishLexicon {
  private readonly byDialect: Record<Dialect, Set<string>> = {
    kurmanci: new Set(),
    sorani: new Set(),
  };

  constructor(entries: Iterable<{ word: string; dialect: Dialect }> = []) {
    for (const { word, dialect } of entries) this.add(word, dialect);
  }

  add(word: string, dialect: Dialect): void {
    const n = normalizeWord(word);
    if (n) this.byDialect[dialect].add(n);
  }

  has(normalizedWord: string, dialect: Dialect): boolean {
    return this.byDialect[dialect].has(normalizedWord);
  }
}

export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane';

export interface RhymeResult {
  accepted: boolean;
  quality: RhymeQuality;
  points: number;
  /** normalized submission — the caller tracks these as this round's used words */
  normalized: string;
  /** set only when accepted is false */
  reason?: RhymeReject;
}

export interface RhymeSubmissionInput {
  prompt: string;
  submission: string;
  elapsedMs: number;
  windowMs: number;
  dialect: Dialect;
  /** words already scored this round (any form — compared normalized) */
  usedWords?: readonly string[];
}

export interface RhymeScorerDeps {
  lexicon: KurdishLexicon;
  /**
   * An admin's explicit verdict for this (prompt, submission) pair, if there is
   * one. Returning a quality overrides the computed rhyme — including 'none',
   * which rules a pair out that the endings would otherwise accept.
   */
  overrideQuality?: (promptNormalized: string, submissionNormalized: string) => RhymeQuality | undefined;
  /** profanity gate (#086); receives the normalized word. Optional. */
  isProfane?: (normalizedWord: string) => boolean;
}

/**
 * Evaluate one submission end to end, server-authoritatively. Checks run in a
 * fixed order so the rejection reason is deterministic: empty → profane →
 * the prompt itself → already used → not a real word → doesn't rhyme. Only a
 * real, unused, rhyming word scores.
 */
export function evaluateSubmission(
  input: RhymeSubmissionInput,
  deps: RhymeScorerDeps,
): RhymeResult {
  const { prompt, submission, elapsedMs, windowMs, dialect, usedWords = [] } = input;
  const normalized = normalizeWord(submission);

  const reject = (reason: RhymeReject): RhymeResult => ({
    accepted: false,
    quality: 'none',
    points: 0,
    normalized,
    reason,
  });

  if (normalized === '') return reject('not-a-word');
  if (deps.isProfane?.(normalized)) return reject('profane');
  if (normalized === normalizeWord(prompt)) return reject('is-prompt');
  if (usedWords.some((w) => normalizeWord(w) === normalized)) return reject('already-used');
  if (!deps.lexicon.has(normalized, dialect)) return reject('not-a-word');

  // a curator's explicit decision beats the derived one, in both directions
  const quality = deps.overrideQuality?.(normalizeWord(prompt), normalized) ?? classifyRhyme(prompt, submission);
  if (quality === 'none') return reject('no-rhyme');

  return {
    accepted: true,
    quality,
    points: rhymePoints({ quality, elapsedMs, windowMs }),
    normalized,
  };
}
