import { describe, expect, it } from 'vitest';
import {
  PEEK_LEAN,
  PEEK_TURN,
  TURN_SPRING,
  leanFor,
  stepLean,
  swingAngle,
  tiltFromGravity,
  tiltFromOrientation,
  turnFor,
  turnForMotion,
  turnForTilt,
  type LeanState,
} from './peek-lean.js';

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

describe('how far his head turns as the phone swings round', () => {
  /** Swings the phone at `rate` degrees a second for `seconds`, in readings 40 ms apart, from `from`. */
  const swingFor = (from: number, rate: number, seconds: number): number => {
    let angle = from;
    for (let t = 0; t < seconds - 1e-9; t += 0.04) angle = swingAngle(angle, rate, 0.04);
    return angle;
  };

  it('turns toward the side the phone swings back on, easing into a full turn, and never past it', () => {
    const swung = swingFor(0, 50, 0.5);
    expect(swung).toBeGreaterThan(24);
    expect(turnFor(swung)).toBeGreaterThan(0.75);
    expect(turnFor(swung)).toBeLessThan(1);
    expect(turnFor(-swung)).toBeCloseTo(-turnFor(swung));
    expect(swingFor(0, 400, 1)).toBe(PEEK_TURN.maxDeg);
  });

  it('faces us again when the phone swings back, not past us, even after holding it round a while', () => {
    const held = swingFor(swingFor(0, 50, 0.5), 0, 1.5);
    const back = swingFor(held, -50, 0.5);
    expect(Math.abs(turnFor(back))).toBeLessThan(0.15);
  });

  it('takes a hand’s drift for stillness, and slowly takes a new way of holding the phone as the middle', () => {
    expect(swingFor(0, PEEK_TURN.stillRate * 0.9, 2)).toBe(0);
    const held = swingFor(swingFor(0, 50, 0.5), 0, 30);
    expect(Math.abs(turnFor(held))).toBeLessThan(0.15);
    expect(swingAngle(10, null, 0.04)).toBeLessThan(10);
  });

  it('turns on a spring that follows without a wobble', () => {
    let state: LeanState = { angle: 0, speed: 0 };
    let most = 0;
    for (let frame = 0; frame < 90; frame++) {
      state = stepLean(state, 1, 1 / 60, TURN_SPRING);
      most = Math.max(most, state.angle);
    }
    expect(state.angle).toBe(1);
    expect(most).toBeLessThan(1.03);
  });
});

describe('how far his head turns as the phone tilts', () => {
  it('turns toward the side going down, none while it is nearly level, easing into a full turn and never past it', () => {
    expect(turnForTilt(PEEK_LEAN.deadDeg * 0.8)).toBe(0);
    expect(turnForTilt(10)).toBeGreaterThan(0.3);
    expect(turnForTilt(-10)).toBeCloseTo(-turnForTilt(10));
    expect(turnForTilt(40)).toBeGreaterThan(0.9);
    expect(turnForTilt(90)).toBeLessThanOrEqual(1);
  });

  it('adds the tilt to the swing, a swing back undoing a tilt, and never past a full turn together', () => {
    expect(turnForMotion(0, 12)).toBeCloseTo(turnForTilt(12));
    expect(turnForMotion(-30, 12)).toBeLessThan(turnForTilt(12));
    expect(turnForMotion(60, 60)).toBe(1);
    expect(turnForMotion(-60, -60)).toBe(-1);
  });
});
