/**
 * The drawings Hevalo's book is printed with, which nothing else in the app
 * had a use for.
 *
 * The book is the Kurmanji Road on paper, and its running joke is the road's
 * own: a young deer who is never hungry, he says, and an apple that is
 * smaller every time you look. So here is that apple, bite by bite down to
 * its core (`bookAppleSvg`: the book lays one in the corner of every page of
 * a chapter, a bite further on each page), and the small things the road's
 * scenes are told with and the word pictures did not have: Hamo's moustache,
 * his father's flute, half an old photo, the lake on the summer pastures,
 * the stove of the winter tales (`bookSpotSvg`); a dab of paint for each
 * colour word (`bookPaintSvg`); a sky and a hill for a scene to stand on
 * (`bookBackdropSvg`); and the postmark a finished chapter's stamp is
 * cancelled with (`bookPostmarkSvg`).
 *
 * They are painted as the word pictures are (art/word-pictures.ts): flat
 * planes on the 120-unit canvas with no outlines, each form one face and one
 * step of shade toward the lower right, at most one patch of light, standing
 * on a soft patch of shade on a clear ground. No gradient, blur, mask or
 * clip, so a PDF draws them exactly as a browser does.
 *
 * And the three friends, posed (`bookCastSvg`). A pose changes nothing of a
 * character: it is the rig's own layers put together another way — the
 * deer's pupils turned to the sky, an ear laid back, the head tilted; the
 * near end of Hamo's moustache lifted; Xezal's blush — with a prop laid over
 * or beside them: an apple in the deer's mouth, crumbs, a snore.
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
import { CANVAS, escapeXml, n, n2, prefixFor, seeded, type Pt } from './svg.js';
import { VALLEY, blobPath, earthHouse, ellipsePath, foliage, roundTree } from './valley.js';

// ───────────────────────────────────────────────────────────── colours

/** A form's three tones: its face, its one step of shade, and its patch of light. */
type Tone = readonly [face: string, shade: string, light: string];

/** The word pictures' own tones, so an apple here is the apple there. */
const RED: Tone = ['#e0503f', '#b5382c', '#f08b7e'];
const LEAF: Tone = [VALLEY.leaf, VALLEY.leafShade, VALLEY.leafLight];
const GRASS: Tone = ['#b3d184', '#93b566', '#cfe3a4'];
const BARK: Tone = [VALLEY.trunk, '#664026', '#a8774e'];
const WOOD: Tone = ['#b8804d', '#8a5a33', '#d6a46f'];
const STRAW: Tone = ['#e3b866', '#b98b3c', '#f4d996'];
const BLUE: Tone = [VALLEY.gate, VALLEY.gateDark, '#7fb4e2'];
const GLASS: Tone = ['#e1eff5', '#b3cdd8', '#ffffff'];
const WATER: Tone = ['#5aaee0', '#3a86bf', '#cdeaf6'];
const PAPER: Tone = ['#fbf1dc', '#e2cfaa', '#fffaf0'];
const COPPER: Tone = ['#cd7c3e', '#9a5326', '#eaa96d'];
const IRON: Tone = [VALLEY.basalt, VALLEY.basaltSide, VALLEY.basaltLight];
const BURLAP: Tone = ['#cdb07a', '#a88a54', '#e3cc9c'];
/** The flesh of a bitten apple, and the shade in the hollow of a bite. */
const FLESH: Tone = ['#f8e6b4', '#e3cb90', '#fff5d8'];
/** An old photo's browns. */
const SEPIA: Tone = ['#d9c39a', '#a98d5f', '#f1e3c4'];
/** Hamo's moustache: his own black, never pure. */
const MOUSTACHE: Tone = ['#2a1c16', '#150d0a', '#5a4638'];
/** The near-black of a seed, a hole, a pencil's lead. */
const INK = VALLEY.ink;
/** The patch of shade every thing stands on, as under the word pictures. */
const GROUND = VALLEY.earthShade;

// ───────────────────────────────────────────────────────────── shapes

const f = n;
const E = ellipsePath;
/** A circle as a path, so many can share one element. */
const O = (cx: number, cy: number, r: number): string => ellipsePath(cx, cy, r, r);

