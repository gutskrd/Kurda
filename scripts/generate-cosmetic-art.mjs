/**
 * The shop's backgrounds and icons, the photo editor's stickers, the flag the
 * "Ala" filter lays over a picture, and the admin's backdrop — every one of
 * them drawn by this file, from nothing but this file.
 *
 *   node scripts/generate-cosmetic-art.mjs              write into the repo
 *   node scripts/generate-cosmetic-art.mjs --out <dir>  write the same tree under <dir>
 *
 * ── what it draws ─────────────────────────────────────────────────────────
 *
 * Backgrounds (1280×720 WebP): skies in graded colour with mountain ridges,
 * hills, suns, moons, seeded stars, mist and blossom; and kilims — diamonds,
 * hooks, zigzags and eight-point stars laid out the way a woven kilim is, with
 * the slight colour drift (abrash) of hand-dyed wool. Icons (512×512 PNG):
 * bold, friendly motifs with one outline weight, so they sit together on an
 * avatar. Stickers (512×512 WebP): the suns, a Kurdistan flag badge, the
 * Hevalo deer and a few words in a badge.
 *
 * Every piece has a Kurdish and an English name. The shop catalogue
 * (`api/content/cosmetics.json`) prices them; the names there must match the
 * ones here, which api/src/cosmetics/art.test.ts checks.
 *
 * ── why nothing is read from disk ──────────────────────────────────────────
 *
 * The lettering on the word stickers is a small stroke alphabet defined below
 * rather than a font. A font would be whatever the machine running this had
 * installed, and the same script would draw different letters on a laptop and
 * on CI. Shapes are SVG strings with every number rounded to two decimals, and
 * every random choice comes from a generator seeded with the piece's name, so
 * the same script writes the same SVG on every machine and sharp turns it into
 * the same pixels. The test regenerates everything into a temporary folder and
 * compares it with what is committed: what ships is what this draws.
 *
 * ── what it owns ──────────────────────────────────────────────────────────
 *
 * `web/public/cosmetics/backgrounds`, `web/public/cosmetics/icons` and
 * `web/public/stickers` belong to this script whole: a file in them that it did
 * not write is removed when it runs against the repo. It also writes
 * `web/public/filters/kurdistan.webp` and `admin/public/background.jpg`.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ───────────────────────────────────────────────────────────── determinism

/** FNV-1a: a piece's name becomes its seed, so renaming a piece redraws it. */
function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** mulberry32 — small, fast, and the same sequence in every JavaScript engine. */
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A number as it is written into SVG: two decimals, and never "-0".
 *
 * Rounding is what keeps the text identical across machines: Math.sin may
 * differ in its last bit between platforms, and two decimals of a pixel is far
 * coarser than that.
 */
function n(v) {
  const x = Math.round(v * 100) / 100;
  return String(Object.is(x, -0) ? 0 : x);
}
const pt = ([x, y]) => `${n(x)},${n(y)}`;
const poly = (points) => points.map(pt).join(' ');
const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();
const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

// ────────────────────────────────────────────────────────────────── colour

function rgbOf(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function hexOf(rgb) {
  return '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}
/** Straight sRGB blend; t = 0 is `a`, 1 is `b`. */
function mix(a, b, t) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.map((c, i) => c + (y[i] - c) * t));
}
/** Toward white for t > 0, toward black for t < 0. */
const tint = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));

/** Hevalo's colours: the brand purples, Newroz's gold, red and green, night, dawn, pasture. */
const C = {
  plum: '#2b1740',
  ink: '#1a0e29',
  violet: '#6b3fa0',
  lilac: '#b874f0',
  lavender: '#d9b8ff',
  gold: '#f2b632',
  amber: '#e8892b',
  red: '#d7263d',
  crimson: '#9e1b32',
  green: '#2a9d4b',
  pine: '#1f5c45',
  moss: '#6a9f6b',
  night: '#0b1a3a',
  navy: '#14295a',
  blue: '#2f5fa8',
  teal: '#1f8a8a',
  ice: '#cfe8f5',
  pink: '#f7a8b8',
  peach: '#ffd4a3',
  cream: '#fff4e0',
  white: '#ffffff',
  brown: '#8a5a3b',
};

/** The Kurdistan flag's own colours. */
const FLAG = { red: '#ed2024', white: '#ffffff', green: '#278e43', sun: '#febd11' };

// ───────────────────────────────────────────────────────────── svg helpers

const doc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

/** stops: [offset, colour, opacity?][] */
const stopsOf = (stops) =>
  stops
    .map(([o, c, a = 1]) => `<stop offset="${n(o)}" stop-color="${c}"${a === 1 ? '' : ` stop-opacity="${n(a)}"`}/>`)
    .join('');
const linear = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stopsOf(stops)}</linearGradient>`;
const radial = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stopsOf(stops)}</radialGradient>`;
/** A radial gradient in canvas pixels rather than in the shape's box. */
const radialAt = (id, stops, cx, cy, r) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stopsOf(stops)}</radialGradient>`;
const blur = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(sd)}"/></filter>`;

/**
 * A canvas-sized drawing in progress: a list of `defs`, a list of shapes, and
 * a counter so every gradient gets an id of its own.
 */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.defs = [];
    this.body = [];
    this.ids = 0;
  }
  id(prefix) {
    this.ids += 1;
    return `${prefix}${this.ids}`;
  }
  def(markup) {
    this.defs.push(markup);
  }
  add(markup) {
    this.body.push(markup);
  }
  svg() {
    return doc(this.w, this.h, this.defs.join(''), this.body.join(''));
  }
}

// ────────────────────────────────────────────────────────── landscape layers

/** The sky: a vertical gradient over the whole canvas. */
function sky(cv, stops, angle = 0) {
  const id = cv.id('sky');
  // a slight slant keeps a wide gradient from reading as horizontal stripes
  const dx = Math.sin((angle * Math.PI) / 180) / 2;
  cv.def(linear(id, stops, 0.5 - dx, 0, 0.5 + dx, 1));
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${id})"/>`);
}

/** A soft round light — a sun's halo, a glow behind a ridge. */
function glow(cv, cx, cy, r, colour, opacity) {
  const id = cv.id('glow');
  cv.def(radialAt(id, [[0, colour, opacity], [0.45, colour, opacity * 0.45], [1, colour, 0]], cx, cy, r));
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
}

function disc(cv, cx, cy, r, colour, rim) {
  const id = cv.id('disc');
  cv.def(radial(id, [[0, tint(colour, 0.35)], [0.7, colour], [1, rim ?? tint(colour, -0.08)]], 0.42, 0.4, 0.62));
  cv.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
}

/** A crescent: a disc with a second, offset disc taken out of it. */
function crescentPath(cx, cy, r, bite = 0.62, tilt = -0.5) {
  const ox = Math.cos(tilt) * r * bite;
  const oy = Math.sin(tilt) * r * bite;
  const r2 = r * 0.92;
  // the two circles' intersection points, solved directly
  const d = Math.hypot(ox, oy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = ox / d;
  const uy = oy / d;
  const mx = cx + ux * a;
  const my = cy + uy * a;
  const p1 = [mx - uy * hh, my + ux * hh];
  const p2 = [mx + uy * hh, my - ux * hh];
  return `M${pt(p1)} A${n(r)},${n(r)} 0 1 1 ${pt(p2)} A${n(r2)},${n(r2)} 0 1 0 ${pt(p1)} Z`;
}

function moon(cv, cx, cy, r, colour, glowColour) {
  glow(cv, cx, cy, r * 4.2, glowColour ?? colour, 0.22);
  const id = cv.id('moon');
  cv.def(radial(id, [[0, tint(colour, 0.4)], [1, colour]], 0.35, 0.35, 0.8));
  cv.add(`<path d="${crescentPath(cx, cy, r)}" fill="url(#${id})"/>`);
}

/** A four-pointed glint, for the few stars bright enough to have one. */
function sparkle(x, y, r) {
  const k = r * 0.22;
  return `M${pt([x, y - r])} Q${pt([x + k, y - k])} ${pt([x + r, y])} Q${pt([x + k, y + k])} ${pt([x, y + r])} Q${pt([x - k, y + k])} ${pt([x - r, y])} Q${pt([x - k, y - k])} ${pt([x, y - r])} Z`;
}

/**
 * Seeded stars, thinning toward the horizon, mostly pinpricks with a handful
 * of bright ones — a sky with all its stars the same size reads as noise.
 */
function stars(cv, rnd, { count, top = 0, bottom, colour = '#ffffff', bright = 6 }) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    // squaring the draw crowds them toward the top
    const y = top + (bottom - top) * rnd() * rnd();
    const r = 0.5 + rnd() * rnd() * 1.6;
    const a = 0.35 + rnd() * 0.6;
    dots.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${colour}" fill-opacity="${n(a)}"/>`);
  }
  cv.add(`<g>${dots.join('')}</g>`);
  for (let i = 0; i < bright; i++) {
    const x = between(rnd, 40, cv.w - 40);
    const y = top + (bottom - top) * rnd() * 0.7;
    const r = between(rnd, 7, 13);
    glow(cv, x, y, r * 2.6, colour, 0.35);
    cv.add(`<path d="${sparkle(x, y, r)}" fill="${colour}" fill-opacity="0.9"/>`);
  }
}

/**
 * The tops of a ridge, left to right, past both edges so nothing ends in the
 * frame. `jag` is how far a peak may stray from the line through its
 * neighbours.
 */
function ridgePoints(rnd, w, { base, amp, peaks }) {
  const out = [];
  const step = (w + 200) / peaks;
  for (let i = 0; i <= peaks; i++) {
    const x = -100 + i * step + between(rnd, -0.3, 0.3) * step;
    // alternate high and low so it reads as peaks and saddles, then vary both
    const high = i % 2 === 0;
    const y = base - (high ? between(rnd, 0.55, 1) : between(rnd, 0.05, 0.4)) * amp;
    out.push([x, y]);
  }
  return out;
}

/** Straight-sided mountains: a polyline of peaks, closed along the bottom. */
function mountains(cv, rnd, { base, amp, peaks, fill, snow }) {
  const tops = ridgePoints(rnd, cv.w, { base, amp, peaks });
  const d = `M${pt([-100, cv.h + 10])} L${poly(tops)} L${pt([cv.w + 100, cv.h + 10])} Z`;
  cv.add(`<path d="${d}" fill="${fill}"/>`);
  if (snow) {
    // a cap on each high peak: the peak and two points part-way down its flanks
    for (let i = 0; i < tops.length; i++) {
      if (i % 2 !== 0) continue;
      const [x, y] = tops[i];
      const left = tops[i - 1] ?? [x - 120, y + amp];
      const right = tops[i + 1] ?? [x + 120, y + amp];
      const k = 0.28;
      const l = [x + (left[0] - x) * k, y + (left[1] - y) * k];
      const r = [x + (right[0] - x) * k, y + (right[1] - y) * k];
      const mid = [x + between(rnd, -8, 8), y + Math.min(l[1] - y, r[1] - y) * 0.75];
      cv.add(`<path d="M${pt(l)} L${pt([x, y])} L${pt(r)} L${pt([(r[0] + mid[0]) / 2, mid[1] + 6])} L${pt(mid)} L${pt([(l[0] + mid[0]) / 2, mid[1] + 4])} Z" fill="${snow}"/>`);
    }
  }
  return tops;
}

/**
 * Rounded hills: the same kind of ridge, drawn through with a Catmull-Rom curve
 * so it rolls rather than peaks.
 */
