import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENT_KEYS,
  NEUTRAL,
  applyAdjustments,
  blockSizeFor,
  buildRamp,
  combine,
  isNeutral,
  pixelate,
  rangeFor,
  scale,
  type Adjustments,
  type ColourStop,
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

describe('the gradient map', () => {
  const SEPIA: ColourStop[] = [
    [0, 30, 20, 10],
    [1, 250, 230, 200],
  ];

  it('interpolates between the stops it was given', () => {
    const ramp = buildRamp(SEPIA);
    expect([ramp[0], ramp[1], ramp[2]]).toEqual([30, 20, 10]);
    expect([ramp[765], ramp[766], ramp[767]]).toEqual([250, 230, 200]);
    // halfway along, halfway between
    expect(ramp[384]).toBeCloseTo((30 + 250) / 2, -1);
  });

  it('survives being given no stops at all', () => {
    expect(buildRamp([]).length).toBe(768);
  });

  it('puts stops in order rather than trusting the caller', () => {
    const forwards = buildRamp([[0, 0, 0, 0], [1, 255, 255, 255]]);
    const backwards = buildRamp([[1, 255, 255, 255], [0, 0, 0, 0]]);
    expect([...backwards]).toEqual([...forwards]);
  });

  /**
   * The point of a gradient map: the picture is repainted from its brightness,
   * so a grey and a red of the same brightness come out the same colour. No
   * amount of saturation or warmth can do that.
   */
  it('repaints from brightness, discarding the original hue', () => {
    const ramp = buildRamp(SEPIA);
    const tone = { ramp, amount: 1 };
    // a grey and a green with the same luminance: 0.7152 x 200 = 143.0
    const grey = new Uint8ClampedArray([143, 143, 143, 255]);
    const green = new Uint8ClampedArray([0, 200, 0, 255]);
    applyAdjustments(grey, 1, 1, NEUTRAL, tone);
    applyAdjustments(green, 1, 1, NEUTRAL, tone);
    expect([...green].slice(0, 3)).toEqual([...grey].slice(0, 3));
  });

  it('mixes back towards the original as the amount comes down', () => {
    const ramp = buildRamp(SEPIA);
    const full = new Uint8ClampedArray([128, 128, 128, 255]);
    const half = new Uint8ClampedArray([128, 128, 128, 255]);
    const none = new Uint8ClampedArray([128, 128, 128, 255]);
    applyAdjustments(full, 1, 1, NEUTRAL, { ramp, amount: 1 });
    applyAdjustments(half, 1, 1, NEUTRAL, { ramp, amount: 0.5 });
    applyAdjustments(none, 1, 1, NEUTRAL, { ramp, amount: 0 });
    expect(none[0]).toBe(128);
    expect(half[0]).toBeGreaterThan(Math.min(128, full[0]!) - 1);
    expect(half[0]).toBeLessThan(Math.max(128, full[0]!) + 1);
    expect(half[0]).not.toBe(full[0]);
  });
});

describe('pixelate', () => {
  /** A w×h image where every pixel differs. */
  const noisy = (w: number, h: number): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
    return d;
  };

  it('makes every pixel in a block the same', () => {
    const d = noisy(8, 8);
    pixelate(d, 8, 8, 4);
    const at = (x: number, y: number): number[] => [...d.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 3)];
    expect(at(0, 0)).toEqual(at(3, 3));
    expect(at(4, 4)).toEqual(at(7, 7));
    // and different blocks are still different
    expect(at(0, 0)).not.toEqual(at(4, 4));
  });

  it('handles a picture that does not divide evenly into blocks', () => {
    const d = noisy(7, 5);
    expect(() => pixelate(d, 7, 5, 3)).not.toThrow();
    expect(d.length).toBe(7 * 5 * 4);
  });

  it('does nothing at a block size of one', () => {
    const before = noisy(4, 4);
    const after = before.slice();
    pixelate(after, 4, 4, 1);
    expect([...after]).toEqual([...before]);
  });

  it('leaves alpha alone', () => {
    const d = new Uint8ClampedArray([10, 10, 10, 40, 200, 200, 200, 90, 0, 0, 0, 255, 5, 5, 5, 7]);
    pixelate(d, 2, 2, 2);
    expect([d[3], d[7], d[11], d[15]]).toEqual([40, 90, 255, 7]);
  });

  it('scales the block to the picture, so it looks the same at any size', () => {
    expect(blockSizeFor(0, 1000, 1000)).toBe(1);
    expect(blockSizeFor(100, 1000, 1000)).toBe(60);
    // a square crop of a landscape picture is bounded by its height
    expect(blockSizeFor(100, 2000, 1000)).toBe(60);
  });
});

describe('grain', () => {
  const flat = (w: number, h: number): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set([128, 128, 128, 255], i * 4);
    return d;
  };

  it('roughens a flat surface', () => {
    const d = flat(40, 40);
    applyAdjustments(d, 40, 40, adj({ grain: 100 }));
    const values = new Set<number>();
    for (let i = 0; i < d.length; i += 4) values.add(d[i]!);
    expect(values.size).toBeGreaterThan(8);
  });

  it('is the same every time, so a redraw is not a reshuffle', () => {
    const a = flat(20, 20);
    const b = flat(20, 20);
    applyAdjustments(a, 20, 20, adj({ grain: 70 }));
    applyAdjustments(b, 20, 20, adj({ grain: 70 }));
    expect([...a]).toEqual([...b]);
  });

  /**
   * The claim that makes grain safe to ship: the preview and the export must
   * carry the same texture. Noise tied to the pixel grid would be coarse in a
   * 360px preview and fine in a 720px export, and the preview would stop being
   * a preview. The lattice is mapped onto the picture instead, so the same
   * *relative* point gets the same grain at either size.
   */
  it('is the same texture at preview size and export size', () => {
    const small = flat(180, 180);
    const large = flat(360, 360);
    applyAdjustments(small, 180, 180, adj({ grain: 90 }));
    applyAdjustments(large, 360, 360, adj({ grain: 90 }));

    let matches = 0;
    let compared = 0;
    for (let y = 0; y < 180; y += 7) {
      for (let x = 0; x < 180; x += 7) {
        const s = small[(y * 180 + x) * 4]!;
        // the same fraction of the way across the larger picture
        const l = large[(y * 2 * 360 + x * 2) * 4]!;
        compared += 1;
        if (Math.abs(s - l) <= 1) matches += 1;
      }
    }
    expect(matches / compared).toBeGreaterThan(0.95);
  });
});
