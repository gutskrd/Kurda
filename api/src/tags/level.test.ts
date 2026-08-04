import { describe, expect, it } from 'vitest';
import { levelForXp, xpForLevel } from './level.js';

describe('levelForXp', () => {
  it('starts at level 1 and climbs on a square-root curve', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    expect(levelForXp(500)).toBe(3);
    expect(levelForXp(900)).toBe(4);
  });

  it('xpForLevel is the inverse threshold', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(4)).toBe(900);
    expect(levelForXp(xpForLevel(5))).toBe(5);
  });
});
