import { describe, expect, it } from 'vitest';
import { driftRatio, isDrifting } from './metrics.js';

describe('driftRatio', () => {
  it('is faucet over sink', () => {
    expect(driftRatio(150, 100)).toBeCloseTo(1.5, 5);
  });
  it('handles an empty sink', () => {
    expect(driftRatio(100, 0)).toBe(Infinity);
    expect(driftRatio(0, 0)).toBe(1);
  });
  it('treats a sink that refunds outweighed as no sink at all', () => {
    expect(driftRatio(100, -500)).toBe(Infinity);
    expect(driftRatio(0, -500)).toBe(1);
  });
});

describe('isDrifting', () => {
  it('is within tolerance near the target', () => {
    expect(isDrifting(1.1, 1, 0.2)).toBe(false);
    expect(isDrifting(0.85, 1, 0.2)).toBe(false);
  });
  it('alerts past the tolerance', () => {
    expect(isDrifting(1.3, 1, 0.2)).toBe(true);
    expect(isDrifting(0.7, 1, 0.2)).toBe(true);
  });
  it('always alerts on runaway (infinite) inflation', () => {
    expect(isDrifting(Infinity, 1)).toBe(true);
  });
});