function hills(cv, rnd, { base, amp, peaks, fill }) {
  const p = ridgePoints(rnd, cv.w, { base, amp, peaks });
  let d = `M${pt([-100, cv.h + 10])} L${pt(p[0])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  d += ` L${pt([cv.w + 100, cv.h + 10])} Z`;
  cv.add(`<path d="${d}" fill="${fill}"/>`);
  return p;
}

/** A band of haze that fades in and out again — distance between two ridges. */
function mist(cv, y, h, colour, opacity) {
  const id = cv.id('mist');
  cv.def(linear(id, [[0, colour, 0], [0.5, colour, opacity], [1, colour, 0]]));
  cv.add(`<rect x="0" y="${n(y)}" width="${cv.w}" height="${n(h)}" fill="url(#${id})"/>`);
}

/** Pines: stacked triangles standing on a line, seeded in height and spacing. */
function pines(cv, rnd, { y, count, height, fill, spread = 1 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = between(rnd, -30, cv.w + 30);
    const h = height * between(rnd, 0.55, 1.1) * spread;
    const w = h * between(rnd, 0.3, 0.38);
    const base = y + between(rnd, -10, 25);
    const tiers = 4;
    let d = `M${pt([x - 3, base])} L${pt([x - 3, base + 20])} L${pt([x + 3, base + 20])} L${pt([x + 3, base])} Z`;
    for (let t = 0; t < tiers; t++) {
      const top = base - h + (h * t) / (tiers + 0.6);
      const bottom = top + h / 2.1;
      const half = (w / 2) * (0.45 + (0.55 * (t + 1)) / tiers);
      d += ` M${pt([x, top])} L${pt([x + half, bottom])} L${pt([x - half, bottom])} Z`;
    }
    out.push(`<path d="${d}" fill="${fill}"/>`);
  }
  cv.add(out.join(''));
}

/** Light on water: thin horizontal strokes under a sun or moon, shorter further down. */
function shimmer(cv, rnd, { x, top, bottom, colour, width }) {
  const lines = [];
  for (let y = top; y < bottom; y += between(rnd, 5, 11)) {
    const t = (y - top) / (bottom - top);
    const w = width * (1 - t * 0.6) * between(rnd, 0.3, 1);
    const cx = x + between(rnd, -1, 1) * width * 0.25;
    lines.push(`<rect x="${n(cx - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(between(rnd, 1.5, 3))}" rx="1.5" fill="${colour}" fill-opacity="${n((1 - t) * between(rnd, 0.25, 0.6))}"/>`);
  }
  cv.add(lines.join(''));
}

/** Curtains of an aurora: wide blurred strokes along slow curves. */
function aurora(cv, rnd, colours) {
  const id = cv.id('blur');
  cv.def(blur(id, 26));
  const bands = [];
  for (const [i, colour] of colours.entries()) {
    const y = 150 + i * 70 + between(rnd, -30, 30);
    const a = between(rnd, 60, 120);
    const ph = rnd() * Math.PI * 2;
    const pts = [];
    for (let x = -100; x <= cv.w + 100; x += 80) pts.push([x, y + Math.sin(x / 260 + ph) * a]);
    bands.push(`<polyline points="${poly(pts)}" fill="none" stroke="${colour}" stroke-width="${n(between(rnd, 50, 90))}" stroke-opacity="${n(between(rnd, 0.35, 0.55))}" stroke-linecap="round"/>`);
  }
  cv.add(`<g filter="url(#${id})">${bands.join('')}</g>`);
}

/** Five round petals around a centre. */
function flower(x, y, r, petal, centre, opacity = 1) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    parts.push(`<circle cx="${n(x + Math.cos(a) * r * 0.55)}" cy="${n(y + Math.sin(a) * r * 0.55)}" r="${n(r * 0.5)}" fill="${petal}"/>`);
  }
  parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.28)}" fill="${centre}"/>`);
  return `<g opacity="${n(opacity)}">${parts.join('')}</g>`;
}

/** Blossom: flowers scattered in a band, the near ones bigger, plus out-of-focus discs. */
function blossom(cv, rnd, { count, top, bottom, petals, centre, bokeh = 0 }) {
  const id = cv.id('blur');
  cv.def(blur(id, 9));
  const soft = [];
  for (let i = 0; i < bokeh; i++) {
    soft.push(`<circle cx="${n(rnd() * cv.w)}" cy="${n(between(rnd, top, bottom))}" r="${n(between(rnd, 14, 46))}" fill="${pick(rnd, petals)}" fill-opacity="${n(between(rnd, 0.15, 0.4))}"/>`);
  }
  cv.add(`<g filter="url(#${id})">${soft.join('')}</g>`);
  const sharpOnes = [];
  for (let i = 0; i < count; i++) {
    const t = rnd();
    const y = top + (bottom - top) * t;
    const r = 5 + 22 * t * t * between(rnd, 0.6, 1);
    sharpOnes.push(flower(rnd() * cv.w, y, r, pick(rnd, petals), centre, between(rnd, 0.7, 1)));
  }
  cv.add(sharpOnes.join(''));
}

/** Tulips in a field: a cup of three petals on a stem, nearer ones larger. */
function tulipField(cv, rnd, { count, top, bottom, colours, stem }) {
  const out = [];
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(top + (bottom - top) * Math.sqrt(rnd()));
  rows.sort((a, b) => a - b);
  for (const y of rows) {
    const t = (y - top) / (bottom - top);
    const s = 6 + 26 * t;
    const x = rnd() * cv.w;
    const lean = between(rnd, -0.25, 0.25);
    const colour = pick(rnd, colours);
    const head = [x + lean * s * 2, y - s * 2.2];
    out.push(`<path d="M${pt([x, y + s])} Q${pt([x + lean * s, y - s * 0.6])} ${pt(head)}" stroke="${stem}" stroke-width="${n(Math.max(1.2, s * 0.16))}" fill="none"/>`);
    out.push(`<path d="M${pt([head[0] - s * 0.55, head[1] - s * 0.9])} Q${pt([head[0] - s * 0.62, head[1] + s * 0.45])} ${pt([head[0], head[1] + s * 0.45])} Q${pt([head[0] + s * 0.62, head[1] + s * 0.45])} ${pt([head[0] + s * 0.55, head[1] - s * 0.9])} L${pt([head[0] + s * 0.25, head[1] - s * 0.5])} L${pt([head[0], head[1] - s * 1.05])} L${pt([head[0] - s * 0.25, head[1] - s * 0.5])} Z" fill="${colour}"/>`);
  }
  cv.add(out.join(''));
}

/** Fireflies: tiny warm dots with a halo each. */
function fireflies(cv, rnd, { count, top, bottom, colour }) {
  const id = cv.id('blur');
  cv.def(blur(id, 5));
  const halos = [];
  const cores = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * cv.w;
    const y = between(rnd, top, bottom);
    const r = between(rnd, 1.2, 3);
    halos.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 4)}" fill="${colour}" fill-opacity="${n(between(rnd, 0.25, 0.55))}"/>`);
    cores.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${tint(colour, 0.6)}"/>`);
  }
  cv.add(`<g filter="url(#${id})">${halos.join('')}</g>${cores.join('')}`);
}

/** Wide wedges of light from a point, very faint. */
function beams(cv, { x, y, colour, count = 7, spread = 1.2, opacity = 0.12, length = 1400 }) {
  const id = cv.id('beam');
  cv.def(radialAt(id, [[0, colour, opacity], [1, colour, 0]], x, y, length));
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI / 2 + (i / (count - 1) - 0.5) * spread;
    const w = 0.035;
    const p1 = [x + Math.cos(a - w) * length, y + Math.sin(a - w) * length];
    const p2 = [x + Math.cos(a + w) * length, y + Math.sin(a + w) * length];
    out.push(`<path d="M${pt([x, y])} L${pt(p1)} L${pt(p2)} Z" fill="url(#${id})"/>`);
  }
  cv.add(out.join(''));
}

/** Darkened corners, so whatever sits on top of the background reads. */
function vignette(cv, strength = 0.35, colour = '#000000') {
  const id = cv.id('vig');
  cv.def(radial(id, [[0.55, colour, 0], [1, colour, strength]], 0.5, 0.5, 0.75));
  cv.add(`<rect width="${cv.w}" height="${cv.h}" fill="url(#${id})"/>`);
}

// ─────────────────────────────────────────────────────────────── the kilim

/** An eight-point star: two squares, one turned 45°, as one sixteen-point outline. */
function eightPointStar(cx, cy, R) {
  const r = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8) * 0.93;
  const p = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    p.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return `M${poly(p)} Z`;
}

const diamond = (cx, cy, w, h) => `M${pt([cx, cy - h / 2])} L${pt([cx + w / 2, cy])} L${pt([cx, cy + h / 2])} L${pt([cx - w / 2, cy])} Z`;

/**
 * A diamond whose outline steps the way a weft-faced weave does: each edge is a
 * staircase of `steps` treads, which is what makes a lozenge read as woven
 * rather than drawn.
 */
function steppedDiamond(cx, cy, w, h, steps) {
  const hw = w / 2;
  const hh = h / 2;
  const sx = hw / steps;
  const sy = hh / steps;
  const p = [[cx, cy - hh]];
  for (let i = 0; i < steps; i++) p.push([cx + sx * i, cy - hh + sy * (i + 1)], [cx + sx * (i + 1), cy - hh + sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx + hw - sx * i, cy + sy * (i + 1)], [cx + hw - sx * (i + 1), cy + sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx - sx * i, cy + hh - sy * (i + 1)], [cx - sx * (i + 1), cy + hh - sy * (i + 1)]);
  for (let i = 0; i < steps; i++) p.push([cx - hw + sx * i, cy - sy * (i + 1)], [cx - hw + sx * (i + 1), cy - sy * (i + 1)]);
  return `M${poly(p)} Z`;
}

/**
 * Hooks along a lozenge's four edges: a short stem out from the edge, then a
 * turn along it — the "ram's horn" hook kilims are full of.
 */
function hooks(cx, cy, w, h, per, len, colour, width) {
  const corners = [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]];
  const out = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    const tx = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ty = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    // outward normal for a clockwise outline
    const nx = ty;
    const ny = -tx;
    for (let k = 1; k <= per; k++) {
      const t = k / (per + 1);
      const p0 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const p1 = [p0[0] + nx * len, p0[1] + ny * len];
      const p2 = [p1[0] + tx * len * 0.7, p1[1] + ty * len * 0.7];
      out.push(`M${pt(p0)} L${pt(p1)} L${pt(p2)}`);
    }
  }
  return `<path d="${out.join(' ')}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linejoin="miter"/>`;
}

/** A row of triangles across the width, alternating two colours; `down` points them at the bottom edge. */
function zigzag(cv, y, h, size, a, b, down = false) {
  const out = [];
  const [base, tip] = down ? [y, y + h] : [y + h, y];
  let i = 0;
  for (let x = -size; x < cv.w + size; x += size) {
    out.push(`<path d="M${pt([x, base])} L${pt([x + size / 2, tip])} L${pt([x + size, base])} Z" fill="${i % 2 === 0 ? a : b}"/>`);
    i += 1;
  }
  cv.add(out.join(''));
}

/**
 * A kilim: a field with abrash, borders of stripes, zigzags and small diamonds,
 * and a row of hooked lozenges with eight-point stars between them.
 *
 * `field` is the ground, `ink` the dark outlining colour, `accents` the dyes
 * the motifs are woven in. Which motif takes which dye is seeded, so the same
 * palette makes a different kilim under a different name.
 */
