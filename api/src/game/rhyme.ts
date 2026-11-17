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
import { wordKey, type LetterDialect } from '@kurda/shared';
import { POINTS_BASE, SPEED_BONUS } from './scoring.js';

export type Dialect = 'kurmanci' | 'sorani';

export type RhymeQuality = 'perfect' | 'near' | 'none';

/** The games' name for a variety, as the shared letter helpers name it. */
export function letterDialectOf(dialect: Dialect): LetterDialect {
  return dialect === 'sorani' ? 'ckb' : 'kmr';
}

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
 * A word as a round compares it: one word in the dialect's own letters
 * (shared `wordKey`: ê is not e, and the Arabic keyboard's ي is Soranî's ی),
 * or '' when it is not one word of that dialect at all.
 *
 * Every comparison a round makes goes through this one key — is it the
 * prompt, was it said already, which dictionary entry is it — so a word typed
 * without its marks can never pass for the word with them. That was how the
 * prompt şev, typed as "sev", used to score as a perfect rhyme of itself.
 */
export function rhymeWordKey(word: string, dialect: Dialect): string {
  return wordKey(letterDialectOf(dialect), word) ?? '';
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

/** Soranî: two shared final letters is a full rhyme; one is a half rhyme. */
export const PERFECT_FROM = 2;

/** The eight Kurmancî vowels of the Hawar alphabet; w and y are consonants. */
export const KURMANCI_VOWELS: ReadonlySet<string> = new Set(['a', 'e', 'ê', 'i', 'î', 'o', 'u', 'û']);

/** The same vowels as a regular-expression class, for the database's side of a rhyme lookup. */
const VOWEL_CLASS = `[${[...KURMANCI_VOWELS].join('')}]`;

/**
 * Where a Kurmancî word rhymes: its rime, the last vowel and everything after
 * it, and its coda, the consonants after that vowel (empty for a word that
 * ends in a vowel). `null` for a word with no vowel at all, which rhymes with
 * nothing by this rule.
 *
 *     bajar → rime "ar", coda "r"      derî → rime "î", coda ""
 *     dest  → rime "est", coda "st"    şîrîn → rime "în", coda "n"
 */
export function rimeOf(word: string): { rime: string; coda: string; vowel: string } | null {
  const letters = [...normalizeWord(word)];
  for (let i = letters.length - 1; i >= 0; i--) {
    const ch = letters[i]!;
    if (KURMANCI_VOWELS.has(ch)) return { rime: letters.slice(i).join(''), coda: letters.slice(i + 1).join(''), vowel: ch };
  }
  return null;
}

/**
 * A word written backwards, which is how its rhymes are found.
 *
 * Rhyming is a question about the end of a word, and no index can answer one of
 * those. Reversed it becomes a question about the start: every word ending in
 * `-an` begins `na-` here, so "what rhymes with kurdistan" is a prefix lookup.
 * `dict_entries.rhyme_key` is the stored form of this (1751000117000), and
 * Postgres' `reverse()` has to agree with this function exactly.
 */
export function rhymeKey(word: string): string {
  return [...normalizeWord(word)].reverse().join('');
}

/**
 * The rhyme-key prefix shared by every word that ends with this one's last
 * `letters` letters, or null when the word is too short to have that many.
 *
 * Null is the answer to a real question rather than an error: a one-letter word
 * cannot share two final letters with anything but itself, so it has no perfect
 * rhymes at all. Returning a short prefix instead would match every word ending
 * in that letter and call them all perfect.
 */
export function rhymePrefix(word: string, letters: number): string | null {
  const key = [...rhymeKey(word)];
  if (letters < 1 || key.length < letters) return null;
  return key.slice(0, letters).join('');
}

/**
 * Classify how well two words rhyme.
 *
 * **Kurmancî, by the rime**, as Kurdish verse rhymes:
 *  - `perfect`: the same last vowel and the same letters after it — dar,
 *    bajar, êvar; baran, şivan, ziman; and derî, kanî, azadî, which end on the
 *    same î and nothing after it.
 *  - `near`: the same consonants at the end after a different last vowel —
 *    dar and dêr, dil and gul.
 *  - `none`: anything else. A shared last letter is no longer enough on its
 *    own: dest and mast share "st" but not the vowel before it, so they are a
 *    near rhyme, and derî and bira share nothing.
 *
 * **Soranî, by its last letters**: two or more is perfect and one is near.
 * Soranî writes some vowels and leaves others out, so the letters at the end
 * are the honest thing to compare there.
 *
 * Both are spelling, not phonetics: one answer a player can predict, decided
 * for hundreds of thousands of words without anybody ruling on them one at a
 * time. Where it is wrong about a particular pair, a curator's
 * `rhyme_overrides` verdict beats it — in both directions.
 */
export function classifyRhyme(prompt: string, submission: string, dialect: Dialect = 'kurmanci'): RhymeQuality {
  const np = normalizeWord(prompt);
  const ns = normalizeWord(submission);
  if (np === '' || ns === '') return 'none';

  if (dialect === 'sorani') {
    const shared = sharedEnding(np, ns);
    if (shared >= PERFECT_FROM) return 'perfect';
    if (shared === 1) return 'near';
    return 'none';
  }

  const a = rimeOf(np);
  const b = rimeOf(ns);
  if (!a || !b) return 'none';
  if (a.rime === b.rime) return 'perfect';
  if (a.coda !== '' && a.coda === b.coda) return 'near';
  return 'none';
}

/**
 * How the dictionary finds a word's rhymes by its `rhyme_key` (the reversed
 * headword): every partner's key starts with `prefix`, which an index answers;
 * `any` and `perfect` are anchored patterns over the key that tell a partner
 * from a word that merely shares the prefix, and a perfect partner from a near
 * one. Null for a word nothing can rhyme with (a Kurmancî word with no vowel).
 *
 * Kurmancî: a partner ends in the prompt's coda with a vowel just before it
 * (any vowel for a near rhyme, the prompt's own for a perfect one); a prompt
 * ending in a vowel has only perfect partners, the words ending in that vowel.
 * Soranî: the last letter, and the last two.
 */
export function rhymePattern(word: string, dialect: Dialect): { prefix: string; any: string; perfect: string } | null {
  if (dialect === 'sorani') {
    const one = rhymePrefix(word, 1);
    if (one === null) return null;
    const two = rhymePrefix(word, PERFECT_FROM);
    // a one-letter word has no perfect partner: a pattern no key can match says so
    return { prefix: one, any: `^${one}`, perfect: two === null ? '^$.' : `^${two}` };
  }
  const r = rimeOf(word);
  if (!r) return null;
  const coda = [...r.coda].reverse().join('');
  const rime = [...r.rime].reverse().join('');
  if (coda === '') return { prefix: rime, any: `^${rime}`, perfect: `^${rime}` };
  return { prefix: coda, any: `^${coda}${VOWEL_CLASS}`, perfect: `^${rime}` };
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

/**
 * The endings a word takes in a sentence rather than in the dictionary, each
 * with what its stem ends in again once it is taken off (Kurmancî î becomes iy
 * before an ending: derî, deriyê). Longest first, so "malên" is read as mal +
 * ên and not as malê + n.
 *
 * Kurmancî: the oblique and the plural (-an, -ên), the ezafe (-a, -ê, -ên, and
 * -ya, -yê after a vowel), and the indefinite (-ek, -eke, -ekê, -ekî).
 * Soranî: the definite (ەکە, ەکان and their -کە, -کان after a vowel), the
 * plural ان, and the indefinite ێک, یەک.
 */
const INFLECTIONS: Record<Dialect, ReadonlyArray<readonly [ending: string, stemEnd: string]>> = {
  kurmanci: [
    ['iyên', 'î'], ['iyan', 'î'], ['iyê', 'î'], ['iya', 'î'],
    ['yekê', ''], ['yekî', ''], ['yeke', ''], ['ekê', ''], ['ekî', ''], ['eke', ''], ['yek', ''], ['ek', ''],
    ['yên', ''], ['yan', ''], ['yê', ''], ['ya', ''],
    ['ên', ''], ['an', ''], ['ê', ''], ['a', ''],
  ],
  sorani: [
    ['ەکانی', ''], ['ەکان', ''], ['ەکەی', ''], ['ەکە', ''], ['یەکان', ''], ['یەکە', ''], ['کان', ''], ['کە', ''],
    ['یەک', ''], ['ێک', ''], ['ان', ''],
  ],
};

/** The shortest stem an ending is taken off: "ma" is not a word's stem, it is two letters. */
const MIN_STEM_LETTERS = 2;

/**
 * The words a submission could be an inflected form of: each stem, with the
 * ending taken off. The engine asks the lexicon which of them are words; this
 * only proposes.
 */
export function inflectionStems(word: string, dialect: Dialect): Array<{ stem: string; ending: string }> {
  const letters = normalizeWord(word);
  const out: Array<{ stem: string; ending: string }> = [];
  for (const [ending, stemEnd] of INFLECTIONS[dialect]) {
    if (!letters.endsWith(ending)) continue;
    const stem = letters.slice(0, letters.length - ending.length) + stemEnd;
    if ([...stem].length >= MIN_STEM_LETTERS && !out.some((o) => o.stem === stem)) out.push({ stem, ending });
  }
  return out;
}

/**
 * How many letters at the end of `submission` the rhyme with `prompt` rests
 * on: the rime for a perfect Kurmancî rhyme, the coda for a near one, and in
 * Soranî the letters the two share.
 */
function rhymingTail(prompt: string, submission: string, quality: RhymeQuality, dialect: Dialect): number {
  if (dialect === 'sorani') return sharedEnding(normalizeWord(prompt), normalizeWord(submission));
  const r = rimeOf(submission);
  if (!r) return 0;
  return [...(quality === 'perfect' ? r.rime : r.coda)].length;
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
    const n = rhymeWordKey(word, dialect) || normalizeWord(word);
    if (n) this.byDialect[dialect].add(n);
  }

  has(normalizedWord: string, dialect: Dialect): boolean {
    return this.byDialect[dialect].has(normalizedWord);
  }
}

/**
 * Why a word was not taken. `inflected` is a word with an ending on it (malan,
 * mala) whose rhyme is only the ending: any noun can be given one, so a round
 * of them is a round of padding, not of finding rhymes.
 */
export type RhymeReject = 'not-a-word' | 'is-prompt' | 'already-used' | 'no-rhyme' | 'profane' | 'inflected';

export interface RhymeResult {
  accepted: boolean;
  quality: RhymeQuality;
  points: number;
  /** the word in the dialect's letters — the caller tracks these as this round's used words */
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
  /** words already scored this round (any form — compared in the dialect's letters) */
  usedWords?: readonly string[];
}

export interface RhymeScorerDeps {
  /** the words that exist: the submission, and for the inflection check any stem of it */
  lexicon: KurdishLexicon;
  /**
   * An admin's explicit verdict for this (prompt, submission) pair, if there is
   * one. Returning a quality overrides the computed rhyme — including 'none',
   * which rules a pair out that the endings would otherwise accept.
   */
  overrideQuality?: (promptNormalized: string, submissionNormalized: string) => RhymeQuality | undefined;
  /** profanity gate (#086); receives the normalized word. Optional. */
  isProfane?: (normalizedWord: string) => boolean;
  /**
   * A word somebody chose by hand — a curated game word, or a word the course
   * teaches — is a word in its own right whatever it ends in (baran is not
   * bar + -an), so the inflection check leaves it alone.
   */
  isChosen?: (normalizedWord: string) => boolean;
}

/**
 * Evaluate one submission end to end, server-authoritatively. Checks run in a
 * fixed order so the rejection reason is deterministic: empty → profane →
 * the prompt itself → already used → not a real word → doesn't rhyme → an
 * ending doing all the rhyming. Only a real, unused, rhyming word scores.
 */
export function evaluateSubmission(
  input: RhymeSubmissionInput,
  deps: RhymeScorerDeps,
): RhymeResult {
  const { prompt, submission, elapsedMs, windowMs, dialect, usedWords = [] } = input;
  const normalized = rhymeWordKey(submission, dialect);
  const promptKey = rhymeWordKey(prompt, dialect) || normalizeWord(prompt);

  const reject = (reason: RhymeReject): RhymeResult => ({
    accepted: false,
    quality: 'none',
    points: 0,
    normalized,
    reason,
  });

  if (normalized === '') return reject('not-a-word');
  if (deps.isProfane?.(normalized)) return reject('profane');
  if (normalized === promptKey) return reject('is-prompt');
  if (usedWords.some((w) => (rhymeWordKey(w, dialect) || normalizeWord(w)) === normalized)) return reject('already-used');
  if (!deps.lexicon.has(normalized, dialect)) return reject('not-a-word');

  // a curator's explicit decision beats the derived one, in both directions
  const decided = deps.overrideQuality?.(promptKey, normalized);
  const quality = decided ?? classifyRhyme(promptKey, normalized, dialect);
  if (quality === 'none') return reject('no-rhyme');

  // An ending that does all the rhyming on a word the dictionary also has without it (malan for baran, mala for
  // bira) is padding, unless the stem rhymes too. A curator's ruling, or a word chosen by hand, is never second-guessed.
  if (decided === undefined && !deps.isChosen?.(normalized)) {
    const tail = rhymingTail(promptKey, normalized, quality, dialect);
    for (const { stem, ending } of inflectionStems(normalized, dialect)) {
      if (tail > [...ending].length || !deps.lexicon.has(stem, dialect)) continue;
      if (classifyRhyme(promptKey, stem, dialect) === 'none') return reject('inflected');
    }
  }

  return {
    accepted: true,
    quality,
    points: rhymePoints({ quality, elapsedMs, windowMs }),
    normalized,
  };
}
