import { describe, expect, it } from 'vitest';
import { applyJitter } from './stampede.js';

describe('applyJitter', () => {
  it('stays within ±ratio and never below 1', () => {
    expect(applyJitter(100, 0.1, () => 0.5)).toBe(100); // midpoint = no change
    expect(applyJitter(100, 0.1, () => 0)).toBe(90); // -ratio
    expect(applyJitter(100, 0.1, () => 1)).toBe(110); // +ratio
    expect(applyJitter(1, 0.5, () => 0)).toBe(1); // clamps to >= 1
  });

  it('disabled when ratio or ttl is non-positive', () => {
    expect(applyJitter(60, 0)).toBe(60);
    expect(applyJitter(0, 0.1)).toBe(0);
  });
});
