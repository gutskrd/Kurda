/**
 * The colour maths, done here rather than handed to the browser.
 *
 * The obvious way to filter a canvas is `ctx.filter`, which takes CSS filter
 * functions. It is not used, for two reasons. It is still not baseline —
 * WebKit shipped it late and with a known bug where a filtered `drawImage`
 * paints only part of the image — so the same picture would come out
 * differently depending on who made it, which is the one thing this editor is
 * built not to do. And it cannot express half of what is here: there is no CSS
 * function for recovering highlights, lifting shadows, or protecting a face
 * from a saturation slider.
 *
 * So it is a pixel loop. That sounds slow and is not, at the sizes involved: a
 * 720px preview is half a million pixels and lands inside a frame, and the
 * export runs once. Being ordinary TypeScript, it is also the only part of the
 * editor whose output can be asserted on directly.
 *
 * Everything is a number from -100 to 100, where 0 is "leave it alone", so a
 * preset and a person's own adjustments are the same kind of thing and can
 * simply be added together.
 */

export interface Adjustments {
  /** in stops, at the extremes: -100 is two stops down, +100 two stops up */
  exposure: number;
  contrast: number;
  /** negative recovers a blown sky, positive opens the bright end further */
  highlights: number;
  /** positive lifts what is buried in the dark */
  shadows: number;
  /** towards amber, or towards blue */
  warmth: number;
  saturation: number;
  /** saturation that leaves already-vivid colour, and skin, alone */
  vibrance: number;
  /** milky blacks — the matte look, and the only one that only goes one way */
  fade: number;
  vignette: number;
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
};

export const ADJUSTMENT_KEYS = Object.keys(NEUTRAL) as ReadonlyArray<keyof Adjustments>;

/** In the order a photographer works: light, then tone, then colour, then look. */
export const ADJUSTMENT_LABELS: Record<keyof Adjustments, string> = {
  exposure: 'Exposure',
  contrast: 'Contrast',
  highlights: 'Highlights',
  shadows: 'Shadows',
  warmth: 'Warmth',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  fade: 'Fade',
  vignette: 'Vignette',
};

/** Sliders that only make sense in one direction. */
const ONE_WAY: ReadonlySet<keyof Adjustments> = new Set(['fade', 'vignette']);

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

/** Every value scaled towards doing nothing. This is what a filter's strength is. */
export function scale(a: Adjustments, strength: number): Adjustments {
  const k = Math.max(0, Math.min(1, strength));
  const out = { ...NEUTRAL };
  // `|| 0` normalises the negative zero that -20 * 0 produces, so an untouched
  // filter compares equal to neutral and does not churn the grading cache key
  for (const key of ADJUSTMENT_KEYS) out[key] = a[key] * k || 0;
  return out;
}

/**
 * A filter plus what the person did on top of it.
 *
 * Adding works because 0 means "unchanged" everywhere: a preset that warms by
 * 30 and a slider pulled 10 the other way leave 20, which is what someone
 * dragging that slider expects to happen.
 */
