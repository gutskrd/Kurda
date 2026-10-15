/**
 * The shop's backgrounds and icons, the photo editor's stickers, the flag the
 * "Ala" filter lays over a picture, and the admin's backdrop — every one of
 * them drawn by code: this file and the modules in scripts/cosmetic-art/.
 *
 *   node scripts/generate-cosmetic-art.mjs              write into the repo
 *   node scripts/generate-cosmetic-art.mjs --out <dir>  write the same tree under <dir>
 *
 * ── what it draws ─────────────────────────────────────────────────────────
 *
 * Backgrounds (1280×720 WebP, cosmetic-art/backgrounds.mjs): Kurdish places
 * and moments painted as scenes, with no people in them — Agirî and the
 * palace of Ishak Pasha at a winter dawn, Sîpan over the lake, the Delal
 * bridge at Zaxo with the sun in its arch, Hewlêr's citadel, Amêdî on its
 * cliff, Newroz night at Akre with the torches climbing the mountain and the
 * bonfire in front, Hewraman's stepped houses under the moon, the black tents
 * on the summer pastures, ridge behind ridge in the dawn mist, Judas trees,
 * almond orchards, tulips and Newroz's narcissus in flower. Each is laid up
 * from layers: trees grown branch by branch, grass, flowers, fog and cloud,
 * a bonfire (cosmetic-art/nature.mjs), ridges and villages (landscape.mjs),
 * the landmarks (places.mjs), the deer and the lambs (figures.mjs). The
 * compositor (render.mjs) paints the mountains from a relief — ribs and
 * gullies lit by the sun, snow lying in them — and puts the layers together
 * the way a camera sees a place: softened and hazed by distance, light
 * breaking through the gaps in shafts, water holding what stands over it, a
 * glow round what is bright, a film's grade and grain. And kilims, woven cell
 * by cell on a grid and lying in soft light (kilim.mjs).
 *
 * Icons (512×512 PNG, cosmetic-art/icons.mjs): small Kurdish things drawn the
 * way the mascot is drawn, soft and glossy with its big-eyed face. Stickers
 * (512×512 WebP, here): the suns, a Kurdistan flag badge, the Hevalo deer and
 * a few words in a badge.
 *
 * Every piece has a Kurdish and an English name. The shop catalogue
 * (`api/content/cosmetics.json`) prices them; the names there must match the
 * ones here, which api/src/cosmetics/catalogue.test.ts checks; art.test.ts
 * checks that what is committed is what this draws.
 *
 * ── why (almost) nothing is read from disk ──────────────────────────────────
 *
 * The lettering on the word stickers is a small stroke alphabet defined below
 * rather than a font. A font would be whatever the machine running this had
 * installed, and the same script would draw different letters on a laptop and
 * on CI. Shapes are SVG strings with every number rounded to two decimals, and
 * every random choice comes from a generator seeded with the piece's name, so
 * the same script writes the same SVG on every machine and sharp turns it into
 * the same pixels; the compositor's work on them is plain arithmetic, the same
 * everywhere too. Pieces are drawn on worker threads, one per core, and as each
 * is seeded by its own name, which thread draws it changes nothing. The one
 * file read is the mascot's own picture (web/public/mascot-deer.png), which
 * the deer icon is, and which is in the repo like the script. The test
 * regenerates everything into a temporary folder and compares it with what is
 * committed: what ships is what this draws.
 *
 * ── what it owns ──────────────────────────────────────────────────────────
 *
 * `web/public/cosmetics/backgrounds`, `web/public/cosmetics/icons` and
 * `web/public/stickers` belong to this script whole: a file in them that it did
 * not write is removed when it runs against the repo. It also writes
 * `web/public/filters/kurdistan.webp` and `admin/public/background.jpg`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import {
  C,
  Canvas,
  FLAG,
  between,
  blur,
  doc,
  linear,
  n,
  poly,
  pt,
  radial,
  radialAt,
  random,
  seedOf,
  tint,
} from './cosmetic-art/kit.mjs';
import { BACKGROUNDS } from './cosmetic-art/backgrounds.mjs';
import { renderScene } from './cosmetic-art/render.mjs';
import { ICONS } from './cosmetic-art/icons.mjs';

export { BACKGROUNDS, ICONS };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// ──────────────────────────────────────────────────────────── backgrounds

export const BG = { width: 1280, height: 720, maxBytes: 120 * 1024 };

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

// ─────────────────────────────────────────────────────── the stickers' pen

/** The one outline every sticker is drawn with, so they read as a set. */
const LINE = C.plum;
const W = 14;
const shine = (cx, cy, rx, ry, rot = 0, a = 0.35) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})" fill="#ffffff" fill-opacity="${n(a)}"/>`;
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

