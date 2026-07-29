/**
 * Kurdish Wordle engine (KUR-303) — the pure core for the daily/practice
 * service (KUR-304), the mobile UI (KUR-305), and multiplayer battle (KUR-306).
 * Given a target word and a guess it produces per-letter green/yellow/gray
 * feedback using the official Wordle duplicate-letter algorithm, validates
 * guesses (exact length + dictionary), and advances the 6-attempt game state.
 *
 * No storage, no network, no React — and crucially the game state never holds
 * the target, so it is safe to serialize to the client (the answer stays
 * server-side; guesses are scored server-authoritatively).
 */

export const MAX_ATTEMPTS = 6;

export type LetterFeedback = 'green' | 'yellow' | 'gray';

/**
 * Normalize a word for comparison: lowercase + NFC (keeps Kurdish letters
 * Ç Ê Î Ş Û as single letters, never decomposed) + strip anything that is not
 * a letter. Equivalent Unicode encodings therefore compare equal.
 *
 * NOTE: identical to the rhyme engine's normalizer (#298); to be lifted into a
 * shared Kurdish-text helper once both land on main.
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

/** Split a word into its Kurdish letters (code-point aware, NFC-normalized). */
export function toLetters(word: string): string[] {
  return Array.from(normalizeWord(word));
}

/**
 * Score a guess against a target using the official two-pass Wordle algorithm:
 *  1. mark exact-position matches green and consume them from the target's
 *     per-letter counts;
 *  2. mark each remaining guess letter yellow only while that letter still has
 *     unconsumed count, else gray.
 * This gives correct repeated-letter behavior (AAAA vs MALA colors only the
 * two real As, the rest gray — never all four yellow).
 */
export function scoreGuess(target: string, guess: string): LetterFeedback[] {
  const targetLetters = toLetters(target);
  const guessLetters = toLetters(guess);
  const feedback: LetterFeedback[] = guessLetters.map(() => 'gray');

  const remaining = new Map<string, number>();
  for (const ch of targetLetters) remaining.set(ch, (remaining.get(ch) ?? 0) + 1);

  // Pass 1 — greens.
  for (let i = 0; i < guessLetters.length; i++) {
    const g = guessLetters[i];
    if (g !== undefined && g === targetLetters[i]) {
      feedback[i] = 'green';
      remaining.set(g, (remaining.get(g) ?? 0) - 1);
    }
  }

  // Pass 2 — yellows, constrained by remaining counts.
  for (let i = 0; i < guessLetters.length; i++) {
    if (feedback[i] === 'green') continue;
    const g = guessLetters[i];
    if (g === undefined) continue;
    const left = remaining.get(g) ?? 0;
    if (left > 0) {
      feedback[i] = 'yellow';
      remaining.set(g, left - 1);
    }
  }

  return feedback;
}

/** Injected Kurdish dictionary — real one from #043/#044/#048, a small set in tests. */
export interface KurdishDictionary {
  has(normalizedWord: string): boolean;
}

/** In-memory dictionary; normalizes on insert so lookups are diacritic-safe. */
export class InMemoryDictionary implements KurdishDictionary {
  private readonly words = new Set<string>();

  constructor(words: Iterable<string> = []) {
    for (const w of words) this.add(w);
  }

  add(word: string): void {
    const n = normalizeWord(word);
    if (n) this.words.add(n);
  }

  has(normalizedWord: string): boolean {
    return this.words.has(normalizedWord);
  }
}

export type GuessRejection = 'wrong-length' | 'not-a-word';

export type GuessValidation =
  | { ok: true; normalized: string; letters: string[] }
  | { ok: false; reason: GuessRejection };

/** Validate a guess: exact target length (in letters) and dictionary membership. */
export function validateGuess(
  guess: string,
  targetLength: number,
  dict: KurdishDictionary,
): GuessValidation {
  const normalized = normalizeWord(guess);
  const letters = Array.from(normalized);
  if (letters.length !== targetLength) return { ok: false, reason: 'wrong-length' };
  if (!dict.has(normalized)) return { ok: false, reason: 'not-a-word' };
  return { ok: true, normalized, letters };
}

export interface GuessRow {
  /** normalized guess */
  guess: string;
  letters: string[];
  feedback: LetterFeedback[];
  /** all letters green */
  correct: boolean;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface WordleGame {
  targetLength: number;
  status: GameStatus;
  guesses: GuessRow[];
  /** best status seen per letter across all guesses (upgrade-only) */
  keyboard: Record<string, LetterFeedback>;
}

/** A fresh game. Holds only the target *length* — never the target itself. */
export function initGame(targetLength: number): WordleGame {
  return { targetLength, status: 'playing', guesses: [], keyboard: {} };
}

const FEEDBACK_RANK: Record<LetterFeedback, number> = { gray: 1, yellow: 2, green: 3 };

/** Merge a guess's feedback into keyboard state, upgrade-only (never downgrade). */
export function mergeKeyboard(
  keyboard: Record<string, LetterFeedback>,
  letters: string[],
  feedback: LetterFeedback[],
): Record<string, LetterFeedback> {
  const next = { ...keyboard };
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const fb = feedback[i];
    if (letter === undefined || fb === undefined) continue;
    const current = next[letter];
    if (current === undefined || FEEDBACK_RANK[fb] > FEEDBACK_RANK[current]) {
      next[letter] = fb;
    }
  }
  return next;
}

/** Derive keyboard state from scratch (pure helper for tests / rehydration). */
export function keyboardFromGuesses(guesses: GuessRow[]): Record<string, LetterFeedback> {
  return guesses.reduce(
    (kb, row) => mergeKeyboard(kb, row.letters, row.feedback),
    {} as Record<string, LetterFeedback>,
  );
}

export type ApplyResult =
  | { ok: true; game: WordleGame; row: GuessRow }
  | { ok: false; game: WordleGame; reason: GuessRejection };

/**
 * Apply a guess to the game. Rejected guesses (wrong length / not a word) do
 * not consume an attempt and leave the game unchanged. A valid guess is scored
 * against the (server-held) target, appended, and the status advances to `won`
 * on an all-green guess or `lost` after MAX_ATTEMPTS. Applying to a finished
 * game is a no-op.
 */
export function applyGuess(
  game: WordleGame,
  target: string,
  guess: string,
  dict: KurdishDictionary,
): ApplyResult {
  if (game.status !== 'playing') {
    return { ok: false, game, reason: 'wrong-length' };
  }

  const validation = validateGuess(guess, game.targetLength, dict);
  if (!validation.ok) return { ok: false, game, reason: validation.reason };

  const feedback = scoreGuess(target, validation.normalized);
  const correct = feedback.every((f) => f === 'green');
  const row: GuessRow = {
    guess: validation.normalized,
    letters: validation.letters,
    feedback,
    correct,
  };

  const guesses = [...game.guesses, row];
  const keyboard = mergeKeyboard(game.keyboard, row.letters, row.feedback);
  const status: GameStatus = correct ? 'won' : guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing';

  return { ok: true, game: { ...game, guesses, keyboard, status }, row };
}
