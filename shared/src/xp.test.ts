import { describe, expect, it } from 'vitest';
import { ACCURACY_BONUS_XP, BASE_LESSON_XP, lessonXpRange } from './xp.js';

describe('lessonXpRange', () => {
  it('pays the base to the base and the whole bonus the first time through', () => {
    expect(lessonXpRange(false)).toEqual({ min: BASE_LESSON_XP, max: BASE_LESSON_XP + ACCURACY_BONUS_XP });
    expect(lessonXpRange(false)).toEqual({ min: 10, max: 20 });
  });

  it('pays a quarter of that again, rounded as the server rounds it', () => {
    expect(lessonXpRange(true)).toEqual({ min: 3, max: 5 });
  });
});
