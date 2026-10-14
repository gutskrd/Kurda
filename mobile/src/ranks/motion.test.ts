import { describe, expect, it } from 'vitest';
import { FLECKS, confettiPlan, countUpMs, revealPlan } from './motion';

describe('confettiPlan', () => {
  it('is the same every time for the same moment', () => {
    expect(confettiPlan(14, 7, 4)).toEqual(confettiPlan(14, 7, 4));
    expect(confettiPlan(14, 7, 4)).not.toEqual(confettiPlan(14, 8, 4));
  });

  it('spreads the flecks across the whole width, falling once and slowly', () => {
    const plan = confettiPlan(FLECKS.tier, 3, 4);
    expect(plan).toHaveLength(FLECKS.tier);
    const xs = plan.map((f) => f.x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(0.15);
    expect(xs[xs.length - 1]).toBeGreaterThan(0.85);
    for (const f of plan) {
      expect(f.duration).toBeGreaterThanOrEqual(2200);
      expect(f.colour).toBeLessThan(4);
      expect(f.fall).toBeLessThanOrEqual(1);
    }
  });

  it('is calm: a division is a nod, never a screenful', () => {
    expect(FLECKS.division).toBeLessThan(FLECKS.tier);
    expect(Math.max(...Object.values(FLECKS))).toBeLessThanOrEqual(24);
  });
});

describe('revealPlan', () => {
  it('is a plain fade under Reduce Motion: no rays, no flecks, no tick', () => {
    expect(revealPlan(true)).toEqual({ emblemMs: 200, textDelayMs: 0, hapticAtMs: null, confetti: false, rays: false });
  });

  it('lands the light tick as the emblem lands', () => {
    const plan = revealPlan(false);
    expect(plan.hapticAtMs).not.toBeNull();
    expect(plan.hapticAtMs!).toBeLessThan(plan.emblemMs);
    expect(plan.confetti && plan.rays).toBe(true);
  });
});

describe('countUpMs', () => {
  it('is quick for a small change and never drags for a big one', () => {
    expect(countUpMs(0, false)).toBe(0);
    expect(countUpMs(6, false)).toBeLessThan(countUpMs(40, false));
    expect(countUpMs(400, false)).toBe(1400);
    expect(countUpMs(-6, false)).toBe(countUpMs(6, false));
  });

  it('does not count at all under Reduce Motion', () => {
    expect(countUpMs(24, true)).toBe(0);
  });
});
