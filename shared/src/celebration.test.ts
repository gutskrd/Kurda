import { describe, expect, it } from 'vitest';
import { BURST, CELEBRATE_MS, burstPlan, celebrationEndMs, celebrationPlan } from './celebration.js';

describe('celebrationPlan', () => {
  it('is over inside 1.6 s, felt as the art lands, and the words come after it', () => {
    const plan = celebrationPlan(false);
    expect(celebrationEndMs(plan)).toBeLessThanOrEqual(CELEBRATE_MS);
    expect(CELEBRATE_MS).toBe(1600);
    expect(plan.hapticAtMs).toBeGreaterThan(0);
    expect(plan.hapticAtMs).toBeLessThan(plan.artMs);
    expect(plan.detailsDelayMs).toBeGreaterThan(plan.hapticAtMs);
    expect(plan.travel).toBe(true);
  });

  it('is a short fade under Reduce Motion, with nothing thrown — and still felt', () => {
    const plan = celebrationPlan(true);
    expect(plan.travel).toBe(false);
    expect(plan.burstMs).toBe(0);
    expect(plan.ringMs).toBe(0);
    expect(celebrationEndMs(plan)).toBeLessThanOrEqual(200);
    expect(plan.hapticAtMs).toBe(0);
  });
});

describe('burstPlan', () => {
  it('is the same every time for the same moment', () => {
    expect(burstPlan(14, 7, 4, 120)).toEqual(burstPlan(14, 7, 4, 120));
    expect(burstPlan(14, 7, 4, 120)).not.toEqual(burstPlan(14, 8, 4, 120));
  });

  it('throws the flecks all the way round, within reach, each gone before the burst ends', () => {
    const plan = burstPlan(BURST.tier, 3, 3, 150);
    expect(plan).toHaveLength(BURST.tier);
    expect(plan.some((f) => f.dx < -40)).toBe(true);
    expect(plan.some((f) => f.dx > 40)).toBe(true);
    for (const f of plan) {
      expect(Math.hypot(f.dx, f.dy)).toBeLessThanOrEqual(150 * 1.25);
      expect(f.start).toBeGreaterThanOrEqual(0);
      expect(f.end).toBeLessThanOrEqual(1);
      expect(f.end - f.start).toBeGreaterThan(0.5);
      expect(f.colour).toBeLessThan(3);
    }
  });

  it('is light: never a screenful', () => {
    expect(Math.max(...Object.values(BURST))).toBeLessThanOrEqual(24);
    expect(BURST.lesson).toBeLessThan(BURST.tier);
  });
});
