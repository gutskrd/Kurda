import type { MessageKey } from '../i18n/en';
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
 * The photo filters: named sets of the same adjustments a person can make, so a filter can be turned down and the
 * sliders keep working on top. A gradient map (`tone`) and an overlay picture cannot be slider values, so they hang off
 * the preset. Names are Kurmancî in every language.
 */
export interface Overlay {
  src: string;
  /** How much of the picture's width the artwork spans. */
  widthShare: number;
  /** The most of the picture's height it may take; the nearly square artwork would otherwise be clipped on landscape crops. */
  maxHeightShare: number;
  opacity: number;
}

export interface FilterPreset {
  key: string;
  /** The filter's name in Kurmancî, in every language; `hintKey` explains it. */
  label: string;
  /** What it means, for the tooltip. */
  hintKey: MessageKey;
  adjustments: Adjustments;
  /** Repaint from brightness through a palette. */
  tone?: { stops: readonly ColourStop[]; amount: number };
  /** A second picture, laid over the top right. */
  overlay?: Overlay;
}

/* --- palettes ------------------------------------------------------------- */

/** The ironbow palette of a thermal camera: dark blue through purple and red into white. */
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
  hintKey: MessageKey,
  adjustments: Partial<Adjustments>,
  extra: Pick<FilterPreset, 'tone' | 'overlay'> = {},
): FilterPreset => ({ key, label, hintKey, adjustments: { ...NEUTRAL, ...adjustments }, ...extra });

/** The one that does nothing; always first, and where every picture starts. */
export const NO_FILTER = 'orijinal';

export const FILTERS: readonly FilterPreset[] = [
  preset(NO_FILTER, 'Orîjînal', 'photo.filter.none', {}),

  preset(
    'ala',
    'Ala',
    'photo.filter.flag',
    { warmth: 6, contrast: 6, vibrance: 10 },
    { overlay: { src: '/filters/kurdistan.webp', widthShare: 0.58, maxHeightShare: 0.6, opacity: 1 } },
  ),

  preset('zer', 'Zêr', 'photo.filter.gold', {
    warmth: 28,
    exposure: 4,
    contrast: 10,
    shadows: 8,
    vibrance: 18,
    vignette: 12,
  }),

  preset('rojava', 'Rojava', 'photo.filter.sunset', {
    warmth: 40,
    exposure: 6,
    contrast: 14,
    highlights: -18,
    saturation: 12,
    vignette: 18,
  }),

  preset('ciya', 'Çiya', 'photo.filter.mountain', {
    warmth: -18,
    contrast: 26,
    highlights: -12,
    shadows: -8,
    vibrance: 26,
  }),

  preset('zelal', 'Zelal', 'photo.filter.clear', {
    exposure: 4,
    contrast: 18,
    highlights: -14,
    shadows: 12,
    vibrance: 34,
  }),

  preset('nerm', 'Nerm', 'photo.filter.soft', {
    warmth: 8,
    contrast: -10,
    highlights: -8,
    shadows: 14,
    saturation: 6,
    fade: 18,
  }),

  preset('sev', 'Şev', 'photo.filter.night', {
    exposure: -10,
    warmth: -26,
    contrast: 20,
    shadows: -22,
    saturation: -8,
    vignette: 34,
  }),

  preset('kevn', 'Kevn', 'photo.filter.faded', {
    warmth: 22,
    contrast: -8,
    highlights: -10,
    saturation: -18,
    fade: 34,
    vignette: 20,
  }),

  /* Old rather than faded: a sepia gradient map, with grain and a heavy vignette. */
  preset(
    'kevnar',
    'Kevnar',
    'photo.filter.antique',
    { contrast: 8, highlights: -14, saturation: -20, fade: 24, vignette: 52, grain: 62 },
    { tone: { stops: SEPIA, amount: 0.85 } },
  ),

  preset(
    'germi',
    'Germî',
    'photo.filter.heat',
    // Contrast first, so a flat picture does not map to a flat band of one colour.
    { contrast: 26 },
    { tone: { stops: THERMAL, amount: 1 } },
  ),

  preset('piksel', 'Piksel', 'photo.filter.pixelated', {
    pixelate: 45,
    contrast: 8,
    saturation: 10,
  }),

  preset('res-u-spi', 'Reş û Spî', 'photo.filter.bw', {
    saturation: -100,
    contrast: 18,
    shadows: 6,
  }),

  preset('noir', 'Noir', 'photo.filter.noir', {
    saturation: -100,
    contrast: 42,
    highlights: -10,
    shadows: -20,
    vignette: 30,
  }),
];

/** Every overlay artwork any filter uses, decoded up front since drawing is synchronous. */
export function overlaySources(): string[] {
  return FILTERS.map((f) => f.overlay?.src).filter((src): src is string => typeof src === 'string');
}

/** The preset for a key, falling back to the one that changes nothing. */
export function presetByKey(key: string): FilterPreset {
  return FILTERS.find((f) => f.key === key) ?? FILTERS[0]!;
}

/** A fixed order, so the signature is stable whatever order the keys come in. */
const ADJ_ORDER = [...ADJUSTMENT_KEYS].sort();

/** Ramps, built once per preset, since every thumbnail would otherwise rebuild them on each redraw. */
const ramps = new Map<string, Uint8Array>();
function rampFor(preset: FilterPreset): Uint8Array | null {
  if (!preset.tone) return null;
  const cached = ramps.get(preset.key);
  if (cached) return cached;
  const built = buildRamp(preset.tone.stops);
  ramps.set(preset.key, built);
  return built;
}

/** Everything done to the picture, as one value shared by the preview, the thumbnails and the export. */
export interface Grade {
  adjustments: Adjustments;
  tone: ToneMap | null;
  overlay: Overlay | null;
  /** A short identity for the cache key; the three inputs determine the grade without serialising its 768-byte palette. */
  signature: string;
}

export function gradeOf(filterKey: string, strength: number, byHand: Adjustments): Grade {
  const found = presetByKey(filterKey);
  const k = Math.max(0, Math.min(1, strength));
  const ramp = rampFor(found);
  return {
    signature: `${found.key}|${k}|${ADJ_ORDER.map((a) => byHand[a]).join(',')}`,
    adjustments: combine(scale(found.adjustments, k), byHand),
    // Strength fades the palette and the overlay together, so one slider turns the whole look down.
    tone: ramp && found.tone ? { ramp, amount: found.tone.amount * k } : null,
    overlay: found.overlay ? { ...found.overlay, opacity: found.overlay.opacity * k } : null,
  };
}