/** An ellipse turned `deg` degrees about its centre, as a path. */
function oval(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a) * rx, Math.sin(a) * rx];
  const arc = `A${f(rx)} ${f(ry)} ${f(deg)} 1 0`;
  return `M${f(cx - dx)} ${f(cy - dy)}${arc} ${f(cx + dx)} ${f(cy + dy)}${arc} ${f(cx - dx)} ${f(cy - dy)}Z`;
}

/** A rectangle with its corners rounded by `r`. */
function box(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${f(x)} ${f(y)}v${f(h)}h${f(w)}v${f(-h)}Z`;
  const q = Math.min(r, w / 2, h / 2);
  const c = `a${f(q)} ${f(q)} 0 0 0`;
  return (
    `M${f(x + q)} ${f(y)}${c} ${f(-q)} ${f(q)}v${f(h - 2 * q)}${c} ${f(q)} ${f(q)}h${f(w - 2 * q)}` +
    `${c} ${f(q)} ${f(-q)}v${f(-(h - 2 * q))}${c} ${f(-q)} ${f(-q)}Z`
  );
}

/** A closed polygon through x, y pairs. */
function poly(...xy: number[]): string {
  let d = '';
  for (let i = 0; i + 1 < xy.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${f(xy[i]!)} ${f(xy[i + 1]!)}`;
  return `${d}Z`;
}

/** A smooth closed outline through the points (Catmull-Rom, as cubic Béziers). */
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

  /** A line for a thing that is a line: a stalk, a string, a wire, a crumb's fall. */
  line(d: string, hex: string, width: number, more = ''): void {
    this.out += `<path d="${d}" fill="none" stroke="${hex}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
  }

  /**
   * A form in one face and one step of shade: the whole shape in its shade,
   * and its face over it drawn `k` of its size toward (ax, ay), a point near
   * its lit upper-left edge, so the shade shows as a band to the lower right.
   */
  form(d: string, t: Tone, ax: number, ay: number, k = 0.88): void {
    this.fill(d, t[1]);
    this.fill(d, t[0], ` transform="matrix(${n2(k)} 0 0 ${n2(k)} ${f(ax * (1 - k))} ${f(ay * (1 - k))})"`);
  }

  /** The soft patch of shade a thing stands on. */
  ground(rx: number, cx = 60, cy = 104): void {
    this.out += `<path d="${E(cx, cy, rx, rx * 0.15)}" fill="${GROUND}" fill-opacity="0.45"/>`;
  }

  /** What `draw` paints, moved or turned as one. */
  group(transform: string, draw: () => void): void {
    this.out += `<g transform="${transform}">`;
    draw();
    this.out += '</g>';
  }

  /** Markup made elsewhere in the valley's hand (a house, a tree). */
  add(markup: string): void {
    this.out += markup;
  }

  toString(): string {
    return this.out;
  }
}

/** A picture on the 120-unit canvas: decorative and hidden from screen readers unless it is given a `title`. */
function picture(body: string, prefix: string, size: number | undefined, title: string | undefined, view = `0 0 ${CANVAS} ${CANVAS}`, ratio = 1): string {
  const width = size ?? CANVAS;
  if (!(width > 0) || !Number.isFinite(width)) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const label = title ? ` role="img" aria-labelledby="${prefix}t"><title id="${prefix}t">${escapeXml(title)}</title>` : ' aria-hidden="true" focusable="false">';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(width)}" height="${n2(width * ratio)}" viewBox="${view}"${label}${body}</svg>`;
}

export interface BookArtOptions {
  /** how wide it is drawn, in points or pixels; the canvas's own 120 by default */
  size?: number;
  /** its name for a screen reader; without one the picture is decorative and hidden */
  title?: string;
  idPrefix?: string;
}

// ───────────────────────────────────────────────────────────── the apple

/** One cubic Bézier: its start, its two handles and its end. */
type Cubic = readonly [Pt, Pt, Pt, Pt];

/**
 * The word pictures' apple (the same outline, so a whole apple here and
 * there are one apple), as the six curves it is drawn with, from the dip
 * under its stalk round by the left, the bottom and the right.
 */
const APPLE: readonly Cubic[] = [
  [[60, 41], [49, 31], [22, 35], [22, 63]],
  [[22, 63], [22, 86], [39, 104], [51, 104]],
  [[51, 104], [55, 104], [57, 102], [60, 102]],
  [[60, 102], [63, 102], [65, 104], [69, 104]],
  [[69, 104], [81, 104], [98, 86], [98, 63]],
  [[98, 63], [98, 35], [71, 31], [60, 41]],
];

