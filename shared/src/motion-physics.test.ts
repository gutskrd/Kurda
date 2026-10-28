import { describe, expect, it } from 'vitest';
import { APPLE_SPRINGS, DECELERATION, project, releaseVelocity, rubberBand, shouldDismiss, snapTarget, springFor } from './motion-physics.js';

describe('springFor', () => {
  it('turns a response and a damping fraction into stiffness and damping', () => {
    const s = springFor({ response: 0.5, dampingFraction: 0.825 });
    expect(s.stiffness).toBeCloseTo(157.9137, 4);
    expect(s.damping).toBeCloseTo(20.7345, 4);
    expect(s.mass).toBe(1);
  });

  it('reads a bounce as one less the damping fraction', () => {
    const s = springFor({ duration: 0.5, bounce: 0.3 });
    expect(s.stiffness).toBeCloseTo(157.9137, 4);
    expect(s.damping).toBeCloseTo(17.5929, 4);
    expect(springFor({ duration: 0.5, bounce: 0.3 })).toEqual(springFor({ response: 0.5, dampingFraction: 0.7 }));
  });

  it('reads a negative bounce as slower than critical', () => {
    expect(springFor({ duration: 0.5, bounce: -0.5 }).damping).toBeCloseTo(50.2655, 4);
  });

  it('refuses a spring that could not move', () => {
    expect(() => springFor({ response: 0, dampingFraction: 1 })).toThrow(RangeError);
    expect(() => springFor({ duration: 0.5, bounce: -1 })).toThrow(RangeError);
  });

  it('gives the named presets their numbers', () => {
    expect(springFor(APPLE_SPRINGS.smooth).damping).toBeCloseTo(25.1327, 4);
    expect(springFor(APPLE_SPRINGS.snappy).damping).toBeCloseTo(21.3628, 4);
    expect(springFor(APPLE_SPRINGS.bouncy).damping).toBeCloseTo(17.5929, 4);
    const drag = springFor(APPLE_SPRINGS.interactive);
    expect(drag.stiffness).toBeCloseTo(1754.5963, 4);
    expect(drag.damping).toBeCloseTo(72.0472, 4);
    // the default is critically damped: it arrives without overshooting
    const d = springFor(APPLE_SPRINGS.default);
    expect(d.stiffness).toBeCloseTo(130.5072, 4);
    expect(d.damping).toBeCloseTo(22.8479, 4);
    expect(d.damping / (2 * Math.sqrt(d.stiffness))).toBeCloseTo(1, 9);
  });
});

describe('rubberBand', () => {
  it('is nothing at the edge and gives less the further it goes', () => {
    expect(rubberBand(0, 400)).toBe(0);
    expect(rubberBand(100, 100)).toBeCloseTo(35.4839, 4);
    expect(rubberBand(50, 400)).toBeCloseTo(25.731, 3);
  });

  it('keeps the sign of the drag', () => {
    expect(rubberBand(-200, 400)).toBeCloseTo(-86.2745, 4);
  });

  it('never reaches the dimension', () => {
    const far = rubberBand(1e9, 100);
    expect(far).toBeLessThan(100);
    expect(far).toBeGreaterThan(99.9999);
  });

  it('is stiffer with a smaller constant', () => {
    expect(rubberBand(100, 100, 0.3)).toBeLessThan(rubberBand(100, 100));
  });

  it('gives nothing in a space with no size', () => {
    expect(rubberBand(50, 0)).toBe(0);
  });
});

describe('project', () => {
  it('carries a flick as far as a scroll view would', () => {
    expect(project(1000)).toBeCloseTo(499, 6);
    expect(project(500)).toBeCloseTo(249.5, 6);
    expect(project(-2000)).toBeCloseTo(-998, 6);
    expect(project(0)).toBe(0);
  });

  it('stops sooner at the fast rate', () => {
    expect(project(1000, DECELERATION.fast)).toBeCloseTo(99, 6);
  });
});

describe('snapTarget', () => {
  const stops = [0, 300];

  it('settles at the nearest stop when let go at rest', () => {
    expect(snapTarget(100, 0, stops)).toBe(0);
    expect(snapTarget(200, 0, stops)).toBe(300);
  });

  it('follows a flick past the stop the finger was nearer', () => {
    // 100 + 499 = 599: nearer 300
    expect(snapTarget(100, 1000, stops)).toBe(300);
    // 250 − 499: nearer 0
    expect(snapTarget(250, -1000, stops)).toBe(0);
  });

  it('stays where it is with no stops', () => {
    expect(snapTarget(42, 1000, [])).toBe(42);
  });
});

describe('shouldDismiss', () => {
  it('lets a sheet go when it is let go past half its height', () => {
    expect(shouldDismiss(150, 0, 400)).toBe(false);
    expect(shouldDismiss(201, 0, 400)).toBe(true);
  });

  it('lets a quick flick down close it from near the top', () => {
    // 50 + 199.6 = 249.6, past 200
    expect(shouldDismiss(50, 400, 400)).toBe(true);
    expect(shouldDismiss(50, 200, 400)).toBe(false);
  });

  it('keeps a sheet flicked back up from far down', () => {
    // 300 − 249.5 = 50.5
    expect(shouldDismiss(300, -500, 400)).toBe(false);
  });
});

describe('releaseVelocity', () => {
  it('measures the speed over the last tenth of a second, in points per second', () => {
    const samples = [
      { time: 0, position: 0 },
      { time: 50, position: 10 },
      { time: 100, position: 30 },
      { time: 150, position: 60 },
    ];
    // 50 → 150: 50 points in 100 ms
    expect(releaseVelocity(samples, 150)).toBe(500);
  });

  it('is nothing when the finger was held still before lifting', () => {
    expect(releaseVelocity([{ time: 0, position: 0 }, { time: 16, position: 40 }], 400)).toBe(0);
    expect(releaseVelocity([{ time: 0, position: 0 }], 0)).toBe(0);
  });

  it('keeps the direction: up is negative', () => {
    expect(releaseVelocity([{ time: 0, position: 100 }, { time: 20, position: 80 }], 20)).toBe(-1000);
  });
});
