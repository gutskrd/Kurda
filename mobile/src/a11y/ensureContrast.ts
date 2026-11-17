/**
 * Adjusts a colour just enough to clear a contrast ratio against a fixed one, such as a monogram avatar's letters
 * on its background. Pure; no React imports.
 */
import { AAA_NORMAL, contrastRatio, hexToRgb, relativeLuminance, type Rgb } from './contrast';

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function channelHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}
function toHex({ r, g, b }: Rgb): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/**
 * Return `color` moved toward black or white, whichever widens the gap, by the smallest step that meets
 * `minRatio` (default 7:1) against `against`. A compliant colour is returned unchanged; an unreachable target
 * returns the closest extreme.
 */
export function ensureContrast(color: string, against: string, minRatio: number = AAA_NORMAL): string {
  const src = hexToRgb(color);
  if (contrastRatio(src, against) >= minRatio) return toHex(src);
  // Moving away from `against`'s luminance widens the ratio.
  const target = relativeLuminance(against) >= relativeLuminance(src) ? BLACK : WHITE;
  let best = target; // Fallback = the extreme (maximum achievable).
  for (let t = 0.04; t <= 1; t += 0.04) {
    const cand = mix(src, target, t);
    if (contrastRatio(cand, against) >= minRatio) {
      best = cand;
      break;
    }
  }
  return toHex(best);
}
