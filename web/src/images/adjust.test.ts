import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENT_KEYS,
  NEUTRAL,
  applyAdjustments,
  combine,
  isNeutral,
  rangeFor,
  scale,
  type Adjustments,
} from './adjust';

const adj = (over: Partial<Adjustments>): Adjustments => ({ ...NEUTRAL, ...over });

/** One pixel, run through the pipeline, back as [r, g, b, a]. */
function pixel(rgb: [number, number, number], a: Partial<Adjustments>, alpha = 255): number[] {
  const data = new Uint8ClampedArray([...rgb, alpha]);
  applyAdjustments(data, 1, 1, adj(a));
  return [...data];
}

/** A row of `n` identical pixels, so position-dependent effects have somewhere to act. */
function row(n: number, rgb: [number, number, number], a: Partial<Adjustments>): number[][] {
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) data.set([...rgb, 255], i * 4);
  applyAdjustments(data, n, 1, adj(a));
  return Array.from({ length: n }, (_, i) => [...data.slice(i * 4, i * 4 + 4)]);
}

const MID: [number, number, number] = [128, 128, 128];

describe('the neutral case', () => {
  it('leaves every pixel exactly as it found it', () => {
    expect(pixel([12, 240, 77], {})).toEqual([12, 240, 77, 255]);
  });

  it('knows itself', () => {
    expect(isNeutral(NEUTRAL)).toBe(true);
    expect(isNeutral(adj({ contrast: 1 }))).toBe(false);
  });
});

describe('exposure', () => {
  it('brightens and darkens', () => {
    expect(pixel(MID, { exposure: 50 })[0]!).toBeGreaterThan(128);
    expect(pixel(MID, { exposure: -50 })[0]!).toBeLessThan(128);
  });

  it('is two stops at the top, so +100 doubles twice', () => {
    // 40 x 2^2 = 160
    expect(pixel([40, 40, 40], { exposure: 100 })[0]).toBe(160);
  });

  it('cannot push a pixel past white', () => {
    expect(pixel([250, 250, 250], { exposure: 100 })).toEqual([255, 255, 255, 255]);
  });
});

describe('contrast', () => {
  it('pushes away from mid-grey, and pulls towards it', () => {
    const bright: [number, number, number] = [200, 200, 200];
    const dark: [number, number, number] = [60, 60, 60];
    expect(pixel(bright, { contrast: 50 })[0]!).toBeGreaterThan(200);
    expect(pixel(dark, { contrast: 50 })[0]!).toBeLessThan(60);
    expect(pixel(bright, { contrast: -100 })[0]!).toBeLessThan(200);
    expect(pixel(dark, { contrast: -100 })[0]!).toBeGreaterThan(60);
  });

  it('leaves mid-grey where it is, because that is what it pivots on', () => {
    // 128/255 is a hair over 0.5, so allow the rounding
    expect(pixel(MID, { contrast: 80 })[0]!).toBeCloseTo(128, -1);
  });
});

describe('highlights and shadows', () => {
  it('recovers the bright end without touching the dark end', () => {
    const before: [number, number, number] = [20, 20, 20];
    expect(pixel([240, 240, 240], { highlights: -80 })[0]!).toBeLessThan(240);
    expect(pixel(before, { highlights: -80 })[0]).toBe(20);
  });

  it('lifts the dark end without touching the bright end', () => {
    expect(pixel([20, 20, 20], { shadows: 80 })[0]!).toBeGreaterThan(20);
    expect(pixel([245, 245, 245], { shadows: 80 })[0]).toBe(245);
  });

  /**
   * Shadows are lifted by adding rather than by multiplying: multiplying black
   * by anything is still black, and getting something out of black is the whole
   * reason the slider exists.
   */
  it('can get something out of pure black', () => {
    expect(pixel([0, 0, 0], { shadows: 100 })[0]!).toBeGreaterThan(0);
  });
});

