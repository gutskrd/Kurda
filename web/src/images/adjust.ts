import type { MessageKey } from '../i18n/en';

/**
 * The photo editor's colour maths as a pixel loop rather than `ctx.filter`, which renders inconsistently across
 * engines (WebKit paints a filtered `drawImage` only partly) and has nothing for highlights, shadows or skin-safe
 * saturation. A 720px preview grades within a frame, and the output can be asserted on directly.
 *
 * Every value runs from -100 to 100 with 0 meaning unchanged, so a preset and a person's own adjustments add together.
 */

export interface Adjustments {
  /** In stops at the extremes: -100 is two stops down, +100 two up. */
  exposure: number;
  contrast: number;
  /** Negative recovers a blown sky; positive opens the bright end further. */
  highlights: number;
  /** Positive lifts what is buried in the dark. */
  shadows: number;
  /** Towards amber, or towards blue. */
  warmth: number;
  saturation: number;
  /** Saturation that leaves already vivid colour, and skin, alone. */
  vibrance: number;
  /** Milky blacks: the matte look. */
  fade: number;
  vignette: number;
  /** Film grain, as a texture that does not change with output size. */
  grain: number;
  /** Block size as a share of the short edge, applied before everything else. */
  pixelate: number;
}

export const NEUTRAL: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  saturation: 0,
  vibrance: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  pixelate: 0,
};

export const ADJUSTMENT_KEYS = Object.keys(NEUTRAL) as ReadonlyArray<keyof Adjustments>;

/** In a photographer's order: light, tone, colour, then look. */
export const ADJUSTMENT_LABEL_KEYS: Record<keyof Adjustments, MessageKey> = {
  exposure: 'photo.adjust.exposure',
  contrast: 'photo.adjust.contrast',
  highlights: 'photo.adjust.highlights',
  shadows: 'photo.adjust.shadows',
  warmth: 'photo.adjust.warmth',
  saturation: 'photo.adjust.saturation',
  vibrance: 'photo.adjust.vibrance',
  fade: 'photo.adjust.fade',
  vignette: 'photo.adjust.vignette',
  grain: 'photo.adjust.grain',
  pixelate: 'photo.adjust.pixelate',
};

/** Sliders that only make sense in one direction. */
const ONE_WAY: ReadonlySet<keyof Adjustments> = new Set(['fade', 'vignette', 'grain', 'pixelate']);

export function rangeFor(key: keyof Adjustments): { min: number; max: number } {
  return ONE_WAY.has(key) ? { min: 0, max: 100 } : { min: -100, max: 100 };
}

export function isNeutral(a: Adjustments): boolean {
  return ADJUSTMENT_KEYS.every((k) => a[k] === 0);
}

const clampAdj = (key: keyof Adjustments, v: number): number => {
  const r = rangeFor(key);
  return v < r.min ? r.min : v > r.max ? r.max : v;
};

/** Every value scaled towards doing nothing; this is a filter's strength. */
export function scale(a: Adjustments, strength: number): Adjustments {
  const k = Math.max(0, Math.min(1, strength));
  const out = { ...NEUTRAL };
  // `|| 0` turns the -0 from -20 * 0 into 0, so an untouched filter equals neutral and keeps the cache key stable.
  for (const key of ADJUSTMENT_KEYS) out[key] = a[key] * k || 0;
  return out;
}

/** A filter plus the person's own changes, added since 0 means unchanged everywhere. */
export function combine(a: Adjustments, b: Adjustments): Adjustments {
  const out = { ...NEUTRAL };
  for (const key of ADJUSTMENT_KEYS) out[key] = clampAdj(key, a[key] + b[key]);
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A colour at a point along a ramp: where it sits (0–1), then r, g, b as bytes. */
export type ColourStop = readonly [at: number, r: number, g: number, b: number];

/**
 * A gradient map: brightness in, colour out, as in a thermal camera or real sepia. It repaints the picture from its
 * brightness, which no slider can express, so it is passed separately. `amount` mixes it with the original.
 */
export interface ToneMap {
  /** 768 bytes: r, g, b for each of 256 brightness steps. */
  ramp: Uint8Array;
  amount: number;
}

/** Builds the 256-step ramp once from a handful of stops. */
export function buildRamp(stops: readonly ColourStop[]): Uint8Array {
  const ramp = new Uint8Array(768);
  if (stops.length === 0) return ramp;
  const sorted = [...stops].sort((a, b) => a[0] - b[0]);

  for (let v = 0; v < 256; v += 1) {
    const t = v / 255;
    let lo = sorted[0]!;
    let hi = sorted[sorted.length - 1]!;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (t >= sorted[i]![0] && t <= sorted[i + 1]![0]) {
        lo = sorted[i]!;
        hi = sorted[i + 1]!;
        break;
      }
    }
    const span = hi[0] - lo[0];
    const k = span <= 0 ? 0 : (t - lo[0]) / span;
    ramp[v * 3] = Math.round(lo[1] + (hi[1] - lo[1]) * k);
    ramp[v * 3 + 1] = Math.round(lo[2] + (hi[2] - lo[2]) * k);
    ramp[v * 3 + 2] = Math.round(lo[3] + (hi[3] - lo[3]) * k);
  }
  return ramp;
}

