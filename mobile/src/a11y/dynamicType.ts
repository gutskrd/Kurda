/**
 * Dynamic Type: honour the OS font size but clamp it, since React Native's scaling has no upper bound and the
 * largest accessibility sizes overflow tight layouts. `useFontScale` is the React wrapper.
 */

/** Default clamp: a little shrink, and growth up to 1.6×. Dense UI can pass a tighter `max`. */
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.6;

export interface FontScaleOptions {
  min?: number;
  max?: number;
}

/** Clamp an OS font scale into range; missing or invalid values (0, NaN, negative) become 1. */
export function clampFontScale(scale: number, opts: FontScaleOptions = {}): number {
  const min = opts.min ?? MIN_FONT_SCALE;
  const max = opts.max ?? MAX_FONT_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) return Math.min(Math.max(1, min), max);
  return Math.min(max, Math.max(min, scale));
}

/** A base size scaled by the clamped OS font scale, rounded to a whole pixel, for text with auto-scaling turned off. */
export function scaledFontSize(baseSize: number, scale: number, opts?: FontScaleOptions): number {
  return Math.round(baseSize * clampFontScale(scale, opts));
}
