/**
 * The streak's fire's flame, painted: one looping sheet of frames for each
 * stage that burns, which both apps play frame by frame
 * (`shared/src/art/fire-sprites.ts` says how the frames lie and where the
 * flame stands).
 *
 *   node scripts/generate-fire-sprites.mjs                          write into both apps
 *   node scripts/generate-fire-sprites.mjs --out <dir> [--stage s]  write the sheets (or one) under <dir>
 *
 * Each frame is painted the way a fire is drawn on a screen's graphics chip,
 * here on the processor: the stage's flame — a wide hot foot on the logs
 * narrowing into licks that lean in to one tall one — is pulled about by
 * fractal noise scrolling up through it, so its edges flow upward, its licks
 * stretch and sway and their tips tear off; its heat is mapped from a
 * near-white core through yellow and amber to red-orange edges that fade
 * softly to nothing, laid on in a few soft tones with a grain of brush
 * strokes running up it. The noise repeats in time — it scrolls up by whole
 * lengths of itself over the loop and turns once round its third dimension —
 * so the last frame flows into the first with no seam. The glow round the
 * flame, the sparks and the logs are drawn by the apps.
 *
 * Every random choice comes from a generator seeded with the stage's name,
 * and the rest is plain arithmetic, so the same script writes the same files
 * every time it runs; shared/src/art/fire-sprites.test.ts paints one again
 * and holds it to what is committed.
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

// ─────────────────────────────────────────────────────────────── noise

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

const GRADS = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

/**
 * Gradient noise in three dimensions that repeats every `py` along y and
 * `pz` along z (whole numbers of its cells), so a field scrolled up by `py`
 * or turned round by `pz` comes back to itself exactly.
 */
