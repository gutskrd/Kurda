/**
 * Drawings used only by Hevalo's book: the apple that loses a bite on every page (`bookAppleSvg`), scene props
 * (`bookSpotSvg`), colour-word paint dabs (`bookPaintSvg`), scene backdrops (`bookBackdropSvg`), the chapter stamp's
 * postmark (`bookPostmarkSvg`) and the three friends posed (`bookCastSvg`; a pose only recombines the rig's layers).
 * Painted like the word pictures with no gradient, blur, mask or clip, so a PDF draws them exactly as a browser does.
 */
import {
  characterArt,
  cropBody,
  cropBox,
  eyesFor,
  pupilShift,
  type BrowState,
  type CharacterArt,
  type CharacterCrop,
  type CharacterId,
  type EyeState,
  type MouthShape,
} from '../characters/index.js';
import { CANVAS, escapeXml, hashOf, mix, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import { VALLEY, bark, blobPath, earthHouse, ellipsePath, foliage, grownTree, orchardTree, roundTree, type TreeShape } from './valley.js';
// The word pictures' own tones and shapes, so an apple here matches the apple there.
import {
  BARK,
  BLUE,
  CLAY,
  COPPER,
  GLASS,
  GRASS,
  LEAF,
  PAPER,
  RED,
  STRAW,
  WATER,
  WOOD,
  box,
  oval,
  poly,
  wordPictureKinBody,
  type Tone,
} from './word-pictures.js';

// ───────────────────────────────────────────────────────────── colours

const IRON: Tone = [VALLEY.basalt, VALLEY.basaltSide, VALLEY.basaltLight];
const BURLAP: Tone = ['#cdb07a', '#a88a54', '#e3cc9c'];
/** A bitten apple's flesh, and the shade in a bite's hollow. */
const FLESH: Tone = ['#f8e6b4', '#e3cb90', '#fff5d8'];
/** Field stone and the lanes' dry-stone walls. */
const STONE: Tone = ['#cbc3b2', '#a3998a', '#e2dccf'];
/** Brown leather, worn. */
const LEATHER: Tone = ['#7a4a2c', '#57321d', '#9c6845'];
/** An old photo's browns. */
const SEPIA: Tone = ['#d9c39a', '#a98d5f', '#f1e3c4'];
/** Hamo's moustache black, never pure. */
const MOUSTACHE: Tone = ['#2a1c16', '#150d0a', '#5a4638'];
/** The near-black of a seed, a hole, a pencil lead. */
const INK = VALLEY.ink;
/** The shade patch things stand on, as under the word pictures. */
const GROUND = VALLEY.earthShade;

// ───────────────────────────────────────────────────────────── shapes

const f = n;
const E = ellipsePath;
/** A circle as a path, so many can share one element; the radius is rounded first so its two arcs meet exactly. */
const O = (cx: number, cy: number, r: number): string => {
  const q = Math.round(r * 10) / 10;
  return ellipsePath(cx, cy, q, q);
};

/** A smooth closed Catmull-Rom outline through the points, as cubic Béziers. */
function smooth(pts: readonly Pt[]): string {
  const m = pts.length;
  const at = (i: number): Pt => pts[((i % m) + m) % m]!;
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < m; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    d += `C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)} ${f(x2)} ${f(y2)}`;
  }
  return `${d}Z`;
}

// ───────────────────────────────────────────────────────────── the brush

/** What a spot is painted with: flat fills and round-ended lines. */
class Brush {
  private out = '';

  fill(d: string, hex: string, more = ''): void {
    this.out += `<path d="${d}" fill="${hex}"${more}/>`;
  }

  /** A stroke for things that are lines: a stalk, a string, a wire, falling crumbs. */
  line(d: string, hex: string, width: number, more = ''): void {
    this.out += `<path d="${d}" fill="none" stroke="${hex}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
  }

  /**
   * A form with one face and one step of shade: the whole shape in shade, and its face over it scaled `k` toward (ax, ay)
   * near the lit upper-left edge, so the shade shows as a band to the lower right.
   */
  form(d: string, t: Tone, ax: number, ay: number, k = 0.88): void {
    this.fill(d, t[1]);
    this.fill(d, t[0], ` transform="matrix(${n2(k)} 0 0 ${n2(k)} ${f(ax * (1 - k))} ${f(ay * (1 - k))})"`);
  }

  /** The soft patch of shade a thing stands on. */
  ground(rx: number, cx = 60, cy = 104): void {
    this.out += `<path d="${E(cx, cy, rx, rx * 0.15)}" fill="${GROUND}" fill-opacity="0.45"/>`;
  }

  /** Paints `draw` inside one transformed group. */
  group(transform: string, draw: () => void): void {
    this.out += `<g transform="${transform}">`;
    draw();
    this.out += '</g>';
  }

  /** Markup made elsewhere in the valley style (a house, a tree). */
  add(markup: string): void {
    this.out += markup;
  }

  toString(): string {
    return this.out;
  }
}

/** A picture on the 120-unit canvas, decorative and hidden from screen readers unless given a `title`. */
function picture(body: string, prefix: string, size: number | undefined, title: string | undefined, view = `0 0 ${CANVAS} ${CANVAS}`, ratio = 1): string {
  const width = size ?? CANVAS;
  if (!(width > 0) || !Number.isFinite(width)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const label = title ? ` role="img" aria-labelledby="${prefix}t"><title id="${prefix}t">${escapeXml(title)}</title>` : ' aria-hidden="true" focusable="false">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(width * ratio)}" viewBox="${view}"${label}${body}</svg>`;
}

export interface BookArtOptions {
  /** Display width in points or pixels; the canvas's 120 by default. */
  size?: number;
  /** The accessible label; without one the picture is decorative and hidden. */
  title?: string;
  idPrefix?: string;
}

// ───────────────────────────────────────────────────────────── the apple

/** One cubic Bézier: start, two handles, end. */
type Cubic = readonly [Pt, Pt, Pt, Pt];

/** The word pictures' apple outline as six cubics, from the dip under the stalk round by the left, bottom and right. */
const APPLE: readonly Cubic[] = [
  [[60, 41], [49, 31], [22, 35], [22, 63]],
  [[22, 63], [22, 86], [39, 104], [51, 104]],
  [[51, 104], [55, 104], [57, 102], [60, 102]],
  [[60, 102], [63, 102], [65, 104], [69, 104]],
  [[69, 104], [81, 104], [98, 86], [98, 63]],
  [[98, 63], [98, 35], [71, 31], [60, 41]],
];

/** The middle of the apple's flesh, which bites are taken toward. */
const HEART: Pt = [60, 72];

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The part of a cubic from `t0` to `t1` as its own cubic (de Casteljau subdivision, twice). */
function part(c: Cubic, t0: number, t1: number): Cubic {
  const head = (q: Cubic, t: number): Cubic => {
    const ab = lerp(q[0], q[1], t);
    const bc = lerp(q[1], q[2], t);
    const cd = lerp(q[2], q[3], t);
    const abc = lerp(ab, bc, t);
    const bcd = lerp(bc, cd, t);
    return [q[0], ab, abc, lerp(abc, bcd, t)];
  };
  const tail = (q: Cubic, t: number): Cubic => {
    const ab = lerp(q[0], q[1], t);
    const bc = lerp(q[1], q[2], t);
    const cd = lerp(q[2], q[3], t);
    const abc = lerp(ab, bc, t);
    const bcd = lerp(bc, cd, t);
    return [lerp(abc, bcd, t), bcd, cd, q[3]];
  };
  const rest = tail(c, t0);
  return t1 >= 1 ? rest : head(rest, (t1 - t0) / (1 - t0));
}

const p2 = (p: Pt): string => `${f(p[0])} ${f(p[1])}`;
const curveTo = (c: Cubic): string => `C${p2(c[1])} ${p2(c[2])} ${p2(c[3])}`;

/** A bite out of the apple: where on the outline it starts and ends (curve index and position along it) and how many tooth marks it leaves. */
interface Bite {
  from: readonly [curve: number, t: number];
  to: readonly [curve: number, t: number];
  dents: number;
  /** How far its middle reaches toward the heart. */
  depth: number;
}

/** A point `by` units nearer the apple's heart. */
function deeper(p: Pt, by: number): Pt {
  const reach = Math.hypot(HEART[0] - p[0], HEART[1] - p[1]) || 1;
  return [p[0] + ((HEART[0] - p[0]) / reach) * by, p[1] + ((HEART[1] - p[1]) / reach) * by];
}

/** The tooth-mark endpoints between `a` and `b`, along a line sagging `depth` toward the heart, so a big bite is a hollow, not a straight cut. */
function toothline(a: Pt, b: Pt, count: number, depth: number): Pt[] {
  const sag = deeper(lerp(a, b, 0.5), depth * 2);
  return Array.from({ length: count + 1 }, (_, k) => {
    const t = k / count;
    return lerp(lerp(a, sag, t), lerp(sag, b, t), t);
  });
}

/** The round tooth marks through `pts`, each bulging toward the heart, as arcs. */
function dents(pts: readonly Pt[]): string {
  let d = '';
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1]!, pts[k]!];
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.56;
    // An arc with sweep 1 bulges to the left of its direction, since the canvas's y runs down.
    const cross = (b[0] - a[0]) * (HEART[1] - a[1]) - (b[1] - a[1]) * (HEART[0] - a[0]);
    d += `A${f(r)} ${f(r)} 0 0 ${cross < 0 ? 1 : 0} ${p2(b)}`;
  }
  return d;
}

/** The apple's light source: its shade is the whole apple and its face the same apple scaled toward this point. */
const LIT: Pt = [32, 44];

/**
 * The apple's outline with these bites taken (in order round it), and the flesh each shows. With `k` below 1 it is the
 * lit face: the outline scaled toward `LIT` but with the bites exactly where the whole apple's are, so the face never
 * shows past a bite's edge.
 */
function bitten(bites: readonly Bite[], k = 1): { skin: string; flesh: string } {
  const lit = (p: Pt): Pt => [LIT[0] + (p[0] - LIT[0]) * k, LIT[1] + (p[1] - LIT[1]) * k];
  const face = (c: Cubic): Cubic => [lit(c[0]), lit(c[1]), lit(c[2]), lit(c[3])];
  let skin = `M${p2(lit(APPLE[0]![0]))}`;
  let flesh = '';
  let at: readonly [number, number] = [0, 0];
  const run = (from: readonly [number, number], to: readonly [number, number]): void => {
    for (let i = from[0]; i <= to[0]; i++) {
      const t0 = i === from[0] ? from[1] : 0;
      const t1 = i === to[0] ? to[1] : 1;
      if (t1 > t0) skin += curveTo(face(part(APPLE[i]!, t0, t1)));
    }
  };
  for (const bite of bites) {
    run(at, bite.from);
    const a = part(APPLE[bite.from[0]]!, bite.from[1], 1)[0];
    const b = part(APPLE[bite.to[0]]!, bite.to[1], 1)[0];
    const marks = toothline(a, b, bite.dents, bite.depth);
    skin += k === 1 ? dents(marks) : `L${p2(a)}${dents(marks)}L${p2(lit(b))}`;
    // The flesh is the same row of marks set a little deeper and joined to the first: a band along the bite.
    const inner = marks.map((p) => deeper(p, 7)).reverse();
    flesh += `M${p2(a)}${dents(marks)}L${p2(inner[0]!)}${dents(inner)}Z`;
    at = bite.to;
  }
  run(at, [APPLE.length - 1, 1]);
  return { skin: `${skin}Z`, flesh };
}

/** The bitten apple painted: its shade, lit face, and each bite's flesh. */
function bittenApple(b: Brush, bites: readonly Bite[]): void {
  const whole = bitten(bites);
  b.fill(whole.skin, RED[1]);
  b.fill(bitten(bites, 0.88).skin, RED[0]);
  if (whole.flesh) b.fill(whole.flesh, FLESH[0]);
}

/** The bites at each stage between the whole apple and the core: one, then a deeper one, then another from the other side. */
const BITES: readonly (readonly Bite[])[] = [
  [],
  [{ from: [4, 0.9], to: [5, 0.42], dents: 3, depth: 5 }],
  [{ from: [4, 0.42], to: [5, 0.56], dents: 4, depth: 11 }],
  [
    { from: [0, 0.5], to: [1, 0.52], dents: 3, depth: 9 },
    { from: [4, 0.36], to: [5, 0.6], dents: 4, depth: 13 },
  ],
];

/** How many bites the apple can lose; after the last only the core is left. */
export const BOOK_APPLE_BITES = 4;