/** Grain is sampled from a fixed lattice mapped onto the picture, so the preview and export show the same texture. */
const GRAIN_LATTICE = 1100;

/** A deterministic -1..1 from two integers; cheap, and film-like enough. */
function noiseAt(gx: number, gy: number): number {
  let h = Math.imul(gx, 374761393) + Math.imul(gy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32768 - 1;
}

/**
 * Pixelates by averaging square blocks. A separate pass because it needs neighbours, which the main loop never reads;
 * it runs first so the grading works on the blocks.
 */
export function pixelate(data: Uint8ClampedArray, width: number, height: number, block: number): void {
  const size = Math.max(1, Math.round(block));
  if (size <= 1) return;

  for (let by = 0; by < height; by += size) {
    const yEnd = Math.min(by + size, height);
    for (let bx = 0; bx < width; bx += size) {
      const xEnd = Math.min(bx + size, width);
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = by; y < yEnd; y += 1) {
        let i = (y * width + bx) * 4;
        for (let x = bx; x < xEnd; x += 1, i += 4) {
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n += 1;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      for (let y = by; y < yEnd; y += 1) {
        let i = (y * width + bx) * 4;
        for (let x = bx; x < xEnd; x += 1, i += 4) {
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }
}

/** Block size in pixels for a 0–100 setting, relative to the picture's short edge. */
export function blockSizeFor(amount: number, width: number, height: number): number {
  if (amount <= 0) return 1;
  const short = Math.min(width, height);
  // At 100 a block is 6% of the short edge: chunky but recognisable.
  return Math.max(2, Math.round((amount / 100) * short * 0.06));
}


/** Rec. 709 luminance: how bright a colour looks. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** A soft 0→1 ramp for the highlight and shadow masks; a hard cut at mid-grey leaves a seam across a sky. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Applies adjustments to raw RGBA bytes in place, in a photographer's order: white balance, exposure, contrast, then
 * highlights and shadows, colour intensity, and the look. The order changes the result.
 *
 * This is the frame rate of every slider, so it is written for speed (a plain version took 71 ms on a 720px preview):
 * per-channel work is precomputed into 256-entry tables, luminance curves are tables too, the vignette avoids
 * `Math.hypot`, and nested loops over y and x keep coordinates without division.
 */
export function applyAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: Adjustments,
  tone?: ToneMap | null,
): void {
  const toning = tone && tone.amount > 0 ? tone : null;
  if (isNeutral(adj) && !toning) return;

  // Two stops each way at the extremes.
  const exposure = Math.pow(2, (adj.exposure / 100) * 2);
  // 0 leaves it; -100 flattens towards mid-grey; +100 roughly doubles the slope.
  const contrast = adj.contrast >= 0 ? 1 + adj.contrast / 100 : 1 + adj.contrast / 200;
  const highlights = adj.highlights / 100;
  const shadows = adj.shadows / 100;
  const warmth = adj.warmth / 100;
  const saturation = adj.saturation / 100;
  const vibrance = adj.vibrance / 100;
  const fade = adj.fade / 100;
  const vignette = adj.vignette / 100;
  // 0.14 at full; more stops reading as film.
  const grain = (adj.grain / 100) * 0.14;

  /*
   * White balance, exposure and contrast for every byte value: three tables, since warmth pulls the channels apart.
   * Deliberately unclamped, so the highlight and shadow steps see values past either end.
   */
  const table = (shift: number): Float32Array => {
    const lut = new Float32Array(256);
    for (let v = 0; v < 256; v += 1) {
      let x = v / 255;
      if (shift !== 0) x = clamp01(x + shift);
      x *= exposure;
      x = (x - 0.5) * contrast + 0.5;
      lut[v] = x;
    }
    return lut;
  };
  const lutR = table(warmth * 0.12);
  // Green moves a little the other way, or warming looks magenta.
  const lutG = table(warmth * 0.02);
  const lutB = table(warmth * -0.12);

  const shapesTone = highlights !== 0 || shadows !== 0;
  const colour = saturation !== 0 || vibrance !== 0;
  const fadeLift = fade * 0.16;

  /* The highlight and shadow curves per brightness, read with luminance quantised to 256 steps. */
  let hiK: Float32Array | null = null;
  let loAdd: Float32Array | null = null;
  if (shapesTone) {
    hiK = new Float32Array(256);
    loAdd = new Float32Array(256);
    for (let v = 0; v < 256; v += 1) {
      const lum = v / 255;
      // Only the top half, easing in, so a sky recovers without a seam.
      hiK[v] = 1 + highlights * smoothstep(0.45, 1, lum) * 0.85;
      loAdd[v] = shadows * smoothstep(0.55, 0, lum) * 0.28;
    }
  }

  // The corner distance, so the vignette is a circle whatever the shape.
  const halfW = width / 2;
  const halfH = height / 2;
  const invMaxDist = 1 / (Math.sqrt(halfW * halfW + halfH * halfH) || 1);
  // The horizontal part of the distance, constant down a column.
  const colSq = vignette !== 0 ? new Float32Array(width) : null;
  if (colSq) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - halfW;
      colSq[x] = dx * dx;
    }
  }
  /* The falloff by distance from the middle, likewise a curve over one number. */
  const VIG_STEPS = 512;
  let vigK: Float32Array | null = null;
  if (colSq) {
    vigK = new Float32Array(VIG_STEPS + 1);
    for (let i = 0; i <= VIG_STEPS; i += 1) {
      vigK[i] = 1 - vignette * smoothstep(0.45, 1, i / VIG_STEPS) * 0.75;
    }
  }

  // The lattice is mapped onto the picture, so the grain matches at preview and export size.
  const lattice = width > 0 ? GRAIN_LATTICE / width : 0;
  const latticeY = height > 0 ? GRAIN_LATTICE / height : 0;

  for (let y = 0; y < height; y += 1) {
    const dy = y - halfH;
    const rowSq = dy * dy;
    const gy = (y * latticeY) | 0;
    let i = y * width * 4;

    for (let x = 0; x < width; x += 1, i += 4) {
      // White balance, exposure and contrast, from the tables.
      let r = lutR[data[i]!]!;
      let g = lutG[data[i + 1]!]!;
      let b = lutB[data[i + 2]!]!;

      if (hiK && loAdd) {
        const lum = clamp01(LUMA_R * r + LUMA_G * g + LUMA_B * b);
        const bucket = (lum * 255) | 0;
        const k = hiK[bucket]!;
        // Added rather than multiplied, since multiplying black gives black.
        const lift = loAdd[bucket]!;
        r = r * k + lift;
        g = g * k + lift;
        b = b * k + lift;
      }

      r = clamp01(r);
      g = clamp01(g);
      b = clamp01(b);

      if (colour) {
        const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        let amount = saturation;
        if (vibrance !== 0) {
          // How colourful it already is, 0 (grey) to 1 (pure).
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          // The less colour there is, the more vibrance adds, which keeps faces from going orange.
          amount += vibrance * (1 - (mx - mn));
        }
        const k = 1 + amount;
        r = clamp01(lum + (r - lum) * k);
        g = clamp01(lum + (g - lum) * k);
        b = clamp01(lum + (b - lum) * k);
      }

      if (toning) {
        // Repaint from luminance, the only way to get a thermal palette or a real sepia.
        const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        const at = ((lum * 255) | 0) * 3;
        const a = toning.amount;
        const ramp = toning.ramp;
        r += (ramp[at]! / 255 - r) * a;
        g += (ramp[at + 1]! / 255 - g) * a;
        b += (ramp[at + 2]! / 255 - b) * a;
      }

      if (fadeLift !== 0) {
        r = fadeLift + r * (1 - fadeLift);
        g = fadeLift + g * (1 - fadeLift);
        b = fadeLift + b * (1 - fadeLift);
      }

      if (grain !== 0) {
        // One value for all three channels, so it reads as luminance grain rather than coloured speckle.
        const n = noiseAt((x * lattice) | 0, gy) * grain;
        r += n;
        g += n;
        b += n;
      }

      if (colSq && vigK) {
        const d = Math.sqrt(colSq[x]! + rowSq) * invMaxDist;
        const k = vigK[(d * VIG_STEPS) | 0]!;
        r *= k;
        g *= k;
        b *= k;
      }

      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
      // Alpha is left alone.
    }
  }
}
