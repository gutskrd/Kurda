import {
  ADJUSTMENT_KEYS,
  NEUTRAL,
  buildRamp,
  combine,
  scale,
  type Adjustments,
  type ColourStop,
  type ToneMap,
} from './adjust';

/**
 * The filters.
 *
 * A filter is mostly not a separate mechanism — it is a set of the same
 * adjustments a person can reach themselves, given a name. That is deliberate:
 * it means a filter can be turned down rather than only on or off, it means the
 * sliders keep working after one is chosen, and it means there is almost
 * nothing in a filter that could not be undone by hand.
 *
 * Two things genuinely cannot be expressed as slider values, so they hang off
 * the preset instead. A gradient map repaints the picture from its brightness,
 * which is how a thermal camera and a real sepia work and is not something any
 * amount of saturation can imitate. And an overlay is a second picture drawn on
 * top, which is not colour maths at all.
 *
 * Named in Kurmancî, like everything else people touch in this app.
 */
export interface Overlay {
  src: string;
  /** how much of the picture's width the artwork spans */
  widthShare: number;
  /**
   * ...unless that would make it taller than this much of the picture.
   *
   * The artwork is nearly square. Sized by width alone it hangs off the bottom
   * of a landscape crop — which a canvas silently clips, so the flag would
   * quietly lose its lower half on exactly the shape most photographs are.
   */
  maxHeightShare: number;
  opacity: number;
}

export interface FilterPreset {
  key: string;
  label: string;
  /** what it means in English, for the tooltip — the names are not all obvious */
  hint: string;
  adjustments: Adjustments;
  /** repaint from brightness through a palette */
  tone?: { stops: readonly ColourStop[]; amount: number };
  /** a second picture, laid over the top right */
  overlay?: Overlay;
}

/* --- palettes ------------------------------------------------------------- */

/**
 * The ironbow a thermal camera uses: cold is dark and blue, hot runs up through
 * purple and red into white. It is a real palette rather than a blue-to-red
 * fade, because the purple-to-orange middle is what makes it read as a heat
 * camera instead of as a tinted photograph.
 */
const THERMAL: readonly ColourStop[] = [
  [0.0, 0, 0, 22],
  [0.2, 32, 0, 92],
  [0.4, 140, 0, 122],
  [0.58, 222, 32, 42],
  [0.74, 255, 132, 0],
  [0.88, 255, 226, 62],
  [1.0, 255, 255, 242],
];

/** Silver that has turned: cold browns in the shadows, warm cream at the top. */
const SEPIA: readonly ColourStop[] = [
  [0.0, 28, 18, 10],
  [0.35, 105, 76, 44],
  [0.7, 190, 155, 106],
  [1.0, 247, 232, 200],
];

/* --- the presets ---------------------------------------------------------- */

const preset = (
  key: string,
  label: string,
  hint: string,
  adjustments: Partial<Adjustments>,
  extra: Pick<FilterPreset, 'tone' | 'overlay'> = {},
): FilterPreset => ({ key, label, hint, adjustments: { ...NEUTRAL, ...adjustments }, ...extra });

/** The one that does nothing. Always first, and where every picture starts. */
export const NO_FILTER = 'orijinal';