function stalk(b: Brush, leaf: boolean): void {
  b.line('M60 41C59 32 62 25 67 20', BARK[0], 4.5);
  if (!leaf) return;
  b.form('M63 31C68 19 82 16 92 21C88 33 74 38 63 31Z', LEAF, 64, 24, 0.84);
  b.line('M67 29C74 26 81 23 88 22', LEAF[2], 1.4);
}

/** The core: both ends still in skin, the flesh eaten to a waist between them, and two seeds. */
function core(b: Brush): void {
  b.ground(22);
  stalk(b, false);
  // The flesh first, so the ends' skin lies over where it meets them.
  b.form('M40 52C50 60 52 68 50 76C48 84 44 90 42 94H78C76 90 72 84 70 76C68 68 70 60 80 52Z', FLESH, 44, 54, 0.9);
  b.fill('M60 41C52 33 36 36 31 48C36 55 44 58 50 56C54 59 57 59 60 57C63 59 66 59 70 56C76 58 84 55 89 48C84 36 68 33 60 41Z', RED[1]);
  b.fill('M60 41C52 33 36 36 31 48C36 54 43 56 49 53C53 56 57 56 60 54C63 56 66 55 69 53C73 52 76 46 74 40C69 36 64 37 60 41Z', RED[0]);
  b.form('M40 93C44 89 50 88 54 90C57 88 63 88 66 90C70 88 76 89 80 93C76 100 72 104 69 104C65 104 63 102 60 102C57 102 55 104 51 104C48 104 44 100 40 93Z', RED, 42, 90, 0.9);
  b.fill(oval(57, 70, 2.2, 4.2, 14) + oval(63.5, 73, 2.2, 4.2, -12), INK);
  b.fill(oval(40, 46, 3, 5, 30), RED[2]);
}

function apple(b: Brush, bites: number): void {
  if (bites >= BOOK_APPLE_BITES) return core(b);
  b.ground(32 - bites * 2);
  stalk(b, true);
  bittenApple(b, BITES[bites]!);
  // The patch of light sits where the third bite goes.
  if (bites < 3) b.fill(oval(39, 58, 5, 9, 20), RED[2]);
}