function kilim(cv, rnd, { field, ink, accents, light }) {
  const { w, h } = cv;
  // abrash: hand-dyed wool comes in batches that never quite match, so the
  // ground drifts in horizontal bands
  for (let y = 0; y < h; ) {
    const bh = between(rnd, 14, 60);
    cv.add(`<rect x="0" y="${n(y)}" width="${w}" height="${n(bh + 1)}" fill="${tint(field, between(rnd, -0.06, 0.05))}"/>`);
    y += bh;
  }
  const shuffled = [...accents].sort(() => rnd() - 0.5);
  const A = shuffled[0];
  const B = shuffled[1 % shuffled.length];
  const D = shuffled[2 % shuffled.length];

  // the borders, mirrored top and bottom
  for (const flip of [false, true]) {
    const yy = (v) => (flip ? h - v : v);
    const band = (y0, hh, colour) => cv.add(`<rect x="0" y="${n(Math.min(yy(y0), yy(y0 + hh)))}" width="${w}" height="${n(hh)}" fill="${colour}"/>`);
    band(0, 26, ink);
    band(26, 6, light);
    band(32, 8, ink);
    zigzag(cv, flip ? h - 70 : 40, 30, 30, A, B, flip);
    band(70, 6, ink);
    // a chain of small diamonds
    const cy = yy(94);
    const chain = [];
    for (let x = 12, i = 0; x < w + 24; x += 36, i++) {
      chain.push(`<path d="${diamond(x, cy, 26, 26)}" fill="${i % 2 ? D : light}"/>`);
      chain.push(`<path d="${diamond(x, cy, 10, 10)}" fill="${ink}"/>`);
    }
    cv.add(chain.join(''));
    band(112, 6, ink);
  }

  // the main row: lozenges centred on the canvas, one half off each edge so
  // the pattern reads as cut from a longer weave
  const cy = h / 2;
  const lw = 300;
  const lh = 300;
  const gap = 340;
  const xs = [];
  for (let x = w / 2 - gap * 2; x <= w / 2 + gap * 2 + 1; x += gap) xs.push(x);
  for (const [i, x] of xs.entries()) {
    const outer = i % 2 === 0 ? A : B;
    const inner = i % 2 === 0 ? B : D;
    cv.add(hooks(x, cy, lw, lh, 3, 26, outer, 9));
    cv.add(`<path d="${steppedDiamond(x, cy, lw, lh, 9)}" fill="${ink}"/>`);
    cv.add(`<path d="${steppedDiamond(x, cy, lw - 30, lh - 30, 8)}" fill="${outer}"/>`);
    cv.add(`<path d="${steppedDiamond(x, cy, lw - 92, lh - 92, 6)}" fill="${light}"/>`);
    cv.add(`<path d="${steppedDiamond(x, cy, lw - 122, lh - 122, 5)}" fill="${inner}"/>`);
    cv.add(`<path d="${eightPointStar(x, cy, 34)}" fill="${ink}"/>`);
    cv.add(`<path d="${eightPointStar(x, cy, 22)}" fill="${light}"/>`);
    cv.add(`<path d="${diamond(x, cy, 14, 14)}" fill="${outer}"/>`);
  }
  // stars between the lozenges, and small diamonds above and below them
  for (let i = 0; i < xs.length - 1; i++) {
    const x = (xs[i] + xs[i + 1]) / 2;
    const s = pick(rnd, [A, B, D]);
    cv.add(`<path d="${eightPointStar(x, cy, 46)}" fill="${ink}"/>`);
    cv.add(`<path d="${eightPointStar(x, cy, 36)}" fill="${s}"/>`);
    cv.add(`<path d="${eightPointStar(x, cy, 16)}" fill="${light}"/>`);
    for (const dy of [-1, 1]) {
      const yy = cy + dy * 150;
      cv.add(`<path d="${steppedDiamond(x, yy, 54, 54, 3)}" fill="${pick(rnd, [A, B, D])}"/>`);
      cv.add(`<path d="${diamond(x, yy, 16, 16)}" fill="${ink}"/>`);
    }
  }
}

// ──────────────────────────────────────────────────────────── backgrounds

export const BG = { width: 1280, height: 720, maxBytes: 120 * 1024 };

/**
 * Every background, in shop order. `key` names the file and seeds the drawing;
 * `ku` and `en` are its names in the shop.
 */
