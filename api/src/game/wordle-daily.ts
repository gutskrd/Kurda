/**
 * Wordle daily selection, XP, and statistics (KUR-304) — the pure, testable
 * pieces of the daily/practice service. Deterministic daily-word choice (same
 * word for everyone on a given UTC day, rotating every 24h with no near-term
 * repeats), the XP-by-guess-count table, and streak/stats aggregation. Storage,
 * HTTP, and the guess engine (#303) live elsewhere; this module has no I/O.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Word lengths (in Kurdish letters) per difficulty. */
export const DIFFICULTY_LENGTHS: Record<Difficulty, readonly number[]> = {
  easy: [4],
  medium: [5],
  hard: [6, 7, 8],
};

/** Count Kurdish letters (NFC, code-point aware) — matches the engine's view. */
function letterCount(word: string): number {
  return Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
}

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

/**
 * The daily word for a given UTC day + difficulty. Deterministic (so every
 * player gets the same word), and because it indexes a seeded permutation of
 * the pool by day, each word appears exactly once per `pool.length`-day cycle —
 * i.e. no repeat until the whole pool has been used. Returns null for an empty
 * pool (caller falls back a difficulty tier).
 */
export function pickDailyWord(
  pool: readonly string[],
  dayIndex: number,
  difficulty: Difficulty,
): string | null {
  if (pool.length === 0) return null;
  const shuffled = seededShuffle(pool, hashString(difficulty) ^ 0x9e3779b9);
  const idx = ((dayIndex % shuffled.length) + shuffled.length) % shuffled.length;
  return shuffled[idx] ?? null;
}

/** XP for a daily win by guess count; loss (or out-of-range) → participation XP. */
export const WORDLE_WIN_XP: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 50, 5: 40, 6: 30 };
export const WORDLE_LOSS_XP = 10;
/** Practice games award a reduced share and never affect the daily streak. */
export const PRACTICE_XP_FACTOR = 0.5;

export interface WordleXpInput {
  won: boolean;
  /** guesses used (1..6) when won */
  guesses: number;
  practice: boolean;
}

export function wordleXp({ won, guesses, practice }: WordleXpInput): number {
  const base = won ? (WORDLE_WIN_XP[guesses] ?? WORDLE_LOSS_XP) : WORDLE_LOSS_XP;
  return practice ? Math.round(base * PRACTICE_XP_FACTOR) : base;
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
 * Fold a finished game into the player's stats. Only **daily** games move the
 * streak: a win on the day after the last daily continues it, a win after a gap
 * resets it to 1, and a loss breaks it. Practice games update totals/XP but
 * never the streak. Returns the new stats plus the XP that was awarded (to post
 * through the XP system #030).
 */
export function applyGameResult(
  stats: WordleStats,
  result: WordleGameResult,
): { stats: WordleStats; xpAwarded: number } {
  const xpAwarded = wordleXp({ won: result.won, guesses: result.guesses, practice: !result.daily });

  const next: WordleStats = {
    ...stats,
    played: stats.played + 1,
    wins: stats.wins + (result.won ? 1 : 0),
    losses: stats.losses + (result.won ? 0 : 1),
    guessesInWins: stats.guessesInWins + (result.won ? result.guesses : 0),
    totalXp: stats.totalXp + xpAwarded,
    wordsLearned: stats.wordsLearned + (result.savedWord ? 1 : 0),
  };

  if (result.won && result.timeMs >= 0) {
    next.fastestMs = stats.fastestMs === null ? result.timeMs : Math.min(stats.fastestMs, result.timeMs);
  }

  if (result.daily && result.dayIndex !== undefined) {
    if (result.won) {
      const consecutive = stats.lastDailyDayIndex === result.dayIndex - 1;
      next.currentStreak = consecutive ? stats.currentStreak + 1 : 1;
    } else {
      next.currentStreak = 0;
    }
    next.longestStreak = Math.max(stats.longestStreak, next.currentStreak);
    next.lastDailyDayIndex = result.dayIndex;
  }

  return { stats: next, xpAwarded };
}
