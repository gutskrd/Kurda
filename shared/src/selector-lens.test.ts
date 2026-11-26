import { describe, expect, it } from 'vitest';
import { SELECTOR_LENS, lensAt, planSwitch, retarget } from './selector-lens.js';

describe('a selection moving', () => {
  it('goes rest, lifting, moving, settling and rest again, the tint out while the lens is up', () => {
    const move = planSwitch(1, 2, 0);
    const phases = [0, 30, 120, 330, 600].map((t) => lensAt(move, t).phase);
    expect(phases).toEqual(['lifting', 'lifting', 'moving', 'settling', 'rest']);
    expect(lensAt(move, 0).tint).toBe(1);
    expect(lensAt(move, 150).tint).toBe(0);
    expect(lensAt(move, 150).scale).toBeCloseTo(SELECTOR_LENS.lensScale, 5);
    expect(lensAt(move, 150).lens).toBe(1);
    const rest = lensAt(move, 600);
    expect(rest).toMatchObject({ phase: 'rest', at: 2, scale: 1, stretch: 0, tint: 1, lens: 0, squash: 1, lead: 0 });
  });

  it('keeps the timing measured from the reference: most of the way by 200 ms, settled within half a second', () => {
    const move = planSwitch(0, 1, 0);
    expect(lensAt(move, 33).at).toBeGreaterThan(0.08);
    // The reference is 0.81 at 183 ms and 0.91 at 217.
    expect(lensAt(move, 200).at).toBeGreaterThan(0.84);
    expect(lensAt(move, 50).at).toBeGreaterThan(0.3);
    expect(Math.max(...[220, 260, 300, 340].map((t) => lensAt(move, t).at))).toBeLessThan(1.06);
    expect(lensAt(move, 420).tint).toBe(1);
  });

  it('stretches with its speed and not at either end', () => {
    const move = planSwitch(0, 3, 0);
    expect(lensAt(move, 0).stretch).toBe(0);
    expect(lensAt(move, 90).stretch).toBeGreaterThan(0.2);
    expect(lensAt(move, 420).stretch).toBeLessThan(0.02);
  });

  it('sends a move under way somewhere else from where it is, at its speed, with its lens still up', () => {
    const first = planSwitch(0, 3, 0);
    const mid = lensAt(first, 100);
    const next = retarget(first, 1, 100);
    const right = lensAt(next, 100);
    expect(right.at).toBeCloseTo(mid.at, 6);
    expect(right.velocity).toBeCloseTo(mid.velocity, 3);
    expect(right.lens).toBe(1);
    expect(lensAt(next, 700)).toMatchObject({ phase: 'rest', at: 1 });
  });

  it('starts afresh from rest, and stays put when sent where it already is', () => {
    const done = planSwitch(0, 2, 0);
    expect(retarget(done, 1, 1000)).toEqual(planSwitch(2, 1, 1000));
    expect(planSwitch(2, 1, 0).velocity).toBeLessThan(0);
    expect(lensAt(planSwitch(2, 2, 0), 10).phase).toBe('rest');
  });
});