export const BACKGROUNDS = [
  {
    key: 'hevalo',
    ku: 'Hevalo',
    en: 'Hevalo violet',
    draw(cv, rnd) {
      sky(cv, [[0, '#1b0d2c'], [0.5, C.plum], [1, '#5b2f86']], 8);
      glow(cv, cv.w * 0.72, cv.h * 0.78, 760, C.lilac, 0.55);
      glow(cv, cv.w * 0.18, cv.h * 0.2, 520, C.violet, 0.35);
      stars(cv, rnd, { count: 70, bottom: cv.h * 0.6, colour: C.lavender, bright: 3 });
      hills(cv, rnd, { base: 600, amp: 70, peaks: 6, fill: '#24123a' });
      hills(cv, rnd, { base: 680, amp: 50, peaks: 5, fill: '#170b26' });
    },
  },
  {
    key: 'seva-zozanan',
    ku: 'Şeva Zozanan',
    en: 'Night on the high pastures',
    draw(cv, rnd) {
      sky(cv, [[0, '#050c22'], [0.55, C.night], [1, '#24467e']]);
      stars(cv, rnd, { count: 260, bottom: cv.h * 0.7, bright: 6 });
      moon(cv, 1010, 150, 46, '#f6efd2', '#9fb8ff');
      mountains(cv, rnd, { base: 520, amp: 190, peaks: 9, fill: '#1b2f5c', snow: '#c9d6f0' });
      mist(cv, 470, 120, '#9fb8ff', 0.18);
      hills(cv, rnd, { base: 630, amp: 80, peaks: 7, fill: '#0f1d3d' });
      hills(cv, rnd, { base: 700, amp: 60, peaks: 6, fill: '#08122a' });
    },
  },
  {
    key: 'ezmane-sterkan',
    ku: 'Ezmanê Stêrkan',
    en: 'Sky full of stars',
    draw(cv, rnd) {
      sky(cv, [[0, '#07051a'], [0.6, '#1a1040'], [1, '#2a1a5c']], -10);
      // a milky band across the sky, as soft light rather than as dots
      const id = cv.id('blur');
      cv.def(blur(id, 60));
      cv.add(`<g filter="url(#${id})" opacity="0.55"><path d="M-100,560 C300,380 800,300 1400,60" stroke="#8f7fd9" stroke-width="170" fill="none"/><path d="M-100,560 C300,400 820,330 1400,90" stroke="#f0c6ff" stroke-width="60" stroke-opacity="0.6" fill="none"/></g>`);
      stars(cv, rnd, { count: 520, bottom: cv.h, bright: 9, colour: '#fff8ef' });
      mountains(cv, rnd, { base: 690, amp: 90, peaks: 11, fill: '#05040f' });
    },
  },
  {
    key: 'heyva-zivin',
    ku: 'Heyva Zîvîn',
    en: 'Silver moon',
    draw(cv, rnd) {
      sky(cv, [[0, '#1d2230'], [0.6, '#3b4256'], [1, '#6a7186']]);
      glow(cv, 380, 210, 420, '#dfe6f5', 0.35);
      disc(cv, 380, 210, 70, '#eef1f7', '#cfd6e4');
      stars(cv, rnd, { count: 90, bottom: cv.h * 0.55, colour: '#e8ecf5', bright: 2 });
      mountains(cv, rnd, { base: 470, amp: 120, peaks: 8, fill: '#4b5268' });
      mist(cv, 420, 160, '#c7cedd', 0.3);
      mountains(cv, rnd, { base: 560, amp: 90, peaks: 10, fill: '#353b4d' });
      mist(cv, 520, 140, '#c7cedd', 0.22);
      hills(cv, rnd, { base: 680, amp: 60, peaks: 6, fill: '#1f2331' });
    },
  },
  {
    key: 'berfa-ciyayan',
    ku: 'Berfa Çiyayan',
    en: 'Snow on the mountains',
    draw(cv, rnd) {
      sky(cv, [[0, '#7fa7d6'], [0.55, '#bcd6ef'], [1, '#eef5fb']]);
      glow(cv, 920, 160, 380, '#ffffff', 0.5);
      mountains(cv, rnd, { base: 470, amp: 230, peaks: 8, fill: '#8aa3c4', snow: '#ffffff' });
      mist(cv, 420, 140, '#ffffff', 0.45);
      mountains(cv, rnd, { base: 580, amp: 140, peaks: 9, fill: '#6f8db5', snow: '#f4f8fc' });
      hills(cv, rnd, { base: 650, amp: 50, peaks: 6, fill: '#e3edf7' });
      hills(cv, rnd, { base: 710, amp: 40, peaks: 5, fill: '#f7fbff' });
    },
  },
  {
    key: 'gola-sin',
    ku: 'Gola Şîn',
    en: 'Blue lake',
    draw(cv, rnd) {
      sky(cv, [[0, '#0e3b4f'], [0.5, '#1f7088'], [0.62, '#5fb3bd'], [0.621, '#2b7f8f'], [1, '#0a2e3d']]);
      glow(cv, 640, 440, 520, '#bff3ee', 0.3);
      disc(cv, 640, 330, 52, '#f3fff9');
      mountains(cv, rnd, { base: 446, amp: 110, peaks: 9, fill: '#174d61' });
      hills(cv, rnd, { base: 452, amp: 26, peaks: 10, fill: '#123f50' });
      cv.add(`<rect x="0" y="446" width="${cv.w}" height="${cv.h - 446}" fill="#0d3a4a" fill-opacity="0.55"/>`);
      shimmer(cv, rnd, { x: 640, top: 456, bottom: 720, colour: '#e8fffb', width: 260 });
    },
  },
  {
    key: 'ronahiya-bakur',
    ku: 'Ronahiya Bakur',
    en: 'Northern lights',
    draw(cv, rnd) {
      sky(cv, [[0, '#050a1c'], [0.6, '#0d1f3a'], [1, '#132e46']]);
      stars(cv, rnd, { count: 200, bottom: cv.h * 0.75, bright: 4 });
      aurora(cv, rnd, ['#3fe0b0', '#7a5cff', '#2fc8c8', '#b874f0']);
      mountains(cv, rnd, { base: 600, amp: 140, peaks: 10, fill: '#081626' });
      hills(cv, rnd, { base: 700, amp: 40, peaks: 6, fill: '#040b16' });
    },
  },
  {
    key: 'bin-erxewanan',
    ku: 'Binê Erxewanan',
    en: 'Under the Judas trees',
    draw(cv, rnd) {
      sky(cv, [[0, '#2a1446'], [0.55, '#5a2f8a'], [1, '#9b6fd0']], 6);
      glow(cv, 820, 260, 600, C.lavender, 0.35);
      blossom(cv, rnd, { count: 120, top: 40, bottom: 760, petals: ['#e7d0ff', '#c79bf2', '#f6eaff', '#b07ae0'], centre: '#ffe6a8', bokeh: 50 });
    },
  },
  {
    key: 'berbang',
    ku: 'Berbang',
    en: 'Daybreak',
    draw(cv, rnd) {
      sky(cv, [[0, '#2e1d4f'], [0.35, '#8a4f8f'], [0.65, '#f09a8a'], [0.85, '#ffd4a3'], [1, '#fff0d0']]);
      glow(cv, 640, 560, 520, '#fff2c8', 0.65);
      disc(cv, 640, 560, 64, '#fff6dc', '#ffe1a0');
      mountains(cv, rnd, { base: 590, amp: 120, peaks: 9, fill: '#7a4a78' });
      mist(cv, 560, 90, '#ffd8b8', 0.18);
      hills(cv, rnd, { base: 660, amp: 60, peaks: 6, fill: '#4e2c55' });
      hills(cv, rnd, { base: 715, amp: 40, peaks: 5, fill: '#2f1a3a' });
    },
  },
  {
    key: 'mija-gulan',
    ku: 'Mija Gulan',
    en: 'Rose mist',
    draw(cv, rnd) {
      sky(cv, [[0, '#6e4a7a'], [0.5, '#c98aa6'], [1, '#f6d0d6']], 12);
      glow(cv, 980, 220, 620, '#ffe2e8', 0.5);
      glow(cv, 200, 600, 520, '#f7a8b8', 0.35);
      hills(cv, rnd, { base: 520, amp: 70, peaks: 7, fill: '#d7a3b8' });
      mist(cv, 470, 140, '#fff0f3', 0.45);
      hills(cv, rnd, { base: 620, amp: 60, peaks: 6, fill: '#c48aa3' });
      mist(cv, 580, 140, '#fff0f3', 0.35);
      hills(cv, rnd, { base: 705, amp: 40, peaks: 5, fill: '#a96d89' });
      blossom(cv, rnd, { count: 0, top: 0, bottom: 720, petals: ['#ffffff', '#ffd6e0'], centre: '#ffffff', bokeh: 40 });
    },
  },
  {
    key: 'evara-zerin',
    ku: 'Êvara Zêrîn',
    en: 'Golden evening',
    draw(cv, rnd) {
      sky(cv, [[0, '#4a2a12'], [0.45, '#b8732a'], [0.75, '#f2b632'], [1, '#ffe7a6']]);
      glow(cv, 900, 470, 600, '#fff0b8', 0.6);
      beams(cv, { x: 900, y: 470, colour: '#fff3c4', count: 9, spread: 2.4, opacity: 0.1 });
      disc(cv, 900, 470, 58, '#fff8e0', '#ffe39a');
      hills(cv, rnd, { base: 540, amp: 90, peaks: 7, fill: '#8a5a24' });
      hills(cv, rnd, { base: 620, amp: 70, peaks: 6, fill: '#5e3a18' });
      pines(cv, rnd, { y: 650, count: 22, height: 120, fill: '#3a2410' });
      hills(cv, rnd, { base: 705, amp: 40, peaks: 5, fill: '#2a190b' });
    },
  },
  {
    key: 'agire-newroze',
    ku: 'Agirê Newrozê',
    en: 'Newroz fire',
    draw(cv, rnd) {
      sky(cv, [[0, '#14060a'], [0.5, '#5a1414'], [0.8, '#c8441c'], [1, '#f2a83a']]);
      glow(cv, 640, 720, 700, '#ffb347', 0.7);
      glow(cv, 640, 760, 360, '#fff1b0', 0.6);
      // sparks rising from the fire, thinning as they climb
      const sparks = [];
      for (let i = 0; i < 160; i++) {
        const y = 720 - 700 * rnd() * rnd();
        const x = 640 + between(rnd, -1, 1) * (180 + (720 - y) * 0.7);
        sparks.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(between(rnd, 0.8, 2.8))}" fill="${pick(rnd, ['#ffd166', '#ff9f43', '#fff1b0'])}" fill-opacity="${n(between(rnd, 0.4, 0.95))}"/>`);
      }
      cv.add(sparks.join(''));
      mountains(cv, rnd, { base: 660, amp: 120, peaks: 10, fill: '#1c0808' });
      hills(cv, rnd, { base: 715, amp: 30, peaks: 6, fill: '#0d0404' });
    },
  },
  {
    key: 'evara-sor',
    ku: 'Êvara Sor',
    en: 'Red evening',
    draw(cv, rnd) {
      sky(cv, [[0, '#2a0a1a'], [0.45, '#8a1f2e'], [0.8, '#e0563a'], [1, '#f6a65a']]);
      glow(cv, 420, 520, 520, '#ffb070', 0.55);
      disc(cv, 420, 520, 66, '#ffd9a0', '#ffb070');
      cv.add(`<rect x="0" y="540" width="${cv.w}" height="180" fill="#4a0f1c"/>`);
      shimmer(cv, rnd, { x: 420, top: 548, bottom: 720, colour: '#ffc58a', width: 300 });
      mountains(cv, rnd, { base: 546, amp: 70, peaks: 12, fill: '#3a0c18' });
    },
  },
  {
    key: 'seva-sor',
    ku: 'Şeva Sor',
    en: 'Red night',
    draw(cv, rnd) {
      sky(cv, [[0, '#0d0306'], [0.5, '#3a0710'], [0.85, '#9e1b32'], [1, '#c8323a']]);
      glow(cv, 640, 600, 640, '#e0404a', 0.45);
      stars(cv, rnd, { count: 150, bottom: cv.h * 0.55, colour: '#ffd8d8', bright: 3 });
      pines(cv, rnd, { y: 560, count: 18, height: 280, fill: '#12040a' });
      hills(cv, rnd, { base: 600, amp: 50, peaks: 6, fill: '#12040a' });
      pines(cv, rnd, { y: 680, count: 14, height: 360, fill: '#07020a' });
      hills(cv, rnd, { base: 700, amp: 30, peaks: 6, fill: '#07020a' });
    },
  },
  {
    key: 'lalezar',
    ku: 'Lalezar',
    en: 'Tulip field',
    draw(cv, rnd) {
      sky(cv, [[0, '#1a0a12'], [0.55, '#4a1424'], [1, '#2a0c16']]);
      glow(cv, 900, 300, 560, '#ff6b6b', 0.25);
      hills(cv, rnd, { base: 420, amp: 50, peaks: 7, fill: '#2b1a12' });
      hills(cv, rnd, { base: 480, amp: 40, peaks: 6, fill: '#1e2a14' });
      tulipField(cv, rnd, { count: 170, top: 470, bottom: 730, colours: ['#d7263d', '#e8473b', '#b81d3a', '#ff5a5f'], stem: '#2f6b2f' });
    },
  },
  {
    key: 'zozan',
    ku: 'Zozan',
    en: 'High pasture',
    draw(cv, rnd) {
      sky(cv, [[0, '#5aa0d8'], [0.6, '#a8d4ef'], [1, '#e6f4fb']]);
      glow(cv, 230, 140, 300, '#ffffff', 0.55);
      disc(cv, 230, 140, 46, '#fffbe6');
      mountains(cv, rnd, { base: 430, amp: 180, peaks: 8, fill: '#8aa6c8', snow: '#ffffff' });
      hills(cv, rnd, { base: 500, amp: 80, peaks: 6, fill: '#7fb069' });
      hills(cv, rnd, { base: 590, amp: 70, peaks: 6, fill: '#5f9a4f' });
      blossom(cv, rnd, { count: 140, top: 560, bottom: 740, petals: ['#ffffff', '#fff3b0', '#f7d6e0'], centre: '#f2b632' });
      hills(cv, rnd, { base: 735, amp: 30, peaks: 5, fill: '#4a8a3f' });
    },
  },
  {
    key: 'bihar',
    ku: 'Bihar',
    en: 'Spring',
    draw(cv, rnd) {
      sky(cv, [[0, '#f6d6c8'], [0.5, '#f9ead2'], [1, '#e4f2c8']]);
      glow(cv, 1000, 120, 520, '#fff6d8', 0.6);
      beams(cv, { x: 1000, y: 40, colour: '#fff6d0', count: 8, spread: 1.4, opacity: 0.18 });
      hills(cv, rnd, { base: 470, amp: 70, peaks: 6, fill: '#a9cf8a' });
      hills(cv, rnd, { base: 560, amp: 70, peaks: 6, fill: '#86bb6a' });
      hills(cv, rnd, { base: 650, amp: 60, peaks: 5, fill: '#5f9a4f' });
      blossom(cv, rnd, { count: 160, top: 500, bottom: 740, petals: ['#ffffff', '#ffd1dc', '#fff3b0'], centre: '#f2a33a' });
    },
  },
  {
    key: 'daristana-seve',
    ku: 'Daristana Şevê',
    en: 'Forest at night',
    draw(cv, rnd) {
      sky(cv, [[0, '#06110f'], [0.6, '#0f2a24'], [1, '#1d3f33']]);
      glow(cv, 640, 380, 520, '#3fbf8f', 0.2);
      pines(cv, rnd, { y: 470, count: 30, height: 300, fill: '#0b201b' });
      mist(cv, 380, 200, '#5fbf9f', 0.12);
      pines(cv, rnd, { y: 600, count: 22, height: 420, fill: '#06140f' });
      fireflies(cv, rnd, { count: 70, top: 220, bottom: 700, colour: '#f6e27a' });
      hills(cv, rnd, { base: 700, amp: 30, peaks: 6, fill: '#030b08' });
    },
  },
  {
    key: 'mij',
    ku: 'Mij',
    en: 'Mist',
    draw(cv, rnd) {
      sky(cv, [[0, '#9aa39c'], [0.5, '#c4cac2'], [1, '#e2e5df']]);
      mountains(cv, rnd, { base: 360, amp: 110, peaks: 8, fill: '#a9b1aa' });
      mist(cv, 290, 160, '#f2f4f0', 0.6);
      mountains(cv, rnd, { base: 470, amp: 100, peaks: 9, fill: '#8d968f' });
      mist(cv, 410, 160, '#f2f4f0', 0.55);
      pines(cv, rnd, { y: 560, count: 16, height: 200, fill: '#6f7871' });
      mist(cv, 500, 160, '#f2f4f0', 0.5);
      pines(cv, rnd, { y: 700, count: 10, height: 330, fill: '#4a524c' });
      hills(cv, rnd, { base: 705, amp: 30, peaks: 6, fill: '#4a524c' });
    },
  },
  {
    key: 'newroz',
    ku: 'Rengên Newrozê',
    en: 'The colours of Newroz',
    draw(cv, rnd) {
      sky(cv, [[0, '#7a1424'], [0.4, '#d7263d'], [0.75, '#f2a33a'], [1, '#ffd36a']]);
      glow(cv, 640, 470, 520, '#fff3b0', 0.6);
      // the sun as Newroz draws it: a disc with twenty-one rays
      const rays = [];
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2 - Math.PI / 2;
        const p0 = [640 + Math.cos(a - 0.07) * 70, 470 + Math.sin(a - 0.07) * 70];
        const p1 = [640 + Math.cos(a) * 150, 470 + Math.sin(a) * 150];
        const p2 = [640 + Math.cos(a + 0.07) * 70, 470 + Math.sin(a + 0.07) * 70];
        rays.push(`<path d="M${pt(p0)} L${pt(p1)} L${pt(p2)} Z"/>`);
      }
      cv.add(`<g fill="${C.gold}" fill-opacity="0.85">${rays.join('')}</g>`);
      disc(cv, 640, 470, 74, '#ffe08a', C.gold);
      hills(cv, rnd, { base: 560, amp: 70, peaks: 7, fill: '#2a9d4b' });
      hills(cv, rnd, { base: 640, amp: 60, peaks: 6, fill: '#1f7a3a' });
      hills(cv, rnd, { base: 715, amp: 40, peaks: 5, fill: '#155c2b' });
    },
  },
  {
    key: 'kilima-sor',
    ku: 'Kilîma Sor',
    en: 'Red kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#9e1b32', ink: '#2b0d14', accents: ['#f2b632', '#1f4f7a', '#e8e0cc', '#2a7a4b'], light: '#f3e6c8' });
      vignette(cv, 0.4);
    },
  },
  {
    key: 'kilima-mor',
    ku: 'Kilîma Mor',
    en: 'Purple kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#4a2370', ink: C.ink, accents: [C.lilac, '#f2b632', '#e86a9a', '#7fd1c7'], light: '#efe0ff' });
      vignette(cv, 0.4);
    },
  },
  {
    key: 'kilima-zer',
    ku: 'Kilîma Zer',
    en: 'Gold kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#c98a2a', ink: '#3a2010', accents: ['#9e1b32', '#1f4f7a', '#5a3a1a', '#2a7a4b'], light: '#fbe9c4' });
      vignette(cv, 0.35);
    },
  },
  {
    key: 'kilima-kesk',
    ku: 'Kilîma Kesk',
    en: 'Green kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#1f5c45', ink: '#0b1f18', accents: ['#f2b632', '#d7263d', '#e8e0cc', '#7fb069'], light: '#eef3dc' });
      vignette(cv, 0.4);
    },
  },
  {
    key: 'kilima-sin',
    ku: 'Kilîma Şîn',
    en: 'Blue kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#1d3b6e', ink: '#0a1430', accents: ['#e8892b', '#f2b632', '#d7263d', '#9fc6e8'], light: '#e8f0fa' });
      vignette(cv, 0.4);
    },
  },
  {
    key: 'kilima-gulan',
    ku: 'Kilîma Gulan',
    en: 'Rose kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#b0466e', ink: '#3a1024', accents: ['#f7a8b8', '#2a6f6a', '#f2b632', '#5a2f8a'], light: '#fde8ee' });
      vignette(cv, 0.35);
    },
  },
  {
    key: 'kilima-seve',
    ku: 'Kilîma Şevê',
    en: 'Night kilim',
    draw(cv, rnd) {
      kilim(cv, rnd, { field: '#22242c', ink: '#0c0d11', accents: ['#c9cdd6', '#8a8f9c', '#b8a06a', '#5d6b85'], light: '#e9ebf0' });
      vignette(cv, 0.45);
    },
  },
];