/** Hevalo's apple after `bites` bites: 0 is whole, as in the word pictures, and `BOOK_APPLE_BITES` is the core. */
export function bookAppleSvg(opts: BookArtOptions & { bites: number }): string {
  const bites = Math.floor(opts.bites);
  if (!(bites >= 0 && bites <= BOOK_APPLE_BITES)) throw new RangeError(`art: an apple has 0 to ${BOOK_APPLE_BITES} bites out of it, not ${String(opts.bites)}`);
  const brush = new Brush();
  apple(brush, bites);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-apple', bites), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── the spots

type Draw = (b: Brush, random: () => number) => void;

/** A valley house as a spot shows it, its cast shade softened like every other thing's so it suits any scene's ground. */
const soft = (markup: string): string => markup.split(`fill="${GROUND}"`).join(`fill="${GROUND}" fill-opacity="0.45"`);

const SPOTS = {
  // Hamo's moustache alone: full across the lip with both ends turned up, as when he is pleased.
  moustache: (b) => {
    const half: Pt[] = [[60, 52], [70, 45], [84, 46], [97, 51], [106, 45], [111, 34], [110, 51], [101, 63], [87, 70], [73, 70], [64, 64], [60, 60]];
    const whole = smooth([...half, ...half.slice(1, -1).reverse().map(([x, y]): Pt => [120 - x, y])]);
    b.form(whole, MOUSTACHE, 30, 34, 0.94);
    b.line('M67 53C76 50 88 52 97 57M53 53C44 50 32 52 23 57', MOUSTACHE[2], 2.4);
  },

  // The shepherd's flute: a plain wooden pipe bound at both ends, six holes down it, lying where it was put down.
  flute: (b) => {
    b.ground(46, 60, 102);
    b.group('rotate(-7 60 92)', () => {
      b.form(box(12, 86, 96, 12, 6), WOOD, 14, 87, 0.96);
      b.fill(box(12, 86, 9, 12, 5) + box(99, 86, 9, 12, 5), WOOD[1]);
      b.fill(box(26, 86, 3.5, 12) + box(91, 86, 3.5, 12), STRAW[0]);
      b.line('M24 89H96', WOOD[2], 1.6);
      b.fill([38, 47, 56, 65, 74, 83].map((x) => O(x, 92, 2.2)).join(''), '#5a3a22');
    });
  },

  // Half of an old sepia photo, torn down its right side and propped up: two children by the walnut tree.
  photo: (b) => {
    b.ground(36, 60, 104);
    b.group('rotate(-5 56 100)', () => {
      const edge = [88, 30, 91, 39, 85, 47, 92, 56, 86, 65, 93, 74, 87, 83, 92, 92, 87, 101];
      b.fill(poly(23.5, 31.5, ...edge.map((v) => v + 1.5), 23.5, 102.5), PAPER[1]);
      b.fill(poly(22, 30, ...edge, 22, 101), PAPER[2]);
      b.fill(poly(28, 36, 82, 36, 85, 43, 79, 49, 86, 57, 80, 65, 87, 74, 81, 82, 85, 91, 28, 91), SEPIA[2]);
      b.fill('M28 79C40 72 54 75 64 71C72 68 78 71 82 75L85 91H28Z', SEPIA[0]);
      // The walnut tree behind them.
      b.fill(box(35, 55, 3.5, 20), SEPIA[1]);
      b.fill(O(37, 50, 10), SEPIA[1]);
      // The boy, and his sister beside him, half of her torn away.
      const child = (x: number, y: number, k: number): string => O(x, y, 3.6 * k) + box(x - 3.8 * k, y + 3.6 * k, 7.6 * k, 12 * k, 3 * k) + box(x - 2.6 * k, y + 15 * k, 2.2 * k, 6 * k) + box(x + 0.4 * k, y + 15 * k, 2.2 * k, 6 * k);
      b.fill(child(52, 58, 1.05) + child(71, 61, 0.92), '#7d6442');
      b.fill(O(51, 57, 2.4) + O(70.2, 60.2, 2.1), SEPIA[0]);
    });
  },

  // The lake above the tents: still water in its green bank, reflecting the mountains upside down.
  lake: (b, random) => {
    b.fill(poly(14, 74, 27, 54, 39, 46.6, 52, 30.4, 58.6, 37, 65, 34.8, 82, 41, 93.6, 55, 106, 74), '#9aa9c4');
    // Each peak's shaded side, and snow near the tops.
    b.fill(poly(52, 30.4, 58.6, 37, 56, 44, 61, 52, 54, 74, 50, 52, 54, 42) + poly(82, 41, 93.6, 55, 106, 74, 90, 74, 92, 60, 86, 50), '#7d8dac');
    b.fill(poly(47.6, 36.4, 52, 30.4, 56.4, 35.2, 53.4, 36, 51.6, 39.4, 49.4, 36.8) + poly(77.6, 43.4, 82, 41, 86.4, 45.4, 83.4, 45, 81.4, 47.2, 79.6, 44.8), VALLEY.snow);
    b.fill(blobPath(60, 84, 54, 19, 11, 0.12, random), GRASS[1]);
    b.fill(blobPath(59, 82.6, 52, 17.4, 11, 0.12, random), GRASS[0]);
    // The water, its far edge holding the mountains' reflection, with two streaks of light.
    b.fill('M26 82.6C28 77.8 40 75.4 58 75.6C76 75.8 90 77.2 94 81.4C96 85.6 86 89.4 66 90C46 90.6 27 88.4 26 82.6Z', WATER[0]);
    b.fill('M34 77.6C42 76.2 50 75.6 58 75.6C66 75.6 76 76 84 77.2L76 79.6L66 78.2L58 82.4L50 78.4L42 80.2Z', '#6f8fb8');
    b.line('M38 85.4H50M62 87H76', WATER[2], 1.6);
    // Reeds of different heights at the near bank, and stones on the far side.
    b.line('M15.6 89V75.4M18.6 90V79.6M21 88.6V77', LEAF[1], 1.4);
    b.fill(oval(15.6, 74.6, 1.1, 2.6, 0) + oval(21, 76.2, 1, 2.2, 0), BARK[1]);
    b.fill(ellipsePath(99.4, 88.4, 3.2, 2) + ellipsePath(104.4, 86, 2.2, 1.4), IRON[2]);
  },

  // The iron stove of the winter evenings, its door glowing and the kettle on.
  stove: (b) => {
    b.ground(36);
    b.fill(box(68, 10, 10, 42), IRON[1]);
    b.fill(box(68, 10, 5, 42), IRON[0]);
    b.fill(box(38, 92, 6, 11, 2) + box(76, 92, 6, 11, 2), IRON[1]);
    b.form(box(32, 50, 56, 46, 9), IRON, 34, 52, 0.94);
    b.fill(box(28, 46, 64, 8, 4), IRON[2]);
    b.fill(box(44, 62, 32, 24, 5), IRON[1]);
    b.fill(box(48, 66, 24, 16, 4), VALLEY.fire);
    b.fill('M60 80C54 80 52 75 55 71C57 73 58 72 58 69C62 71 66 75 64 78C63 80 62 80 60 80Z', VALLEY.fireCore);
    b.form(E(46, 39, 11, 7.5), COPPER, 40, 34, 0.9);
    b.line('M56 38C60 37 61 33 64 32', COPPER[1], 3);
    b.line('M39 33C40 24 52 24 53 33', COPPER[1], 2.2);
  },

  // Dapîr's calendar by the stove, Saturday ringed in red.
  calendar: (b) => {
    b.ground(30);
    b.line('M42 24L60 12L78 24', BARK[1], 1.6);
    b.fill(O(60, 12, 2.4), BARK[1]);
    b.form(box(28, 22, 64, 78, 5), PAPER, 30, 24, 0.95);
    b.fill('M33 22H87A5 5 0 0 1 92 27V40H28V27A5 5 0 0 1 33 22Z', RED[0]);
    b.fill(O(44, 31, 2.6) + O(76, 31, 2.6), PAPER[2]);
    let days = '';
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) if (!(row === 1 && col === 3)) days += box(35 + col * 11, 48 + row * 12, 6, 6, 1.5);
    b.fill(days, PAPER[1]);
    b.fill(box(68, 60, 6, 6, 1.5), RED[0]);
    b.line(O(71, 63, 7.5), RED[1], 2);
  },

  // Hamo's old notebook and pencil.
  notebook: (b) => {
    b.ground(38);
    b.group('rotate(-9 58 62)', () => {
      b.fill(box(34, 28, 54, 72, 4), PAPER[1]);
      b.form(box(30, 24, 54, 72, 5), BLUE, 32, 26, 0.95);
      b.fill(box(30, 24, 9, 72, 4), BLUE[1]);
      b.fill(box(45, 36, 30, 16, 2.5), PAPER[2]);
      b.line('M50 42H70M50 47H64', PAPER[1], 1.8);
    });
    b.group('rotate(-32 70 88)', () => {
      b.fill(box(38, 84, 54, 8, 1), STRAW[0]);
      b.fill(box(38, 88, 54, 4), STRAW[1]);
      b.fill(poly(92, 84, 102, 88, 92, 92), PAPER[1]);
      b.fill(poly(98, 86.4, 102, 88, 98, 89.6), INK);
      b.fill(box(32, 84, 7, 8, 2), '#f2b0a2');
    });
  },

  // The apple-harvest ladder.
  ladder: (b) => {
    b.ground(30);
    const rail = (x0: number, x1: number, y: number): number => x0 + ((x1 - x0) * (100 - y)) / 86;
    let rungs = '';
    for (const y of [30, 44, 58, 72, 86]) rungs += `M${f(rail(42, 51, y))} ${y}H${f(rail(82, 73, y))}`;
    b.line(rungs, WOOD[1], 4.2);
    b.line('M42 100L51 14M82 100L73 14', WOOD[0], 5.4);
    b.line('M41 96L49.4 18', WOOD[2], 1.6);
  },

  // A sack of apples for the summer pastures.
  sack: (b) => {
    b.ground(40);
    b.form(smooth([[38, 101], [29, 80], [34, 58], [48, 46], [60, 44], [72, 46], [86, 58], [91, 80], [82, 101], [60, 104]]), BURLAP, 32, 48, 0.92);
    b.fill('M47 46C50 40 46 34 44 30C52 34 68 34 76 30C74 34 70 40 73 46C66 49 54 49 47 46Z', BURLAP[2]);
    b.line('M46 46C54 50 66 50 74 46', '#8a6428', 3);
    b.line('M42 70C46 73 50 73 54 70M66 84C70 87 74 87 78 84', BURLAP[1], 1.8);
    b.group('matrix(0.3 0 0 0.3 80 71)', () => {
      b.line('M60 41C59 32 62 25 67 20', BARK[0], 6);
      bittenApple(b, []);
      b.fill(oval(39, 58, 5, 9, 20), RED[2]);
    });
  },

  // The lamp at the blue gate on the night before Newroz.
  lamp: (b) => {
    b.ground(26);
    b.line('M45 84C30 60 40 26 60 22C80 26 90 60 75 84', COPPER[1], 2.6);
    b.fill(O(60, 21, 3.6), COPPER[1]);
    b.form(box(42, 86, 36, 15, 5), COPPER, 44, 88, 0.92);
    b.fill(box(50, 34, 20, 8, 3), COPPER[1]);
    b.fill('M49 86C44 70 50 56 53 42H67C70 56 76 70 71 86Z', GLASS[0]);
    b.fill('M60 80C53 80 50 72 54 64C56 67 58 66 58 60C64 64 69 72 66 77C65 79 63 80 60 80Z', VALLEY.fire);
    b.fill('M60 79C56 79 55 75 57 71C59 73 60 72 60 69C63 72 65 75 63 77C62 79 61 79 60 79Z', VALLEY.fireCore);
    b.line('M53 48C51 58 50 66 51 76', GLASS[2], 2);
  },

  // Hevalo's tracks: a walking line of small cloven prints, each two slim halves with a gap, alternating left and right.
  hoofprints: (b) => {
    // One half of a print: a slim teardrop, pointed at the toe and round at the heel.
    const half = 'M0 -9C-2.8 -7.6 -4.2 -1.8 -3.6 3.4C-3.2 7 -1.6 8.4 0 8C0.6 3 0.8 -3 0 -9Z';
    const print = (x: number, y: number, turn: number, k: number): void =>
      b.group(`translate(${x} ${y}) rotate(${turn}) scale(${k})`, () => {
        b.fill(half, VALLEY.wallSide, ' transform="translate(-1.4 0)"');
        b.fill(half, VALLEY.wallSide, ' transform="translate(1.4 0) scale(-1 1)"');
        b.fill(E(-1.6, 6.2, 1.5, 1.1) + E(1.6, 6.2, 1.5, 1.1), VALLEY.earthShade);
      });
    // The line bends a little as a walk does, each step varied in size and angle, a stride apart and alternating sides, so the
    // prints never touch and read as a deer walking rather than a row of beans.
    print(27, 99, 40, 1.12);
    print(38, 78, 47, 1.08);
    print(60, 68, 37, 1.06);
    print(71, 47, 45, 1.02);
    print(93, 37, 39, 1);
  },

  // Kobanî under Miştenûr: the flat roofs of Hamo's town, the fig tree in his father's yard, and the hill above them.
  town: (b, random) => {
    b.ground(54, 60, 104);
    // Miştenûr: a long hill rising unevenly to a flat top, its right flank shaded, a path up its face, ending behind the roofs.
    b.fill('M2 92C8 80 14 66 24 54C30 46 36 40 46 37.4C52 36 58 35.6 64 35.8C72 36 80 37.6 86 41.4C94 46.6 102 58 108 70C112 78 115 86 118 92C96 96 24 96 2 92Z', '#c9c6a2');
    b.fill('M86 41.4C94 46.6 102 58 108 70C112 78 115 86 118 92C110 93 102 93.6 96 94C95 76 90 58 81 39C83 39.6 84.6 40.4 86 41.4Z', '#b5b08a');
    b.fill('M42 39C48 37 56 36.2 64 36.2C70 36.2 75 36.8 79 37.8C71 38.4 57 38.6 42 39Z', '#dedbb8');
    b.line('M30 72C38 68 46 66 52 62C46 58 50 52 58 48C62 46 64 43 66 39', '#dedbb8', 1.4);
    // The houses, each different: two storeys, a parapet, a side stair, a roof ladder; their cast shade is soft like the rest.
    const house = (x: number, y: number, w: number, h: number, d: number, more: { door?: string; roofLine?: string } = {}): void =>
      b.add(soft(earthHouse(x, y, w, h, d, { dark: false, ground: GROUND, ...more })));
    house(70, 78, 24, 24, 10, { roofLine: VALLEY.fruit });
    b.fill(box(74, 64, 5, 6, 1), VALLEY.window);
    house(36, 92, 26, 18, 11);
    b.line('M38 92L48 74M40.4 92L50.4 74M39.4 88H42.8M41.4 84H44.8M43.4 80H46.8M45.4 76H48.8', WOOD[1], 1.2);
    house(6, 103, 28, 20, 12, { door: VALLEY.gateDark });
    b.fill(poly(34, 103, 46, 97, 46, 93, 34, 99), VALLEY.parapet);
    house(72, 104, 30, 22, 12, { door: VALLEY.gate });
    b.fill(box(70, 80, 34, 2.6, 1), VALLEY.parapet);
    // At this size a round tree with its trunk well up inside the crown reads as a fig with fewer curves.
    b.add(soft(roundTree(58, 104, 0.62, foliage(false), GROUND, random)));
  },


  // ── What a scene sets things on, and what stands in front of it.

  // A low round guest-room table seen a little from above; things put on it stand on its middle.
  lowTable: (b) => {
    b.ground(50, 60, 104);
    b.fill(box(31, 74, 6, 26, 2.5) + box(83, 74, 6, 26, 2.5), WOOD[1]);
    b.form(box(20, 76, 8, 27, 3), WOOD, 21, 77, 0.9);
    b.form(box(92, 76, 8, 27, 3), WOOD, 93, 77, 0.9);
    b.fill(E(60, 75, 51, 11), WOOD[1]);
    b.fill(E(60, 70.5, 51, 11), WOOD[0]);
    b.fill(oval(42, 66.5, 20, 3.6, -4), WOOD[2]);
  },

  // The round copper tea tray, set down on the floor or the grass.
  tray: (b) => {
    b.ground(54, 60, 104);
    b.fill(E(60, 100.5, 52, 8.6), COPPER[1]);
    b.fill(E(60, 98, 52, 8.6), COPPER[0]);
    b.fill(E(61, 98.6, 44, 6.2), mix(COPPER[0], COPPER[1], 0.45));
    b.line('M24 95.4C36 91.6 52 90.6 66 91', COPPER[2], 1.8);
  },

  // The meal cloth spread on the floor: a woven red ground inside a pale border of lozenges.
  cloth: (b) => {
    const edge = (k: number, dy: number): string => {
      const [l, r, t, u] = [12 + k * 1.4, 108 - k * 1.4, 84 + k + dy, 104 - k + dy];
      return (
        `M${f(l + 2)} ${f(u)}C${f(l - 2)} ${f(u)} ${f(l - 2)} ${f(u - 3)} ${f(l + 1)} ${f(u - 6)}L${f(l + 14)} ${f(t + 2)}C${f(l + 16)} ${f(t)} ${f(l + 18)} ${f(t)} ${f(l + 20)} ${f(t)}` +
        `H${f(r - 20)}C${f(r - 18)} ${f(t)} ${f(r - 16)} ${f(t)} ${f(r - 14)} ${f(t + 2)}L${f(r - 1)} ${f(u - 6)}C${f(r + 2)} ${f(u - 3)} ${f(r + 2)} ${f(u)} ${f(r - 2)} ${f(u)}Z`
      );
    };
    b.fill(edge(0, 1.4), VALLEY.redDark);
    b.fill(edge(0, 0), VALLEY.red);
    b.fill(edge(2.6, 0), VALLEY.cream);
    b.fill(edge(5, 0), VALLEY.red);
    b.fill([0, 1, 2, 3, 4, 5, 6].map((i) => poly(27 + i * 11, 101.4, 29.2 + i * 11, 100, 31.4 + i * 11, 101.4, 29.2 + i * 11, 102.8)).join(''), VALLEY.indigo);
    b.line('M36 90.4H84', mix(VALLEY.red, VALLEY.cream, 0.35), 1.2);
  },

  // A flat-topped rock by the path, where a shepherd sets his tea glass.
  rock: (b) => {
    b.ground(50, 62, 104);
    b.form(smooth([[14, 103], [16, 88], [24, 74], [38, 67.4], [60, 66], [82, 67.4], [96, 74], [104, 88], [106, 103], [60, 105]]), STONE, 20, 70, 0.9);
    b.fill(E(58, 69.6, 38, 4.4), STONE[2]);
    b.line('M30 84C36 88 40 94 38 101M80 80C84 86 90 88 94 94', STONE[1], 1.4);
    b.fill(blobPath(84, 99, 9, 3.6, 7, 0.3, seeded('book-rock-moss')), GRASS[1]);
  },

  // A waist-high dry-stone wall capped with flat stones: a scene's near edge, or a seat.
  stoneWall: (b, random) => {
    b.fill(box(0, 62, 120, 44), STONE[1]);
    let stones = '';
    let lit = '';
    for (const [y, h] of [[67, 12], [80, 12], [93, 12]] as const) {
      for (let x = -8 + random() * 10; x < 120; ) {
        const w = 18 + random() * 12;
        stones += box(x + 0.8, y + 0.6, w - 1.6, h - 1.4, 3.4);
        lit += `M${f(x + 2.4)} ${f(y + 2.6)}h${f(w * 0.45)}`;
        x += w;
      }
    }
    b.fill(stones, STONE[0]);
    b.line(lit, STONE[2], 1.8);
    b.fill(box(-2, 58, 124, 7, 3), STONE[2]);
    b.fill(box(-2, 62.4, 124, 2.6), STONE[1]);
    b.fill(blobPath(14, 105, 10, 3.4, 7, 0.4, random) + blobPath(98, 105, 12, 3.4, 7, 0.4, random), GRASS[1]);
  },

  // A village bed made up on the floor: a thick mattress and a quilt in kilim red and indigo.
  bedding: (b) => {
    b.ground(56, 60, 105);
    b.form(box(4, 84, 112, 20, 7), PAPER, 6, 85, 0.94);
    b.fill('M8 92C8 76 20 66 40 64C58 62 80 62 98 66C110 68 116 78 116 92Z', VALLEY.redDark);
    b.fill('M8 90C8 75 20 65.4 40 63.4C58 61.4 80 61.4 98 65.4C109 67.6 114 76 114 90Z', VALLEY.red);
    b.line('M14 86C18 74 30 70 44 69C62 68 82 68 98 72C105 74 108 79 110 86', VALLEY.cream, 2.6);
    b.fill([24, 42, 60, 78, 96].map((x) => poly(x, 72.6, x + 4, 76.6, x, 80.6, x - 4, 76.6)).join(''), VALLEY.indigo);
  },

  // ── Places a scene is set in, and what grows there.

  // One of Hamo's apple trees, its fruit nearly ripe.
  appleTree: (b, random) => {
    b.ground(40, 66, 104);
    b.add(grownTree({ ...orchardTree(58, 104, 2.85, 0.9, random), shadow: false }, foliage(false, VALLEY.apple), bark(false), GROUND, random));
  },

  // The old walnut tree: a thick pale trunk, a broad dark crown, green nuts among the leaves.
  walnutTree: (b, random) => {
    const shape: TreeShape = {
      foot: [60, 104],
      base: 12,
      fork: [59, 68],
      limbs: [
        { from: [59, 68], bend: [46, 56], to: [32, 46], width: 5 },
        { from: [59, 68], bend: [59, 50], to: [60, 32], width: 5.6 },
        { from: [59, 68], bend: [74, 56], to: [88, 44], width: 4.6 },
      ],
      lobes: [
        { x: 31, y: 46, rx: 24, ry: 17 },
        { x: 60, y: 31, rx: 27, ry: 21 },
        { x: 89, y: 44, rx: 24, ry: 17 },
        { x: 60, y: 54, rx: 32, ry: 11 },
      ],
      rough: 0.12,
      dot: 2.2,
      shadow: false,
    };
    b.ground(46, 66, 104);
    b.add(grownTree(shape, { face: '#5d8c44', light: '#82ad5e', shade: '#456b35', dots: '#a8c15c' }, { face: '#a39383', shade: '#7c6f63' }, GROUND, random));
  },

  // A mud-brick village house under its flat roof, with a blue door and a small window.
  flatHouse: (b) => {
    b.add(soft(earthHouse(12, 104, 68, 46, 28, { dark: false, ground: GROUND, door: VALLEY.gate, roofLine: VALLEY.fruit })));
    b.fill(box(56, 66, 8, 7, 1.5), VALLEY.window);
  },

  // The same house with the ladder to its roof, where everyone sleeps in summer.
  houseLadder: (b) => {
    b.add(soft(earthHouse(8, 104, 66, 46, 28, { dark: false, ground: GROUND, door: VALLEY.gate })));
    b.line('M76 104L69 52M85 104L78 52', WOOD[0], 3);
    b.line('M75.2 98H83.8M74 89H82.6M72.8 80H81.4M71.6 71H80.2M70.4 62H79', WOOD[1], 2.2);
    b.line('M75.6 103L68.8 54', WOOD[2], 1);
  },

  // The old roofless stone house by the lake: walls broken to different heights, a doorway and a window open to the sky.
  ruin: (b, random) => {
    b.ground(54, 62, 104);
    b.fill(poly(80, 104, 80, 60, 92, 54, 98, 60, 104, 57, 106, 96), STONE[1]);
    b.fill(poly(14, 104, 14, 62, 22, 57, 28, 63, 36, 52, 46, 57, 52, 49, 62, 51, 70, 59, 80, 55, 80, 104), STONE[0]);
    b.line('M14 74H80M14 87H80M22 62V74M40 74V87M58 74V87M30 87V104M66 87V104M48 62V74M70 62V74', STONE[1], 1.2);
    b.fill('M24 104V84A7 7 0 0 1 38 84V104Z' + box(54, 64, 10, 10, 1), '#5a4c40');
    b.fill(blobPath(86, 104, 7, 3.4, 6, 0.3, random) + blobPath(96, 103, 5, 2.6, 6, 0.3, random) + blobPath(8, 103, 6, 3, 6, 0.3, random), STONE[1]);
    b.fill(blobPath(46, 105, 10, 3, 7, 0.4, random) + blobPath(104, 104, 6, 2.4, 6, 0.4, random), GRASS[1]);
  },

  // ── Animals the word pictures do not have.

  // Zerê, the golden doe of the summer pastures: no antlers.
  doe: (b) => b.add(wordPictureKinBody('doe')),
  // Dapîr's white goat, with her long beard and collar.
  whiteGoat: (b) => b.add(wordPictureKinBody('whiteGoat')),
  // A ram with curled horns.
  ram: (b) => b.add(wordPictureKinBody('ram')),

  // A small bird in flight, wings up, crossing a scene's sky.
  flyingBird: (b) => {
    const t: Tone = ['#a8703f', '#7c4f2a', '#cf9a64'];
    b.fill(smooth([[64, 58], [76, 38], [92, 26], [90, 38], [78, 56]]), t[1]);
    b.fill(poly(84, 60, 100, 52, 98, 62, 100, 70), t[1]);
    b.fill(smooth([[26, 60], [36, 54], [52, 52], [70, 55], [88, 60], [72, 67], [52, 68], [36, 66]]), t[0]);
    b.fill(smooth([[36, 64], [52, 66], [70, 64], [60, 68], [46, 68]]), '#efdcc0');
    b.form(smooth([[46, 58], [40, 38], [28, 22], [32, 38], [40, 58]]), t, 34, 30, 0.9);
    b.fill(poly(27, 58.6, 19, 60.6, 27, 62.4), VALLEY.goldDark);
    b.fill(O(32, 58, 1.8), INK);
  },

  // An eagle soaring, wings wide and fingered at the tips: dark, with gold on its nape.
  eagle: (b) => {
    const t: Tone = ['#5a4030', '#3d2b20', '#7a5a42'];
    const wing = (side: 1 | -1): string => {
      const x = (v: number): number => 60 + side * v;
      return `M${x(6)} 54C${x(18)} 44 ${x(34)} 38 ${x(50)} 40L${x(54)} 36L${x(55)} 42L${x(58)} 39L${x(58)} 45L${x(56)} 49C${x(42)} 52 ${x(26)} 58 ${x(8)} 64Z`;
    };
    b.fill(wing(1), t[1]);
    b.fill(wing(-1), t[0]);
    b.fill(poly(70, 56, 84, 54, 84, 66, 70, 64), t[1]);
    b.form(smooth([[36, 56], [44, 51], [60, 51], [74, 56], [62, 63], [44, 62]]), t, 42, 52, 0.9);
    b.fill(smooth([[30, 54], [36, 49.6], [44, 50], [44, 57], [36, 58]]), '#c9a05c');
    b.fill('M30 53.4C26 53.6 24 55.4 25.6 57.6C27 56.6 28.6 56.4 30.4 56.6Z', VALLEY.gold);
    b.fill(O(34, 53, 1.3), INK);
  },

  // ── Small things.

  // The rusty tin from under the walnut tree, its lid open on a handful of marbles.
  tin: (b) => {
    const rust: Tone = ['#b8673a', '#8a4526', '#d98e5c'];
    b.ground(42, 62, 104);
    b.fill(poly(30, 66, 38, 46, 96, 46, 88, 66), rust[1]);
    b.fill(poly(34, 64, 40.4, 49, 92.4, 49, 86, 64), mix(rust[1], rust[0], 0.4));
    b.fill(poly(86, 70, 98, 64, 98, 96, 86, 102), rust[1]);
    b.fill(box(24, 70, 62, 32, 3), rust[0]);
    b.fill(poly(24, 70, 36, 64, 98, 64, 86, 70), '#4a2a1c');
    b.fill(O(46, 67.4, 3.6) + O(64, 66.6, 3.4), '#3f7fbf');
    b.fill(O(55, 68, 3.4) + O(104, 101, 3.2), '#5aa452');
    b.fill(O(74, 67.6, 3.2) + O(95, 104, 2.8), '#e9a93b');
    b.fill(blobPath(36, 88, 5, 3.4, 6, 0.4, seeded('book-tin')) + blobPath(70, 80, 6, 3, 6, 0.4, seeded('book-tin-2')), rust[1]);
    b.line('M27 74H82', rust[2], 1.4);
  },

  // Doctor Azad's bag: brown leather, a brass clasp along its mouth, a worn handle.
  doctorBag: (b) => {
    b.ground(46, 60, 104);
    b.line('M44 52C44 36 76 36 76 52', LEATHER[1], 5);
    b.form('M20 102C17 84 20 66 30 56C40 50 80 50 90 56C100 66 103 84 100 102Z', LEATHER, 24, 58, 0.93);
    b.fill(box(26, 52, 68, 7, 3.4), VALLEY.goldDark);
    b.fill(box(26, 52, 68, 3.4, 1.7), VALLEY.gold);
    b.fill(box(55, 57, 10, 9, 2), VALLEY.gold);
    b.line('M24 90H96', LEATHER[2], 1.2, ' stroke-dasharray="2 2.6"');
  },

  // Baran's boots, muddy to the ankles.
  boots: (b) => {
    const boot = (x: number, t: Tone, mud: string): void => {
      b.fill(`M${x} 46H${x + 22}V86C${x + 30} 88 ${x + 38} 92 ${x + 38} 98V103H${x - 2}V60C${x - 2} 52 ${x} 48 ${x} 46Z`, t[0]);
      b.fill(`M${x + 22} 46V86C${x + 30} 88 ${x + 38} 92 ${x + 38} 98V103H${x + 30}V96C${x + 30} 92 ${x + 24} 90 ${x + 16} 89V46Z`, t[1]);
      b.fill(`M${x - 2} 84C${x + 6} 80 ${x + 14} 86 ${x + 22} 82C${x + 30} 86 ${x + 36} 88 ${x + 38} 96V103H${x - 2}Z`, mud);
    };
    b.ground(46, 60, 104);
    boot(52, ['#4f5a3c', '#3a4329', '#6b7752'], '#8a6a45');
    boot(26, ['#5d6a46', '#45502f', '#76835a'], '#9c7a4f');
    b.fill(O(20, 98, 2.4) + O(96, 96, 2) + O(100, 101, 1.6), '#8a6a45');
  },

  // A clay jug for milk or spring water, its handle on its shoulder.
  jug: (b) => {
    b.ground(34, 60, 104);
    b.line('M76 48C92 48 92 72 76 76', CLAY[1], 5);
    b.form('M48 30H72V40C84 48 88 62 86 78C84 94 74 102 60 102C46 102 36 94 34 78C32 62 36 48 48 40Z', CLAY, 42, 44, 0.92);
    b.fill(E(60, 30, 13, 3.4), CLAY[1]);
    b.line('M38 70C50 74 70 74 82 70', VALLEY.cream, 2.2);
    b.fill([46, 54, 62, 70].map((x) => O(x + 2, 78, 1.5)).join(''), VALLEY.redDark);
  },

  // The goatskin churn hanging from three poles, rocked to make butter and ayran.
  churn: (b) => {
    b.ground(50, 60, 104);
    b.line('M60 14L22 104M60 14L98 104', WOOD[1], 3.4);
    b.line('M60 14L66 104', WOOD[0], 3.4);
    b.line('M48 52L60 16L72 50', BARK[1], 1.2);
    b.form(smooth([[30, 62], [42, 50], [60, 48], [80, 50], [92, 62], [86, 78], [62, 82], [38, 78]]), ['#b08a5c', '#86643c', '#cba67a'], 38, 52, 0.9);
    b.fill(oval(30, 56, 4, 7, -30) + oval(92, 56, 4, 7, 30), '#86643c');
    b.line('M44 70C54 74 70 74 80 70', '#cba67a', 1.4);
  },

  // The saj: an iron dome over a low fire on three stones, with paper-thin bread spread on it.
  saj: (b) => {
    b.ground(48, 60, 104);
    b.fill(E(28, 97, 9, 7) + E(92, 97, 9, 7) + E(60, 100, 8, 5), STONE[0]);
    b.fill('M48 100C50 90 56 88 60 82C64 88 70 90 72 100Z', VALLEY.fire);
    b.fill('M54 100C56 94 58 92 60 88C62 92 64 94 66 100Z', VALLEY.fireCore);
    b.fill('M14 88C22 70 40 62 60 62C80 62 98 70 106 88C92 86 76 85 60 85C44 85 28 86 14 88Z', IRON[1]);
    b.fill('M18 84C28 70 42 65 60 65C78 65 92 70 102 84C88 82 74 81 60 81C46 81 32 82 18 84Z', PAPER[1]);
    b.fill(blobPath(52, 70, 5, 2, 6, 0.3, seeded('book-saj')) + blobPath(74, 74, 4, 1.6, 6, 0.3, seeded('book-saj-2')), STRAW[1]);
  },

  // The snow deer Hevalo builds by the wall, with an apple for a nose.
  snowDeer: (b) => {
    const snow: Tone = [VALLEY.snow, VALLEY.snowShade, '#ffffff'];
    b.ground(40, 60, 104);
    b.line('M48 34L42 20M44 26L38 24M64 34L70 20M68 26L74 24', BARK[0], 2.4);
    b.form(smooth([[30, 102], [28, 84], [36, 70], [60, 66], [84, 70], [92, 84], [90, 102], [60, 104]]), snow, 36, 72, 0.92);
    b.form(smooth([[42, 52], [46, 38], [60, 34], [74, 38], [78, 52], [70, 62], [50, 62]]), snow, 46, 40, 0.92);
    b.fill(O(52, 46, 2) + O(68, 46, 2) + O(60, 82, 2) + O(60, 92, 2), INK);
    b.fill(O(60, 55, 5), RED[0]);
    b.fill(O(58.4, 53.4, 1.6), RED[2]);
  },

  // Three framed photos on a wall: the family far away in Kobanî, a moustache in the middle.
  frames: (b) => {
    const frame = (x: number, y: number, w: number, h: number): void => {
      b.fill(box(x + 1, y + 1.4, w, h, 2), mix(WOOD[1], '#000000', 0.15));
      b.fill(box(x, y, w, h, 2), WOOD[0]);
      b.fill(box(x + 3, y + 3, w - 6, h - 6, 1), SEPIA[2]);
      b.fill(O(x + w / 2, y + h * 0.42, w * 0.14) + box(x + w * 0.28, y + h * 0.58, w * 0.44, h * 0.42 - 3, 3), SEPIA[1]);
    };
    frame(10, 36, 30, 38);
    frame(46, 24, 30, 40);
    frame(82, 40, 28, 34);
    b.fill(oval(61, 43.6, 4.6, 1.3, 0), MOUSTACHE[0]);
    b.line('M25 36L25 30M61 24L61 18M96 40L96 34', BARK[1], 1);
  },
} as const satisfies Readonly<Record<string, Draw>>;

