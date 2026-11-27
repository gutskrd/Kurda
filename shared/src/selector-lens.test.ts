import { describe, expect, it } from 'vitest';
import { SELECTOR_LENS, lensAt, magnifier, planSwitch, retarget } from './selector-lens.js';

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

  it('keeps the timing measured from the reference: rising in place, then most of the way by 200 ms, settled within half a second', () => {
    const move = planSwitch(0, 1, 0);
    expect(lensAt(move, 33).at).toBe(0);
    expect(lensAt(move, 33).stretch).toBe(0);
    // The reference is about two thirds of the way at 100 ms and nine tenths at 200.
    expect(lensAt(move, 100).at).toBeGreaterThan(0.5);
    expect(lensAt(move, 200).at).toBeGreaterThan(0.85);
    expect(Math.max(...[220, 260, 300, 340].map((t) => lensAt(move, t).at))).toBeLessThan(1.06);
    expect(lensAt(move, 420).tint).toBe(1);
  });

  it('stretches with its speed and not at either end', () => {
    const move = planSwitch(0, 3, 0);
    expect(lensAt(move, 0).stretch).toBe(0);
    expect(lensAt(move, 90).stretch).toBeGreaterThan(0.15);
    expect(lensAt(move, 220).stretch).toBeLessThan(lensAt(move, 90).stretch / 2);
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

  it('goes on rising in place toward a new choice tapped before it set off', () => {
    const first = planSwitch(0, 3, 0);
    const next = retarget(first, 1, 20);
    expect(next).toMatchObject({ from: 0, to: 1, start: 0, hold: first.hold });
    expect(lensAt(next, 30).at).toBe(0);
    expect(lensAt(next, 100).at).toBeGreaterThan(0.4);
  });

  it('starts afresh from rest, and stays put when sent where it already is', () => {
    const done = planSwitch(0, 2, 0);
    expect(retarget(done, 1, 1000)).toEqual(planSwitch(2, 1, 1000));
    expect(planSwitch(2, 1, 0).velocity).toBeLessThan(0);
    expect(lensAt(planSwitch(2, 2, 0), 10).phase).toBe('rest');
  });
});

describe('the magnified row inside the lens', () => {
  it('magnifies about the lens’s middle, however the lens is stretched and flattened', () => {
    const box = { left: 100, right: 220, slot: 80, height: 52, tall: 0.9 };
    const m = magnifier(box, 1.3);
    // A point of the row goes through the copy's transform, then the lens's own, which clips it.
    const throughLens = (x: number, y: number) => [box.left + ((box.right - box.left) / box.slot) * x, 26 + box.tall * (y - 26)];
    for (const [x, y] of [
      [160, 26],
      [130, 10],
      [205, 45],
    ] as const) {
      const [px, py] = throughLens(m.x + m.sx * x, m.y + m.sy * y);
      expect(px).toBeCloseTo(160 + 1.3 * (x - 160), 6);
      expect(py).toBeCloseTo(26 + 1.3 * (y - 26), 6);
    }
  });

  it('magnifies about the lens’s middle when the lens stands lower in the row than its top', () => {
    const box = { left: 40, right: 140, slot: 80, height: 32, tall: 0.95, top: 6 };
    const m = magnifier(box, 1.25);
    // The lens's own box starts `top` down the row and scales about its own middle.
    const throughLens = (x: number, y: number) => [box.left + ((box.right - box.left) / box.slot) * x, 6 + 16 + box.tall * (y - 16)];
    const [px, py] = throughLens(m.x + m.sx * 90, m.y + m.sy * 30);
    expect(px).toBeCloseTo(90 + 1.25 * (90 - 90), 6);
    expect(py).toBeCloseTo(22 + 1.25 * (30 - 22), 6);
    expect(magnifier({ left: 50, right: 130, slot: 80, height: 32, tall: 1, top: 6 }, 1)).toEqual({ x: -50, y: -6, sx: 1, sy: 1 });
  });

  it('shows the row as it is when the lens is the capsule at rest', () => {
    expect(magnifier({ left: 80, right: 160, slot: 80, height: 52, tall: 1 }, 1)).toEqual({ x: -80, y: 0, sx: 1, sy: 1 });
    expect(magnifier({ left: 40, right: 40, slot: 0, height: 52, tall: 1 }, 1.3)).toEqual({ x: -40, y: 0, sx: 1, sy: 1 });
  });

  it('magnifies only while the lens is up', () => {
    const move = planSwitch(0, 2, 0);
    expect(lensAt(move, 0).magnify).toBe(1);
    expect(lensAt(move, 150).magnify).toBeCloseTo(SELECTOR_LENS.magnify, 6);
    expect(lensAt(move, 600).magnify).toBe(1);
  });

  it('spreads its bending glass past it while it is down and lays it on its edge once it is up', () => {
    const move = planSwitch(0, 2, 0);
    expect(lensAt(move, 0).swell).toBe(SELECTOR_LENS.rimSwell);
    expect(lensAt(move, 25).swell).toBeLessThan(SELECTOR_LENS.rimSwell);
    expect(lensAt(move, 25).swell).toBeGreaterThan(1);
    expect(lensAt(move, 150).swell).toBe(1);
    expect(lensAt(move, 600).swell).toBe(SELECTOR_LENS.rimSwell);
  });
});
