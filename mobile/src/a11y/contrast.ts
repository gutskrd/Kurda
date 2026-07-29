/**
 * WCAG colour-contrast checking (KUR-266). Pure functions to compute the
 * contrast ratio between two colours and test it against WCAG AA / AAA, so the
 * design-token palette can be audited (in light and dark mode) and so we never
 * rely on colour alone to convey state. Follows the WCAG 2.x relative-luminance
 * definition. No React / RN imports — plain values in, verdict out.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse a #rgb or #rrggbb hex string (leading # optional) into 0–255 channels. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, '');
  const expanded =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/** Linearize one sRGB channel (0–1) per the WCAG formula. */
function linearize(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). Accepts hex or Rgb. */
export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === 'string' ? hexToRgb(color) : color;
  const R = linearize(r / 255);
  const G = linearize(g / 255);
  const B = linearize(b / 255);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Contrast ratio between two colours, from 1:1 (identical) to 21:1 (black on
 * white). Order-independent.
 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG minimum ratios. Large text = ≥18.66px bold or ≥24px regular. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export const AAA_NORMAL = 7;
export const AAA_LARGE = 4.5;

export interface ContrastOptions {
  /** the text is "large" (relaxed threshold) */
  largeText?: boolean;
  /** require AAA instead of AA */
  level?: 'AA' | 'AAA';
}

/** The required ratio for the given level + text size. */
export function requiredRatio({ largeText = false, level = 'AA' }: ContrastOptions = {}): number {
  if (level === 'AAA') return largeText ? AAA_LARGE : AAA_NORMAL;
  return largeText ? AA_LARGE : AA_NORMAL;
}

export interface ContrastResult {
  ratio: number;
  required: number;
  passes: boolean;
}

/**
 * Check a foreground/background pair against WCAG. Defaults to AA for normal
 * text. Returns the measured ratio, the threshold, and whether it passes.
 */
export function checkContrast(
  foreground: string | Rgb,
  background: string | Rgb,
  options: ContrastOptions = {},
): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  const required = requiredRatio(options);
  // round to 2dp so a value like 4.4999 doesn't spuriously pass/fail on noise
  const rounded = Math.round(ratio * 100) / 100;
  return { ratio: rounded, required, passes: rounded >= required };
}