// ─────────────────────────────────────────────────────────────── lettering

/**
 * A stroke alphabet: each letter is a centre line drawn with a round pen, in
 * units where a capital is 100 tall and the baseline is 0 (up is negative).
 * `l` and `r` are where the ink's centre line starts and ends, so letters
 * whose marks reach sideways (j's tail, î's hat) still get their room.
 *
 * Only the letters the stickers spell are here. Asking for any other one is an
 * error, not a blank, so a new sticker cannot ship with a hole in its word.
 */
const GLYPHS = {
  B: { l: 0, r: 58, d: 'M0 0 V-100 H30 C46 -100 54 -90 54 -76 C54 -62 46 -52 30 -52 H0 M30 -52 C48 -52 58 -42 58 -26 C58 -10 48 0 30 0 H0' },
  H: { l: 0, r: 60, d: 'M0 0 V-100 M60 0 V-100 M0 -50 H60' },
  N: { l: 0, r: 62, d: 'M0 0 V-100 L62 0 V-100' },
  S: { l: 0, r: 56, d: 'M54 -84 C48 -95 38 -100 27 -100 C12 -100 2 -91 2 -76 C2 -46 56 -56 56 -24 C56 -9 44 0 28 0 C15 0 5 -6 0 -16' },
  a: { l: 0, r: 60, d: 'M60 -64 V0 M60 -32 C60 -52 47 -64 30 -64 C13 -64 0 -51 0 -32 C0 -13 13 0 30 0 C47 0 60 -12 60 -32' },
  b: { l: 0, r: 60, d: 'M0 -100 V0 M0 -32 C0 -52 13 -64 30 -64 C47 -64 60 -51 60 -32 C60 -13 47 0 30 0 C13 0 0 -12 0 -32' },
  e: { l: 0, r: 58, d: 'M4 -32 H56 C56 -52 44 -64 29 -64 C12 -64 2 -50 2 -32 C2 -12 14 0 31 0 C42 0 50 -5 54 -12' },
  i: { l: 0, r: 0, d: 'M0 0 V-64', dots: [[0, -94]] },
  î: { l: -12, r: 12, d: 'M0 0 V-64 M-17 -84 L0 -102 L17 -84' },
  // the tail tucks under the letter before it, so it does not push the j away
  j: { l: -6, r: 0, d: 'M0 -64 V16 C0 30 -8 36 -22 36', dots: [[0, -94]] },
  l: { l: 0, r: 0, d: 'M0 -100 V0' },
  o: { l: 0, r: 62, d: 'M31 -64 C48 -64 62 -50 62 -32 C62 -14 48 0 31 0 C14 0 0 -14 0 -32 C0 -50 14 -64 31 -64 Z' },
  p: { l: 0, r: 60, d: 'M0 -64 V36 M0 -32 C0 -52 13 -64 30 -64 C47 -64 60 -51 60 -32 C60 -13 47 0 30 0 C13 0 0 -12 0 -32' },
  r: { l: 0, r: 36, d: 'M0 0 V-64 M0 -34 C4 -54 18 -64 36 -63' },
  s: { l: 0, r: 46, d: 'M44 -55 C40 -61 32 -64 23 -64 C11 -64 3 -58 3 -47 C3 -27 46 -38 46 -17 C46 -6 36 0 23 0 C12 0 4 -4 0 -11' },
  v: { l: 0, r: 62, d: 'M0 -64 L31 0 L62 -64' },
  w: { l: 0, r: 76, d: 'M0 -64 L18 0 L38 -50 L58 0 L76 -64' },
  z: { l: 0, r: 52, d: 'M0 -64 H52 L0 0 H52' },
  '!': { l: 0, r: 0, d: 'M0 -100 V-34', dots: [[0, -4]] },
};
const SPACE = 34;
const TRACKING = 30;
/** How wide the pen is, in the same units. */
const PEN = 20;

/** Moves and scales every coordinate of a path written in absolute M/L/H/V/C/Q/Z. */
function shiftPath(d, dx, dy, k) {
  const tokens = d.match(/[MLHVCQZ]|-?\d+(?:\.\d+)?/g);
  const out = [];
  let cmd = '';
  let axis = 0;
  for (const t of tokens) {
    if (/[MLHVCQZ]/.test(t)) {
      cmd = t;
      axis = 0;
      out.push(t);
      continue;
    }
    const v = Number(t);
    if (cmd === 'H') out.push(n(dx + v * k));
    else if (cmd === 'V') out.push(n(dy + v * k));
    else {
      out.push(n(axis % 2 === 0 ? dx + v * k : dy + v * k));
      axis += 1;
    }
  }
  return out.join(' ');
}

/** How wide a word is in glyph units, centre line to centre line. */
function measure(text) {
  let w = 0;
  let first = true;
  for (const ch of text) {
    if (ch === ' ') {
      w += SPACE;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) throw new Error(`the sticker alphabet has no "${ch}"`);
    if (!first) w += TRACKING;
    w += g.r - g.l;
    first = false;
  }
  return w;
}

/**
 * Lettering centred on (cx, baseline), `size` px to a capital. Drawn twice: a
 * wide dark pen for the outline, then the colour on top, so it reads on any
 * photograph without depending on SVG's paint-order.
 */
function lettering(text, { cx, baseline, size, fill = '#ffffff', outline = C.plum, rim = 10 }) {
  const k = size / 100;
  let x = cx - (measure(text) * k) / 2;
  const paths = [];
  const dots = [];
  let first = true;
  for (const ch of text) {
    if (ch === ' ') {
      x += SPACE * k;
      continue;
    }
    const g = GLYPHS[ch];
    if (!first) x += TRACKING * k;
    const ox = x - g.l * k;
    paths.push(shiftPath(g.d, ox, baseline, k));
    for (const [dx, dy] of g.dots ?? []) dots.push([ox + dx * k, baseline + dy * k]);
    x += (g.r - g.l) * k;
    first = false;
  }
  const pen = PEN * k;
  const dot = pen * 0.62;
  const d = paths.join(' ');
  const round = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  return [
    `<path d="${d}" ${round} stroke="${outline}" stroke-width="${n(pen + rim * 2)}"/>`,
    ...dots.map(([px, py]) => `<circle cx="${n(px)}" cy="${n(py)}" r="${n(dot + rim)}" fill="${outline}"/>`),
    `<path d="${d}" ${round} stroke="${fill}" stroke-width="${n(pen)}"/>`,
    ...dots.map(([px, py]) => `<circle cx="${n(px)}" cy="${n(py)}" r="${n(dot)}" fill="${fill}"/>`),
  ].join('');
}

// ───────────────────────────────────────────────────────────────── icons

export const ICON = { size: 512, maxBytes: 80 * 1024 };

