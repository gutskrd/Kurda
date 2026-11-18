/**
 * Kurdish Peyvok engine, the pure core of the daily, practice and battle services: per-letter green/yellow/gray
 * feedback with the two-pass duplicate-letter rule, guess validation (exact length and dictionary), and the 6-attempt
 * game state. The game state never holds the target, so it is safe to send to clients.
 */
import { normalizeWord } from './rhyme.js';

export const MAX_ATTEMPTS = 6;

export type LetterFeedback = 'green' | 'yellow' | 'gray';

/** Split a word into its Kurdish letters (code-point aware, NFC-normalized). */
export function toLetters(word: string): string[] {
  return Array.from(normalizeWord(word));
}

/**
 * Score a guess with the two-pass duplicate-letter rule:
 * 1. mark exact-position matches green and consume them from the target's letter counts;
 * 2. mark each remaining guess letter yellow while that letter has unconsumed count, else gray.
 * So AAAA against MALA colours only the two real As, never all four.
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

/** Injected Kurdish dictionary; tests use a small set. */
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
  | { ok: false; game: WordleGame; reason: GuessRejection | 'finished' };

/**
 * Apply a guess. A rejected guess (wrong length, not a word) uses no attempt and leaves the game unchanged. A valid
 * guess is scored, appended, and moves the status to `won` on all green or `lost` after MAX_ATTEMPTS. A finished game
 * is unchanged and reported as `finished`.
 */
export function applyGuess(
  game: WordleGame,
  target: string,
  guess: string,
  dict: KurdishDictionary,
): ApplyResult {
  if (game.status !== 'playing') {
    return { ok: false, game, reason: 'finished' };
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