describe('colour', () => {
  it('takes all the colour out at the bottom of saturation', () => {
    const [r, g, b] = pixel([200, 40, 90], { saturation: -100 });
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('adds colour at the top', () => {
    const [r, , b] = pixel([180, 120, 100], { saturation: 60 });
    expect(r).toBeGreaterThan(180);
    expect(b).toBeLessThan(100);
  });

  /**
   * Vibrance is saturation that leaves alone what is already vivid. That is
   * what stops a face turning orange while a dull landscape gets the help it
   * asked for, and it is the whole reason it is a separate slider.
   */
  it('vibrance moves a muted colour more than a vivid one', () => {
    const muted = pixel([140, 120, 110], { vibrance: 100 });
    const vivid = pixel([255, 0, 0], { vibrance: 100 });
    const spread = (p: number[]): number => Math.max(p[0]!, p[1]!, p[2]!) - Math.min(p[0]!, p[1]!, p[2]!);
    const mutedGain = spread(muted) - spread([140, 120, 110]);
    const vividGain = spread(vivid) - spread([255, 0, 0]);
    expect(mutedGain).toBeGreaterThan(vividGain);
  });

  it('warmth goes amber one way and blue the other', () => {
    const warm = pixel(MID, { warmth: 80 });
    expect(warm[0]!).toBeGreaterThan(128);
    expect(warm[2]!).toBeLessThan(128);

    const cool = pixel(MID, { warmth: -80 });
    expect(cool[0]!).toBeLessThan(128);
    expect(cool[2]!).toBeGreaterThan(128);
  });
});

describe('the look', () => {
  it('fade stops black being black', () => {
    expect(pixel([0, 0, 0], { fade: 100 })[0]!).toBeGreaterThan(20);
  });

  it('fade barely touches white, so it lifts rather than washes out', () => {
    expect(pixel([255, 255, 255], { fade: 100 })[0]).toBe(255);
  });

  it('vignette darkens the edges and leaves the middle alone', () => {
    const pixels = row(21, [200, 200, 200], { vignette: 100 });
    const middle = pixels[10]![0]!;
    const edge = pixels[0]![0]!;
    expect(edge).toBeLessThan(middle);
    expect(middle).toBe(200);
  });

  it('vignette does nothing at zero, whatever the shape', () => {
    expect(row(9, [200, 200, 200], { vignette: 0 }).every((p) => p[0] === 200)).toBe(true);
  });
});

describe('what it must never do', () => {
  it('leaves alpha alone', () => {
    expect(pixel([10, 20, 30], { exposure: 100, contrast: 100, saturation: -100 }, 128)[3]).toBe(128);
  });

  it('keeps every channel inside a byte, under everything at once', () => {
    const extremes: Array<[number, number, number]> = [[0, 0, 0], [255, 255, 255], [255, 0, 128], [3, 250, 17]];
    const brutal = adj({
      exposure: 100, contrast: 100, highlights: 100, shadows: 100,
      warmth: 100, saturation: 100, vibrance: 100, fade: 100, vignette: 100,
    });
    for (const rgb of extremes) {
      const data = new Uint8ClampedArray([...rgb, 255]);
      applyAdjustments(data, 1, 1, brutal);
      for (const v of data) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('scale and combine', () => {
  it('scaling to nothing is doing nothing', () => {
    expect(scale(adj({ warmth: 60, contrast: -20 }), 0)).toEqual(NEUTRAL);
  });

  it('scaling to one leaves the filter as written', () => {
    const a = adj({ warmth: 60, contrast: -20 });
    expect(scale(a, 1)).toEqual(a);
  });

  it('halves everything in the middle', () => {
    expect(scale(adj({ warmth: 60, vignette: 40 }), 0.5)).toEqual(adj({ warmth: 30, vignette: 20 }));
  });

  it('refuses a strength outside 0 to 1', () => {
    const a = adj({ warmth: 60 });
    expect(scale(a, 5)).toEqual(a);
    expect(scale(a, -3)).toEqual(NEUTRAL);
  });

  /**
   * A filter and a person's own adjustments add rather than override, because
   * both are distances from "unchanged". Pulling warmth back 10 under a filter
   * that warms by 30 should leave 20 — which is what dragging that slider looks
   * like it is doing.
   */
  it('adds a filter and a hand adjustment', () => {
    const merged = combine(adj({ warmth: 30, contrast: 10 }), adj({ warmth: -10 }));
    expect(merged.warmth).toBe(20);
    expect(merged.contrast).toBe(10);
  });

  it('holds the sum inside each slider’s own range', () => {
    expect(combine(adj({ warmth: 80 }), adj({ warmth: 80 })).warmth).toBe(100);
    expect(combine(adj({ vignette: 80 }), adj({ vignette: -100 })).vignette).toBe(0);
  });
});

describe('the slider ranges', () => {
  it('lets most things go both ways', () => {
    expect(rangeFor('exposure')).toEqual({ min: -100, max: 100 });
  });

  it('keeps the one-way ones one-way', () => {
    // there is no such thing as negative fade, or an inside-out vignette
    expect(rangeFor('fade')).toEqual({ min: 0, max: 100 });
    expect(rangeFor('vignette')).toEqual({ min: 0, max: 100 });
  });

  it('has a range and a label for every adjustment there is', () => {
    for (const key of ADJUSTMENT_KEYS) {
      expect(rangeFor(key).max).toBeGreaterThan(rangeFor(key).min);
    }
  });
});
