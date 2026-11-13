import { describe, expect, it } from 'vitest';
import { duration, pressedDim, spring } from './motion';

/** How far a spring with no bounce has come after `seconds`, 0 to 1: 1 − (1 + ωt)·e^(−ωt). */
function settled(s: { stiffness: number; mass: number }, seconds: number): number {
  const w = Math.sqrt(s.stiffness / s.mass);
  return 1 - (1 + w * seconds) * Math.exp(-w * seconds);
}

/** No bounce: critically damped, damping² = 4 · stiffness · mass. */
const bounceless = (s: { stiffness: number; damping: number; mass: number }): boolean => Math.abs(s.damping ** 2 - 4 * s.stiffness * s.mass) < 1e-6;

describe('the motion tokens', () => {
  it('keeps every time a piece of interface takes under 300 ms, as the website does', () => {
    expect(duration).toEqual({ quick: 120, base: 200, slow: 280, progress: 400, celebrate: 1600 });
    expect(Math.max(duration.quick, duration.base, duration.slow)).toBeLessThan(300);
  });

  it('gives the interface a spring of its own: no bounce, and there within 300 ms', () => {
    expect(bounceless(spring.chrome)).toBe(true);
    expect(settled(spring.chrome, 0.3)).toBeGreaterThan(0.99);
  });

  it('keeps the half-second springs for moments and for what a finger throws', () => {
    // Apple's smooth spring is still nine tenths of the way at 300 ms: right for a moment, late for a tab
    expect(settled(spring.standard, 0.3)).toBeLessThan(0.9);
    expect(bounceless(spring.standard)).toBe(true);
    expect(bounceless(spring.release)).toBe(false);
    expect(bounceless(spring.bouncy)).toBe(false);
  });

  it('has one dim for everything that fades under a finger', () => {
    expect(pressedDim).toBe(0.6);
  });
});