/** The middle of the apple's flesh: a bite is taken toward it. */
const HEART: Pt = [60, 72];

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The part of a curve from `t0` to `t1` of its length, as a curve of its own (de Casteljau, twice). */
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

/**
 * A bite out of the apple: from where on its outline to where (a curve's
 * number and how far along it, each), and how many teeth marks it leaves.
 */
interface Bite {
  from: readonly [curve: number, t: number];
  to: readonly [curve: number, t: number];
  dents: number;
  /** how far its middle goes in toward the heart */
  depth: number;
}

/** A point `by` units nearer the apple's heart. */
function deeper(p: Pt, by: number): Pt {
  const reach = Math.hypot(HEART[0] - p[0], HEART[1] - p[1]) || 1;
  return [p[0] + ((HEART[0] - p[0]) / reach) * by, p[1] + ((HEART[1] - p[1]) / reach) * by];
}

/**
 * Where the teeth went in between `a` and `b`: the ends of each mark, along
 * a line that sags `depth` toward the apple's heart, so a big bite is a
 * hollow and not a straight cut.
 */
function toothline(a: Pt, b: Pt, count: number, depth: number): Pt[] {
  const sag = deeper(lerp(a, b, 0.5), depth * 2);
  return Array.from({ length: count + 1 }, (_, k) => {
    const t = k / count;
    return lerp(lerp(a, sag, t), lerp(sag, b, t), t);
  });
}

/** The round marks of the teeth through `pts`, each bulging toward the apple's heart, as arcs. */
function dents(pts: readonly Pt[]): string {
  let d = '';
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1]!, pts[k]!];
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.56;
    // an arc drawn with sweep 1 bulges to the left of the way it is going (the canvas's y runs down)
    const cross = (b[0] - a[0]) * (HEART[1] - a[1]) - (b[1] - a[1]) * (HEART[0] - a[0]);
    d += `A${f(r)} ${f(r)} 0 0 ${cross < 0 ? 1 : 0} ${p2(b)}`;
  }
  return d;
}

/** Where the apple's face is lit from: its shade is the whole apple, and its face the same apple drawn smaller toward this point. */
const LIT: Pt = [32, 44];

/**
 * The apple's outline with these bites out of it (in the order they come
 * round it), and the flesh each one shows. With `k` under 1 it is the
 * apple's lit face: the outline drawn `k` of its size toward `LIT`, but its
 * bites exactly where the whole apple's are, so the face never shows past
 * the edge of a bite.
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
    // the flesh is the same row of marks set a little deeper into the apple and joined to the first: a band along the bite
    const inner = marks.map((p) => deeper(p, 7)).reverse();
    flesh += `M${p2(a)}${dents(marks)}L${p2(inner[0]!)}${dents(inner)}Z`;
    at = bite.to;
  }
  run(at, [APPLE.length - 1, 1]);
  return { skin: `${skin}Z`, flesh };
}

/** The apple with its bites, painted: its shade, its lit face, and the flesh of each bite. */
function bittenApple(b: Brush, bites: readonly Bite[]): void {
  const whole = bitten(bites);
  b.fill(whole.skin, RED[1]);
  b.fill(bitten(bites, 0.88).skin, RED[0]);
  if (whole.flesh) b.fill(whole.flesh, FLESH[0]);
}

/** The bites of each stage between the whole apple and its core: one, then a deeper one, then another from the other side. */
const BITES: readonly (readonly Bite[])[] = [
  [],
  [{ from: [4, 0.9], to: [5, 0.42], dents: 3, depth: 5 }],
  [{ from: [4, 0.42], to: [5, 0.56], dents: 4, depth: 11 }],
  [
    { from: [0, 0.5], to: [1, 0.52], dents: 3, depth: 9 },
    { from: [4, 0.36], to: [5, 0.6], dents: 4, depth: 13 },
  ],
];

/** How many bites the apple can lose: after the last there is only the core. */
export const BOOK_APPLE_BITES = 4;

function stalk(b: Brush, leaf: boolean): void {
  b.line('M60 41C59 32 62 25 67 20', BARK[0], 4.5);
  if (!leaf) return;
  b.form('M63 31C68 19 82 16 92 21C88 33 74 38 63 31Z', LEAF, 64, 24, 0.84);
  b.line('M67 29C74 26 81 23 88 22', LEAF[2], 1.4);
}

