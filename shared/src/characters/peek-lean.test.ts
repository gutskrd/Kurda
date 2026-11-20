import { describe, expect, it } from 'vitest';
import { PEEK_LEAN, leanFor, stepLean, tiltFromGravity, tiltFromOrientation, type LeanState } from './peek-lean.js';

const G = 9.81;
const RAD = Math.PI / 180;

describe('reading the phone’s tilt', () => {
  it('reads a phone held upright and turned like a wheel, and one lying nearly flat with a side dipped, the same way', () => {
    expect(tiltFromGravity(0, -G, 0)).toBeCloseTo(0);
    expect(tiltFromGravity(G * Math.sin(20 * RAD), -G * Math.cos(20 * RAD), 0)).toBeCloseTo(20);
    expect(tiltFromGravity(-G * Math.sin(20 * RAD), -G * Math.cos(20 * RAD), 0)).toBeCloseTo(-20);
    expect(tiltFromGravity(G * Math.sin(15 * RAD), 0, -G * Math.cos(15 * RAD))).toBeCloseTo(15);
    expect(tiltFromGravity(0, 0, 0)).toBeNull();
    expect(tiltFromGravity(Number.NaN, 1, 1)).toBeNull();
  });

  it('reads a browser’s orientation the same way, upright or flat, and turned with the screen', () => {
    expect(tiltFromOrientation(90, 0)).toBeCloseTo(0);
    expect(tiltFromOrientation(0, 0)).toBeCloseTo(0);
    expect(tiltFromOrientation(0, 15)).toBeCloseTo(15);
    expect(tiltFromOrientation(0, -15)).toBeCloseTo(-15);
    expect(tiltFromOrientation(40, 12)).toBeGreaterThan(0);
    // shown sideways, the screen's right is the device's bottom edge; upside down, left and right swap
    expect(tiltFromOrientation(15, 0, 90)).toBeCloseTo(15);
    expect(tiltFromOrientation(15, 0, -90)).toBeCloseTo(-15);
    expect(tiltFromOrientation(10, 25, 180)).toBeCloseTo(-(tiltFromOrientation(10, 25, 0) ?? 0));
    expect(tiltFromOrientation(null, 10)).toBeNull();
  });
});

describe('how far Hevalo leans', () => {
  it('ignores a hand’s small tilt, follows a real one either way alike, and never passes his limit', () => {
    expect(leanFor(0)).toBe(0);
    expect(leanFor(PEEK_LEAN.deadDeg)).toBe(0);
    expect(leanFor(-PEEK_LEAN.deadDeg * 0.9)).toBe(0);
    expect(leanFor(20)).toBeCloseTo(-leanFor(-20));
    let last = 0;
    for (let tilt = 2; tilt <= 90; tilt += 2) {
      const lean = leanFor(tilt);
      expect(lean).toBeGreaterThan(last);
      expect(lean).toBeLessThan(PEEK_LEAN.maxDeg);
      last = lean;
    }
    expect(leanFor(20)).toBeGreaterThan(5);
    expect(leanFor(90)).toBeGreaterThan(PEEK_LEAN.maxDeg * 0.95);
  });

  it('swings over on the spring, past the mark only a little, and settles', () => {
    let state: LeanState = { angle: 0, speed: 0 };
    let most = 0;
    let settledAt = -1;
    for (let frame = 1; frame <= 120; frame++) {
      const next = stepLean(state, 8, 1 / 60);
      state = next;
      most = Math.max(most, next.angle);
      if (next.settled && settledAt < 0) settledAt = frame;
    }
    expect(state.angle).toBe(8);
    expect(most).toBeLessThan(8 * 1.08);
    expect(most).toBeGreaterThan(8);
    expect(settledAt).toBeGreaterThan(20);
    expect(settledAt).toBeLessThan(90);
  });

  it('is not thrown by a stalled frame', () => {
    const next = stepLean({ angle: -8, speed: 0 }, 8, 2);
    expect(Math.abs(next.angle)).toBeLessThan(PEEK_LEAN.maxDeg * 1.2);
    expect(stepLean({ angle: 3, speed: 0 }, 3, -1)).toEqual({ angle: 3, speed: 0, settled: true });
  });
});