function periodicNoise(seed) {
  const rand = random(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const wrap = (i, n) => ((i % n) + n) % n;
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => {
    const g = GRADS[h % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  return (x, y, z, py, pz) => {
    const [xi, yi, zi] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [xf, yf, zf] = [x - xi, y - yi, z - zi];
    const [x0, x1] = [xi & 255, (xi + 1) & 255];
    const [y0, y1] = [wrap(yi, py), wrap(yi + 1, py)];
    const [z0, z1] = [wrap(zi, pz), wrap(zi + 1, pz)];
    const h = (a, b, c) => p[p[p[a] + (b & 255)] + (c & 255)];
    const [u, v, w] = [fade(xf), fade(yf), fade(zf)];
    const near = lerp(lerp(grad(h(x0, y0, z0), xf, yf, zf), grad(h(x1, y0, z0), xf - 1, yf, zf), u), lerp(grad(h(x0, y1, z0), xf, yf - 1, zf), grad(h(x1, y1, z0), xf - 1, yf - 1, zf), u), v);
    const far = lerp(
      lerp(grad(h(x0, y0, z1), xf, yf, zf - 1), grad(h(x1, y0, z1), xf - 1, yf, zf - 1), u),
      lerp(grad(h(x0, y1, z1), xf, yf - 1, zf - 1), grad(h(x1, y1, z1), xf - 1, yf - 1, zf - 1), u),
      v,
    );
    return lerp(near, far, w);
  };
}

/** Fractal noise: `octaves` layers of `noise`, each twice as fine and half as strong, every one repeating as the first does. */
function fbm(noise, x, y, z, py, pz, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0, k = 1; o < octaves; o++, k *= 2) {
    sum += amp * noise(x * k + o * 31.7, y * k, z * k, py * k, pz * k);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// ─────────────────────────────────────────────────────────────── paint

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/** The flame's colours by heat, coolest first: red-orange edges, orange, amber, yellow, pale gold, near white. */
const RAMP = [
  [0, hex('#D2461C')],
  [0.15, hex('#EE6A1E')],
  [0.32, hex('#F98F22')],
  [0.5, hex('#FFB02E')],
  [0.66, hex('#FFCE4A')],
  [0.82, hex('#FFE587')],
  [1, hex('#FFF6D6')],
];

function ramp(stops, q) {
  if (q <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [at, c] = stops[i];
    if (q <= at) {
      const [from, a] = stops[i - 1];
      const t = (q - from) / (at - from);
      return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    }
  }
  return stops.at(-1)[1];
}

/** The Newroz fire's colours: the same flame in gold. */
const GOLD = [
  [0, hex('#D86A18')],
  [0.15, hex('#F08E1E')],
  [0.32, hex('#FBAE28')],
  [0.5, hex('#FFC83A')],
  [0.66, hex('#FFDC5E')],
  [0.82, hex('#FFEFA4')],
  [1, hex('#FFF7D8')],
];

/** How far the logs reach either side of the flame's root, in the fire's units (`FIRE_LOGS`), a little in from their ends. */
const LOGS_HALF = 44;

/** The blue at the root of the hottest flame. */
const BLUE = hex('#8ED0FF');

/**
 * A lick of flame: its foot `at` across from the root and `w` either side of
 * it, both in shares of the flame's half-width; `h` tall, in shares of its
 * height; leaning `lean` (of its half-width) by its tip; breathing taller and
 * shorter `beat` times a loop.
 */
const lick = (at, w, h, lean = 0, beat = 1) => ({ at, w, h, lean, beat });

/**
 * A fire's licks, every one leaning in towards the middle so the whole
 * converges as a real fire does: a wide hot foot on the logs, a body, and
 * one tall lick up the middle. `side` licks stand either side of the middle
 * one, `outer` ones lower and further out; each pair a little different, so
 * the two sides are never one shape mirrored.
 */
function fire({ middle, side, outer, foot }) {
  return [
    lick(0, middle.w, 1, 0.03, 1),
    ...(side ? [lick(-side.at, side.w, side.h, side.lean, 2), lick(side.at * 1.04, side.w * 0.94, side.h * 0.93, -side.lean * 1.1, 1)] : []),
    ...(outer ? [lick(-outer.at, outer.w, outer.h, outer.lean, 1), lick(outer.at, outer.w * 0.96, outer.h * 1.06, -outer.lean, 2)] : []),
    lick(0, foot.w, foot.h),
  ];
}

/**
 * How each stage's flame is painted, each a step up from the one before: its
 * licks, how hard the noise pulls it about (`wild`), how fine its turbulence
 * is (`detail`), how hot it burns (`heat`: a bigger white heart), and its
 * colours. A spark is one young flame and a bud, quick and restless; the
 * little flame parts into three; the campfire stands on a wide hot foot; the
 * big fire and the bonfire spread wider and stand taller with more licks;
 * the blaze burns hottest, white at its heart with blue at its root; the
 * Newroz fire is the biggest, and gold.
 */
const ART = {
  spark: { wild: 1.25, detail: 0.9, heat: 0.8, ramp: RAMP, licks: [lick(0, 0.72, 1, -0.04, 2), lick(-0.34, 0.4, 0.5, 0.14, 1), lick(0, 0.9, 0.36)] },
  kindling: { wild: 1.15, detail: 0.95, heat: 0.9, ramp: RAMP, licks: fire({ middle: { w: 0.56 }, side: { at: 0.42, w: 0.4, h: 0.68, lean: 0.14 }, foot: { w: 0.9, h: 0.4 } }) },
  campfire: { wild: 1, detail: 1, heat: 1, ramp: RAMP, licks: fire({ middle: { w: 0.52 }, side: { at: 0.42, w: 0.42, h: 0.72, lean: 0.16 }, foot: { w: 0.95, h: 0.42 } }) },
  bigfire: {
    wild: 1,
    detail: 1.1,
    heat: 1.04,
    ramp: RAMP,
    licks: fire({ middle: { w: 0.5 }, side: { at: 0.36, w: 0.4, h: 0.78, lean: 0.14 }, outer: { at: 0.68, w: 0.3, h: 0.46, lean: 0.2 }, foot: { w: 0.98, h: 0.38 } }),
  },
  bonfire: {
    wild: 1.05,
    detail: 1.2,
    heat: 1.08,
    ramp: RAMP,
    licks: fire({ middle: { w: 0.5 }, side: { at: 0.36, w: 0.42, h: 0.74, lean: 0.14 }, outer: { at: 0.68, w: 0.32, h: 0.46, lean: 0.2 }, foot: { w: 1, h: 0.4 } }),
  },
  blaze: {
    wild: 1.05,
    detail: 1.25,
    heat: 1.18,
    ramp: RAMP,
    blue: true,
    licks: fire({ middle: { w: 0.52 }, side: { at: 0.36, w: 0.42, h: 0.74, lean: 0.14 }, outer: { at: 0.68, w: 0.32, h: 0.48, lean: 0.2 }, foot: { w: 1, h: 0.42 } }),
  },
  newroz: {
    wild: 1.05,
    detail: 1.3,
    heat: 1.12,
    ramp: GOLD,
    licks: fire({ middle: { w: 0.5 }, side: { at: 0.34, w: 0.44, h: 0.76, lean: 0.14 }, outer: { at: 0.68, w: 0.33, h: 0.5, lean: 0.22 }, foot: { w: 1, h: 0.44 } }),
  },
};

/** How hot a lick is at (u, v), across in shares of the half-width and up in shares of the height: 1 down its middle at its foot, 0 at its edge and its tip, below 0 outside it. */
function lickHeat(l, u, v, t) {
  const h = l.h * (1 + 0.06 * Math.sin(Math.PI * 2 * (l.beat * t + l.at)));
  const s = Math.max(0, v / h);
  if (s >= 1) return -1;
  const mid = l.at + l.lean * s * s;
  // a teardrop: round at its foot, swelling a little, narrowing to its tip
  const half = l.w * Math.pow(1 - s, 0.75) * (1 + 0.4 * s * (1 - s));
  const across = Math.abs(u - mid) / Math.max(1e-4, half);
  return (1 - across * across) * Math.pow(1 - s, 0.35);
}

/**
 * How the noise moves and paints every flame: how fine it is across and up
 * (`across`, `up`); how far it pulls the flame sideways (`sway`, and
 * `swayFoot` of that even at its foot) and up and down (`stretch`, on noise
 * `finer` times as fine across); how ragged its edges are (`ragged`) and how
 * wide their soft fade (`soft`); how much brush grain runs through its colour
 * (`brush`) and how far its colours gather into a few tones (`tones`); and how
 * its heat becomes colour (`hot`, `curve`).
 */
const FLOW = { across: 3.6, up: 1.6, sway: 0.35, swayFoot: 0.25, stretch: 0.5, finer: 2, ragged: 0.02, soft: 0.4, brush: 0.05, tones: 0.35, hot: 0.95, curve: 1.4 };

/** How many whole lengths of the noise a flame rises through in one loop: the loop ends where it began. */
const SCROLL = 2;

/** One frame of a stage's flame, as straight (not premultiplied) RGBA floats. */
function paintFrame(sprite, f, noise) {
  const art = ART[sprite.stage];
  const { w: reach, h: H } = FIRE_FLAME_REACH[sprite.stage].to;
  const R = reach / 2 / H;
  // a fire wider than its logs is tucked in among them at its very foot, and swells out over them just above
  const foot = Math.min(1, LOGS_HALF / (reach / 2));
  const { w: W, h: Ht } = sprite.frame;
  const scale = W / sprite.box.w;
  const t = f / FIRE_SPRITE_FRAMES;
  // scrolled up by whole lengths of the noise, and once round its third dimension, over the loop
  const turn = t * 2;
  const fx = FLOW.across * art.detail;
  const heats = new Float32Array(W * Ht);
  const strokes = new Float32Array(W * Ht);
  const fade = new Float32Array(W * Ht);
  const ups = new Float32Array(W * Ht);
  const acrosses = new Float32Array(W * Ht);
  for (let py = 0; py < Ht; py++) {
    const y = sprite.box.y + (py + 0.5) / scale;
    const v = (FIRE_ROOT[1] - y) / H;
    const Y = v * FLOW.up - t * SCROLL;
    for (let px = 0; px < W; px++) {
      const x = sprite.box.x + (px + 0.5) / scale;
      const u = (x - FIRE_ROOT[0]) / H;
      // the flame pulled about by the noise rising through it, harder the higher up
      const up = Math.max(0, v);
      const du = fbm(noise, u * fx + 11.3, Y, turn, SCROLL, 2, 2) * FLOW.sway * (FLOW.swayFoot + up) * art.wild;
      const dv = fbm(noise, u * fx * FLOW.finer + 47.9, Y, turn + 0.5, SCROLL, 2, 2) * FLOW.stretch * (0.05 + up) * art.wild;
      const [su, sv] = [(u + du) / (R * (foot + (1 - foot) * smooth(-0.02, 0.16, v))), v + dv];
      let heat = -1;
      for (const l of art.licks) heat = Math.max(heat, lickHeat(l, su, sv, t));
      const i = py * W + px;
      // ragged edges; and fine strokes running with the flow, in its colour alone
      heats[i] = heat + noise(u * 14 + 5.1, Y * 4, turn * 2 + 0.7, SCROLL * 4, 4) * FLOW.ragged;
      strokes[i] = noise(su * R * 34 + 3.7, Y * 6, turn * 2 + 1.3, SCROLL * 6, 4) * FLOW.brush;
      ups[i] = v;
      acrosses[i] = u;
      // nothing cut off by the frame's edges, and nothing at them to bleed into the frames beside it on the sheet: whatever reaches them fades out first (the foot behind the logs)
      fade[i] = smooth(0.01, 0.06, Math.min(px, W - 1 - px) / W) * smooth(0.01, 0.05, Math.min(py, Ht - 1 - py) / Ht);
    }
  }
  const rgba = new Float32Array(W * Ht * 4);
  for (let i = 0; i < heats.length; i++) {
    const v = Math.max(0, ups[i]);
    // hottest down the middle of its foot, cooling out to its edges and up to its tips
    const raw = Math.min(1, Math.pow(Math.max(0, heats[i] + strokes[i]), FLOW.curve) * FLOW.hot * art.heat * (1.2 - 0.5 * v));
    // laid on in a few tones, as a painter would, their edges still soft
    const q = raw + FLOW.tones * (Math.round(raw * 6) / 6 - raw);
    let c = ramp(art.ramp, q);
    if (art.blue) {
      // the hottest flame's root burns blue, just over the logs
      const [du, dv] = [acrosses[i] / 0.16, (v - 0.12) / 0.035];
      const k = 0.5 * Math.exp(-(du * du + dv * dv)) * smooth(0.5, 0.9, raw);
      c = c.map((ch, j) => ch + (BLUE[j] - ch) * k);
    }
    // its edges soft: fading out over a band of cooling flame, never cut
    const o = i * 4;
    for (let k = 0; k < 3; k++) rgba[o + k] = c[k];
    rgba[o + 3] = smooth(0, FLOW.soft, heats[i]) * fade[i];
  }
  return rgba;
}

/** A stage's sheet: every frame in its cell, as 8-bit RGBA. */
function paintSheet(sprite) {
  const noise = periodicNoise(seedOf(sprite.stage));
  const { w: W, h: H } = sprite.frame;
  const out = Buffer.alloc(sprite.sheet.w * sprite.sheet.h * 4);
  for (let f = 0; f < FIRE_SPRITE_FRAMES; f++) {
    const frame = paintFrame(sprite, f, noise);
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
 * A stage's sheet, painted and written to each of `dirs`: its colour lossy and
 * small (a painted flame is soft, so little is lost), its alpha lossless, so
 * every soft edge keeps its every step.
 */
async function writeSheet(sprite, dirs) {
  const raw = paintSheet(sprite);
  const webp = await sharp(raw, { raw: { width: sprite.sheet.w, height: sprite.sheet.h, channels: 4 } })
    .webp({ quality: 50, alphaQuality: 100, effort: 6 })
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
