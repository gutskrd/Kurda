/**
 * The streak's fire's flame, painted: one looping sheet of frames for each
 * stage that burns, which both apps play frame by frame
 * (`shared/src/art/fire-sprites.ts` says how the frames lie and where the
 * flame stands).
 *
 *   node scripts/generate-fire-sprites.mjs                          write into both apps
 *   node scripts/generate-fire-sprites.mjs --out <dir> [--stage s]  write the sheets (or one) under <dir>
 *
 * The flame is drawn simply, the way a cartoon fire is: one plump teardrop,
 * round and heavy at the bottom, its tip tapering and curling a little, its
 * outline smooth; inside it flat tones nested one in another — a deep
 * orange-red rim, an orange body, a yellow inner flame and a pale core low
 * down — each inner shape a soft blob of its own, wobbling, and a thin warm
 * light round the outside. It moves simply too: the body breathes, swelling
 * and slimming; gentle waves run up its outline; its tip sways side to side;
 * once a loop the tip stretches and a small drop pinches off it and rises,
 * shrinking; and a round spot drifts up through the core. From the big fire
 * up, two smaller flames lean in at its sides. Every movement turns a whole
 * number of times in the loop, so the last frame flows into the first with
 * no seam. The glow round the flame, the sparks and the logs are drawn by
 * the apps.
 *
 * Each shape is a field, positive inside it, and every edge is smoothed over
 * one pixel by the field's own slope, so the outlines are clean at any size.
 * The phases come from a generator seeded with the stage's name, and the
 * rest is plain arithmetic, so the same script writes the same files every
 * time it runs; shared/src/art/fire-sprites.test.ts paints one again and
 * holds it to what is committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { register } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
register();
const { FIRE_ROOT, FIRE_FLAME_REACH, FIRE_SPRITES, FIRE_SPRITE_FRAMES, fireSpriteCell } = await import(pathToFileURL(path.join(ROOT, 'shared/src/art/fire-sprites.ts')).href);

/** Where the sheets go in each app. */
const FIRE_SHEET_DIRS = ['web/public/fire', 'mobile/assets/fire'];

const TAU = Math.PI * 2;

/** A small seeded generator (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (name) => [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const frac = (v) => v - Math.floor(v);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// ─────────────────────────────────────────────────────────────── colours

/**
 * The flat tones, outside in: the rim, the body, the inner flame, the core,
 * and the warm light round the outside. The blaze burns whitest, a touch of
 * blue at its root; the Newroz fire is gold.
 */
const TONES = {
  warm: { rim: hex('#EC531D'), body: hex('#F98B1F'), inner: hex('#FFC53B'), core: hex('#FFF0B4'), light: hex('#FF6A1E') },
  hot: { rim: hex('#E64E1C'), body: hex('#FB9A26'), inner: hex('#FFD65E'), core: hex('#FFFCF0'), light: hex('#FF7424'), blue: hex('#A8DCFF') },
  gold: { rim: hex('#E0761A'), body: hex('#FAAB26'), inner: hex('#FFD957'), core: hex('#FFF6D2'), light: hex('#FF9A22') },
};

// ─────────────────────────────────────────────────────────────── shapes

/** How sharply a teardrop narrows to its tip: higher, a slimmer, longer tip. */
const TAPER = 1.7;

/** A teardrop's half-width `s` of the way up it (0 its round bottom, 1 its tip), 1 at its widest. */
const teardrop = (() => {
  const raw = (s) => {
    const t = Math.acos(Math.min(1, Math.max(-1, 2 * s - 1)));
    return Math.sin(t) * Math.sin(t / 2) ** TAPER;
  };
  let peak = 0;
  for (let s = 0; s <= 1; s += 0.001) peak = Math.max(peak, raw(s));
  return (s) => (s <= 0 || s >= 1 ? 0 : raw(s) / peak);
})();