/** A background's scene: its layers (each an SVG of the whole canvas) and effects, in order. */
export function backgroundScene(piece) {
  return piece.scene(random(seedOf(piece.key)));
}

/** The scene written out as text — the same text on every machine. */
export function backgroundSvg(piece) {
  return JSON.stringify(backgroundScene(piece));
}

/** A background, rendered by the compositor (cosmetic-art/render.mjs) and fitted under the size budget. */
export async function renderBackground(piece) {
  const rgb = await renderScene({ w: BG.width, h: BG.height, ...backgroundScene(piece), seed: seedOf(`${piece.key}:grain`) });
  return webpWithin(rgb, { width: BG.width, height: BG.height, channels: 3 }, BG.maxBytes);
}

/** Where each background is written, relative to the repo root. */
export const backgroundFile = (piece, i) => `web/public/cosmetics/backgrounds/made-${String(i + 1).padStart(2, '0')}-${piece.key}.webp`;

// ─────────────────────────────────────────────────────────────── main

function parseArgs(argv) {
  const i = argv.indexOf('--out');
  return { out: i >= 0 ? path.resolve(argv[i + 1]) : ROOT, only: argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null };
}

// ───────────────────────────────────────────────────────────── on every core

/** How each kind of piece is drawn, by its place in its list. */
const DRAW = {
  background: (i) => renderBackground(BACKGROUNDS[i]),
  icon: (i) => renderIcon(ICONS[i]),
  sticker: (i) => renderSticker(STICKERS[i]),
  overlay: () => renderFlagOverlay(),
  admin: () => renderAdminBackdrop(),
};

/**
 * Draws `jobs` ({ kind, i }) on worker threads, one per core up to eight, each
 * of which loads this script and draws what it is handed; the backgrounds take
 * seconds apiece, the compositor being plain JavaScript. Every piece is seeded
 * by its own name, so which thread draws it, and when, changes nothing in what
 * comes out. Resolves to the files' bytes, in the order of `jobs`.
 */
function drawAll(jobs) {
  if (!jobs.length) return Promise.resolve([]);
  const out = new Array(jobs.length);
  let next = 0;
  let failed = null;
  const threads = Math.min(os.availableParallelism(), jobs.length, 8);
  const crew = Array.from({ length: threads }, () => new Promise((resolve, reject) => {
    // plain Node: none of the flags this process was started with (a test runner's, an -e's)
    const worker = new Worker(new URL(import.meta.url), { workerData: { draws: true }, execArgv: [] });
    let stopped = false;
    const stop = (err) => {
      stopped = true;
      if (err) failed ??= err;
      worker.terminate().then(() => (err ? reject(err) : resolve()), reject);
    };
    const hand = () => {
      if (failed || next >= jobs.length) return stop(null);
      const at = next++;
      worker.postMessage({ at, kind: jobs[at].kind, i: jobs[at].i });
    };
    worker.on('message', ({ at, bytes, error }) => {
      if (error) return stop(new Error(`drawing ${jobs[at].file}: ${error}`));
      out[at] = Buffer.from(bytes);
      hand();
    });
    worker.on('error', (err) => stop(err));
    worker.on('exit', (code) => {
      if (!stopped) stop(new Error(`a drawing thread stopped (exit code ${code})`));
    });
    hand();
  }));
  return Promise.all(crew).then(() => out);
}

if (!isMainThread && workerData?.draws) {
  parentPort.on('message', async ({ at, kind, i }) => {
    try {
      parentPort.postMessage({ at, bytes: await DRAW[kind](i) });
    } catch (err) {
      parentPort.postMessage({ at, error: err?.stack ?? String(err) });
    }
  });
}

export async function renderAll(outRoot, { only = null, log = () => {} } = {}) {
  const wanted = (name) => !only || name.includes(only);
  const jobs = [
    ...BACKGROUNDS.map((piece, i) => ({ kind: 'background', i, name: piece.key, file: backgroundFile(piece, i) })),
    ...ICONS.map((piece, i) => ({ kind: 'icon', i, name: piece.key, file: iconFile(piece, i) })),
    ...STICKERS.map((piece, i) => ({ kind: 'sticker', i, name: piece.file, file: stickerFile(piece) })),
    { kind: 'overlay', i: 0, name: 'kurdistan', file: OVERLAY_FILE },
    { kind: 'admin', i: 0, name: 'admin', file: ADMIN_FILE },
  ].filter((job) => wanted(job.name));
  const files = await drawAll(jobs);
  const written = [];
  jobs.forEach((job, k) => {
    const f = path.join(outRoot, ...job.file.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, files[k]);
    written.push(job.file);
    log(`  ${job.file.padEnd(64)} ${(files[k].length / 1024).toFixed(0).padStart(4)}KB`);
  });
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

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, only } = parseArgs(process.argv.slice(2));
  await renderAll(out, { only, log: console.log });
}
