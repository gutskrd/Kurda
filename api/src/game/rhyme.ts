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

/** Vowels per dialect. Kurmancî ê/î/û and Soranî vowels are distinct letters,
 *  not decorative diacritics, so they are kept (NFC), never decomposed. */
const VOWELS: Record<Dialect, ReadonlySet<string>> = {
  kurmanci: new Set(['a', 'e', 'ê', 'i', 'î', 'o', 'u', 'û']),
  sorani: new Set(['ا', 'ە', 'ه', 'ێ', 'ی', 'ۆ', 'و', 'ئ']),
};

/** Long/short (and close) vowel pairs that count as a *near* (slant) match. */
const NEAR_VOWELS: Record<Dialect, ReadonlyArray<ReadonlySet<string>>> = {
  kurmanci: [new Set(['i', 'î']), new Set(['u', 'û']), new Set(['e', 'ê'])],
  sorani: [new Set(['و', 'ۆ']), new Set(['ی', 'ێ']), new Set(['ه', 'ە'])],
};

/**
 * Normalize a word for comparison: lowercase, NFC (keeps ê/î/û as single
 * letters), and strip everything that is not a letter — whitespace,
 * punctuation, digits, and Arabic combining marks all go. The result is the
 * pure letter sequence the rhyme logic operates on.
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

interface Rime {
  nucleus: string;
  coda: string;
  hadVowel: boolean;
}

/** The rime = final vowel (nucleus) + trailing consonants (coda). */
function rimeOf(normalized: string, dialect: Dialect): Rime {
  const vowels = VOWELS[dialect];
  let last = -1;
  for (let i = normalized.length - 1; i >= 0; i--) {
    const ch = normalized[i];
    if (ch !== undefined && vowels.has(ch)) {
      last = i;
      break;
    }
  }
  if (last === -1) return { nucleus: '', coda: normalized, hadVowel: false };
  return { nucleus: normalized[last] ?? '', coda: normalized.slice(last + 1), hadVowel: true };
}

function vowelsNear(a: string, b: string, dialect: Dialect): boolean {
  if (a === b) return true;
  return NEAR_VOWELS[dialect].some((set) => set.has(a) && set.has(b));
}

/**
 * Classify how well two words rhyme:
 *  - `perfect`: identical rime (same final vowel + same trailing consonants).
 *  - `near` (slant): same final vowel but a different coda, or the same coda
 *    with a close long/short vowel.
 *  - `none`: otherwise.
 */
export function classifyRhyme(prompt: string, submission: string, dialect: Dialect): RhymeQuality {
  const np = normalizeWord(prompt);
  const ns = normalizeWord(submission);
  if (np === '' || ns === '') return 'none';

  const rp = rimeOf(np, dialect);
  const rs = rimeOf(ns, dialect);

  if (rp.nucleus === rs.nucleus && rp.coda === rs.coda && (rp.hadVowel || np === ns)) {
    return 'perfect';
  }
  if (rp.hadVowel && rs.hadVowel) {
    if (rp.nucleus === rs.nucleus) return 'near'; // same vowel, different coda
    if (rp.coda === rs.coda && rp.coda !== '' && vowelsNear(rp.nucleus, rs.nucleus, dialect)) {
      return 'near'; // same coda, close vowel
    }
  }
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

  const quality = classifyRhyme(prompt, submission, dialect);
  if (quality === 'none') return reject('no-rhyme');

  return {
    accepted: true,
    quality,
    points: rhymePoints({ quality, elapsedMs, windowMs }),
    normalized,
  };
}
