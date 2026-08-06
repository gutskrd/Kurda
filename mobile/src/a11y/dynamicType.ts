/**
 * Dynamic Type support (KUR-266). Respect the OS font-size setting, but clamp it
 * so large-text accessibility works without shattering space-constrained layouts
 * (React Native's default font scaling has no upper bound — at the largest iOS
 * accessibility sizes unclamped text overflows and clips). The clamp math lives
 * here, pure + unit-tested; `useFontScale` is the thin RN wrapper.
 */

/** Default clamp: allow a little shrink, and growth up to 1.6×. Dense/space-
 *  critical UI can pass a tighter `max`; roomy UI a looser one. */
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.6;

export interface FontScaleOptions {
  min?: number;
  max?: number;
}

/** Clamp an OS font scale into a safe range. Missing/garbage values (0, NaN,
 *  negative) fall back to 1 (neutral) so callers never produce a broken size. */
export function clampFontScale(scale: number, opts: FontScaleOptions = {}): number {
  const min = opts.min ?? MIN_FONT_SCALE;
  const max = opts.max ?? MAX_FONT_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) return Math.min(Math.max(1, min), max);
  return Math.min(max, Math.max(min, scale));
}

/**
 * A base token size scaled by the (clamped) OS font scale, rounded to a whole
 * pixel. Use for text whose auto-scaling is turned off (e.g. tightly-fitted
 * elements) so it still honours Dynamic Type within safe bounds.
 */
export function scaledFontSize(baseSize: number, scale: number, opts?: FontScaleOptions): number {
  return Math.round(baseSize * clampFontScale(scale, opts));
}
