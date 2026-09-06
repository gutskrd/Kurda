/**
 * Colour, in the three ways people write it down.
 *
 * The picker shows Hex, RGB and HSL at once and lets you type into any of them,
 * so every conversion has to round-trip: type `#3ab26f`, and the HSL you get
 * back must be the HSL that produces `#3ab26f` again. All of it is pure, which
 * is the only reason that is checkable.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** degrees, 0–360 */
  h: number;
  /** percent, 0–100 */
  s: number;
  /** percent, 0–100 */
  l: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round = (n: number): number => Math.round(n * 1000) / 1000;

/** `#abc`, `#aabbcc` or `aabbcc` — anything else is not a colour. */
export function parseHex(input: string): Rgb | null {
  const raw = input.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const byte = (n: number): string => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const span = max - min;
  const l = (max + min) / 2;

  if (span === 0) return { h: 0, s: 0, l: round(l * 100) };

  const s = span / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / span) % 6;
  else if (max === gn) h = (bn - rn) / span + 2;
  else h = (rn - gn) / span + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** `rgb(58, 178, 111)` or `58, 178, 111` or `58 178 111`. */
export function parseRgb(input: string): Rgb | null {
  const nums = input.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [r, g, b] = nums.slice(0, 3).map(Number);
  if ([r, g, b].some((n) => !Number.isFinite(n) || n! < 0 || n! > 255)) return null;
  return { r: Math.round(r!), g: Math.round(g!), b: Math.round(b!) };
}

/** `hsl(150, 51%, 46%)` or `150, 51, 46`. */
export function parseHsl(input: string): Hsl | null {
  const nums = input.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [h, s, l] = nums.slice(0, 3).map(Number);
  if ([h, s, l].some((n) => !Number.isFinite(n))) return null;
  if (s! < 0 || s! > 100 || l! < 0 || l! > 100) return null;
  return { h: ((h! % 360) + 360) % 360, s: s!, l: l! };
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
}

export function formatHsl({ h, s, l }: Hsl): string {
  return `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%`;
}

/**
 * Where a colour sits on the picker: which hue, and where in the square.
 *
 * The square is saturation across and value down, which is what a picker looks
 * like — HSL's lightness is not the same axis, so the two are kept apart and
 * converted at the edges rather than confused in the middle.
 */
export interface Hsv {
  h: number;
  /** 0–1 across the square */
  s: number;
  /** 0–1 up the square */
  v: number;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const span = max - Math.min(rn, gn, bn);

  let h = 0;
  if (span !== 0) {
    if (max === rn) h = ((gn - bn) / span) % 6;
    else if (max === gn) h = (bn - rn) / span + 2;
    else h = (rn - gn) / span + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: round(h), s: max === 0 ? 0 : round(span / max), v: round(max) };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const val = clamp(v, 0, 1);

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0]
    : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c]
    : [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}
