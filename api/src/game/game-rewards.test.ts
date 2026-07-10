import { describe, expect, it } from 'vitest';
import { GAME_BASE_XP, GAME_WIN_BONUS_XP, gameXp, ratingDeltaPlaceholder } from './game-rewards.js';

describe('gameXp', () => {
  it('gives the base grant to everyone', () => {
    expect(gameXp(2)).toBe(GAME_BASE_XP);
    expect(gameXp(5)).toBe(GAME_BASE_XP);
  });
  it('adds the win bonus for 1st place', () => {
    expect(gameXp(1)).toBe(GAME_BASE_XP + GAME_WIN_BONUS_XP);
  });
});

describe('ratingDeltaPlaceholder', () => {
  it('is zero until KUR-061', () => {
    expect(ratingDeltaPlaceholder()).toBe(0);
  });
});