/** The one outline every icon is drawn with, so they read as a set. */
const LINE = C.plum;
const W = 14;
const inked = (d, fill, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${LINE}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
const shine = (cx, cy, rx, ry, rot = 0, a = 0.35) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="#ffffff" fill-opacity="${n(a)}"/>`;
/** A stroke with an outline: the dark pen wide, the colour narrower over it. */
const outlinedStroke = (d, colour, width) =>
  `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="${n(width + W * 2)}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;

function tulip(cv, petals) {
  const [dark, mid, light] = petals;
  const g = cv.id('petal');
  cv.def(linear(g, [[0, light], [1, mid]]));
  const leaf = cv.id('leaf');
  cv.def(linear(leaf, [[0, '#4cc06a'], [1, '#1f7a3a']]));
  cv.add(outlinedStroke('M256 470 C256 400 250 330 256 262', '#2a9d4b', 18));
  cv.add(inked('M252 448 C190 430 140 370 128 286 C196 312 238 360 252 420 Z', `url(#${leaf})`));
  cv.add(inked('M260 410 C318 392 362 340 376 270 C314 292 274 334 260 384 Z', `url(#${leaf})`));
  cv.add(inked('M256 72 C306 112 318 196 256 280 C194 196 206 112 256 72 Z', dark));
  cv.add(inked('M164 128 C232 146 276 204 256 288 C196 290 158 236 164 128 Z', `url(#${g})`));
  cv.add(inked('M348 128 C280 146 236 204 256 288 C316 290 354 236 348 128 Z', `url(#${g})`));
  cv.add(shine(196, 196, 14, 36, -20));
}

/** The deer's head, front on — antlers, ears, fawn spots — centred at (cx, cy) on a 512 grid scaled by k. */
function deerHead(cx, cy, k) {
  const T = (d) => shiftPath(d, cx - 256 * k, cy - 256 * k, k);
  const antler = (flip) => {
    const s = flip ? -1 : 1;
    const X = (x) => 256 + s * (x - 256);
    return `M${X(214)} 156 C${X(196)} 120 ${X(170)} 92 ${X(148)} 46 M${X(186)} 112 C${X(150)} 110 ${X(124)} 98 ${X(102)} 78 M${X(166)} 78 C${X(178)} 60 ${X(182)} 44 ${X(180)} 26`;
  };
  const brown = '#6b4226';
  const parts = [];
  for (const flip of [false, true]) {
    parts.push(`<path d="${T(antler(flip))}" fill="none" stroke="${LINE}" stroke-width="${n((22 + W * 2) * k)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const flip of [false, true]) {
    parts.push(`<path d="${T(antler(flip))}" fill="none" stroke="${brown}" stroke-width="${n(22 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  const ear = (flip) => {
    const s = flip ? -1 : 1;
    const X = (x) => 256 + s * (x - 256);
    return [
      `M${X(184)} 212 C${X(140)} 164 ${X(84)} 160 ${X(52)} 184 C${X(78)} 226 ${X(130)} 250 ${X(188)} 248 Z`,
      `M${X(174)} 220 C${X(136)} 190 ${X(98)} 190 ${X(80)} 198 C${X(100)} 224 ${X(136)} 234 ${X(176)} 236 Z`,
    ];
  };
  for (const flip of [false, true]) {
    const [outer, inner] = ear(flip);
    parts.push(`<path d="${T(outer)}" fill="#b07848" stroke="${LINE}" stroke-width="${n(W * k)}" stroke-linejoin="round"/>`);
    parts.push(`<path d="${T(inner)}" fill="#f3c9a8"/>`);
  }
  parts.push(`<path d="${T('M256 140 C330 140 366 190 358 250 C352 306 312 370 256 394 C200 370 160 306 154 250 C146 190 182 140 256 140 Z')}" fill="#b5743f" stroke="${LINE}" stroke-width="${n(W * k)}" stroke-linejoin="round"/>`);
  const at = (x, y) => [cx + (x - 256) * k, cy + (y - 256) * k];
  const circle = (x, y, r, fill, extra = '') => {
    const [px, py] = at(x, y);
    return `<circle cx="${n(px)}" cy="${n(py)}" r="${n(r * k)}" fill="${fill}"${extra}/>`;
  };
  const ellipse = (x, y, rx, ry, fill, extra = '') => {
    const [px, py] = at(x, y);
    return `<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(rx * k)}" ry="${n(ry * k)}" fill="${fill}"${extra}/>`;
  };
  parts.push(circle(232, 178, 8, '#f6e2c8', ' fill-opacity="0.85"'));
  parts.push(circle(256, 168, 9, '#f6e2c8', ' fill-opacity="0.85"'));
  parts.push(circle(280, 178, 8, '#f6e2c8', ' fill-opacity="0.85"'));
  parts.push(ellipse(256, 326, 60, 50, '#f6e2c8', ` stroke="${LINE}" stroke-width="${n(W * 0.6 * k)}"`));
  parts.push(circle(196, 292, 17, '#f08a8a', ' fill-opacity="0.45"'));
  parts.push(circle(316, 292, 17, '#f08a8a', ' fill-opacity="0.45"'));
  parts.push(circle(212, 250, 18, LINE));
  parts.push(circle(300, 250, 18, LINE));
  parts.push(circle(206, 243, 6, '#ffffff'));
  parts.push(circle(294, 243, 6, '#ffffff'));
  parts.push(ellipse(256, 310, 27, 18, LINE));
  parts.push(ellipse(248, 304, 8, 4, '#ffffff', ' fill-opacity="0.7"'));
  parts.push(`<path d="${T('M256 328 L256 342 M236 350 Q256 364 276 350')}" fill="none" stroke="${LINE}" stroke-width="${n(7 * k)}" stroke-linecap="round"/>`);
  return parts.join('');
}

/** A sun: a disc with `rays` triangular rays, as a set of paths (no outline). */
function sunRays(cx, cy, inner, outer, rays, halfWidth) {
  const out = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    out.push(`M${pt([cx + Math.cos(a - halfWidth) * inner, cy + Math.sin(a - halfWidth) * inner])} L${pt([cx + Math.cos(a) * outer, cy + Math.sin(a) * outer])} L${pt([cx + Math.cos(a + halfWidth) * inner, cy + Math.sin(a + halfWidth) * inner])} Z`);
  }
  return out.join(' ');
}

/**
 * Every icon, in shop order. Each is a bold motif on a transparent 512 square,
 * with the same outline weight, so any of them sits on an avatar like the rest.
 */
export const ICONS = [
  {
    key: 'hinar',
    ku: 'Hinar',
    en: 'Pomegranate',
    draw(cv) {
      const g = cv.id('fruit');
      cv.def(radial(g, [[0, '#ff6b7f'], [0.55, '#d7263d'], [1, '#8f1530']], 0.38, 0.34, 0.75));
      cv.add(inked('M256 132 C362 132 428 206 428 296 C428 392 350 462 256 462 C162 462 84 392 84 296 C84 206 150 132 256 132 Z', `url(#${g})`));
      // the crown is what makes it a pomegranate and not an apple
      cv.add(inked('M196 158 L188 72 L226 112 L256 52 L286 112 L324 72 L316 158 C292 172 220 172 196 158 Z', '#b81d3a'));
      cv.add(`<path d="M226 150 L230 118 M256 150 L256 104 M286 150 L282 118" stroke="#7a1026" stroke-width="7" stroke-linecap="round"/>`);
      cv.add(shine(176, 236, 34, 22, -40));
      cv.add(shine(150, 300, 10, 10, 0, 0.3));
    },
  },
  {
    key: 'roj',
    ku: 'Roj',
    en: 'Sun',
    draw(cv) {
      const g = cv.id('sun');
      cv.def(radial(g, [[0, '#fff1b0'], [0.6, '#ffd36a'], [1, C.gold]], 0.4, 0.38, 0.7));
      const long = [];
      const short = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const outer = i % 2 === 0 ? 232 : 196;
        const hw = i % 2 === 0 ? 0.13 : 0.11;
        const d = `M${pt([256 + Math.cos(a - hw) * 128, 256 + Math.sin(a - hw) * 128])} L${pt([256 + Math.cos(a) * outer, 256 + Math.sin(a) * outer])} L${pt([256 + Math.cos(a + hw) * 128, 256 + Math.sin(a + hw) * 128])} Z`;
        (i % 2 === 0 ? long : short).push(d);
      }
      cv.add(inked(short.join(' '), C.amber));
      cv.add(inked(long.join(' '), C.gold));
      cv.add(inked('M256 130 A126 126 0 1 1 255.9 130 Z', `url(#${g})`));
      cv.add(shine(212, 200, 30, 18, -35, 0.45));
    },
  },
  {
    key: 'ciya',
    ku: 'Çiya',
    en: 'Mountain',
    draw(cv) {
      const g = cv.id('rock');
      cv.def(linear(g, [[0, '#7f9fd4'], [1, '#3d5f99']]));
      const g2 = cv.id('rock');
      cv.def(linear(g2, [[0, '#6a84b8'], [1, '#2f4a7a']]));
      cv.add(inked('M402 168 A44 44 0 1 1 401.9 168 Z', C.gold));
      cv.add(inked('M292 404 L366 236 L470 404 Z', `url(#${g2})`));
      cv.add(inked('M42 404 L206 112 L330 330 L358 404 Z', `url(#${g})`));
      cv.add(inked('M206 112 L164 186 L190 172 L210 196 L232 168 L248 186 Z', '#ffffff'));
      cv.add(inked('M366 236 L344 286 L362 276 L380 292 L392 278 Z', '#ffffff'));
      cv.add(inked('M30 410 C120 360 200 372 256 392 C320 368 410 360 482 410 L482 440 L30 440 Z', '#2a9d4b'));
    },
  },
  {
    key: 'lale',
    ku: 'Lale',
    en: 'Tulip',
    draw(cv) {
      tulip(cv, ['#9e1b32', '#d7263d', '#ff6b6b']);
    },
  },
  {
    key: 'laleya-mor',
    ku: 'Laleya Mor',
    en: 'Purple tulip',
    draw(cv) {
      tulip(cv, ['#4a2370', '#7a45c0', '#c99bff']);
    },
  },
  {
    key: 'ask',
    ku: 'Ask',
    en: 'Deer',
    draw(cv) {
      cv.add(deerHead(256, 270, 1.05));
    },
  },
  {
    key: 'sterk',
    ku: 'Stêrk',
    en: 'Eight-point star',
    draw(cv) {
      const g = cv.id('star');
      cv.def(radial(g, [[0, '#ffe08a'], [1, C.gold]], 0.4, 0.38, 0.7));
      cv.add(inked(eightPointStar(256, 256, 226), `url(#${g})`));
      cv.add(inked(eightPointStar(256, 256, 138), C.red));
      cv.add(inked(eightPointStar(256, 256, 70), C.cream));
      cv.add(inked(diamond(256, 256, 40, 40), C.navy));
      cv.add(shine(196, 150, 26, 14, -45, 0.45));
    },
  },
  {
    key: 'caydan',
    ku: 'Çaydan',
    en: 'Teapot',
    draw(cv) {
      const g = cv.id('pot');
      cv.def(radial(g, [[0, '#4fc0d6'], [0.6, '#2a8fa8'], [1, '#1b5a72']], 0.36, 0.34, 0.8));
      cv.add(outlinedStroke('M364 226 C446 214 462 330 372 352', '#2a8fa8', 22));
      cv.add(inked('M152 330 C100 320 70 270 52 196 L86 188 C102 246 124 276 160 288 Z', '#2a8fa8'));
      cv.add(inked('M140 266 C140 206 190 180 256 180 C322 180 372 206 372 266 C372 354 320 414 256 414 C192 414 140 354 140 266 Z', `url(#${g})`));
      cv.add(inked('M146 244 C206 262 306 262 366 244 L370 278 C306 298 206 298 142 278 Z', C.gold));
      cv.add(inked('M196 184 C200 144 312 144 316 184 Z', '#2a8fa8'));
      cv.add(inked('M256 102 A22 22 0 1 1 255.9 102 Z', C.gold));
      cv.add(inked('M184 414 L328 414 L316 440 L196 440 Z', C.gold));
      cv.add(shine(196, 222, 26, 16, -30, 0.45));
      cv.add(`<path d="M214 92 C200 76 226 64 212 46 M300 92 C286 76 312 64 298 46" fill="none" stroke="${C.lavender}" stroke-width="10" stroke-linecap="round" stroke-opacity="0.8"/>`);
    },
  },
  {
    key: 'saz',
    ku: 'Saz',
    en: 'Saz',
    draw(cv) {
      const wood = cv.id('wood');
      cv.def(radial(wood, [[0, '#e8a55a'], [0.7, '#c27a34'], [1, '#8a5226']], 0.4, 0.4, 0.7));
      const parts = [
        inked('M244 40 L268 40 L270 250 L242 250 Z', '#6b4226'),
        inked('M232 4 L280 4 L278 52 L234 52 Z', '#6b4226'),
        inked('M256 232 C324 236 356 304 350 372 C344 444 302 488 256 488 C210 488 168 444 162 372 C156 304 188 236 256 232 Z', `url(#${wood})`),
        `<circle cx="256" cy="372" r="24" fill="${LINE}"/>`,
        `<circle cx="256" cy="372" r="34" fill="none" stroke="${C.gold}" stroke-width="6"/>`,
        inked('M226 444 L286 444 L286 456 L226 456 Z', C.gold),
        `<path d="M250 20 V450 M256 20 V450 M262 20 V450" stroke="${C.cream}" stroke-width="2.5"/>`,
        `<path d="M244 80 H268 M244 110 H268 M244 140 H268 M244 168 H268 M244 194 H268 M244 218 H268" stroke="${C.cream}" stroke-width="4" stroke-opacity="0.7"/>`,
        inked('M222 14 L234 14 L234 26 L222 26 Z M222 32 L234 32 L234 44 L222 44 Z M278 14 L290 14 L290 26 L278 26 Z M278 32 L290 32 L290 44 L278 44 Z', C.gold),
        shine(208, 330, 16, 34, -20, 0.35),
      ];
      // laid diagonally so the long neck fits the square
      cv.add(`<g transform="rotate(38 256 256) translate(0 6) scale(0.98)">${parts.join('')}</g>`);
    },
  },
  {
    key: 'kevok',
    ku: 'Kevok',
    en: 'Dove',
    draw(cv) {
      const g = cv.id('feather');
      cv.def(linear(g, [[0, '#ffffff'], [1, '#d6e1f0']]));
      cv.add(inked('M136 300 L44 250 L58 338 L140 340 Z', `url(#${g})`));
      cv.add(inked('M120 304 C150 234 262 212 342 242 C382 256 402 282 412 302 C380 334 300 372 210 362 C160 356 130 338 120 304 Z', `url(#${g})`));
      cv.add(inked('M376 186 A50 50 0 1 1 375.9 186 Z', '#ffffff'));
      cv.add(inked('M420 222 L470 238 L418 252 Z', C.gold));
      cv.add(`<circle cx="392" cy="226" r="9" fill="${LINE}"/>`);
      cv.add(inked('M228 268 C236 176 300 104 392 70 C372 160 336 244 270 300 Z', `url(#${g})`));
      cv.add(`<path d="M266 230 C292 190 322 150 360 116 M248 254 C272 214 298 178 330 150" fill="none" stroke="#a9bcd8" stroke-width="8" stroke-linecap="round"/>`);
      cv.add(outlinedStroke('M448 252 C452 290 440 318 420 340', '#2a9d4b', 8));
      cv.add(inked('M444 284 C470 278 486 290 488 306 C466 310 450 302 444 284 Z M434 318 C412 320 400 334 402 350 C422 350 434 338 434 318 Z', '#4cc06a'));
    },
  },
  {
    key: 'genim',
    ku: 'Genim',
    en: 'Wheat',
    draw(cv) {
      const grain = cv.id('grain');
      cv.def(linear(grain, [[0, '#ffe08a'], [1, '#d99a2b']]));
      const stalk = (angle) => {
        const parts = [outlinedStroke('M256 470 L256 120', '#d9a441', 10)];
        for (let i = 0; i < 6; i++) {
          const y = 170 + i * 42;
          parts.push(inked(`M256 ${y + 8} C226 ${y - 2} 214 ${y - 30} 222 ${y - 52} C246 ${y - 44} 258 ${y - 20} 256 ${y + 8} Z`, `url(#${grain})`));
          parts.push(inked(`M256 ${y + 8} C286 ${y - 2} 298 ${y - 30} 290 ${y - 52} C266 ${y - 44} 254 ${y - 20} 256 ${y + 8} Z`, `url(#${grain})`));
        }
        parts.push(inked('M256 150 C240 128 240 98 256 74 C272 98 272 128 256 150 Z', `url(#${grain})`));
        return `<g transform="rotate(${angle} 256 470)">${parts.join('')}</g>`;
      };
      cv.add(`<g transform="translate(0 -4) scale(0.95) translate(13 13)">${stalk(-24)}${stalk(24)}${stalk(0)}${inked('M224 400 L288 400 L292 428 L220 428 Z', C.red)}</g>`);
    },
  },
  {
    key: 'kilim',
    ku: 'Kilîm',
    en: 'Kilim diamond',
    draw(cv) {
      cv.add(hooks(256, 256, 380, 380, 3, 30, C.red, 12));
      cv.add(`<path d="${steppedDiamond(256, 256, 380, 380, 10)}" fill="${LINE}"/>`);
      cv.add(`<path d="${steppedDiamond(256, 256, 352, 352, 9)}" fill="${C.red}"/>`);
      cv.add(`<path d="${steppedDiamond(256, 256, 268, 268, 7)}" fill="${C.cream}"/>`);
      cv.add(`<path d="${steppedDiamond(256, 256, 226, 226, 6)}" fill="${C.navy}"/>`);
      cv.add(`<path d="${eightPointStar(256, 256, 70)}" fill="${LINE}"/>`);
      cv.add(`<path d="${eightPointStar(256, 256, 56)}" fill="${C.gold}"/>`);
      cv.add(`<path d="${diamond(256, 256, 26, 26)}" fill="${C.red}"/>`);
    },
  },
  {
    key: 'pet',
    ku: 'Pêta Newrozê',
    en: 'Newroz flame',
    draw(cv) {
      const outer = cv.id('flame');
      cv.def(linear(outer, [[0, '#ff7a3a'], [1, '#d7263d']]));
      const mid = cv.id('flame');
      cv.def(linear(mid, [[0, '#ffd166'], [1, '#ff8c3a']]));
      cv.add(outlinedStroke('M130 424 L384 466', '#8a5a3b', 26));
      cv.add(outlinedStroke('M384 424 L130 466', '#6b4226', 26));
      cv.add(inked('M256 440 C160 440 116 372 134 296 C148 238 196 214 204 146 C240 180 248 222 244 254 C276 216 296 156 276 64 C356 124 404 214 398 312 C394 398 344 440 256 440 Z', `url(#${outer})`));
      cv.add(`<path d="M256 428 C196 428 170 380 182 330 C192 292 222 278 228 236 C252 260 258 292 252 314 C278 290 296 250 290 196 C334 236 352 290 346 340 C340 400 306 428 256 428 Z" fill="url(#${mid})"/>`);
      cv.add('<path d="M256 420 C226 420 214 394 222 368 C228 350 244 340 248 318 C266 340 280 362 278 384 C276 408 266 420 256 420 Z" fill="#fff1b0"/>');
    },
  },
  {
    key: 'heyv',
    ku: 'Heyv',
    en: 'Crescent moon',
    draw(cv) {
      const g = cv.id('moon');
      cv.def(radial(g, [[0, '#fff3c4'], [1, '#f2b632']], 0.3, 0.4, 0.8));
      cv.add(inked(crescentPath(236, 268, 196, 0.62, -0.75), `url(#${g})`));
      cv.add(inked(sparkle(388, 150, 56), C.cream));
      cv.add(inked(sparkle(432, 270, 26), C.cream));
    },
  },
];

