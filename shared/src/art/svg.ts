/**
 * The primitives every drawing in `art/` is written with: number formatting, the document wrapper, gradients, colour
 * blends and stable ids. A drawing is a string that must be identical on every machine, so every coordinate is rounded
 * before it is written (Math.sin can differ in its last bit between engines) and randomness only comes from a generator
 * seeded with the drawing's name, as in `scripts/generate-cosmetic-art.mjs`. Only SVG that react-native-svg's `SvgXml`
 * draws like a browser is used: paths, circles, ellipses, groups, linear and radial gradients, and clip paths. No
 * filters, masks, patterns, CSS or `<text>`.
 */

/** Every drawing is made on a 120 × 120 canvas; `size` only sets the display size. */
export const CANVAS = 120;

/** A coordinate as written into SVG: one decimal (a tenth of a unit), never "-0". */
export function n(v: number): string {
  const x = Math.round(v * 10) / 10;
  return String(Object.is(x, -0) ? 0 : x);
}

/** Two decimals, for the few values that are not positions: opacities and gradient offsets. */
export function n2(v: number): string {
  const x = Math.round(v * 100) / 100;
  return String(Object.is(x, -0) ? 0 : x);
}

/** Three decimals, for faint opacities and fine scales, where hundredths would be off by a noticeable share. */
export const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);

export type Pt = readonly [number, number];

export const pt = (p: Pt): string => `${n(p[0])},${n(p[1])}`;

/**
 * Escapes text for `<title>` or an attribute. Titles are caller strings (translations, sometimes user text) and the
 * web inlines the markup, so every character that could open a tag, entity or attribute is escaped, and control
 * characters XML cannot carry (they stop the phone's parser) are dropped.
 */
export function escapeXml(text: string): string {
  return Array.from(text)
    .filter((ch) => isXmlChar(ch.codePointAt(0) ?? 0))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Whether XML 1.0 can carry a code point (lone surrogates and most control characters cannot). */
function isXmlChar(c: number): boolean {
  return c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);
}

/** FNV-1a in base 36: a drawing's inputs as a short, stable id prefix. */
export function hashOf(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** mulberry32 seeded with a name: the same sequence in every JavaScript engine. */
export function seeded(name: string): () => number {
  let s = parseInt(hashOf(name), 36) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────────────── colour

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function hexOf(rgb: readonly number[]): string {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
/** Straight sRGB blend; t = 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.map((c, i) => c + ((y[i] ?? 0) - c) * t));
}
/** Toward white for t > 0, toward black for t < 0. */
export const tint = (hex: string, t: number): string => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));

/** How much detail to keep: 0 all of it, 1 the small drawing, 2 the tiny one. */
export type Detail = 0 | 1 | 2;

// ─────────────────────────────────────────────────────────────── gradients

/** [offset, colour, opacity?] */
export type Stop = readonly [number, string, number?];

const stopsOf = (stops: readonly Stop[]): string =>
  stops
    .map(([o, c, a = 1]) => `<stop offset="${n2(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n2(a)}"`}/>`)
    .join('');

/** A linear gradient in canvas units. */
export const linearAt = (id: string, stops: readonly Stop[], x1: number, y1: number, x2: number, y2: number): string =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stopsOf(stops)}</linearGradient>`;

/** A linear gradient over each shape's own box, top to bottom by default. */
export const linearBox = (id: string, stops: readonly Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string =>
  `<linearGradient id="${id}" x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}">${stopsOf(stops)}</linearGradient>`;

/** A radial gradient over each shape's own box, centred and reaching its edge by default. */
export const radialBox = (id: string, stops: readonly Stop[], cx = 0.5, cy = 0.5, r = 0.5): string =>
  `<radialGradient id="${id}" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}">${stopsOf(stops)}</radialGradient>`;

/** A radial gradient in canvas units. */
export const radialAt = (id: string, stops: readonly Stop[], cx: number, cy: number, r: number): string =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stopsOf(stops)}</radialGradient>`;

// ────────────────────────────────────────────────────────────── the document

/**
 * A drawing in progress: its `defs`, its shapes, and ids that cannot collide with another drawing's. The web inlines
 * these SVGs, so all drawings on a page share one id space; a gradient called "rim" in one badge would otherwise paint
 * every other badge's rim. The prefix is a hash of the request, so it is stable and distinct per drawing; callers
 * drawing the same thing twice on a page pass their own `idPrefix`.
 */
export class Drawing {
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private count = 0;

  constructor(readonly prefix: string) {}

  id(name: string): string {
    this.count += 1;
    return `${this.prefix}${name}${this.count}`;
  }

  def(markup: string): void {
    this.defs.push(markup);
  }

  add(markup: string): void {
    this.body.push(markup);
  }

  /** A clip path for `d`; returns its id. `evenodd` for a ring or a band. */
  clip(d: string, evenodd = false): string {
    const id = this.id('c');
    this.def(`<clipPath id="${id}"><path d="${d}"${evenodd ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    return id;
  }

  /** The defs and body drawn so far, for a caller that wraps them in a non-square frame (a card, a banner). */
  parts(): { defs: string; body: string } {
    return { defs: this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '', body: this.body.join('') };
  }

  /** The finished SVG. `title` is the drawing's accessible label, which the apps also pass alongside. */
  svg(size: number, title: string): string {
    const t = `${this.prefix}t`;
    const defs = this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '';
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
      `<title id="${t}">${escapeXml(title)}</title>${defs}${this.body.join('')}</svg>`
    );
  }
}

/** Validates a requested size: a positive, finite number of pixels. */
export function checkSize(size: number | undefined, fallback: number): number {
  const s = size ?? fallback;
  if (!Number.isFinite(s) || s <= 0) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  return s;
}

/** The id prefix for a drawing: the caller's, or one derived from what was asked for. */
export function prefixFor(idPrefix: string | undefined, ...parts: readonly (string | number | boolean | undefined)[]): string {
  if (idPrefix !== undefined) {
    if (!/^[A-Za-z][\w-]*$/.test(idPrefix)) throw new RangeError(`art: idPrefix must be a plain identifier, got ${idPrefix}`);
    return idPrefix;
  }
  return `hv${hashOf(parts.map((p) => String(p)).join('|'))}`;
}