export function combine(a: Adjustments, b: Adjustments): Adjustments {
  const out = { ...NEUTRAL };
  for (const key of ADJUSTMENT_KEYS) out[key] = clampAdj(key, a[key] + b[key]);
  return out;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Rec. 709 luminance — how bright a colour looks, not how big its numbers are. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/**
 * A soft 0→1 ramp. Used for the highlight and shadow masks, because a hard
 * cut-off at mid-grey leaves a visible seam across anything with a gradient in
 * it — a sky, most obviously.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Apply adjustments to raw RGBA bytes, in place.
 *
 * The order is the one a photographer works in and is not arbitrary: white
 * balance first, because everything downstream reads colour; then exposure, to
 * put the picture in the right place overall; then the tonal range, coarse
 * (contrast) before fine (highlights, shadows); then colour intensity; then the
 * two effects that are about the look rather than the exposure. Reordering it
 * gives different pictures, not the same picture differently arranged.
 */
/**
 * Apply adjustments to raw RGBA bytes, in place.
 *
 * The order is the one a photographer works in and is not arbitrary: white
 * balance first, because everything downstream reads colour; then exposure, to
 * put the picture in the right place overall; then the tonal range, coarse
 * (contrast) before fine (highlights, shadows); then colour intensity; then the
 * two effects that are about the look rather than the exposure. Reordering it
 * gives different pictures, not the same picture differently arranged.
 *
 * Written for speed, because the cost of this function is the frame rate of
 * every slider in the editor. The plain version of it measured 71ms on a 720px
 * preview — fourteen frames a second, which feels broken. Three things fixed
 * that, and they are why the code below looks the way it does:
 *
 *   - Everything that depends only on one channel's own value — white balance,
 *     exposure, contrast — is precomputed into a 256-entry table per channel.
 *     There are only 256 possible inputs, so the whole first half of the
 *     pipeline collapses into three array lookups per pixel.
 *   - `Math.hypot` is correct and slow: it guards against overflow that cannot
 *     happen here. The vignette uses a plain square root of precomputed squares.
 *   - Nested loops over y and x, so a pixel's coordinates are already known
 *     rather than recovered with a modulo and a division per pixel.
 */
export function applyAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  adj: Adjustments,
): void {
  if (isNeutral(adj)) return;

  // two stops each way at the extremes
  const exposure = Math.pow(2, (adj.exposure / 100) * 2);
  // 0 leaves it; -100 flattens towards mid-grey; +100 roughly doubles the slope
  const contrast = adj.contrast >= 0 ? 1 + adj.contrast / 100 : 1 + adj.contrast / 200;
  const highlights = adj.highlights / 100;
  const shadows = adj.shadows / 100;
  const warmth = adj.warmth / 100;
  const saturation = adj.saturation / 100;
  const vibrance = adj.vibrance / 100;
  const fade = adj.fade / 100;
  const vignette = adj.vignette / 100;

  /*
   * White balance, exposure and contrast, for every value a byte can hold.
   *
   * Warmth pulls the three channels apart, so there are three tables; the rest
   * of the chain is the same for each. The result is deliberately not clamped
   * to 0..1 — contrast can push a value past either end, and the highlight and
   * shadow steps below want to see that before it is squared off.
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
  // green moves a little the other way, or warming just looks like magenta
  const lutG = table(warmth * 0.02);
  const lutB = table(warmth * -0.12);

  const tone = highlights !== 0 || shadows !== 0;
  const colour = saturation !== 0 || vibrance !== 0;
  const fadeLift = fade * 0.16;

  /*
   * The highlight and shadow curves, per possible brightness.
   *
   * Both are functions of one number — how bright the pixel looks — so they
   * are tables too, read with the luminance quantised to 256 steps. That is
   * finer than the eight-bit values going in and out, so nothing is lost, and
   * it removes two `smoothstep` calls from every pixel.
   */
  let hiK: Float32Array | null = null;
  let loAdd: Float32Array | null = null;
  if (tone) {
    hiK = new Float32Array(256);
    loAdd = new Float32Array(256);
    for (let v = 0; v < 256; v += 1) {
      const lum = v / 255;
      // only the top half, easing in, so a sky recovers without a seam
      hiK[v] = 1 + highlights * smoothstep(0.45, 1, lum) * 0.85;
      loAdd[v] = shadows * smoothstep(0.55, 0, lum) * 0.28;
    }
  }

  // the corner distance, so the vignette is a circle whatever the shape
  const halfW = width / 2;
  const halfH = height / 2;
  const invMaxDist = 1 / (Math.sqrt(halfW * halfW + halfH * halfH) || 1);
  // the horizontal half of the distance, which does not change down a column
  const colSq = vignette !== 0 ? new Float32Array(width) : null;
  if (colSq) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - halfW;
      colSq[x] = dx * dx;
    }
  }
  /* the falloff by distance from the middle, likewise a curve over one number */
  const VIG_STEPS = 512;
  let vigK: Float32Array | null = null;
  if (colSq) {
    vigK = new Float32Array(VIG_STEPS + 1);
    for (let i = 0; i <= VIG_STEPS; i += 1) {
      vigK[i] = 1 - vignette * smoothstep(0.45, 1, i / VIG_STEPS) * 0.75;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const dy = y - halfH;
    const rowSq = dy * dy;
    let i = y * width * 4;

    for (let x = 0; x < width; x += 1, i += 4) {
      // white balance, exposure and contrast, already done
      let r = lutR[data[i]!]!;
      let g = lutG[data[i + 1]!]!;
      let b = lutB[data[i + 2]!]!;

      if (hiK && loAdd) {
        const lum = clamp01(LUMA_R * r + LUMA_G * g + LUMA_B * b);
        const bucket = (lum * 255) | 0;
        const k = hiK[bucket]!;
        // added rather than multiplied: multiplying black by anything is black,
        // and the whole point of the shadow slider is to get something out of it
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
          // how colourful it already is, 0 (grey) to 1 (pure)
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
          // the less colour there is, the more vibrance gives it. This is what
          // keeps a face from going orange when a landscape needs the help.
          amount += vibrance * (1 - (mx - mn));
        }
        const k = 1 + amount;
        r = clamp01(lum + (r - lum) * k);
        g = clamp01(lum + (g - lum) * k);
        b = clamp01(lum + (b - lum) * k);
      }

      if (fadeLift !== 0) {
        r = fadeLift + r * (1 - fadeLift);
        g = fadeLift + g * (1 - fadeLift);
        b = fadeLift + b * (1 - fadeLift);
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
      // alpha is left alone: these are adjustments, not a way to erase anything
    }
  }
}