export function iconSvg(piece) {
  const cv = new Canvas(ICON.size, ICON.size);
  piece.draw(cv, random(seedOf(piece.key)));
  return cv.svg();
}

export async function renderIcon(piece) {
  return sharp(Buffer.from(iconSvg(piece))).png({ palette: true, quality: 100, effort: 10, compressionLevel: 9 }).toBuffer();
}

export const iconFile = (piece, i) => `web/public/cosmetics/icons/made-${String(i + 1).padStart(2, '0')}-${piece.key}.png`;

// ─────────────────────────────────────────────────────────────── stickers

export const STICKER = { size: 512, maxBytes: 60 * 1024 };

/** A die-cut sticker's edge: the shape again, wider and white, over a soft shadow. */
function dieCut(cv, d, edge = 26) {
  const id = cv.id('shadow');
  cv.def(blur(id, 8));
  cv.add(`<path d="${d}" fill="#000000" fill-opacity="0.28" stroke="#000000" stroke-opacity="0.28" stroke-width="${edge * 2}" stroke-linejoin="round" transform="translate(0 6)" filter="url(#${id})"/>`);
  cv.add(`<path d="${d}" fill="#ffffff" stroke="#ffffff" stroke-width="${edge * 2}" stroke-linejoin="round"/>`);
}

/** The sun of the Kurdistan flag: a disc and twenty-one rays. */
function flagSun(cx, cy, r, colour) {
  return `<path d="${sunRays(cx, cy, r * 0.5, r, 21, 0.085)}" fill="${colour}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.56)}" fill="${colour}"/>`;
}

/** A pill-shaped badge with a word on it. */
function wordBadge(cv, word, { top, bottom, size, w }) {
  const h = 190;
  const x = 256 - w / 2;
  const y = 256 - h / 2;
  const d = `M${x + h / 2} ${y} H${x + w - h / 2} A${h / 2} ${h / 2} 0 0 1 ${x + w - h / 2} ${y + h} H${x + h / 2} A${h / 2} ${h / 2} 0 0 1 ${x + h / 2} ${y} Z`;
  dieCut(cv, d);
  const g = cv.id('badge');
  cv.def(linear(g, [[0, top], [1, bottom]]));
  cv.add(`<path d="${d}" fill="url(#${g})"/>`);
  cv.add(`<path d="M${x + h / 2} ${y + 14} H${x + w - h / 2}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="10" stroke-linecap="round"/>`);
  cv.add(lettering(word, { cx: 256, baseline: 256 + size * 0.38, size, outline: tint(bottom, -0.45), rim: 7 }));
}

/**
 * Every sticker. `file` is its name under web/public/stickers — the suns and the
 * flag badge keep the names they always had, so a picture saved with one still
 * finds it.
 */
export const STICKERS = [
  {
    file: 'kurdistan_badge',
    ku: 'Kurdistan',
    en: 'Kurdistan flag badge',
    draw(cv) {
      const shield = 'M256 40 C320 66 384 76 436 76 V250 C436 370 356 440 256 478 C156 440 76 370 76 250 V76 C128 76 192 66 256 40 Z';
      dieCut(cv, shield, 22);
      const clip = cv.id('shield');
      cv.def(`<clipPath id="${clip}"><path d="${shield}"/></clipPath>`);
      cv.add(`<g clip-path="url(#${clip})"><rect x="0" y="0" width="512" height="200" fill="${FLAG.red}"/><rect x="0" y="200" width="512" height="130" fill="${FLAG.white}"/><rect x="0" y="330" width="512" height="200" fill="${FLAG.green}"/>${flagSun(256, 265, 92, FLAG.sun)}</g>`);
      cv.add(`<path d="${shield}" fill="none" stroke="${C.plum}" stroke-width="8" stroke-linejoin="round"/>`);
      const sheen = cv.id('sheen');
      cv.def(linear(sheen, [[0, '#ffffff', 0.35], [0.5, '#ffffff', 0]], 0, 0, 1, 1));
      cv.add(`<path d="${shield}" fill="url(#${sheen})"/>`);
    },
  },
  {
    file: 'yellow_sun',
    ku: 'Roja zer',
    en: 'Yellow sun',
    draw(cv) {
      const id = cv.id('shadow');
      cv.def(blur(id, 6));
      const rays = sunRays(256, 256, 120, 236, 21, 0.085);
      cv.add(`<g filter="url(#${id})" transform="translate(0 5)" opacity="0.25"><path d="${rays}"/><circle cx="256" cy="256" r="132"/></g>`);
      const g = cv.id('sun');
      cv.def(radial(g, [[0, '#ffd84d'], [1, '#fcb813']], 0.42, 0.4, 0.7));
      cv.add(`<path d="${rays}" fill="#fcb813"/><circle cx="256" cy="256" r="132" fill="url(#${g})"/>`);
    },
  },
  {
    file: 'white_sun',
    ku: 'Roja spî',
    en: 'White sun',
    draw(cv) {
      const id = cv.id('shadow');
      cv.def(blur(id, 6));
      const rays = sunRays(256, 256, 104, 214, 21, 0.09);
      cv.add(`<g filter="url(#${id})" transform="translate(0 4)" opacity="0.35"><path d="${rays}" fill="#4a4060"/><circle cx="256" cy="256" r="116" fill="#4a4060"/></g>`);
      const g = cv.id('sun');
      cv.def(radial(g, [[0, '#ffffff'], [1, '#eef0f6']], 0.42, 0.4, 0.7));
      cv.add(`<path d="${rays}" fill="#ffffff"/><circle cx="256" cy="256" r="116" fill="url(#${g})"/>`);
    },
  },
  {
    file: 'hevalo',
    ku: 'Hevalo',
    en: 'Hevalo deer badge',
    draw(cv) {
      const ring = 'M256 26 A230 230 0 1 1 255.9 26 Z';
      dieCut(cv, ring, 16);
      const g = cv.id('field');
      cv.def(radial(g, [[0, '#cf9cff'], [0.6, C.lilac], [1, '#7a3fc0']], 0.45, 0.35, 0.7));
      cv.add(`<path d="${ring}" fill="url(#${g})"/>`);
      cv.add(deerHead(256, 214, 0.74));
      cv.add(`<path d="M86 360 C170 392 342 392 426 360 L410 432 C330 456 182 456 102 432 Z" fill="${C.plum}"/>`);
      cv.add(lettering('Hevalo', { cx: 256, baseline: 430, size: 52, outline: C.plum, rim: 4 }));
    },
  },
  {
    file: 'heart',
    ku: 'Dil',
    en: 'Heart',
    draw(cv) {
      const heart = 'M256 448 C196 400 66 320 66 196 C66 128 116 82 176 82 C214 82 240 102 256 132 C272 102 298 82 336 82 C396 82 446 128 446 196 C446 320 316 400 256 448 Z';
      dieCut(cv, heart);
      const g = cv.id('heart');
      cv.def(radial(g, [[0, '#ff7a8a'], [0.6, C.red], [1, '#a81a32']], 0.38, 0.32, 0.8));
      cv.add(`<path d="${heart}" fill="url(#${g})"/>`);
      cv.add(shine(160, 170, 40, 24, -40, 0.5));
    },
  },
  {
    file: 'star',
    ku: 'Stêrk',
    en: 'Star',
    draw(cv) {
      const p = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? 220 : 96;
        p.push([256 + Math.cos(a) * r, 272 + Math.sin(a) * r]);
      }
      const star = `M${poly(p)} Z`;
      dieCut(cv, star, 24);
      const g = cv.id('star');
      cv.def(radial(g, [[0, '#ffe58a'], [1, '#f2a31a']], 0.42, 0.4, 0.7));
      cv.add(`<path d="${star}" fill="url(#${g})" stroke="url(#${g})" stroke-width="18" stroke-linejoin="round"/>`);
      cv.add(shine(210, 220, 28, 16, -30, 0.5));
    },
  },
  {
    file: 'biji',
    ku: 'Bijî!',
    en: 'Bijî! (Long live!)',
    draw(cv) {
      wordBadge(cv, 'Bijî!', { top: '#ff6b5a', bottom: '#d7263d', size: 108, w: 390 });
    },
  },
  {
    file: 'spas',
    ku: 'Spas',
    en: 'Spas (Thank you)',
    draw(cv) {
      wordBadge(cv, 'Spas', { top: '#4cc06a', bottom: '#1f7a3a', size: 108, w: 400 });
    },
  },
  {
    file: 'newroz',
    ku: 'Newroz pîroz be',
    en: 'Newroz pîroz be (Happy Newroz)',
    draw(cv) {
      const ring = 'M256 30 A226 226 0 1 1 255.9 30 Z';
      dieCut(cv, ring, 16);
      const g = cv.id('gold');
      cv.def(radial(g, [[0, '#ffe08a'], [0.7, C.gold], [1, '#d98a1a']], 0.45, 0.35, 0.7));
      cv.add(`<path d="${ring}" fill="url(#${g})"/>`);
      cv.add(`<circle cx="256" cy="256" r="204" fill="none" stroke="${FLAG.red}" stroke-width="14"/>`);
      cv.add(`<circle cx="256" cy="256" r="186" fill="none" stroke="${FLAG.green}" stroke-width="10"/>`);
      cv.add(`<path d="${sunRays(256, 256, 120, 176, 21, 0.06)}" fill="#ffffff" fill-opacity="0.35"/>`);
      cv.add(lettering('Newroz', { cx: 256, baseline: 258, size: 72, outline: '#9e1b32', rim: 7 }));
      cv.add(lettering('pîroz be', { cx: 256, baseline: 344, size: 56, outline: '#1f6b35', rim: 6 }));
    },
  },
];

