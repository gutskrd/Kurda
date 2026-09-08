import { NEUTRAL, type Adjustments } from './adjust';

/**
 * The filters.
 *
 * A filter here is not a separate mechanism — it is a set of the same
 * adjustments a person can reach themselves, given a name. That is deliberate:
 * it means a filter can be turned down rather than only on or off, it means the
 * sliders keep working after one is chosen, and it means there is nothing in a
 * filter that could not be undone by hand.
 *
 * Named in Kurmancî, like everything else people touch in this app.
 */
export interface FilterPreset {
  key: string;
  label: string;
  /** what it means in English, for the tooltip — the names are not all obvious */
  hint: string;
  adjustments: Adjustments;
}

const preset = (
  key: string,
  label: string,
  hint: string,
  adjustments: Partial<Adjustments>,
): FilterPreset => ({ key, label, hint, adjustments: { ...NEUTRAL, ...adjustments } });

/** The one that does nothing. Always first, and the one every picture starts on. */
export const NO_FILTER = 'orijinal';

export const FILTERS: readonly FilterPreset[] = [
  preset(NO_FILTER, 'Orîjînal', 'No filter', {}),

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

/** The preset for a key, falling back to the one that changes nothing. */
export function presetByKey(key: string): FilterPreset {
  return FILTERS.find((f) => f.key === key) ?? FILTERS[0]!;
}
