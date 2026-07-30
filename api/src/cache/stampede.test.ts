import { describe, expect, it } from 'vitest';
import { applyJitter, shouldEarlyRecompute } from './stampede.js';

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

describe('shouldEarlyRecompute', () => {
  it('always recomputes once expired', () => {
    expect(shouldEarlyRecompute(0, 100)).toBe(true);
    expect(shouldEarlyRecompute(-5, 100)).toBe(true);
  });

  it('recomputes near expiry, not far from it (deterministic RNG)', () => {
    // rng = e^-1 ⇒ -ln(rng) = 1 ⇒ gap = recomputeMs*beta
    const rng = () => Math.exp(-1);
    expect(shouldEarlyRecompute(50, 100, 1, rng)).toBe(true); // gap 100 ≥ remaining 50
    expect(shouldEarlyRecompute(150, 100, 1, rng)).toBe(false); // gap 100 < remaining 150
  });
});
