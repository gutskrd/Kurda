import { describe, expect, it } from 'vitest';
import {
  applyGameResult,
  averageGuesses,
  DIFFICULTY_LENGTHS,
  emptyStats,
  filterByDifficulty,
  pickDailyWord,
  PRACTICE_XP_FACTOR,
  utcDayIndex,
  winPercentage,
  wordleXp,
  WORDLE_LOSS_XP,
  WORDLE_WIN_XP,
  type WordleGameResult,
} from './wordle-daily.js';

describe('filterByDifficulty', () => {
  const words = ['mala', 'gulan', 'pirtûk', 'kerpîç', 'çîrokek', 'av'];
  it('keeps only the right letter-lengths per difficulty', () => {
    expect(filterByDifficulty(words, 'easy')).toEqual(['mala']); // 4 letters
    expect(filterByDifficulty(words, 'medium')).toEqual(['gulan']); // 5 letters
    expect(filterByDifficulty(words, 'hard').sort()).toEqual(['kerpîç', 'pirtûk', 'çîrokek'].sort()); // 6-8
  });

  it('counts Kurdish letters (î/ç), not code units', () => {
    // kerpîç is 6 letters → hard
    expect(DIFFICULTY_LENGTHS.hard).toContain(6);
    expect(filterByDifficulty(['kerpîç'], 'hard')).toEqual(['kerpîç']);
  });
});

describe('utcDayIndex', () => {
  it('is stable within a UTC day and increments across the boundary', () => {
    const day = utcDayIndex(Date.UTC(2026, 0, 1, 3, 0, 0));
    expect(utcDayIndex(Date.UTC(2026, 0, 1, 23, 59, 59))).toBe(day);
    expect(utcDayIndex(Date.UTC(2026, 0, 2, 0, 0, 1))).toBe(day + 1);
  });
});

describe('pickDailyWord', () => {
  const pool = ['aa', 'bb', 'cc', 'dd', 'ee'];

  it('is deterministic — same day + difficulty → same word for everyone', () => {
    expect(pickDailyWord(pool, 100, 'medium')).toBe(pickDailyWord(pool, 100, 'medium'));
  });

  it('rotates across days and uses every word once before repeating', () => {
    const seen = new Set<string>();
    for (let d = 0; d < pool.length; d++) {
      const w = pickDailyWord(pool, d, 'medium');
      expect(w).not.toBeNull();
      if (w) seen.add(w);
    }
    expect(seen.size).toBe(pool.length); // full cycle, no repeat within the window
    // the cycle repeats after pool.length days
    expect(pickDailyWord(pool, pool.length, 'medium')).toBe(pickDailyWord(pool, 0, 'medium'));
  });

  it('returns null for an empty pool', () => {
    expect(pickDailyWord([], 5, 'easy')).toBeNull();
  });

  it('handles negative day indices without going out of range', () => {
    expect(pickDailyWord(pool, -3, 'hard')).not.toBeNull();
  });
});

describe('wordleXp', () => {
  it('awards the daily win table by guess count', () => {
    expect(wordleXp({ won: true, guesses: 1, practice: false })).toBe(WORDLE_WIN_XP[1]);
    expect(wordleXp({ won: true, guesses: 6, practice: false })).toBe(WORDLE_WIN_XP[6]);
    expect(wordleXp({ won: true, guesses: 3, practice: false })).toBe(60);
  });

  it('gives participation XP for a loss', () => {
    expect(wordleXp({ won: false, guesses: 6, practice: false })).toBe(WORDLE_LOSS_XP);
  });

  it('reduces practice XP by the practice factor', () => {
    expect(wordleXp({ won: true, guesses: 1, practice: true })).toBe(
      Math.round(WORDLE_WIN_XP[1]! * PRACTICE_XP_FACTOR),
    );
  });

  it('rewards fewer guesses more', () => {
    const one = wordleXp({ won: true, guesses: 1, practice: false });
    const five = wordleXp({ won: true, guesses: 5, practice: false });
    expect(one).toBeGreaterThan(five);
  });
});

describe('applyGameResult — stats + streak', () => {
  const dailyWin = (dayIndex: number, guesses = 3, timeMs = 4000): WordleGameResult => ({
    won: true,
    guesses,
    timeMs,
    daily: true,
    dayIndex,
  });

  it('increments played/wins and accumulates XP', () => {
    const { stats, xpAwarded } = applyGameResult(emptyStats(), dailyWin(10));
    expect(stats.played).toBe(1);
    expect(stats.wins).toBe(1);
    expect(xpAwarded).toBe(60);
    expect(stats.totalXp).toBe(60);
  });

  it('continues the streak on consecutive daily wins', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10)).stats;
    s = applyGameResult(s, dailyWin(11)).stats;
    s = applyGameResult(s, dailyWin(12)).stats;
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });

  it('resets the streak to 1 after a gap, keeping the longest', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10)).stats;
    s = applyGameResult(s, dailyWin(11)).stats; // streak 2
    s = applyGameResult(s, dailyWin(20)).stats; // gap → streak 1
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2);
  });

  it('breaks the streak on a daily loss', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10)).stats;
    s = applyGameResult(s, { won: false, guesses: 6, timeMs: 9000, daily: true, dayIndex: 11 }).stats;
    expect(s.currentStreak).toBe(0);
    expect(s.losses).toBe(1);
    expect(s.longestStreak).toBe(1);
  });

  it('does not let practice games affect the streak', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10)).stats; // streak 1
    s = applyGameResult(s, { won: true, guesses: 2, timeMs: 3000, daily: false }).stats;
    expect(s.currentStreak).toBe(1);
    expect(s.played).toBe(2);
  });

  it('tracks fastest solve and average guesses over wins', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10, 4, 8000)).stats;
    s = applyGameResult(s, dailyWin(11, 2, 3000)).stats;
    expect(s.fastestMs).toBe(3000);
    expect(averageGuesses(s)).toBe(3); // (4 + 2) / 2
  });

  it('computes win percentage over all games', () => {
    let s = emptyStats();
    s = applyGameResult(s, dailyWin(10)).stats;
    s = applyGameResult(s, { won: false, guesses: 6, timeMs: 9000, daily: true, dayIndex: 11 }).stats;
    expect(winPercentage(s)).toBe(50);
  });

  it('counts words learned when saved to vocabulary', () => {
    const { stats } = applyGameResult(emptyStats(), { ...dailyWin(10), savedWord: true });
    expect(stats.wordsLearned).toBe(1);
  });
});