export function stickerSvg(piece) {
  const cv = new Canvas(STICKER.size, STICKER.size);
  piece.draw(cv, random(seedOf(piece.file)));
  return cv.svg();
}

export async function renderSticker(piece) {
  const { data, info } = await rasterise(stickerSvg(piece));
  return webpWithin(data, info, STICKER.maxBytes, { alpha: true, start: 90 });
}

export const stickerFile = (piece) => `web/public/stickers/${piece.file}.webp`;
export const OVERLAY_FILE = 'web/public/filters/kurdistan.webp';
export const ADMIN_FILE = 'admin/public/background.jpg';
/** Folders nothing but this script writes into. */
export const OWNED_DIRS = ['web/public/cosmetics/backgrounds', 'web/public/cosmetics/icons', 'web/public/stickers'];

// ──────────────────────────────────────────────────────── the flag overlay

/**
 * The "Ala" filter's flag: the Kurdistan flag flying from the top-right corner
 * of the picture, waving.
 *
 * Drawn flat, then waved in plain JavaScript: each column of the cloth is
 * moved up or down along a sine that grows away from the pole, and shaded by
 * the slope of that sine — light where the cloth faces up, shadow in the folds.
 * Then turned and placed so the hoist is off the corner and the fly hangs into
 * the picture.
 */
export const OVERLAY = { size: 1024, maxBytes: 90 * 1024, scale: 0.74, tilt: -34, centre: [640, 300] };

export async function renderFlagOverlay() {
  const FW = 1200;
  const FH = 800;
  const flat = doc(FW, FH, '', `<rect width="${FW}" height="${FH}" fill="${FLAG.red}"/><rect y="${FH / 3}" width="${FW}" height="${FH / 3}" fill="${FLAG.white}"/><rect y="${(FH * 2) / 3}" width="${FW}" height="${FH / 3}" fill="${FLAG.green}"/>${flagSun(FW / 2, FH / 2, FH * 0.19, FLAG.sun)}`);
  const src = await sharp(Buffer.from(flat)).ensureAlpha().raw().toBuffer();
  const pad = 140;
  const H = FH + pad * 2;
  const out = Buffer.alloc(FW * H * 4);
  const wave = (x) => {
    const t = x / FW;
    const grow = 0.25 + 0.75 * t;
    const phase = (x / 520) * Math.PI * 2 + 0.6;
    return { dy: Math.sin(phase) * 46 * grow, slope: Math.cos(phase) * grow };
  };
  for (let x = 0; x < FW; x++) {
    const { dy, slope } = wave(x);
    // a falling cloth also hangs: the fly end droops a little
    const droop = Math.pow(x / FW, 1.6) * 60;
    const light = 1 + slope * 0.22;
    for (let y = 0; y < H; y++) {
      const sy = y - pad - dy - droop;
      if (sy < -1 || sy > FH) continue;
      const y0 = Math.floor(sy);
      const f = sy - y0;
      const o = (y * FW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = y0 >= 0 && y0 < FH ? src[(y0 * FW + x) * 4 + c] : 0;
        const b = y0 + 1 >= 0 && y0 + 1 < FH ? src[((y0 + 1) * FW + x) * 4 + c] : 0;
        let v = a + (b - a) * f;
        if (c < 3) v *= light;
        out[o + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
      // the top and bottom hems, antialiased against the transparency
      const edge = Math.min(sy + 1, FH - sy);
      if (edge < 1) out[o + 3] = Math.round(out[o + 3] * Math.max(0, edge));
    }
  }
  // the pole side to the right, flying left, smaller, then tilted so the fly
  // falls toward the picture; one step per pipeline, because sharp orders the
  // operations of a single pipeline its own way
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const flopped = await sharp(out, { raw: { width: FW, height: H, channels: 4 } }).flop().raw().toBuffer({ resolveWithObject: true });
  const smaller = await sharp(flopped.data, { raw: flopped.info }).resize(Math.round(FW * OVERLAY.scale)).raw().toBuffer({ resolveWithObject: true });
  const turned = await sharp(smaller.data, { raw: smaller.info }).rotate(OVERLAY.tilt, { background: clear }).raw().toBuffer({ resolveWithObject: true });
  const { width: tw, height: th } = turned.info;
  // the cloth's middle goes where `centre` says, which leaves the hoist off the
  // top-right corner and the lower left of the canvas clear
  const left = Math.round(OVERLAY.centre[0] - tw / 2);
  const top = Math.round(OVERLAY.centre[1] - th / 2);
  const M = 1400;
  const margin = await sharp({ create: { width: tw + M * 2, height: th + M * 2, channels: 4, background: clear } })
    .composite([{ input: turned.data, raw: turned.info, left: M, top: M }])
    .raw()
    .toBuffer({ resolveWithObject: true });
  // a second pipeline: sharp extracts before it composites within one
  const placed = await sharp(margin.data, { raw: margin.info })
    .extract({ left: M - left, top: M - top, width: OVERLAY.size, height: OVERLAY.size })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return webpWithin(placed.data, placed.info, OVERLAY.maxBytes, { alpha: true, start: 90 });
}

// ──────────────────────────────────────────────────────── the admin's backdrop

/**
 * Behind the admin's glass panels, under a scrim that washes it nearly out:
 * so a soft dawn with a ridge or two, and nothing with detail to fight a table.
 */
export async function renderAdminBackdrop() {
  const cv = new Canvas(1600, 900);
  const rnd = random(seedOf('admin'));
  sky(cv, [[0, '#cfd9ee'], [0.5, '#f3d9e4'], [1, '#fbe9d6']], 10);
  glow(cv, 1150, 260, 700, '#ffffff', 0.6);
  mountains(cv, rnd, { base: 640, amp: 160, peaks: 9, fill: '#b9b4d6' });
  mist(cv, 590, 140, '#ffffff', 0.3);
  hills(cv, rnd, { base: 760, amp: 90, peaks: 6, fill: '#9fc49a' });
  hills(cv, rnd, { base: 880, amp: 60, peaks: 5, fill: '#83b07e' });
  const { data, info } = await rasterise(cv.svg());
  return sharp(dither(data, info.channels, seedOf('admin:grain')), { raw: info }).removeAlpha().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

// ─────────────────────────────────────────────────────────────── rendering

/**
 * Dither: ±1 level of seeded noise before encoding.
 *
 * A gradient across 720 pixels moves one 8-bit level every few rows, and the
 * encoder turns those steps into visible bands. A little noise breaks the steps
 * up; seeded, so it is the same noise every time.
 */
function dither(raw, channels, seed) {
  const rnd = random(seed);
  const out = Buffer.from(raw);
  for (let i = 0; i < out.length; i += channels) {
    const d = rnd() + rnd() - 1;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.max(0, Math.min(255, Math.round(out[i + c] + d * 1.5)));
    }
  }
  return out;
}

async function rasterise(svg) {
  return sharp(Buffer.from(svg), { density: 72 }).raw().toBuffer({ resolveWithObject: true });
}

/** WebP at the best quality that fits the budget. */
async function webpWithin(raw, info, maxBytes, { alpha = false, start = 92 } = {}) {
  for (let q = start; q >= 60; q -= 4) {
    const buf = await sharp(raw, { raw: info })
      .webp({ quality: q, alphaQuality: alpha ? 90 : 100, effort: 6, smartSubsample: true })
      .toBuffer();
    if (buf.length <= maxBytes) return buf;
  }
  throw new Error(`cannot fit under ${maxBytes} bytes`);
}

/** A background as SVG text — the same text on every machine. */
export function backgroundSvg(piece) {
  const cv = new Canvas(BG.width, BG.height);
  piece.draw(cv, random(seedOf(piece.key)));
  return cv.svg();
}

export async function renderBackground(piece) {
  const { data, info } = await rasterise(backgroundSvg(piece));
  const rgb = await sharp(dither(data, info.channels, seedOf(`${piece.key}:grain`)), { raw: info }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return webpWithin(rgb.data, rgb.info, BG.maxBytes);
}

/** Where each background is written, relative to the repo root. */
export const backgroundFile = (piece, i) => `web/public/cosmetics/backgrounds/made-${String(i + 1).padStart(2, '0')}-${piece.key}.webp`;

// ─────────────────────────────────────────────────────────────── main

function parseArgs(argv) {
  const i = argv.indexOf('--out');
  return { out: i >= 0 ? path.resolve(argv[i + 1]) : ROOT, only: argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null };
}

export async function renderAll(outRoot, { only = null, log = () => {} } = {}) {
  const written = [];
  const put = (rel, buf) => {
    const f = path.join(outRoot, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    written.push(rel);
    log(`  ${rel.padEnd(64)} ${(buf.length / 1024).toFixed(0).padStart(4)}KB`);
  };
  const wanted = (name) => !only || name.includes(only);
  for (const [i, piece] of BACKGROUNDS.entries()) {
    if (wanted(piece.key)) put(backgroundFile(piece, i), await renderBackground(piece));
  }
  for (const [i, piece] of ICONS.entries()) {
    if (wanted(piece.key)) put(iconFile(piece, i), await renderIcon(piece));
  }
  for (const piece of STICKERS) {
    if (wanted(piece.file)) put(stickerFile(piece), await renderSticker(piece));
  }
  if (wanted('kurdistan')) put(OVERLAY_FILE, await renderFlagOverlay());
  if (wanted('admin')) put(ADMIN_FILE, await renderAdminBackdrop());
  // the folders are this script's: whatever it did not just write goes
  if (!only) {
    for (const dir of OWNED_DIRS) {
      const abs = path.join(outRoot, ...dir.split('/'));
      for (const f of fs.readdirSync(abs)) {
        const rel = `${dir}/${f}`;
        if (written.includes(rel)) continue;
        fs.rmSync(path.join(abs, f), { recursive: true });
        log(`  ${rel.padEnd(64)} removed`);
      }
    }
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, only } = parseArgs(process.argv.slice(2));
  await renderAll(out, { only, log: console.log });
}