/** What is left when Hevalo has finished: the two ends still in their skin, the flesh eaten to a waist between them, and two seeds. */
function core(b: Brush): void {
  b.ground(22);
  stalk(b, false);
  // the flesh first, so the skin of the two ends lies over where it meets them
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
  // the patch of light sits where the third bite goes
  if (bites < 3) b.fill(oval(39, 58, 5, 9, 20), RED[2]);
}

/**
 * Hevalo's apple after `bites` bites: 0 the whole apple, as the word
 * pictures draw it, and `BOOK_APPLE_BITES` the core. The book lays one in
 * the corner of each page of a chapter, and it is smaller on every page.
 */
export function bookAppleSvg(opts: BookArtOptions & { bites: number }): string {
  const bites = Math.floor(opts.bites);
  if (!(bites >= 0 && bites <= BOOK_APPLE_BITES)) throw new RangeError(`art: an apple has 0 to ${BOOK_APPLE_BITES} bites out of it, not ${String(opts.bites)}`);
  const brush = new Brush();
  apple(brush, bites);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-apple', bites), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── the spots

type Draw = (b: Brush, random: () => number) => void;

const SPOTS = {
  // Hamo's pride, on its own: full across the lip, and the two ends turned up, as he wears it when he is pleased
  moustache: (b) => {
    const half: Pt[] = [[60, 52], [70, 45], [84, 46], [97, 51], [106, 45], [111, 34], [110, 51], [101, 63], [87, 70], [73, 70], [64, 64], [60, 60]];
    const whole = smooth([...half, ...half.slice(1, -1).reverse().map(([x, y]): Pt => [120 - x, y])]);
    b.form(whole, MOUSTACHE, 30, 34, 0.94);
    b.line('M67 53C76 50 88 52 97 57M53 53C44 50 32 52 23 57', MOUSTACHE[2], 2.4);
  },

  // the shepherd's flute Ibrahîm plays: a plain wooden pipe, bound at both ends, six holes down it
  flute: (b) => {
    b.ground(38, 60, 102);
    b.group('rotate(-36 60 62)', () => {
      b.form(box(10, 55, 100, 14, 7), WOOD, 12, 56, 0.96);
      b.fill(box(10, 55, 9, 14, 6) + box(101, 55, 9, 14, 6), WOOD[1]);
      b.fill(box(24, 55, 3.5, 14) + box(92, 55, 3.5, 14), STRAW[0]);
      b.line('M22 58.5H98', WOOD[2], 1.8);
      b.fill([36, 46, 56, 66, 76, 86].map((x) => O(x, 62.5, 2.5)).join(''), '#5a3a22');
    });
  },

  // half of an old photo, torn down its right side: the walnut tree by the spring, gone brown with thirty years
  photo: (b) => {
    b.ground(34, 58, 104);
    b.group('rotate(-7 58 60)', () => {
      const edge = [88, 26, 91, 35, 85, 43, 92, 52, 86, 61, 93, 70, 87, 79, 92, 88, 87, 96];
      b.fill(poly(23.5, 27.5, ...edge.map((v) => v + 1.5), 23.5, 97.5), PAPER[1]);
      b.fill(poly(22, 26, ...edge, 22, 96), PAPER[2]);
      b.fill(poly(28, 32, 82, 32, 85, 39, 79, 45, 86, 53, 80, 61, 87, 70, 81, 78, 85, 86, 28, 86), SEPIA[2]);
      b.fill('M28 74C40 66 54 70 64 66C72 63 78 66 82 70L85 86H28Z', SEPIA[0]);
      b.fill(box(47, 54, 4.5, 20), SEPIA[1]);
      b.fill(O(49, 48, 13), SEPIA[1]);
      b.fill(O(46, 45, 9), SEPIA[0]);
      b.fill(O(70, 43, 4.5), PAPER[2]);
    });
  },

  // the lake above the tents: still water in its green bank, the mountains behind it
  lake: (b) => {
    b.fill(poly(22, 72, 44, 36, 58, 58, 74, 30, 100, 72), '#9aa9c4');
    b.fill(poly(74, 30, 100, 72, 80, 72, 70, 46), '#7d8dac');
    b.fill(poly(44, 36, 49, 44, 45, 47, 41, 43, 38, 46) + poly(74, 30, 80, 40, 75, 43, 71, 39, 67, 42), VALLEY.snow);
    b.fill(E(60, 86, 52, 20), GRASS[1]);
    b.fill(E(59, 84, 50, 18), GRASS[0]);
    b.fill(E(60, 85, 39, 11.5), WATER[1]);
    b.fill(E(59, 84, 38, 10.5), WATER[0]);
    b.line('M36 82H52M58 88H80M70 80H82', WATER[2], 2);
    b.line('M16 86V72M20 88V76M102 84V72M98 87V78', LEAF[1], 2);
  },

  // the iron stove of the winter evenings, its door glowing and the kettle on
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

  // Dapîr's calendar by the stove, Saturday ringed in red
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

  // Hamo's old notebook and the pencil he writes the summer down with
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

  // the ladder of the apple harvest
  ladder: (b) => {
    b.ground(30);
    const rail = (x0: number, x1: number, y: number): number => x0 + ((x1 - x0) * (100 - y)) / 86;
    let rungs = '';
    for (const y of [30, 44, 58, 72, 86]) rungs += `M${f(rail(42, 51, y))} ${y}H${f(rail(82, 73, y))}`;
    b.line(rungs, WOOD[1], 4.2);
    b.line('M42 100L51 14M82 100L73 14', WOOD[0], 5.4);
    b.line('M41 96L49.4 18', WOOD[2], 1.6);
  },

  // a sack of apples for the summer pastures: for Bişar, says Hamo
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

  // the lamp at the blue gate on the night before Newroz
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

  // the tracks Hevalo leaves: two prints of a small cloven hoof, one ahead of the other
  hoofprints: (b) => {
    const toe = 'M-2.4 -21C-14.5 -18 -17.5 3 -11 18C-8 22.5 -2.4 21 -2.4 14.5Z';
    const print = (x: number, y: number, turn: number): void =>
      b.group(`translate(${x} ${y}) rotate(${turn})`, () => {
        b.fill(toe, VALLEY.wallSide);
        b.fill(toe, VALLEY.wallSide, ' transform="scale(-1 1)"');
      });
    print(38, 84, 12);
    print(82, 38, 20);
  },

  // Kobanî under Miştenûr: the flat roofs of Hamo's town, the fig tree in his father's yard, and the hill above them all
  town: (b, random) => {
    b.fill(E(60, 104, 54, 9), GROUND, ' fill-opacity="0.45"');
    b.fill('M6 84C22 52 44 30 64 30C84 30 102 52 114 84Z', '#c9c6a2');
    b.fill('M64 30C84 30 102 52 114 84H88C84 60 76 42 64 30Z', '#b5b08a');
    b.fill('M52 34C58 30 70 30 76 35C70 34 60 34 52 34Z', '#dedbb8');
    const lane = VALLEY.earthShade;
    b.add(earthHouse(16, 80, 22, 16, 9, { dark: false, ground: lane }));
    b.add(earthHouse(70, 76, 24, 18, 10, { dark: false, ground: lane }));
    b.add(earthHouse(40, 88, 26, 20, 11, { dark: false, ground: lane, door: VALLEY.gate }));
    b.add(earthHouse(8, 102, 28, 20, 12, { dark: false, ground: lane, door: VALLEY.gateDark, roofLine: VALLEY.fruit }));
    b.add(earthHouse(70, 103, 30, 22, 12, { dark: false, ground: lane, door: VALLEY.gate }));
    b.add(roundTree(60, 104, 0.62, foliage(false), lane, random));
  },
} as const satisfies Readonly<Record<string, Draw>>;

/** A small thing the book's scenes are told with. */
export type BookSpot = keyof typeof SPOTS;

/** Every spot, in the order they are drawn above. */
export const BOOK_SPOTS: readonly BookSpot[] = Object.freeze(Object.keys(SPOTS) as BookSpot[]);

/** One of the book's small things on the 120-unit canvas, on a clear ground. */
export function bookSpotSvg(opts: BookArtOptions & { spot: BookSpot }): string {
  const draw = Object.prototype.hasOwnProperty.call(SPOTS, opts.spot) ? SPOTS[opts.spot] : undefined;
  if (!draw) throw new RangeError(`art: no book spot ${String(opts.spot)}`);
  const brush = new Brush();
  draw(brush, seeded(`book-spot|${opts.spot}`));
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-spot', opts.spot), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── paint

/** The colours the road teaches, as paint: what a dab of each looks like, its face, its shade and its light. */
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

/** A dab of paint in one of the road's colours, with the drop it let fall: the picture of a colour word. */
export function bookPaintSvg(opts: BookArtOptions & { colour: BookPaint }): string {
  const tone = Object.prototype.hasOwnProperty.call(PAINTS, opts.colour) ? PAINTS[opts.colour] : undefined;
  if (!tone) throw new RangeError(`art: no paint called ${String(opts.colour)}`);
  const brush = new Brush();
  // every colour is the same dab, so a row of them reads as one paintbox
  const dab = blobPath(58, 58, 38, 30, 9, 0.26, seeded('book-paint'), 0.4);
  brush.form(dab, tone, 26, 32, 0.92);
  brush.fill(O(94, 92, 6.5), tone[1]);
  brush.fill(O(93.4, 91.2, 5.4), tone[0]);
  brush.fill(oval(42, 44, 9, 4.6, -24), tone[2]);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-paint', opts.colour), opts.size, opts.title);
}

// ───────────────────────────────────────────────────────────── the postmark

/**
 * The postmark a finished chapter's stamp is cancelled with: two rings, a
 * bar across them where the date goes, and the wavy lines that run off over
 * the stamp, all in one ink.
 */
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

/** Where a scene is set: by day, by night under the stars, or in the snow. */
export const BOOK_SETTINGS = ['day', 'night', 'snow'] as const;
export type BookSetting = (typeof BOOK_SETTINGS)[number];

/** The backdrop's own canvas: wider than it is tall, as a panel of a comic is. */
export const BOOK_BACKDROP = { w: 180, h: 100, horizon: 74 } as const;

/**
 * What a scene of the book stands on: a sky and a hill in the two colours
 * it is given (a chapter's tint and its wash), with a sun or clouds by day,
 * a moon and stars by night, and falling flakes in the snow. The people and
 * the props are laid over it; the hill's top runs near `BOOK_BACKDROP.horizon`.
 */
export function bookBackdropSvg(opts: BookArtOptions & { setting: BookSetting; sky: string; ground: string; light: string }): string {
  if (!BOOK_SETTINGS.includes(opts.setting)) throw new RangeError(`art: no book setting ${String(opts.setting)}`);
  for (const c of [opts.sky, opts.ground, opts.light]) if (!/^#[0-9a-f]{6}$/.test(c)) throw new RangeError(`art: a backdrop's colours are six-digit colours, not ${String(c)}`);
  const { w, h, horizon } = BOOK_BACKDROP;
  const brush = new Brush();
  const random = seeded(`book-backdrop|${opts.setting}`);
  brush.fill(`M0 0H${w}V${h}H0Z`, opts.sky);
  if (opts.setting === 'day') {
    brush.fill(O(150, 22, 9), opts.light);
    brush.fill(O(34, 20, 6) + O(43, 17, 8) + O(53, 21, 6) + E(43, 23, 15, 4), opts.light);
  } else if (opts.setting === 'night') {
    // the moon is the part of one round that another does not cover
    brush.fill('M152 12A13 13 0 1 0 163 34A10.5 10.5 0 0 1 152 12Z', opts.light);
    let stars = '';
    for (let i = 0; i < 16; i++) stars += O(8 + random() * 130, 6 + random() * 48, 0.9 + random() * 1.1);
    brush.fill(stars, opts.light);
  } else {
    let flakes = '';
    for (let i = 0; i < 22; i++) flakes += O(6 + random() * 168, 5 + random() * 62, 1.2 + random() * 1.4);
    brush.fill(flakes, opts.light);
  }
  brush.fill(`M0 ${horizon + 6}C34 ${horizon - 6} 70 ${horizon - 4} 104 ${horizon + 2}C134 ${horizon + 7} 158 ${horizon + 2} ${w} ${horizon - 3}V${h}H0Z`, opts.ground);
  return picture(String(brush), prefixFor(opts.idPrefix, 'book-backdrop', opts.setting, opts.sky.slice(1), opts.ground.slice(1)), opts.size, opts.title, `0 0 ${w} ${h}`, h / w);
}

// ───────────────────────────────────────────────────────────── the three friends, posed

/** How a character holds itself in a pose: only what the rig can already do. */
interface Pose {
  mouth?: MouthShape;
  eyes?: EyeState;
  brows?: BrowState;
  blush?: boolean;
  /** degrees the head tilts about the neck */
  tilt?: number;
  /** where the deer's pupils look, each way from -1 to 1 */
  look?: readonly [number, number];
  /** each of the deer's ears lifted (up is positive), in degrees: left, right */
  ears?: readonly [number, number];
  /** degrees the near end of Hamo's moustache lifts */
  lift?: number;
  /** what is laid over or beside the figure, in the figure's own units */
  prop?: 'apple' | 'crumbs' | 'core' | 'snore';
}

const POSES = {
  hevalo: {
    plain: {},
    // caught with the apple in his mouth, a bite already gone
    caught: { eyes: 'wide', ears: [14, 14], prop: 'apple' },
    // looking at the sky, as he does whenever apples are counted; the core lies beside him
    innocent: { look: [0.35, -1], mouth: 'u', ears: [-10, -10], tilt: -4, prop: 'core' },
    pleased: { eyes: 'happy', mouth: 'grin', ears: [8, 8] },
    munching: { eyes: 'happy', mouth: 'mbp', prop: 'crumbs' },
    curious: { tilt: 9, ears: [16, -6], brows: 'one' },
    sad: { eyes: 'half', mouth: 'mbp', ears: [-26, -26], look: [0, 0.8] },
    asleep: { eyes: 'closed', ears: [-18, -18], tilt: 6, prop: 'snore' },
  },
  hamo: {
    plain: {},
    // pleased with you, or with himself: the near end of the moustache goes up
    proud: { eyes: 'happy', lift: 7, brows: 'raised' },
    laughing: { eyes: 'happy', mouth: 'grin', brows: 'raised', lift: 4, tilt: -3 },
    // a miss gets one raised eyebrow and a thoughtful look, never a cross word
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

/** A spot from this page, laid into a figure's own units: its 120-unit canvas `k` times as big, its middle at (x, y). */
function laid(draw: (b: Brush) => void, x: number, y: number, k: number, turn = 0): string {
  const brush = new Brush();
  draw(brush);
  const spin = turn === 0 ? '' : ` rotate(${n(turn)} 60 66)`;
  return `<g transform="translate(${n(x - 60 * k)} ${n(y - 66 * k)}) scale(${n2(k)})${spin}">${String(brush)}</g>`;
}

/** Three "z"s rising beside a sleeper, each smaller than the last, in the ink of the page. */
function snore(x: number, y: number, k: number): string {
  let d = '';
  [0, 1, 2].forEach((i) => {
    const s = k * (1 - i * 0.22);
    const [zx, zy] = [x + i * 26 * k, y - i * 30 * k];
    d += `M${n(zx)} ${n(zy)}h${n(22 * s)}l${n(-22 * s)} ${n(24 * s)}h${n(22 * s)}`;
  });
  return `<path d="${d}" fill="none" stroke="#7d76a6" stroke-width="${n(5 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** What a pose lays over or beside the deer, in his own measure (his face is 512 across, his mouth near 255, 440; standing, his hooves are near 1530). */
function deerProp(prop: Pose['prop'], crop: CharacterCrop): string {
  if (prop === 'apple') {
    // the apple he was told was yours, held in his teeth below the nose, with the bite that gave him away
    const crumbs = [[150, 470, 7], [128, 498, 5], [362, 462, 6], [386, 492, 4.5]].map(([x, y, r]) => O(x!, y!, r!)).join('');
    return (
      laid((b) => {
        bittenApple(b, BITES[1]!);
        b.fill(oval(39, 58, 5, 9, 20), RED[2]);
      }, 255, 478, 1.36, -8) + `<path d="${crumbs}" fill="${FLESH[1]}"/>`
    );
  }
  if (prop === 'crumbs') return `<path d="${[[188, 478, 7], [164, 500, 5], [322, 474, 6], [346, 498, 5], [255, 492, 5]].map(([x, y, r]) => O(x!, y!, r!)).join('')}" fill="${FLESH[1]}"/>`;
  // the core lies beside him: by his cheek in a picture of his head, and by his hooves where he is drawn standing
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
    // the deer: his ears and his pupils are layers of their own, and his lids lie over the open eyes
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
  /** the whole figure, head to waist, or head and shoulders (the default: a scene shows them from the chest up) */
  crop?: Exclude<CharacterCrop, 'head'>;
  /** how wide it is drawn; the crop's own width in drawing units by default */
  width?: number;
  title?: string;
  idPrefix?: string;
}

/** One of the three friends in one of the book's poses, as a picture of its own. */
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
