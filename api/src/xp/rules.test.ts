import { describe, expect, it } from 'vitest';
import {
  FULL_RATE_XP,
  GAME_XP_LEAGUE_CAP,
  HALF_RATE_XP,
  countedCurve,
  countedXp,
  isGameSource,
  isLearningSource,
  lessonCompletionXp,
  lessonXp,
  repeatsToday,
} from './rules.js';

const fresh = { gameToday: 0, otherToday: 0 };

describe('lesson repeats', () => {
  it('pays in full the first time and a quarter for a repeat', () => {
    expect(lessonXp(1, { priorCompletions: 0, priorCompletionsToday: 0 })).toBe(lessonCompletionXp(1, false));
    expect(lessonXp(1, { priorCompletions: 3, priorCompletionsToday: 0 })).toBe(lessonCompletionXp(1, true));
  });

  it('pays two repeats a day and nothing for the third', () => {
    // done once on an earlier day, then twice today: those two were repeats
    expect(lessonXp(1, { priorCompletions: 1, priorCompletionsToday: 0 })).toBe(5);
    expect(lessonXp(1, { priorCompletions: 2, priorCompletionsToday: 1 })).toBe(5);
    expect(lessonXp(1, { priorCompletions: 3, priorCompletionsToday: 2 })).toBe(0);
  });

  it('does not count the first time through as a repeat when it was today', () => {
    expect(repeatsToday({ priorCompletions: 1, priorCompletionsToday: 1 })).toBe(0);
    expect(repeatsToday({ priorCompletions: 3, priorCompletionsToday: 3 })).toBe(2);
    expect(repeatsToday({ priorCompletions: 5, priorCompletionsToday: 2 })).toBe(2);
    // first today, then two repeats today: the next pays nothing
    expect(lessonXp(1, { priorCompletions: 3, priorCompletionsToday: 3 })).toBe(0);
    // first today and one repeat: one more still pays
    expect(lessonXp(1, { priorCompletions: 2, priorCompletionsToday: 2 })).toBe(5);
  });
});

describe('what counts for the league', () => {
  it('knows learning from games', () => {
    expect(isLearningSource('lesson_complete')).toBe(true);
    expect(isLearningSource('story')).toBe(true);
    expect(isGameSource('wordle_battle')).toBe(true);
    expect(isGameSource('practice_complete')).toBe(false);
    expect(isLearningSource('race')).toBe(false);
  });

  it('counts a day in full up to 300, at half to 600, at a fifth after', () => {
    expect(countedCurve(300)).toBe(300);
    expect(countedCurve(600)).toBe(450);
    expect(countedCurve(1100)).toBe(550);
    expect(countedXp('lesson_complete', 20, fresh)).toBe(20);
    expect(countedXp('lesson_complete', 20, { gameToday: 0, otherToday: FULL_RATE_XP })).toBe(10);
    expect(countedXp('lesson_complete', 20, { gameToday: 0, otherToday: HALF_RATE_XP })).toBe(4);
    // an award across the edge counts each side at its own rate
    expect(countedXp('lesson_complete', 20, { gameToday: 0, otherToday: 290 })).toBe(15);
  });

  it('caps game XP at 60 a day across every game', () => {
    expect(countedXp('wordle_battle', 100, fresh)).toBe(GAME_XP_LEAGUE_CAP);
    expect(countedXp('rhyme_match', 80, { gameToday: 100, otherToday: 0 })).toBe(0);
    expect(countedXp('race', 30, { gameToday: 50, otherToday: 0 })).toBe(10);
    // learning after a game evening still counts in full (up to the daily curve)
    expect(countedXp('lesson_complete', 20, { gameToday: 400, otherToday: 0 })).toBe(20);
  });

  it('gives the same day total however the day is split', () => {
    const awards: Array<[string, number]> = [
      ['lesson_complete', 20],
      ['wordle_battle', 100],
      ['practice_complete', 7],
      ...Array.from({ length: 40 }, (): [string, number] => ['lesson_complete', 19]),
      ['race', 30],
    ];
    let game = 0;
    let other = 0;
    let total = 0;
    for (const [source, amount] of awards) {
      total += countedXp(source, amount, { gameToday: game, otherToday: other });
      if (isGameSource(source)) game += amount;
      else other += amount;
    }
    expect(total).toBe(Math.floor(countedCurve(other + Math.min(game, GAME_XP_LEAGUE_CAP))));
  });

  it('counts nothing for nothing', () => {
    expect(countedXp('lesson_complete', 0, fresh)).toBe(0);
    expect(countedXp('lesson_complete', -5, fresh)).toBe(0);
  });
});
