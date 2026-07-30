import { describe, expect, it } from 'vitest';
import { DECAY_STRENGTH, GOLD_STRENGTH, isUnlocked, skillState } from './node-state.js';

describe('skillState', () => {
  it('is locked when not unlocked, regardless of the rest', () => {
    expect(skillState({ unlocked: false, completed: false, strength: 0 })).toBe('locked');
    expect(skillState({ unlocked: false, completed: true, strength: 100 })).toBe('locked');
  });

  it('is unlocked when available but not finished', () => {
    expect(skillState({ unlocked: true, completed: false, strength: 50 })).toBe('unlocked');
  });

  it('is gold when completed and very strong', () => {
    expect(skillState({ unlocked: true, completed: true, strength: GOLD_STRENGTH })).toBe('gold');
  });

  it('is decayed when completed but strength slipped', () => {
    expect(skillState({ unlocked: true, completed: true, strength: DECAY_STRENGTH - 1 })).toBe('decayed');
  });

  it('is plain completed in between', () => {
    expect(skillState({ unlocked: true, completed: true, strength: 60 })).toBe('completed');
  });
});

describe('isUnlocked', () => {
  it('unlocks the first skill', () => {
    expect(isUnlocked(1, false, 0)).toBe(true);
  });
  it('unlocks when the previous skill is completed', () => {
    expect(isUnlocked(3, true, 0)).toBe(true);
  });
  it('unlocks when tested out through the level', () => {
    expect(isUnlocked(3, false, 3)).toBe(true);
    expect(isUnlocked(4, false, 3)).toBe(false);
  });
});