/** A small thing the book's scenes use. */
export type BookSpot = keyof typeof SPOTS;

/** Every spot, in the order defined above. */
export const BOOK_SPOTS: readonly BookSpot[] = Object.freeze(Object.keys(SPOTS) as BookSpot[]);

/** One of the book's spots on the 120-unit canvas, on a clear ground. */
export function bookSpotSvg(opts: BookArtOptions & { spot: BookSpot }): string {
  const draw = Object.prototype.hasOwnProperty.call(SPOTS, opts.spot) ? SPOTS[opts.spot] : undefined;
  if (!draw) throw new RangeError(`art: no book spot ${String(opts.spot)}`);
  const brush = new Brush();
  draw(brush, seeded(`book-spot|${opts.spot}`));
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-spot', opts.spot), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── paint

/** The colours the road teaches, as paint dabs: each one's face, shade and light. */
const PAINTS = {
  red: RED,
  blue: BLUE,
  green: LEAF,
  yellow: ['#f7c63c', '#e29a24', '#fde49a'],
  black: ['#34303a', '#1f1c24', '#5c5766'],
  white: ['#fbf8f2', '#d6cdbd', '#ffffff'],
} as const satisfies Readonly<Record<string, Tone>>;

/** A colour the book can show as a dab of paint. */
export type BookPaint = keyof typeof PAINTS;

export const BOOK_PAINTS: readonly BookPaint[] = Object.freeze(Object.keys(PAINTS) as BookPaint[]);

/** A dab of paint in one of the road's colours with the drop it let fall: the picture for a colour word. */
export function bookPaintSvg(opts: BookArtOptions & { colour: BookPaint }): string {
  const tone = Object.prototype.hasOwnProperty.call(PAINTS, opts.colour) ? PAINTS[opts.colour] : undefined;
  if (!tone) throw new RangeError(`art: no paint called ${String(opts.colour)}`);
  const brush = new Brush();
  // Every dab is the same size with its own hand-laid edge and its fallen drop.
  const random = seeded(`book-paint|${opts.colour}`);
  const dab = blobPath(58, 58, 38, 30, 9, 0.26, random, 0.4);
  brush.form(dab, tone, 26, 32, 0.92);
  const [dx, dy] = [90 + random() * 8, 88 + random() * 8];
  brush.fill(O(dx, dy, 6.5), tone[1]);
  brush.fill(O(dx - 0.6, dy - 0.8, 5.4), tone[0]);
  brush.fill(oval(42, 44, 9, 4.6, -24), tone[2]);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-paint', opts.colour), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── the road's other people

/** A point of a profile: x, y on a 200 canvas, and 1 where the outline turns a corner (a nose tip, the lips). */
type ProfilePoint = readonly [x: number, y: number, corner?: 1];

/** A Catmull-Rom curve through the points, as cubic Béziers; closed, or open from the first point to the last. */
function throughPoints(pts: readonly ProfilePoint[], closed: boolean): string {
  const count = pts.length;
  const at = (i: number): ProfilePoint => (closed ? pts[(i + count) % count]! : pts[Math.max(0, Math.min(count - 1, i))]!);
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < (closed ? count : count - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0]!)} ${f(c1[1]!)} ${f(c2[0]!)} ${f(c2[1]!)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** The profiles, facing right and standing on the canvas's foot: a man's, a woman's, a child's, and an older man's and woman's. */
const PROFILE = {
  man: [
    [-6, 200, 1], [0, 178], [18, 162], [42, 153], [56, 142], [60, 130], [54, 116], [46, 98], [44, 76], [52, 52], [70, 35], [96, 28], [120, 32],
    [134, 45], [138, 61], [138, 71], [135, 77], [140, 87], [148, 97, 1], [145, 100], [139, 101, 1], [141, 105], [144, 108], [140, 111, 1],
    [143, 114], [140, 118], [138, 120], [141, 127], [137, 134], [126, 137], [115, 138], [114, 147], [117, 156], [128, 165], [154, 175], [178, 186], [192, 200, 1],
  ],
  woman: [
    [2, 200, 1], [8, 180], [24, 166], [46, 157], [58, 146], [62, 134], [56, 119], [50, 101], [48, 80], [55, 57], [72, 40], [96, 33], [117, 36],
    [129, 48], [133, 63], [133, 73], [131, 79], [135, 88], [141, 97, 1], [138, 100], [133, 101, 1], [135, 105], [138, 108], [134, 111, 1],
    [137, 114], [134, 118], [132, 120], [134, 126], [130, 132], [121, 135], [113, 136], [112, 146], [115, 156], [126, 166], [150, 176], [172, 186], [184, 200, 1],
  ],
  child: [
    [20, 200, 1], [26, 184], [40, 172], [56, 165], [66, 156], [68, 145], [60, 131], [52, 112], [52, 88], [60, 64], [78, 48], [100, 41], [120, 45],
    [133, 58], [138, 74], [137, 87], [135, 93], [138, 100], [143, 106, 1], [139, 109], [135, 110, 1], [137, 114], [139, 117], [135, 119, 1],
    [138, 122], [135, 126], [134, 128], [135, 133], [130, 138], [122, 140], [116, 141], [115, 150], [118, 159], [128, 167], [148, 176], [162, 187], [170, 200, 1],
  ],
  oldMan: [
    [-6, 200, 1], [0, 176], [16, 158], [40, 148], [56, 138], [60, 126], [54, 112], [46, 96], [44, 76], [52, 52], [70, 36], [96, 29], [120, 33],
    [134, 46], [138, 62], [138, 72], [136, 78], [142, 89], [150, 100, 1], [146, 103], [140, 103, 1], [141, 107], [143, 110], [140, 112, 1],
    [142, 115], [139, 119], [137, 121], [139, 127], [134, 133], [124, 136], [114, 137], [113, 146], [116, 155], [127, 164], [154, 175], [178, 186], [192, 200, 1],
  ],
  oldWoman: [
    [0, 200, 1], [6, 178], [22, 162], [44, 152], [58, 141], [62, 130], [56, 116], [50, 99], [48, 79], [55, 57], [72, 41], [96, 34], [116, 37],
    [129, 49], [133, 64], [133, 74], [131, 80], [136, 90], [143, 100, 1], [139, 103], [133, 103, 1], [134, 107], [136, 110], [133, 112, 1],
    [135, 115], [132, 119], [130, 121], [132, 127], [127, 133], [118, 136], [110, 137], [109, 146], [112, 156], [124, 166], [150, 176], [172, 186], [184, 200, 1],
  ],
} as const satisfies Record<string, readonly ProfilePoint[]>;

const PROFILE_MOUSTACHE: readonly ProfilePoint[] = [[137, 100], [146, 101], [149, 104], [147, 108, 1], [143, 106], [138, 106]];

/** One piece of a silhouette: a shape in the ink, a line cut out of it in the paper's colour, a line in the ink, or the lace on a scarf's edge. */
type SilhouettePart =
  | { shape: readonly ProfilePoint[] }
  | { cut: readonly ProfilePoint[]; width: number }
  | { ink: readonly ProfilePoint[]; width: number }
  | { lace: readonly ProfilePoint[] };

const shape = (pts: readonly ProfilePoint[]): SilhouettePart => ({ shape: pts });
const cut = (width: number, ...pts: ProfilePoint[]): SilhouettePart => ({ cut: pts, width });
const lash = (x: number, y: number): SilhouettePart => ({ ink: [[x, y], [x + 4, y - 1.6]], width: 1.1 });

/**
 * Each of the road's people the book has no portrait for, as a cut-paper profile in one ink: a headscarf with its lace
 * edge, a fringe, a plait and its ribbon, a flat cap, a turban and waistcoat, glasses and a stethoscope, a felt cap and cloak, a beard.
 */
const SILHOUETTES = {
  // a woman, her headscarf framing her face and falling to her shoulders, lace along its edge
  woman: [
    shape(PROFILE.woman),
    shape([[129, 48], [120, 32], [98, 25], [74, 30], [54, 46], [44, 72], [42, 104], [38, 130], [28, 154], [14, 176], [8, 196], [28, 184], [52, 172], [80, 164], [104, 162], [114, 158], [110, 142], [110, 128], [112, 110], [116, 90], [121, 70], [126, 56]]),
    cut(1.2, [128, 50], [122, 66], [117, 86], [113, 106], [111, 126], [112, 142], [116, 156]),
    { lace: [[124, 52], [119, 68], [114, 88], [110, 108], [108, 128], [109, 144], [112, 156]] },
    cut(1.1, [64, 52], [56, 80], [54, 110], [46, 140], [34, 164]),
    lash(131, 79),
  ],
  // a grandmother, her headscarf knotted at the nape with its two ends hanging
  grandmother: [
    shape(PROFILE.oldWoman),
    shape([[129, 49], [120, 33], [98, 26], [74, 31], [55, 46], [45, 72], [43, 100], [40, 120], [46, 140], [64, 152], [88, 158], [106, 160], [112, 156], [108, 142], [108, 128], [111, 110], [115, 90], [121, 70], [126, 57]]),
    shape([[54, 110], [44, 100], [28, 102], [18, 114], [20, 128], [32, 136], [48, 134], [56, 124]]),
    shape([[28, 128], [20, 138], [17, 148], [21, 151], [29, 142], [38, 132]]),
    shape([[38, 132], [32, 142], [29, 152], [33, 156], [40, 146], [48, 134]]),
    cut(1.1, [40, 104], [34, 118], [40, 132]),
    cut(1.2, [128, 51], [122, 67], [116, 88], [112, 108], [110, 128], [111, 144], [114, 156]),
    { lace: [[124, 53], [118, 70], [113, 90], [109, 110], [107, 128], [108, 146], [111, 156]] },
  ],
  // a boy of about nine: a tousled fringe
  boy: [
    shape(PROFILE.child),
    shape([[52, 112], [48, 88], [54, 62], [70, 44], [92, 35], [114, 36], [130, 46], [140, 60], [134, 62], [138, 70], [128, 66], [126, 72], [118, 64], [104, 60], [88, 62], [76, 72], [70, 90], [64, 108]]),
    shape([[84, 40], [86, 30], [80, 20, 1], [96, 24], [106, 38]]),
    cut(1, [72, 58], [86, 52], [102, 51]),
    cut(1, [64, 78], [70, 66], [80, 60]),
  ],
  // a girl of about six: a fringe, and a plait tied with a ribbon
  girl: [
    shape(PROFILE.child),
    shape([[52, 116], [48, 90], [54, 64], [70, 46], [92, 37], [114, 38], [130, 48], [139, 64], [136, 72], [128, 68], [116, 62], [100, 60], [86, 64], [76, 76], [70, 94], [64, 114]]),
    shape([[58, 108], [50, 120], [46, 134], [45, 148], [53, 150], [55, 136], [60, 122], [66, 112]]),
    shape([[48, 150, 1], [38, 137], [29, 140], [29, 149], [48, 150, 1], [31, 158], [32, 167], [42, 166], [48, 150, 1], [50, 163], [56, 168, 1], [57, 159]]),
    cut(1, [50, 122], [59, 126]),
    cut(1, [47, 134], [56, 137]),
    cut(1, [70, 58], [86, 52], [104, 50]),
    lash(135, 93),
  ],
  // a farmer in a flat cap with its short peak
  farmer: [
    shape(PROFILE.man),
    shape([[46, 74], [52, 50], [70, 34], [96, 27], [120, 30], [136, 40], [146, 48], [154, 54, 1], [146, 56], [136, 55], [120, 56], [96, 58], [72, 62], [56, 70]]),
    cut(1.4, [48, 70], [70, 61], [100, 57], [136, 55]),
  ],
  // a market seller: a wrapped turban with its fringe, a full moustache, a waistcoat over his shirt
  seller: [
    shape(PROFILE.man),
    shape([[42, 80], [40, 56], [50, 34], [72, 20], [100, 15], [126, 21], [140, 38], [144, 58], [136, 63], [120, 56], [96, 55], [72, 61], [54, 72]]),
    shape(PROFILE_MOUSTACHE),
    cut(1.3, [46, 64], [66, 44], [98, 34], [134, 42]),
    cut(1.3, [52, 40], [78, 27], [112, 25]),
    { lace: [[52, 70], [72, 59], [96, 53], [120, 54], [134, 60]] },
    cut(1.2, [113, 152], [119, 160], [126, 154]),
    cut(1.5, [122, 162], [128, 182], [130, 200]),
    cut(1.3, [140, 168], [154, 174], [170, 182]),
  ],
  // an old doctor: a bald crown, round glasses, a moustache, and a stethoscope round his neck
  doctor: [
    shape(PROFILE.oldMan),
    shape(PROFILE_MOUSTACHE.map(([x, y, corner]): ProfilePoint => (corner ? [x + 1, y + 2, corner] : [x + 1, y + 2]))),
    cut(1.4, [120, 80], [126, 75], [134, 75], [137, 80], [134, 86], [126, 86], [121, 81], [100, 78]),
    cut(1.8, [60, 150], [70, 168], [88, 178], [108, 174], [116, 160]),
    cut(1.8, [88, 178], [92, 190]),
  ],
  // a shepherd: a tall felt cap, a moustache, and the stiff felt cloak with square shoulders
  shepherd: [
    shape([
      [-6, 200, 1], [-6, 166, 1], [20, 156, 1], [56, 150], [60, 130], [54, 116], [46, 98], [44, 76], [52, 52], [70, 35], [96, 28], [120, 32], [134, 45],
      [138, 61], [138, 71], [135, 77], [140, 87], [148, 97, 1], [145, 100], [139, 101, 1], [141, 105], [144, 108], [140, 111, 1], [143, 114],
      [140, 118], [138, 120], [141, 127], [137, 134], [126, 137], [115, 138], [114, 147], [116, 152], [176, 160, 1], [206, 170, 1], [206, 200, 1],
    ]),
    shape([[44, 70], [46, 46], [54, 22], [70, 6], [92, 0], [114, 4], [128, 18], [136, 38], [138, 56], [112, 54], [84, 56], [60, 62]]),
    cut(1.6, [46, 62], [84, 52], [112, 50], [137, 52]),
    cut(1, [90, 6], [94, 20], [96, 40]),
    shape(PROFILE_MOUSTACHE),
    cut(1.4, [118, 150], [120, 176], [122, 200]),
  ],
  // the blacksmith of the Newroz tale: a long beard, a band round his brow, and a smith's shoulders
  smith: [
    shape([
      [-10, 200, 1], [-6, 172], [14, 154], [40, 146], [56, 138], [60, 126], [54, 112], [46, 96], [44, 76], [52, 52], [70, 35], [96, 28], [120, 32],
      [134, 45], [138, 61], [138, 71], [135, 77], [140, 87], [148, 97, 1], [145, 100], [139, 101, 1], [141, 105], [144, 108], [140, 111, 1],
      [143, 114], [140, 118], [138, 120], [141, 127], [137, 134], [126, 137], [115, 138], [116, 150], [134, 162], [164, 172], [194, 186], [206, 200, 1],
    ]),
    shape([[96, 104], [104, 116], [116, 122], [132, 116], [140, 112], [146, 118], [148, 132], [144, 148], [136, 160], [126, 166], [116, 160], [108, 146], [100, 132], [94, 118]]),
    shape([[44, 76], [50, 54], [66, 38], [90, 29], [114, 30], [130, 40], [136, 52], [134, 56], [116, 46], [96, 46], [76, 52], [60, 64], [52, 80]]),
    cut(2.4, [46, 66], [74, 54], [104, 50], [135, 54]),
    cut(1, [124, 124], [128, 140], [126, 154]),
  ],
} as const satisfies Record<string, readonly SilhouettePart[]>;

export type BookSilhouette = keyof typeof SILHOUETTES;
export const BOOK_SILHOUETTES: readonly BookSilhouette[] = Object.freeze(Object.keys(SILHOUETTES) as BookSilhouette[]);

/** Dots spaced along a line: the lace on a headscarf's edge. */
function laceAlong(pts: readonly ProfilePoint[], every = 7): string {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    const length = Math.hypot(x2 - x1, y2 - y1);
    for (let t = 0; t < length; t += every) d += O(x1 + ((x2 - x1) * t) / length, y1 + ((y2 - y1) * t) / length, 1.25);
  }
  return d;
}

/**
 * One of the road's people as a cut-paper profile, facing right and standing on the canvas's foot, in one ink: `deep`
 * darkened toward black. Its cut lines and lace are `paper`, the colour of the round it stands in.
 */
export function bookSilhouetteSvg(opts: BookArtOptions & { who: BookSilhouette; deep: string; paper: string }): string {
  const parts: readonly SilhouettePart[] | undefined = Object.hasOwn(SILHOUETTES, opts.who) ? SILHOUETTES[opts.who] : undefined;
  if (!parts) throw new RangeError(`art: the book has no silhouette ${String(opts.who)}`);
  for (const hex of [opts.deep, opts.paper]) if (!/^#[0-9a-f]{6}$/.test(hex)) throw new RangeError(`art: a silhouette's colours are six-digit colours, not ${String(hex)}`);
  const ink = mix(opts.deep, '#000000', 0.42);
  const brush = new Brush();
  let lace = '';
  brush.group('scale(0.6)', () => {
    for (const part of parts) {
      if ('shape' in part) brush.fill(throughPoints(part.shape, true), ink);
      else if ('cut' in part) brush.line(throughPoints(part.cut, false), opts.paper, part.width);
      else if ('ink' in part) brush.line(throughPoints(part.ink, false), ink, part.width);
      else lace += laceAlong(part.lace);
    }
    if (lace) brush.fill(lace, opts.paper);
  });
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-silhouette', `${opts.who}-${opts.deep.slice(1)}`), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── the postmark

/** The postmark a finished chapter's stamp is cancelled with: two rings, a date bar across them, and wavy lines running off over the stamp, in one ink. */
export function bookPostmarkSvg(opts: BookArtOptions & { ink: string }): string {
  if (!/^#[0-9a-f]{6}$/.test(opts.ink)) throw new RangeError(`art: a postmark's ink is a six-digit colour, not ${String(opts.ink)}`);
  const brush = new Brush();
  brush.line(O(40, 60, 31), opts.ink, 2.4);
  brush.line(O(40, 60, 22), opts.ink, 1.4);
  brush.line('M24 55H56M24 65H56', opts.ink, 1.4);
  let waves = '';
  for (const y of [38, 49, 60, 71, 82]) waves += `M74 ${y}q5.5 -5 11 0t11 0t11 0t11 0`;
  brush.line(waves, opts.ink, 2.2);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-postmark', opts.ink.slice(1)), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── a scene's ground

/** A scene's setting: day, dusk with the sun going down, night under the moon and stars, or snow. */
export const BOOK_SETTINGS = ['day', 'dusk', 'night', 'snow'] as const;
export type BookSetting = (typeof BOOK_SETTINGS)[number];

/** The backdrop's canvas: wider than tall, like a comic panel. */
export const BOOK_BACKDROP = { w: 180, h: 100, horizon: 74 } as const;

/** A box on the backdrop's canvas that its sky keeps clear, where the scene places a person or hangs something. */
export interface BookSkyBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The sun (day or dusk) or moon (night) on the backdrop's canvas: centre, radius, and whether a moon is full. */
export interface BookOrb {
  x: number;
  y: number;
  r: number;
  full?: boolean;
}

/** A mark painted in a backdrop's sky (a star, a snowflake, a cloud), as the box it takes. */
export interface BookSkyMark extends BookSkyBox {
  kind: 'star' | 'twinkle' | 'flake' | 'cloud';
}

/** The default sun or moon position: the sun setting over the hills at dusk, the moon high on the right at night. */
const ORB: Readonly<Record<BookSetting, BookOrb | null>> = { day: null, dusk: { x: 118, y: 46, r: 11 }, night: { x: 150, y: 19, r: 9.5 }, snow: null };

/** How far sky marks keep from the moon, from each other, and from what the scene puts in front of the sky. */
const CLEAR = { orb: 3.2, mark: 2.6, box: 1.6 } as const;

/** The far mountains, the near hill and the scene's floor on the backdrop's canvas; the same land in every scene, so a chapter shares one valley. */
const FAR: readonly Pt[] = [[0, 58], [14, 51], [30, 45.4], [44, 50.6], [58, 47], [78, 39.6], [96, 47.6], [110, 52.4], [128, 48.6], [144, 52], [160, 44.4], [172, 47.2], [180, 50.4]];
/** The shaded side of each far peak, from its top down to the next fold. */
const FAR_SHADE: readonly (readonly Pt[])[] = [
  [[30, 45.4], [44, 50.6], [40, 60], [33, 54]],
  [[78, 39.6], [96, 47.6], [92, 60], [84, 52]],
  [[128, 48.6], [144, 52], [140, 60], [133, 55]],
  [[160, 44.4], [172, 47.2], [180, 50.4], [180, 60], [166, 53]],
];
const MID: readonly Pt[] = [[0, 66.4], [22, 61.6], [50, 64.2], [80, 59.2], [108, 62.6], [136, 60.4], [160, 63.6], [180, 61.6]];
const NEAR: readonly Pt[] = [[0, 77], [28, 72.2], [62, 74.2], [100, 70.8], [136, 74.6], [180, 70.4]];
/** Where poplar stands may grow on the near hill; the first one the scene leaves open is used. */
const POPLAR_SPOTS = [100, 62, 132, 40, 152, 84] as const;

/** Whether two boxes overlap, the first grown by `margin` on every side. */
const overlaps = (a: BookSkyBox, b: BookSkyBox, margin: number): boolean =>
  a.x - margin < b.x + b.w && b.x < a.x + a.w + margin && a.y - margin < b.y + b.h && b.y < a.y + a.h + margin;

/** Whether a box comes within `margin` of a round. */
function nearOrb(box: BookSkyBox, orb: BookOrb, margin: number): boolean {
  const dx = Math.max(box.x - orb.x, 0, orb.x - (box.x + box.w));
  const dy = Math.max(box.y - orb.y, 0, orb.y - (box.y + box.h));
  return Math.hypot(dx, dy) < orb.r + margin;
}

/**
 * The land's height at x on the backdrop's canvas: the far mountains by default (where the sky ends and a setting sun
 * goes down), `floor` for the back edge of the floor people and things stand on, or `room` for where a room's walls
 * meet its floor.
 */
export function bookRidgeAt(x: number, line: 'far' | 'floor' | 'room' = 'far'): number {
  return line === 'room' ? BOOK_ROOM_FLOOR : line === 'floor' ? heightOf(NEAR, x) : farTop(x);
}

/** Where a room's walls meet its floor on the backdrop's canvas; indoor scenes stand furniture there. */
const BOOK_ROOM_FLOOR = 70;

/** A room a scene is set in: its window's box on the backdrop's canvas (none for no window), and whether a kilim lies on the floor. */
export interface BookRoom {
  window: BookSkyBox | null;
  rug?: boolean;
}

/** A shade patch on the floor under someone standing there, on the backdrop's canvas: its centre and half-width. */
export interface BookFloorShade {
  x: number;
  y: number;
  rx: number;
}

/** A room's colours in the setting's light: plaster, beaten-earth floor, and poplar ceiling beams. */
function roomColours(setting: BookSetting, sky: string): { wall: string; shade: string; floor: string; floorShade: string; beam: string } {
  const plaster = setting === 'night' ? mix('#b78b5c', sky, 0.12) : setting === 'dusk' ? mix('#e6c99c', sky, 0.16) : mix('#f0e2c4', sky, setting === 'snow' ? 0.3 : 0.24);
  const floor = setting === 'night' ? mix('#7c5838', plaster, 0.2) : mix('#c39a6a', plaster, 0.22);
  return { wall: plaster, shade: mix(plaster, '#6b4a30', 0.16), floor, floorShade: mix(floor, '#4a3324', 0.25), beam: mix('#7a5236', plaster, 0.12) };
}

/**
 * A room's walls over the land outside, so the land shows only through the window: plaster with the window cut out,
 * the window's depth, blue frame and sill, the beam ends along the top, the beaten-earth floor and a kilim.
 */
function paintRoom(brush: Brush, room: BookRoom, setting: BookSetting, sky: string): void {
  const { w, h } = BOOK_BACKDROP;
  const floorY = BOOK_ROOM_FLOOR;
  const c = roomColours(setting, sky);
  const win = room.window;
  const hole = win ? `M${f(win.x)} ${f(win.y)}V${f(win.y + win.h)}H${f(win.x + win.w)}V${f(win.y)}Z` : '';
  brush.fill(`M0 0H${w}V${floorY}H0Z${hole}`, c.wall, ' fill-rule="evenodd"');
  if (win) {
    const { x, y, w: ww, h: wh } = win;
    // The wall's depth round the window: far side and foot shaded, near side lit.
    brush.fill(poly(x + ww, y, x + ww - 3, y + 3, x + ww - 3, y + wh - 2, x + ww, y + wh) + poly(x, y + wh, x + 3, y + wh - 2, x + ww - 3, y + wh - 2, x + ww, y + wh), c.shade);
    brush.fill(poly(x, y, x + ww, y, x + ww - 3, y + 2.4, x + 3, y + 2.4), mix(c.shade, c.wall, 0.4));
    // The blue frame and bars, and the sill a thing can be set on.
    const frame = VALLEY.gate;
    brush.line(`M${f(x + 3)} ${f(y + 2.4)}H${f(x + ww - 3)}V${f(y + wh - 2)}H${f(x + 3)}Z`, frame, 1.6);
    brush.line(`M${f(x + ww / 2)} ${f(y + 2.4)}V${f(y + wh - 2)}M${f(x + 3)} ${f(y + wh * 0.46)}H${f(x + ww - 3)}`, frame, 1.2);
    brush.fill(box(x - 3, y + wh, ww + 6, 3.4, 1.2), mix(c.wall, '#ffffff', 0.3));
    brush.fill(box(x - 2, y + wh + 3.4, ww + 4, 1.4), c.shade);
  }
  // The ceiling beams, end on, along the top of the wall.
  brush.fill(`M0 0H${w}V4.2H0Z`, c.beam);
  let ends = '';
  for (let x = 9; x < w; x += 21) ends += O(x, 5.2, 2.6);
  brush.fill(ends, mix(c.beam, c.wall, 0.35));
  // The wall darkens a little where it meets the floor.
  brush.fill(`M0 ${floorY - 3.4}H${w}V${floorY}H0Z`, c.shade);
  brush.fill(`M0 ${floorY}H${w}V${h}H0Z`, c.floor);
  brush.fill(`M0 ${floorY}H${w}V${floorY + 1.6}H0Z`, c.floorShade);
  if (room.rug) {
    // A kilim on the floor in perspective: its border and a row of lozenges.
    const rug = (k: number): string => poly(44 + k * 1.6, 76 + k, 136 - k * 1.6, 76 + k, 152 - k * 2, 99 - k, 28 + k * 2, 99 - k);
    brush.fill(rug(0), VALLEY.red);
    brush.fill(rug(2), VALLEY.cream);
    brush.fill(rug(3.6), VALLEY.red);
    let lozenges = '';
    for (let i = 0; i < 7; i++) {
      const x = 52 + i * 12.6;
      lozenges += poly(x, 84, x + 4, 87.6, x, 91.2, x - 4, 87.6);
    }
    brush.fill(lozenges, VALLEY.indigo);
  }
}

/** A land line's height at x, interpolated along its points. */
function heightOf(line: readonly Pt[], x: number): number {
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    if (x <= bx) return ay + ((by - ay) * (x - ax)) / Math.max(1e-6, bx - ax);
  }
  return line.at(-1)![1];
}

/** The far mountains' height at x, where the sky ends. */
const farTop = (x: number): number => heightOf(FAR, x);

/**
 * The marks in a backdrop's sky, placed from a seeded generator and checked one by one: night stars (two or three
 * bright enough to twinkle), snowflakes, or day clouds. None comes near the sun or moon, another mark, or any box the
 * scene keeps clear, and stars stay above the mountains. By day and at dusk clouds go only where nothing hangs.
 */
export function bookSkyMarks(opts: { setting: BookSetting; orb?: BookOrb | null; clear?: readonly BookSkyBox[]; seed?: string }): { orb: BookOrb | null; marks: BookSkyMark[] } {
  const orb = opts.orb === undefined ? ORB[opts.setting] : opts.orb;
  const clear = opts.clear ?? [];
  const random = seeded(`book-sky|${opts.setting}|${opts.seed ?? ''}`);
  const marks: BookSkyMark[] = [];
  const free = (box: BookSkyBox, gap: number = CLEAR.mark): boolean =>
    !(orb && nearOrb(box, orb, CLEAR.orb)) && !clear.some((c) => overlaps(box, c, CLEAR.box)) && !marks.some((m) => overlaps(box, m, gap));
  const { w } = BOOK_BACKDROP;
  if (opts.setting === 'night') {
    // More stars high up than near the mountains, most faint, a few bright enough to twinkle.
    for (let tries = 0; marks.length < 26 && tries < 400; tries++) {
      const x = 4 + random() * (w - 8);
      const y = 3 + random() ** 1.5 * 46;
      const twinkle = marks.filter((m) => m.kind === 'twinkle').length < 3 && random() < 0.16;
      const r = twinkle ? 2 + random() * 0.6 : random() < 0.75 ? 0.45 + random() * 0.45 : 0.95 + random() * 0.4;
      const box = { x: x - r, y: y - r, w: 2 * r, h: 2 * r };
      if (y + r > farTop(x) - 3 || !free(box, twinkle ? 6 : CLEAR.mark + random() * 4)) continue;
      marks.push({ ...box, kind: twinkle ? 'twinkle' : 'star' });
    }
  } else if (opts.setting === 'snow') {
    for (let tries = 0; marks.length < 30 && tries < 400; tries++) {
      const x = 3 + random() * (w - 6);
      const y = 3 + random() * 64;
      const r = random() < 0.6 ? 0.8 + random() * 0.5 : 1.4 + random() * 0.8;
      const box = { x: x - r, y: y - r, w: 2 * r, h: 2 * r };
      if (free(box, CLEAR.mark + random() * 5)) marks.push({ ...box, kind: 'flake' });
    }
  } else {
    // A day's clouds: two of different sizes where they fit; at dusk one, low and long.
    const most = opts.setting === 'dusk' ? 1 : 2;
    for (let tries = 0; marks.length < most && tries < 40; tries++) {
      const cw = (marks.length === 0 ? 26 : 18) + random() * 10;
      const cx = 14 + random() * (w - 28);
      const cy = opts.setting === 'dusk' ? 26 + random() * 8 : 8 + random() * 18;
      const box = { x: cx - cw / 2, y: cy - cw * 0.22, w: cw, h: cw * 0.36 };
      if (free(box, 10)) marks.push({ ...box, kind: 'cloud' });
    }
  }
  return { orb, marks };
}

/** A flat cloud in its box: a level foot and three rounds of different sizes along its top. */
function cloudPath(m: BookSkyBox): string {
  const foot = m.y + m.h;
  const r = (k: number): number => m.w * k;
  return (
    `M${f(m.x + r(0.08))} ${f(foot)}H${f(m.x + m.w - r(0.06))}A${f(r(0.06))} ${f(r(0.06))} 0 0 0 ${f(m.x + m.w - r(0.06))} ${f(foot - r(0.12))}H${f(m.x + r(0.08))}A${f(r(0.06))} ${f(r(0.06))} 0 0 0 ${f(m.x + r(0.08))} ${f(foot)}Z` +
    O(m.x + r(0.26), foot - r(0.12), r(0.16)) +
    O(m.x + r(0.5), foot - r(0.17), r(0.22)) +
    O(m.x + r(0.76), foot - r(0.11), r(0.14))
  );
}

/** A twinkling star: four points drawn in toward its middle. */
function twinklePath(m: BookSkyBox): string {
  const [x, y, r] = [m.x + m.w / 2, m.y + m.h / 2, m.w / 2];
  return `M${f(x)} ${f(y - r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + r)}Q${f(x)} ${f(y)} ${f(x - r)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - r)}Z`;
}

/**
 * The ground a book scene stands on, in a chapter's tint and wash: sky, far mountains with shaded peaks, a near hill
 * with poplars, and the floor people and props stand on; clouds by day, warm bands and a low sun at dusk, moon and
 * stars at night, falling flakes in snow. Every colour is a mix of the two given, so a scene belongs to its chapter.
 * `orb` places the sun or moon (none by day unless asked) and `clear` lists what the scene lays over the sky, so no
 * star sits on a head and nothing is drawn over the moon.
 */
export function bookBackdropSvg(
  opts: BookArtOptions & {
    setting: BookSetting;
    sky: string;
    ground: string;
    light: string;
    far?: string;
    orb?: BookOrb | null;
    clear?: readonly BookSkyBox[];
    seed?: string;
    /** A room the scene is set in, the land outside showing through its window. */
    room?: BookRoom | null;
    /** The floor shade under each person standing on it. */
    shadows?: readonly BookFloorShade[];
  },
): string {
  if (!BOOK_SETTINGS.includes(opts.setting)) throw new RangeError(`art: no book setting ${String(opts.setting)}`);
  for (const c of [opts.sky, opts.ground, opts.light, opts.far ?? '#000000']) if (!/^#[0-9a-f]{6}$/.test(c)) throw new RangeError(`art: a backdrop's colours are six-digit colours, not ${String(c)}`);
  const orbGiven = opts.orb;
  if (orbGiven && !([orbGiven.x, orbGiven.y, orbGiven.r].every(Number.isFinite) && orbGiven.r > 0)) throw new RangeError('art: a sun or a moon needs a place and a size');
  const { w, h } = BOOK_BACKDROP;
  const { setting, sky, ground, light } = opts;
  const far = opts.far ?? mix(sky, ground, setting === 'dusk' ? 0.55 : 0.36);
  const mid = mix(far, ground, 0.5);
  const brush = new Brush();
  const { orb, marks } = bookSkyMarks({ setting, orb: opts.orb, clear: opts.clear, seed: opts.seed });
  brush.fill(`M0 0H${w}V${h}H0Z`, sky);
  if (setting === 'dusk') {
    // The sky warms toward the hills in three bands, each edge hand-cut.
    [0.24, 0.46, 0.7].forEach((k, i) => {
      const top = 30 + i * 11;
      brush.fill(`${smoothLine([[0, top + 2], [44, top - 1.4], [96, top + 1.6], [140, top - 0.6], [180, top + 1.2]])}V${h}H0Z`, mix(sky, light, k));
    });
  }
  if (orb && setting !== 'night') brush.fill(O(orb.x, orb.y, orb.r), light);
  if (orb && setting === 'night') {
    if (orb.full) {
      brush.fill(O(orb.x, orb.y, orb.r), light);
      // The moon's seas, a step darker than its face.
      brush.fill(oval(orb.x - orb.r * 0.3, orb.y - orb.r * 0.18, orb.r * 0.32, orb.r * 0.22, -20) + oval(orb.x + orb.r * 0.28, orb.y + orb.r * 0.3, orb.r * 0.24, orb.r * 0.16, 15), mix(light, sky, 0.16));
    } else {
      // A crescent: the part of one circle that another, offset up and right, does not cover.
      const [x0, y0] = [orb.x + orb.r * 0.42, orb.y - orb.r * 0.9];
      const [x1, y1] = [orb.x + orb.r * 0.9, orb.y + orb.r * 0.42];
      brush.fill(`M${f(x0)} ${f(y0)}A${f(orb.r)} ${f(orb.r)} 0 1 0 ${f(x1)} ${f(y1)}A${f(orb.r * 0.8)} ${f(orb.r * 0.8)} 0 0 1 ${f(x0)} ${f(y0)}Z`, light);
    }
  }
  const stars = marks.filter((m) => m.kind === 'star').map((m) => O(m.x + m.w / 2, m.y + m.h / 2, m.w / 2)).join('');
  if (stars) brush.fill(stars, light);
  const twinkles = marks.filter((m) => m.kind === 'twinkle').map(twinklePath).join('');
  if (twinkles) brush.fill(twinkles, light);
  const clouds = marks.filter((m) => m.kind === 'cloud').map(cloudPath).join('');
  if (clouds) brush.fill(clouds, mix(sky, light, setting === 'dusk' ? 0.6 : 0.55));
  // The far mountains, each peak with its shaded side.
  brush.fill(`${smoothLine(FAR)}V${h}H0Z`, far);
  brush.fill(FAR_SHADE.map((pts) => polygon(pts)).join(''), mix(far, ground, 0.22));
  // The near hill, with poplars in the land's darkest colour where the scene leaves them room.
  brush.fill(`${smoothLine(MID)}V${h}H0Z`, mid);
  const tree = luminance(ground) < luminance(far) ? ground : far;
  const pick = seeded(`book-poplars|${opts.seed ?? setting}`);
  const spot = POPLAR_SPOTS.find((x) => !(opts.clear ?? []).some((c) => overlaps({ x: x - 4, y: heightOf(MID, x) - 16, w: 16, h: 18 }, c, 1)));
  if (spot !== undefined) {
    const stand = Array.from({ length: 2 + Math.floor(pick() * 2) }, (_, i) => {
      const x = spot + i * (3.8 + pick() * 1.6);
      return [x, heightOf(MID, x) + 0.6, 7.6 + pick() * 6] as const;
    });
    brush.fill(stand.map(([x, foot, tall]) => `M${f(x)} ${f(foot - tall)}C${f(x + 2.3)} ${f(foot - tall * 0.62)} ${f(x + 2)} ${f(foot - tall * 0.16)} ${f(x + 0.3)} ${f(foot)}H${f(x - 0.4)}C${f(x - 2)} ${f(foot - tall * 0.2)} ${f(x - 2.1)} ${f(foot - tall * 0.64)} ${f(x)} ${f(foot - tall)}Z`).join(''), tree);
  }
  const flakes = marks.filter((m) => m.kind === 'flake').map((m) => O(m.x + m.w / 2, m.y + m.h / 2, m.w / 2)).join('');
  if (flakes) brush.fill(flakes, light);
  // The scene's floor last, so whatever stands in it stands on it.
  brush.fill(`${smoothLine(NEAR)}V${h}H0Z`, ground);
  if (opts.room) paintRoom(brush, opts.room, setting, sky);
  const shadows = opts.shadows ?? [];
  for (const s of shadows) if (![s.x, s.y, s.rx].every(Number.isFinite) || s.rx <= 0) throw new RangeError('art: a shade on the floor needs a place and a size');
  if (shadows.length > 0) {
    const floor = opts.room ? roomColours(setting, sky).floorShade : mix(ground, '#2b1f2e', setting === 'snow' ? 0.14 : 0.2);
    brush.fill(shadows.map((s) => E(s.x, s.y, s.rx, s.rx * 0.2)).join(''), floor, ' fill-opacity="0.55"');
  }
  const key = [
    setting,
    sky,
    ground,
    light,
    opts.far ?? '',
    opts.seed ?? '',
    orb ? `${f(orb.x)}-${f(orb.y)}-${f(orb.r)}${orb.full ? 'f' : ''}` : 'no',
    ...(opts.clear ?? []).map((c) => `${f(c.x)}-${f(c.y)}-${f(c.w)}-${f(c.h)}`),
    opts.room ? `room-${opts.room.window ? `${f(opts.room.window.x)}-${f(opts.room.window.y)}-${f(opts.room.window.w)}-${f(opts.room.window.h)}` : 'shut'}-${opts.room.rug ? 'rug' : ''}` : '',
    ...shadows.map((s) => `${f(s.x)}-${f(s.y)}-${f(s.rx)}`),
  ].join('|');
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-backdrop', setting, hashOf(key)), opts.size, opts.title, `0 0 ${w} ${h}`, h / w);
}

/** A colour's brightness, for picking the darker of two. */
function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
}

/** A smooth open Catmull-Rom line through the points as cubic Béziers. */
function smoothLine(pts: readonly Pt[]): string {
  const at = (i: number): Pt => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    d += `C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)} ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)} ${f(x2)} ${f(y2)}`;
  }
  return d;
}

/** A closed polygon through points. */
const polygon = (pts: readonly Pt[]): string => poly(...pts.flat());

// ───────────────────────────────────────────────────────────── the three friends, posed

/** How a character holds itself in a pose: only what the rig can already do. */
interface Pose {
  mouth?: MouthShape;
  eyes?: EyeState;
  brows?: BrowState;
  blush?: boolean;
  /** Head tilt about the neck, in degrees. */
  tilt?: number;
  /** Where the deer's pupils look, each axis from -1 to 1. */
  look?: readonly [number, number];
  /** Each deer ear's lift in degrees (up is positive): left, right. */
  ears?: readonly [number, number];
  /** Degrees the near end of Hamo's moustache lifts. */
  lift?: number;
  /** What is laid over or beside the figure, in the figure's own units. */
  prop?: 'apple' | 'crumbs' | 'core' | 'snore';
}

const POSES = {
  hevalo: {
    plain: {},
    // Caught with the apple in his mouth, a bite already gone.
    caught: { eyes: 'wide', ears: [14, 14], prop: 'apple' },
    // Looking at the sky, as he does whenever apples are counted; the core lies beside him.
    innocent: { look: [0.35, -1], mouth: 'u', ears: [-10, -10], tilt: -4, prop: 'core' },
    pleased: { eyes: 'happy', mouth: 'grin', ears: [8, 8] },
    munching: { eyes: 'happy', mouth: 'mbp', prop: 'crumbs' },
    curious: { tilt: 9, ears: [16, -6], brows: 'one' },
    sad: { eyes: 'half', mouth: 'mbp', ears: [-26, -26], look: [0, 0.8] },
    asleep: { eyes: 'closed', ears: [-18, -18], tilt: 6, prop: 'snore' },
  },
  hamo: {
    plain: {},
    // Pleased with you or with himself: the near end of the moustache goes up.
    proud: { eyes: 'happy', lift: 7, brows: 'raised' },
    laughing: { eyes: 'happy', mouth: 'grin', brows: 'raised', lift: 4, tilt: -3 },
    // A miss gets one raised eyebrow and a thoughtful look, never a cross word.
    doubtful: { brows: 'one', mouth: 'mbp', tilt: 3 },
    shocked: { eyes: 'wide', brows: 'raised', mouth: 'o' },
    telling: { mouth: 'a', brows: 'raised' },
    asleep: { eyes: 'closed', tilt: 5, prop: 'snore' },
  },
  xezo: {
    plain: {},
    smiling: { eyes: 'happy', mouth: 'grin', blush: true },
    telling: { mouth: 'e', brows: 'raised' },
  },
} as const satisfies Readonly<Record<CharacterId, Readonly<Record<string, Pose>>>>;

/** The poses each of the three is drawn in for the book. */
export const BOOK_POSES: { readonly [K in CharacterId]: readonly (keyof (typeof POSES)[K])[] } = {
  hevalo: Object.freeze(Object.keys(POSES.hevalo) as (keyof typeof POSES.hevalo)[]),
  hamo: Object.freeze(Object.keys(POSES.hamo) as (keyof typeof POSES.hamo)[]),
  xezo: Object.freeze(Object.keys(POSES.xezo) as (keyof typeof POSES.xezo)[]),
};

export type BookPose<K extends CharacterId = CharacterId> = K extends CharacterId ? keyof (typeof POSES)[K] : never;

const turned = (inner: string, deg: number, about: { x: number; y: number }): string =>
  deg === 0 ? inner : `<g transform="rotate(${n(deg)} ${n(about.x)} ${n(about.y)})">${inner}</g>`;

/** A spot laid into a figure's own units: its 120-unit canvas scaled `k` times, centred at (x, y). */
function laid(draw: (b: Brush) => void, x: number, y: number, k: number, turn = 0): string {
  const brush = new Brush();
  draw(brush);
  const spin = turn === 0 ? '' : ` rotate(${n(turn)} 60 66)`;
  return `<g transform="translate(${n(x - 60 * k)} ${n(y - 66 * k)}) scale(${n2(k)})${spin}">${String(brush)}</g>`;
}

/** Three "z"s rising beside a sleeper, each smaller than the last, in the page's ink. */
function snore(x: number, y: number, k: number): string {
  let d = '';
  [0, 1, 2].forEach((i) => {
    const s = k * (1 - i * 0.22);
    const [zx, zy] = [x + i * 26 * k, y - i * 30 * k];
    d += `M${n(zx)} ${n(zy)}h${n(22 * s)}l${n(-22 * s)} ${n(24 * s)}h${n(22 * s)}`;
  });
  return `<path d="${d}" fill="none" stroke="#7d76a6" stroke-width="${n(5 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** What a pose lays over or beside the deer, in his units (face 512 across, mouth near 255, 440; standing, hooves near 1530). */
function deerProp(prop: Pose['prop'], crop: CharacterCrop): string {
  if (prop === 'apple') {
    // The apple held in his teeth below the nose, showing the bite that gave him away.
    const crumbs = [[150, 470, 7], [128, 498, 5], [362, 462, 6], [386, 492, 4.5]].map(([x, y, r]) => O(x!, y!, r!)).join('');
    return (
      laid((b) => {
        bittenApple(b, BITES[1]!);
        b.fill(oval(39, 58, 5, 9, 20), RED[2]);
      }, 255, 478, 1.36, -8) + `<path d="${crumbs}" fill="${FLESH[1]}"/>`
    );
  }
  if (prop === 'crumbs') return `<path d="${[[188, 478, 7], [164, 500, 5], [322, 474, 6], [346, 498, 5], [255, 492, 5]].map(([x, y, r]) => O(x!, y!, r!)).join('')}" fill="${FLESH[1]}"/>`;
  // The core lies by his cheek in a head picture, and by his hooves when he is drawn standing.
  if (prop === 'core') return crop === 'full' ? laid(core, 446, 1462, 1.7, 14) : laid(core, 466, 438, 1.6, 14);
  if (prop === 'snore') return snore(436, 336, 1.15);
  return '';
}

function assemble(art: CharacterArt, pose: Pose, crop: CharacterCrop): string {
  const mouth = art.mouths[pose.mouth ?? 'rest'];
  const brows = art.brows?.states[pose.brows ?? 'neutral'] ?? '';
  const blush = pose.blush && art.cheeks ? art.cheeks.blush : '';
  const state = pose.eyes ?? 'open';
  let head: string;
  let extra = '';
  if (art.rig) {
    // The deer: his ears and pupils are separate layers, and his lids lie over the open eyes.
    const rig = art.rig;
    const [left, right] = pose.ears ?? [0, 0];
    const shift = pupilShift(art, { x: pose.look?.[0] ?? 0, y: pose.look?.[1] ?? 0 }, pose.look ? 1 : 0);
    const pupil = (side: 'left' | 'right'): string => `<g transform="translate(${n(shift[side].x)} ${n(shift[side].y)})">${rig.look[side].art}</g>`;
    const lids = state === 'open' ? '' : state === 'half' ? rig.look.half : eyesFor(art, state);
    head =
      rig.crown +
      turned(rig.ears.left.art, left, rig.ears.left.pivot) +
      turned(rig.ears.right.art, -right, rig.ears.right.pivot) +
      rig.face +
      rig.look.whites +
      pupil('left') +
      pupil('right') +
      lids +
      brows +
      mouth +
      art.overlay;
    extra = deerProp(pose.prop, crop);
  } else {
    const whiskers = art.moustache ? art.moustache.body + turned(art.moustache.end.art, pose.lift ?? 0, art.moustache.end.pivot) : art.overlay;
    head = (art.brows?.bare ?? art.head) + (art.hair?.art ?? '') + eyesFor(art, state) + brows + blush + mouth + whiskers;
    if (pose.prop === 'snore') {
      const frame = cropBox(art, crop);
      extra = snore(frame.x + frame.w * 0.74, frame.y + frame.h * (crop === 'full' ? 0.1 : 0.3), frame.w / 300);
    }
  }
  return cropBody(art, crop) + turned(head, pose.tilt ?? 0, art.headPivot) + extra;
}

export interface BookCastOptions<K extends CharacterId = CharacterId> {
  who: K;
  pose: BookPose<K>;
  /** The whole figure, head to waist, or head and shoulders (the default; scenes show them from the chest up). */
  crop?: Exclude<CharacterCrop, 'head'>;
  /** Display width; the crop's own width in drawing units by default. */
  width?: number;
  title?: string;
  idPrefix?: string;
}

/** One of the three friends in one of the book's poses, as a standalone picture. */
export function bookCastSvg<K extends CharacterId>(opts: BookCastOptions<K>): string {
  const poses = Object.prototype.hasOwnProperty.call(POSES, opts.who) ? (POSES[opts.who] as Readonly<Record<string, Pose>>) : undefined;
  const pose = poses && Object.prototype.hasOwnProperty.call(poses, opts.pose) ? poses[opts.pose as string] : undefined;
  if (!pose) throw new RangeError(`art: ${String(opts.who)} has no pose called ${String(opts.pose)}`);
  const crop = opts.crop ?? 'bust';
  const prefix = prefixFor(opts.idPrefix, 'book-cast', opts.who, String(opts.pose), crop);
  const art = characterArt(opts.who, prefix);
  const frame = cropBox(art, crop);
  const width = opts.width ?? frame.w;
  if (!(width > 0) || !Number.isFinite(width)) throw new RangeError(`art: width must be a positive number, got ${String(opts.width)}`);
  const view = `${n(frame.x)} ${n(frame.y)} ${n(frame.w)} ${n(frame.h)}`;
  return picture(assemble(art, pose, crop), prefix, width, opts.title ?? art.name, view, frame.h / frame.w);
}