/** The union of two fields, smoothed over `k`: two shapes near each other joined by a neck, as a drop pinching off. */
function smoothUnion(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/**
 * One flame: its foot `x` across from the root, `foot` below it and `h` tall,
 * `w` either side at its widest, its tip leaning `lean` across — all in shares
 * of the stage's flame height. `side`, it is one of the smaller flames at a
 * big fire's sides: no core, no drop. Its own phases keep it from moving in
 * step with any other.
 */
function flame(rand, { x = 0, foot = 0.05, h, w, lean = 0, side = false, sway = 1, blue = false }) {
  const p = Array.from({ length: 10 }, () => rand() * TAU);
  return { x, foot, h, w, lean, side, sway, blue, p, drop: frac(p[8] / TAU) };
}

/**
 * The fields of a flame at a point (`X` across from the root, `Y` up from it,
 * in shares of the stage's flame height), `t` of the way through the loop:
 * its outline, and inside it the body, the inner flame, the core and the
 * spot drifting through it. Each is positive inside its shape, in the same
 * units.
 */
function flameFields(fl, X, Y, t, room) {
  const { p, h, w } = fl;
  // breathing: wider as it squashes, slimmer as it stretches
  const breath = 0.8 * Math.sin(TAU * t + p[0]) + 0.2 * Math.sin(TAU * 2 * t + p[9]);
  // the tip stretching up as a drop is about to pinch off, and the drop rising, shrinking, once it has
  const age = frac(t - fl.drop);
  const lift = Math.min(0.07, room);
  const stretch = fl.side ? 0 : lift * smooth(0.7, 1, age) ** 2;
  const H = h * (1 - 0.04 * breath + stretch);
  const W = w * (1 + 0.06 * breath);
  const s = (Y + fl.foot) / H;
  const up = Math.min(1, Math.max(0, s));
  // the tip sways side to side, curling a little as it goes
  const middle = (u, at) => fl.x + (fl.lean + 0.09 * fl.sway * Math.sin(TAU * at + p[1])) * u * u + 0.11 * Math.sin(TAU * (0.8 * u - at) + p[2]) * u ** 3;
  const mid = middle(up, t);
  // gentle waves running up the outline
  const wave = (0.06 * Math.sin(TAU * (1.2 * up - t) + p[3]) + 0.03 * Math.sin(TAU * (2.3 * up - 2 * t) + p[4])) * (0.4 + up);
  const half = W * teardrop(s) * (1 + wave);
  const across = Math.abs(X - mid);
  const beyond = s < 0 ? -s * H : s > 1 ? (s - 1) * H : 0;
  let outline = half - across - beyond;
  // the rim, thin at the bottom and thicker towards the tip, which is all rim
  let body = outline - h * (0.014 + 0.055 * up * up);
  if (!fl.side && age < 0.4) {
    // the drop, a little flame of its own: from where the stretched tip was, up as far as there is room, shrinking to nothing
    const k = age / 0.4;
    const r = h * 0.035 * (1 - k) ** 0.8;
    const tall = r * 3.2;
    const foot = h * (1 + lift) - fl.foot - tall * 0.75 + k * room;
    const sd = (Y - foot) / tall;
    const cx = middle(1, fl.drop) + 0.02 * Math.sin(TAU * k) + r * 0.6 * Math.sin(TAU * (sd - k)) * sd;
    const d = r * teardrop(sd) - Math.abs(X - cx) - (sd < 0 ? -sd * tall : sd > 1 ? (sd - 1) * tall : 0);
    outline = smoothUnion(outline, d, h * 0.035);
    body = Math.max(body, d - h * 0.006);
  }
  // the inner flame: a smaller teardrop of its own, lower, its outline wobbling more
  const innerH = h * (0.74 - 0.04 * breath);
  const si = (Y + fl.foot - 0.03 * h) / innerH;
  const ui = Math.min(1, Math.max(0, si));
  const innerWave = (0.12 * Math.sin(TAU * (1.5 * ui - t) + p[5]) + 0.06 * Math.sin(TAU * (2.8 * ui - 2 * t) + p[6])) * (0.3 + ui);
  const innerMid = mid + 0.03 * Math.sin(TAU * (1.1 * ui - t) + p[7]) * ui;
  const innerBeyond = si < 0 ? -si * innerH : si > 1 ? (si - 1) * innerH : 0;
  const inner = Math.min(W * 0.7 * teardrop(si) * (1 + innerWave) - Math.abs(X - innerMid) - innerBeyond, body - h * 0.025);
  if (fl.side) return { outline, body, inner };
  // the core: low in the flame, pale, a small flame of its own
  const coreH = h * (0.46 - 0.03 * breath);
  const sc = (Y + fl.foot - 0.05 * h) / coreH;
  const uc = Math.min(1, Math.max(0, sc));
  const coreWave = (0.12 * Math.sin(TAU * (1.4 * uc - t) + p[9]) + 0.06 * Math.sin(TAU * (2.6 * uc - 2 * t) + p[3])) * (0.3 + uc);
  const coreBeyond = sc < 0 ? -sc * coreH : sc > 1 ? (sc - 1) * coreH : 0;
  // rounder than the flame round it: a soft blob more than a drop
  const core = Math.min(W * 0.45 * teardrop(sc) ** 0.7 * (1 + coreWave) - Math.abs(X - innerMid) - coreBeyond, inner - h * 0.025);
  // a round spot of the inner flame's colour drifting up through the core, shrinking as it goes
  const k = frac(t + p[8] / TAU + 0.5);
  const spotR = h * 0.035 * Math.sin(Math.PI * k);
  const spot = Math.min(spotR - Math.hypot(X - innerMid - 0.08 * W * Math.sin(TAU * k + p[1]), Y - h * (0.08 + 0.3 * k)), core - h * 0.012);
  if (!fl.blue) return { outline, body, inner, core, spot };
  // the hottest flame's root: the foot of its core blue, just over the logs, its top edge rippling
  const blue = Math.min(core - h * 0.012, 0.16 + 0.015 * Math.sin(TAU * (5 * (X - innerMid) - t) + p[4]) - Y);
  return { outline, body, inner, core, spot, blue };
}

/**
 * How each stage's flame is drawn, every one a step up from the one before:
 * from the spark to the campfire one flame, simply bigger, its widest
 * `w` either side; from the big fire on, two smaller flames leaning in at its
 * sides, taller at each stage; and their tones.
 */
const ART = {
  spark: { w: 0.27, foot: -0.3, sway: 1.5, tones: TONES.warm, sides: null },
  kindling: { w: 0.3, foot: -0.1, sway: 1.25, tones: TONES.warm, sides: null },
  campfire: { w: 0.31, sway: 1, tones: TONES.warm, sides: null },
  bigfire: { w: 0.27, sway: 1, tones: TONES.warm, sides: { x: 0.24, h: 0.55, w: 0.12, lean: 0.03 } },
  bonfire: { w: 0.26, sway: 1, tones: TONES.warm, sides: { x: 0.235, h: 0.58, w: 0.12, lean: 0.03 } },
  blaze: { w: 0.255, sway: 1, tones: TONES.hot, sides: { x: 0.225, h: 0.6, w: 0.115, lean: 0.03 } },
  newroz: { w: 0.25, sway: 1, tones: TONES.gold, sides: { x: 0.22, h: 0.62, w: 0.11, lean: 0.03 } },
};

/**
 * A stage's flames, back to front: its two side flames, if it has them, and
 * the main one, its tip a little under its frame's `top` (in shares of its
 * height above the root) so it never breathes out of it.
 */
function flamesOf(stage, top) {
  const art = ART[stage];
  const rand = random(seedOf(stage));
  const foot = art.foot ?? 0.05;
  const main = flame(rand, { foot, h: Math.min(0.96, top - 0.1) + foot, w: art.w, sway: art.sway, blue: art.tones.blue !== undefined });
  if (!art.sides) return [main];
  const { x, h, w, lean } = art.sides;
  // the right one a little shorter than the left, so the two sides are never one shape mirrored
  return [flame(rand, { x: -x, h, w, lean, side: true, sway: 0.6 }), flame(rand, { x: x * 1.04, h: h * 0.94, w: w * 0.96, lean: -lean, side: true, sway: 0.6 }), main];
}

// ─────────────────────────────────────────────────────────────── painting

/**
 * How much of each pixel a field covers: its edge smoothed over one pixel by
 * the field's own slope (in pixels), so every outline is clean however the
 * field is shaped.
 */
function coverage(field, W, H) {
  const out = new Float32Array(field.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = (field[y * W + Math.min(W - 1, x + 1)] - field[y * W + Math.max(0, x - 1)]) / 2;
      const gy = (field[Math.min(H - 1, y + 1) * W + x] - field[Math.max(0, y - 1) * W + x]) / 2;
      const d = field[i] / Math.max(1e-4, Math.hypot(gx, gy));
      out[i] = Math.min(1, Math.max(0, d + 0.5));
    }
  return out;
}

/** How far outside a field's outline each pixel lies, in pixels (0 inside): for the light round it. */
function outside(field, W, H) {
  const out = new Float32Array(field.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = (field[y * W + Math.min(W - 1, x + 1)] - field[y * W + Math.max(0, x - 1)]) / 2;
      const gy = (field[Math.min(H - 1, y + 1) * W + x] - field[Math.max(0, y - 1) * W + x]) / 2;
      out[i] = Math.max(0, -field[i] / Math.max(1e-4, Math.hypot(gx, gy)));
    }
  return out;
}

/** One frame of a stage's flame, as straight (not premultiplied) RGBA floats. */
function paintFrame(sprite, f) {
  const art = ART[sprite.stage];
  const tones = art.tones;
  const hh = FIRE_FLAME_REACH[sprite.stage].to.h;
  const { w: W, h: Ht } = sprite.frame;
  const scale = W / sprite.box.w;
  const t = f / FIRE_SPRITE_FRAMES;
  // how far a drop can rise before the top of the frame
  const room = Math.max(0.02, Math.min(0.14, (FIRE_ROOT[1] - sprite.box.y) / hh - 1.14));
  const flames = flamesOf(sprite.stage, (FIRE_ROOT[1] - sprite.box.y) / hh);
  const n = W * Ht;
  const rgba = new Float32Array(n * 4);
  // lays a flat tone over what is there, as much of each pixel as `cover` says
  const lay = (colour, cover) => {
    for (let i = 0; i < n; i++) {
      const a = cover[i];
      if (a <= 0) continue;
      const o = i * 4;
      const under = rgba[o + 3] * (1 - a);
      const out = a + under;
      for (let k = 0; k < 3; k++) rgba[o + k] = (colour[k] * a + rgba[o + k] * under) / out;
      rgba[o + 3] = out;
    }
  };
  for (const fl of flames) {
    const fields = {};
    for (let py = 0; py < Ht; py++) {
      const Y = (FIRE_ROOT[1] - (sprite.box.y + (py + 0.5) / scale)) / hh;
      for (let px = 0; px < W; px++) {
        const X = (sprite.box.x + (px + 0.5) / scale - FIRE_ROOT[0]) / hh;
        const values = flameFields(fl, X, Y, t, room);
        for (const [name, v] of Object.entries(values)) (fields[name] ??= new Float32Array(n))[py * W + px] = v * hh * scale;
      }
    }
    // a thin warm light just outside the outline, gone within a few pixels
    const reach = Math.max(2, hh * scale * 0.012);
    lay(
      tones.light,
      outside(fields.outline, W, Ht).map((d) => (d > 0 ? 0.5 * (1 - smooth(0, reach, d)) : 0)),
    );
    lay(tones.rim, coverage(fields.outline, W, Ht));
    lay(tones.body, coverage(fields.body, W, Ht));
    lay(tones.inner, coverage(fields.inner, W, Ht));
    if (fields.core) {
      lay(tones.core, coverage(fields.core, W, Ht));
      lay(tones.inner, coverage(fields.spot, W, Ht));
    }
    if (fields.blue) lay(tones.blue, coverage(fields.blue, W, Ht));
  }
  // nothing at the frame's edges to bleed into the frames beside it on the sheet
  for (let py = 0; py < Ht; py++)
    for (let px = 0; px < W; px++) rgba[(py * W + px) * 4 + 3] *= smooth(0.005, 0.03, Math.min(px, W - 1 - px) / W) * smooth(0.005, 0.03, Math.min(py, Ht - 1 - py) / Ht);
  return rgba;
}

/** A stage's sheet: every frame in its cell, as 8-bit RGBA. */
function paintSheet(sprite) {
  const { w: W, h: H } = sprite.frame;
  const out = Buffer.alloc(sprite.sheet.w * sprite.sheet.h * 4);
  for (let f = 0; f < FIRE_SPRITE_FRAMES; f++) {
    const frame = paintFrame(sprite, f);
    const { col, row } = fireSpriteCell(f);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const o = ((row * H + y) * sprite.sheet.w + col * W + x) * 4;
        for (let k = 0; k < 4; k++) out[o + k] = Math.round(Math.min(1, Math.max(0, frame[i + k])) * 255);
      }
  }
  return out;
}

/**
 * A stage's sheet, painted and written to each of `dirs`: near-lossless, so
 * every flat tone and every edge comes back within a few steps of its colour;
 * what weighs is the edges, not the flat colour between them.
 */
async function writeSheet(sprite, dirs) {
  const raw = paintSheet(sprite);
  const webp = await sharp(raw, { raw: { width: sprite.sheet.w, height: sprite.sheet.h, channels: 4 } })
    .webp({ nearLossless: true, quality: 40, effort: 6 })
    .toBuffer();
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, sprite.file), webp);
  }
  return webp.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const only = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : null;
  const dirs = outAt >= 0 ? [path.resolve(args[outAt + 1])] : FIRE_SHEET_DIRS.map((d) => path.join(ROOT, d));
  for (const sprite of Object.values(FIRE_SPRITES)) {
    if (only && sprite.stage !== only) continue;
    const bytes = await writeSheet(sprite, dirs);
    console.log(`${sprite.file}  ${sprite.sheet.w}×${sprite.sheet.h}  ${(bytes / 1024).toFixed(1)} KB`);
  }
}
