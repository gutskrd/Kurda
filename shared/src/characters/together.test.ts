import { describe, expect, it } from 'vitest';
import { characterArt } from './index.js';
import { LEAN_DEGREES, eyeShift, gazeTargets, leanToward, lookAcross, standTogether, standingSpots, togetherBackdrop } from './together.js';

const xezo = characterArt('xezo');
const hamo = characterArt('hamo');
const hevalo = characterArt('hevalo');

describe('standing together', () => {
  it('stands two near the middle, and three evenly', () => {
    expect(standingSpots(2)).toEqual([0.28, 0.72]);
    expect(standingSpots(3).map((s) => Math.round(s * 100))).toEqual([17, 50, 83]);
  });

  it('draws them at one size, heads below the top, none wider than its room', () => {
    const width = 358;
    const [a, b] = standTogether([xezo, hamo], width, 260, 16);
    // head to waist the same height for both
    const tall = (p: typeof a, art: typeof xezo): number => (p!.height * art.half.h) / art.viewBox.h;
    expect(tall(a, xezo)).toBeCloseTo(tall(b, hamo), 6);
    // the top of each head-to-waist box at the headroom
    expect(a!.top + ((xezo.half.y - xezo.viewBox.y) * a!.height) / xezo.viewBox.h).toBeCloseTo(16, 6);
    // Hamo, the widest, fits in the room between the two spots
    const hamoWide = (hamo.half.w * b!.height) / hamo.viewBox.h;
    expect(hamoWide).toBeLessThanOrEqual((0.72 - 0.28) * width + 1e-6);
    // and stands centred on his spot
    expect(b!.left + hamoWide / 2).toBeCloseTo(0.72 * width, 6);
  });

  it('stands as tall as the stage allows where there is width to spare', () => {
    const [a] = standTogether([xezo, hamo], 900, 260, 16);
    expect((a!.height * xezo.half.h) / xezo.viewBox.h).toBeCloseTo(244, 6);
  });

  it('turns a face drawn turned away from the others round, and only that one', () => {
    // Hamo's face is drawn turned a little to the left: on the right he already faces Xezo
    const [x, h] = standTogether([xezo, hamo], 400, 260, 16);
    expect([x!.mirrored, h!.mirrored]).toEqual([false, false]);
    // on the left he is turned round to face her
    const [h2, x2] = standTogether([hamo, xezo], 400, 260, 16);
    expect([h2!.mirrored, x2!.mirrored]).toEqual([true, false]);
  });

  it('puts the first speaker on the start side of a page read right to left', () => {
    const [x, h] = standTogether([xezo, hamo], 400, 260, 16, true);
    expect([x!.at, h!.at]).toEqual([0.72, 0.28]);
    expect(h!.mirrored).toBe(true);
  });
});

describe('looking at each other', () => {
  it('looks straight across at the other, in its own drawing’s terms', () => {
    const [x, h] = standTogether([xezo, hamo], 400, 260, 16);
    expect(lookAcross(x!, h!)).toEqual({ x: 1, y: 0 });
    expect(lookAcross(h!, x!)).toEqual({ x: -1, y: 0 });
    // turned round, looking right as seen is looking left as drawn
    const [h2, x2] = standTogether([hamo, xezo], 400, 260, 16);
    expect(lookAcross(h2!, x2!)).toEqual({ x: -1, y: 0 });
  });

  it('moves a person’s irises within their eyes, and the deer’s pupils within his', () => {
    expect(eyeShift(xezo, { x: 1, y: 0 })).toEqual({ left: { x: xezo.irisReach, y: 0 }, right: { x: xezo.irisReach, y: 0 } });
    expect(eyeShift(hamo, { x: -2, y: 0 }).left.x).toBeCloseTo(-hamo.irisReach!, 6);
    const deer = eyeShift(hevalo, { x: 1, y: 0 });
    expect(deer.left.x).toBeGreaterThan(0);
    expect(deer.right.x).toBeGreaterThan(0);
  });

  it('leans the head a little toward whoever it looks at', () => {
    expect(leanToward({ x: 1, y: 0 })).toBe(LEAN_DEGREES);
    expect(leanToward({ x: -1, y: 0 })).toBe(-LEAN_DEGREES);
    expect(leanToward({ x: 0, y: 0 })).toBe(0);
  });

  it('turns everyone to whoever is speaking, and the speaker to whoever spoke before', () => {
    const lines = [{ speaker: 0 }, { speaker: 1 }, { speaker: 2 }, { speaker: 0 }];
    // two people always look at each other
    expect(gazeTargets(2, [{ speaker: 0 }, { speaker: 1 }], 1)).toEqual([1, 0]);
    expect(gazeTargets(2, [{ speaker: 0 }, { speaker: 1 }], null)).toEqual([1, 0]);
    // three: the second line's speaker answers the first, and the others watch them
    expect(gazeTargets(3, lines, 1)).toEqual([1, 0, 1]);
    expect(gazeTargets(3, lines, 2)).toEqual([2, 2, 1]);
    // the first line, before anyone has spoken, is said to whoever answers it
    expect(gazeTargets(3, lines, 0)).toEqual([1, 0, 0]);
  });
});

describe('the stage behind them', () => {
  it('is each one’s own light, well-formed and with ids of its own', () => {
    const svg = togetherBackdrop(
      [
        { id: 'xezo', at: 0.28 },
        { id: 'hamo', at: 0.72 },
      ],
      358,
      260,
      { idPrefix: 'pair' },
    );
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('#f5a3b5');
    expect(svg).toContain('#f6c27a');
    expect(svg.match(/id="pair-/g)).toHaveLength(3);
  });
});