export const FILTERS: readonly FilterPreset[] = [
  preset(NO_FILTER, 'Orîjînal', 'No filter', {}),

  preset(
    'ala',
    'Ala',
    'The flag',
    { warmth: 6, contrast: 6, vibrance: 10 },
    { overlay: { src: '/filters/kurdistan.webp', widthShare: 0.58, maxHeightShare: 0.6, opacity: 1 } },
  ),

  preset('zer', 'Zêr', 'Gold', {
    warmth: 28,
    exposure: 4,
    contrast: 10,
    shadows: 8,
    vibrance: 18,
    vignette: 12,
  }),

  preset('rojava', 'Rojava', 'Sunset', {
    warmth: 40,
    exposure: 6,
    contrast: 14,
    highlights: -18,
    saturation: 12,
    vignette: 18,
  }),

  preset('ciya', 'Çiya', 'Mountain', {
    warmth: -18,
    contrast: 26,
    highlights: -12,
    shadows: -8,
    vibrance: 26,
  }),

  preset('zelal', 'Zelal', 'Clear', {
    exposure: 4,
    contrast: 18,
    highlights: -14,
    shadows: 12,
    vibrance: 34,
  }),

  preset('nerm', 'Nerm', 'Soft', {
    warmth: 8,
    contrast: -10,
    highlights: -8,
    shadows: 14,
    saturation: 6,
    fade: 18,
  }),

  preset('sev', 'Şev', 'Night', {
    exposure: -10,
    warmth: -26,
    contrast: 20,
    shadows: -22,
    saturation: -8,
    vignette: 34,
  }),

  preset('kevn', 'Kevn', 'Faded', {
    warmth: 22,
    contrast: -8,
    highlights: -10,
    saturation: -18,
    fade: 34,
    vignette: 20,
  }),

  /*
   * Properly old, rather than merely faded. The sepia is a gradient map, so the
   * picture is repainted in aged silver from its own brightness instead of
   * having brown thrown over it, and the grain and the heavy vignette do the
   * rest of the century.
   */
  preset(
    'kevnar',
    'Kevnar',
    'Antique',
    { contrast: 8, highlights: -14, saturation: -20, fade: 24, vignette: 52, grain: 62 },
    { tone: { stops: SEPIA, amount: 0.85 } },
  ),

  preset(
    'germi',
    'Germî',
    'Heat camera',
    // contrast first, so the brightness range is spread out before the palette
    // reads it — a flat picture maps to a flat band of one colour
    { contrast: 26 },
    { tone: { stops: THERMAL, amount: 1 } },
  ),

  preset('piksel', 'Piksel', 'Pixelated', {
    pixelate: 45,
    contrast: 8,
    saturation: 10,
  }),

  preset('res-u-spi', 'Reş û Spî', 'Black and white', {
    saturation: -100,
    contrast: 18,
    shadows: 6,
  }),

  preset('noir', 'Noir', 'Deep black and white', {
    saturation: -100,
    contrast: 42,
    highlights: -10,
    shadows: -20,
    vignette: 30,
  }),
];

/**
 * Every piece of overlay artwork any filter uses.
 *
 * Drawing is synchronous — it backs the export as well as the preview — so the
 * artwork has to be decoded before anything asks for it. There is one of these
 * today; the list means adding a second costs nothing.
 */
export function overlaySources(): string[] {
  return FILTERS.map((f) => f.overlay?.src).filter((src): src is string => typeof src === 'string');
}

/** The preset for a key, falling back to the one that changes nothing. */
export function presetByKey(key: string): FilterPreset {
  return FILTERS.find((f) => f.key === key) ?? FILTERS[0]!;
}

/** A fixed order, so the signature is stable whatever order the keys come in. */
const ADJ_ORDER = [...ADJUSTMENT_KEYS].sort();

/**
 * Ramps are built once per preset and kept.
 *
 * Building one walks 256 steps and searches the stops at each; doing that for
 * every thumbnail on every redraw would be the most expensive thing on screen,
 * and the answer never changes.
 */
const ramps = new Map<string, Uint8Array>();
function rampFor(preset: FilterPreset): Uint8Array | null {
  if (!preset.tone) return null;
  const cached = ramps.get(preset.key);
  if (cached) return cached;
  const built = buildRamp(preset.tone.stops);
  ramps.set(preset.key, built);
  return built;
}

/**
 * Everything that will be done to the picture: the filter turned down to its
 * strength, plus whatever the person moved by hand.
 *
 * One value so that the live preview, the ten thumbnails and the export all ask
 * the same question and cannot answer it differently.
 */
export interface Grade {
  adjustments: Adjustments;
  tone: ToneMap | null;
  overlay: Overlay | null;
  /**
   * A short, complete identity for this grade.
   *
   * The grading cache needs to know whether two grades are the same, and a
   * grade holds a 768-byte palette. Serialising that on every draw to build a
   * cache key costs more than the cache saves, and the three inputs below
   * determine the whole thing anyway.
   */
  signature: string;
}

export function gradeOf(filterKey: string, strength: number, byHand: Adjustments): Grade {
  const found = presetByKey(filterKey);
  const k = Math.max(0, Math.min(1, strength));
  const ramp = rampFor(found);
  return {
    signature: `${found.key}|${k}|${ADJ_ORDER.map((a) => byHand[a]).join(',')}`,
    adjustments: combine(scale(found.adjustments, k), byHand),
    // strength fades the palette back towards the picture's own colour, and
    // fades the overlay out, so one slider turns the whole look down
    tone: ramp && found.tone ? { ramp, amount: found.tone.amount * k } : null,
    overlay: found.overlay ? { ...found.overlay, opacity: found.overlay.opacity * k } : null,
  };
}
