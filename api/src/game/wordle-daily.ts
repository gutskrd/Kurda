/**
 * Peyvok daily selection, XP and statistics, pure: deterministic daily words (the same for everyone on a UTC day, no
 * near-term repeats), the XP-by-guesses table, and streak and stats aggregation. Storage, HTTP and the guess engine
 * live elsewhere.
 */
import { letterCount } from '@kurda/shared';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Word lengths (in Kurdish letters) per difficulty. */
export const DIFFICULTY_LENGTHS: Record<Difficulty, readonly number[]> = {
  easy: [4],
  medium: [5],
  hard: [6, 7, 8],
};

/** Keep only words whose letter-length fits the difficulty. */
export function filterByDifficulty(words: Iterable<string>, difficulty: Difficulty): string[] {
  const lengths = new Set(DIFFICULTY_LENGTHS[difficulty]);
  return [...words].filter((w) => lengths.has(letterCount(w)));
}

/** UTC day index (days since the Unix epoch). Defines the shared "day". */
export function utcDayIndex(when: Date | number = Date.now()): number {
  const ms = typeof when === 'number' ? when : when.getTime();
  return Math.floor(ms / 86_400_000);
}

/** djb2 string hash → 32-bit unsigned; seeds the per-difficulty permutation. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** Deterministic Fisher–Yates shuffle from a numeric seed (LCG). */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  let s = seed >>> 0 || 1;
  const rand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = arr[i];
    const b = arr[j];
    if (a !== undefined && b !== undefined) {
      arr[i] = b;
      arr[j] = a;
    }
  }
  return arr;
}

/** A daily word is not set again within this many days, while the pool is big enough to allow it. */
export const DAILY_REPEAT_DAYS = 180;

/**
 * How many days a new daily word must not repeat: half a year, or one day less than the pool lasts when it is smaller
 * (a 120-word pool can go 119 days without a repeat).
 */
export function dailyRepeatWindow(poolSize: number): number {
  return Math.max(0, Math.min(DAILY_REPEAT_DAYS, poolSize - 1));
}

/**
 * The daily word for a UTC day and difficulty. Deterministic, and since it indexes a seeded permutation of the pool by
 * day, each word appears once per `pool.length`-day cycle. Null for an empty pool (the caller falls back a tier).
 *
 * `recent` are words set lately (the stored `wordle_daily` schedule): the pick walks past them, so a pool that changed
 * size (reordering the permutation) never brings back a recent word. If every word is recent it takes the day's own
 * word anyway.
 */
export function pickDailyWord(
  pool: readonly string[],
  dayIndex: number,
  difficulty: Difficulty,
  recent: ReadonlySet<string> = new Set(),
): string | null {
  if (pool.length === 0) return null;
  const shuffled = seededShuffle(pool, hashString(difficulty) ^ 0x9e3779b9);
  const idx = ((dayIndex % shuffled.length) + shuffled.length) % shuffled.length;
  for (let step = 0; step < shuffled.length; step++) {
    const word = shuffled[(idx + step) % shuffled.length]!;
    if (!recent.has(word)) return word;
  }
  return shuffled[idx] ?? null;
}

export interface WordleStats {
  played: number;
  wins: number;
  losses: number;
  currentStreak: number;
  longestStreak: number;
  /** total guesses across *won* games — averaged over wins */
  guessesInWins: number;
  fastestMs: number | null;
  /** XP the game paid while a game played alone still paid any: kept as it stood, and never added to */
  totalXp: number;
  wordsLearned: number;
  /** last daily day index seen, to detect consecutive-day streaks */
  lastDailyDayIndex: number | null;
}

export function emptyStats(): WordleStats {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    longestStreak: 0,
    guessesInWins: 0,
    fastestMs: null,
    totalXp: 0,
    wordsLearned: 0,
    lastDailyDayIndex: null,
  };
}

export function winPercentage(stats: WordleStats): number {
  return stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
}

export function averageGuesses(stats: WordleStats): number {
  return stats.wins === 0 ? 0 : stats.guessesInWins / stats.wins;
}

export interface WordleGameResult {
  won: boolean;
  /** guesses used (1..6 on a win; 6 on a loss) */
  guesses: number;
  timeMs: number;
  /** true for the daily puzzle (affects streak); false for practice */
  daily: boolean;
  /** the UTC day index of a daily game — required when daily is true */
  dayIndex?: number;
  /** the player saved the word to their vocabulary from this game */
  savedWord?: boolean;
}

/**
 * Fold a finished game into the player's stats. Only **daily** games move the streak: a win the day after the last
 * daily continues it, a win after a gap resets it to 1, and a loss breaks it. Practice updates totals only. No XP
 * either way (Peyvok is played alone).
 *
 * Each difficulty has a daily word, but a day counts once: the first daily finished that day moves the streak and
 * others count in totals only, so a second word the same day cannot reset the streak or undo a morning win.
 */
export function applyGameResult(stats: WordleStats, result: WordleGameResult): { stats: WordleStats } {
  const next: WordleStats = {
    ...stats,
    played: stats.played + 1,
    wins: stats.wins + (result.won ? 1 : 0),
    losses: stats.losses + (result.won ? 0 : 1),
    guessesInWins: stats.guessesInWins + (result.won ? result.guesses : 0),
    wordsLearned: stats.wordsLearned + (result.savedWord ? 1 : 0),
  };

  if (result.won && result.timeMs >= 0) {
    next.fastestMs = stats.fastestMs === null ? result.timeMs : Math.min(stats.fastestMs, result.timeMs);
  }

  const dayAlreadyCounted = result.daily && result.dayIndex !== undefined && stats.lastDailyDayIndex === result.dayIndex;
  if (result.daily && result.dayIndex !== undefined && !dayAlreadyCounted) {
    if (result.won) {
      const consecutive = stats.lastDailyDayIndex === result.dayIndex - 1;
      next.currentStreak = consecutive ? stats.currentStreak + 1 : 1;
    } else {
      next.currentStreak = 0;
    }
    next.longestStreak = Math.max(stats.longestStreak, next.currentStreak);
    next.lastDailyDayIndex = result.dayIndex;
  }

  return { stats: next };
}
