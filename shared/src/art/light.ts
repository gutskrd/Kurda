/**
 * The light over the lesson road and its chapters' banners. By day the painted valley's colours are drawn a little
 * deeper, so the land holds its own beside the page; by night every colour is seen under the moon: a deep teal, dim
 * and nearly grey, with a trace of what it is by day, as the app's own night is. A whole drawing is relit at once by recolouring its hex colours.
 */
import { mix } from './svg.js';

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function hexOf(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');
}

function hslOf(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hexOfHsl(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return hexOf(f(0), f(8), f(4));
}

/** The road's daylight: each colour a little richer and a shade deeper, white and near-greys left as they are. */
export function sunlit(hex: string): string {
  const [h, s, l] = hslOf(hex);
  if (s < 0.08 || l > 0.97) return hex;
  return hexOfHsl(h, Math.min(0.9, s * 1.12 + 0.02), l > 0.45 ? l - 0.03 : l);
}

/** The hue the moon gives everything, and how much of a colour's own hue survives it. */
const MOON = { hue: 190, keep: 0.12 } as const;

/**
 * The road's moonlight: every colour turned toward the moon's blue, its saturation mostly lost, and its brightness
 * curved down so the land is deep but still reads, the road and snow catching the most light.
 */
export function moonlit(hex: string): string {
  const [h, s, l] = hslOf(hex);
  // Warm colours turn through green to the moon's teal, as cool ones already lean; only purples and reds come back the
  // other way, so no brown field goes violet.
  const turn = (MOON.hue - h) * (1 - MOON.keep);
  return hexOfHsl((h + turn + 360) % 360, Math.min(0.42, 0.14 + s * 0.28), 0.06 + l * l * 0.48);
}

/** A colour that lights itself at night (a lit window, a lantern, fire): warm, strong and bright. */
function isLamp(hex: string): boolean {
  const [h, s, l] = hslOf(hex);
  return h >= 18 && h <= 62 && s >= 0.6 && l >= 0.5;
}

/** Moonlight over a drawing made for the evening, its lit windows and fires left burning. */
export function moonlitKeepingLamps(hex: string): string {
  return isLamp(hex) ? hex : moonlit(hex);
}

/** A light that is its own (a lit window, a lantern, a fire): left warm at night, only a little dimmed. */
export function lamplit(hex: string): string {
  return mix(hex, '#0c1c1e', 0.08);
}

/** The drawing with every hex colour passed through `light`. */
export function relight(svg: string, light: (hex: string) => string): string {
  const seen = new Map<string, string>();
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const key = hex.toLowerCase();
    let out = seen.get(key);
    if (out === undefined) {
      out = light(key);
      seen.set(key, out);
    }
    return out;
  });
}

/** By day or by night, as the road is lit. */
export const roadLight = (dark: boolean): ((hex: string) => string) => (dark ? moonlit : sunlit);
