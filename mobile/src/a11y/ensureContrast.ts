/**
 * Contrast-guaranteeing colour adjustment (KUR-266, High Contrast). The contrast
 * module can *measure* a ratio; this *fixes* one — darkening or lightening a
 * colour just enough that it clears a target ratio against a fixed counterpart.
 * Pure + deterministic. Used to keep text legible on any background (e.g. the
 * monogram avatar's white letters), and as the primitive behind a high-contrast
 * pass. No React / RN imports.
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
 * Return `color` adjusted so it meets `minRatio` contrast (default AAA 7:1)
 * against `against`, moved toward black or white — whichever increases the gap
 * — by the smallest step that clears the bar. Already-compliant colours are
 * returned unchanged; if the target is unreachable (e.g. against mid-grey with a
 * very high ratio) the closest achievable extreme is returned.
 */
export function ensureContrast(color: string, against: string, minRatio: number = AAA_NORMAL): string {
  const src = hexToRgb(color);
  if (contrastRatio(src, against) >= minRatio) return toHex(src);
  // moving away from `against`'s luminance widens the ratio
  const target = relativeLuminance(against) >= relativeLuminance(src) ? BLACK : WHITE;
  let best = target; // fallback = the extreme (maximum achievable)
  for (let t = 0.04; t <= 1; t += 0.04) {
    const cand = mix(src, target, t);
    if (contrastRatio(cand, against) >= minRatio) {
      best = cand;
      break;
    }
  }
  return toHex(best);
}
