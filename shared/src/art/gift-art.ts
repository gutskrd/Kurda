/**
 * The gifts' pictures, painted as gouache on cut paper (gift-paint.ts): a glass of tea, a cup of coffee on a kilim, a
 * rose, a sleeping kitten, a rowing boat with its lantern, a village house, the full moon and the galaxy. Each must read
 * as one clear shape at 48 px in a chat line and keep its small details for the 240 px unwrap. One drawing serves the
 * light page and the dark, so pale things carry a warm edge and night skies are cut out as a patch of their own.
 * New gifts go on the end of `GIFT_ART_IDS`, so each picture's file keeps its name.
 */
import { Drawing, checkSize, prefixFor, seeded, type Pt } from './svg.js';
import {
  along,
  brush,
  ellipse,
  form,
  lerp,
  outline,
  paint,
  polygon,
  roundish,
  runs,
  scaleAbout,
  shift,
  side,
  streaks,
  touch,
  tremble,
  turn,
  within,
  type Rnd,
  type Tone,
} from './gift-paint.js';

/** The gifts drawn so far, in the order their files are numbered. */
export const GIFT_ART_IDS = ['cay', 'qehwe', 'gul', 'pisik', 'belem', 'mal', 'heyv', 'kadiz'] as const;
export type GiftArtId = (typeof GIFT_ART_IDS)[number];

export function isGiftArtId(id: string): id is GiftArtId {
  return (GIFT_ART_IDS as readonly string[]).includes(id);
}

/** What each picture shows: its label until an app passes a translated one. */
const LABELS: Readonly<Record<GiftArtId, string>> = {
  cay: 'A glass of tea on its saucer',
  qehwe: 'A cup of Kurdish coffee on a kilim',
  gul: 'A red rose tied with twine',
  pisik: 'A kitten asleep on a cushion',
  belem: 'A rowing boat with a lantern',
  mal: 'A village house with a flat roof',
  heyv: 'The full moon over the mountains',
  kadiz: 'The galaxy',
};

/** A picture's file under /cosmetics, named as the shop's drawn art is: its place in the list, then its id. */
export function giftArtKey(id: GiftArtId): string {
  return `gifts/made-${String(GIFT_ART_IDS.indexOf(id) + 1).padStart(2, '0')}-${id}.png`;
}

export interface GiftArtOptions {
  id: GiftArtId;
  size?: number;
  title?: string;
  idPrefix?: string;
}

/** A gift's picture on its own transparent square. */
export function giftArtSvg(opts: GiftArtOptions): string {
  const id = opts.id;
  if (!isGiftArtId(id)) throw new RangeError(`art: no gift picture ${String(id)}`);
  const size = checkSize(opts.size, 120);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'gift', id));
  PAINTERS[id](dr, seeded(`gift|${id}`));
  return dr.svg(size, opts.title ?? LABELS[id]);
}

// ───────────────────────────────────────────────────────────── shared colours

/** What a gift's shadow is painted in: the page's violet, thin, so it shows on a light page and sinks into a dark one. */
const FLOOR = '#2a2140';
const CHINA: Tone = { base: '#f6efe2', light: '#fffcf5', shade: '#d6c7b1' };
const GOLD = '#c39238';
const INK = '#3b2119';

function floor(dr: Drawing, rnd: Rnd, cx: number, cy: number, rx: number, ry: number): void {
  paint(dr, outline(roundish(cx, cy, rx, ry, rnd, { wobble: 0.04, tremor: 0.5 })), FLOOR, 0.14);
}

/**
 * The side band of a round slab seen from above (a saucer, a cushion): the lower half of its top face `top`, as
 * `roundish` lays its points out, joined to the same half `depth` lower.
 */
function slab(top: readonly Pt[], depth: number): Pt[] {
  const half = top.slice(0, Math.floor(top.length / 2) + 1);
  return [...half.map(([x, y]): Pt => [x, y + depth]), ...half.slice().reverse()];
}

/** A ring between an outline and a smaller copy of it, filled even-odd: a rim, a band. */
function band(dr: Drawing, outer: readonly Pt[], inner: readonly Pt[], colour: string): void {
  dr.add(`<path d="${outline(outer)}${outline(inner)}" fill="${colour}" fill-rule="evenodd"/>`);
}

/** A leaf or petal from `base` to `tip`, `width` across at its widest (`at` of the way along), bent by `bend`. */
function blade(base: Pt, tip: Pt, width: number, { at = 0.55, bend = 0, point = 0.7, teeth = 0, count = 14 } = {}): Pt[] {
  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const k = Math.log(0.5) / Math.log(at);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const tooth = teeth && i > 1 && i < count - 1 ? (i % 2 ? 1 + teeth : 1 - teeth) : 1;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, k)), 0.75) * (1 - point * Math.pow(t, 6)) * tooth;
    const off = bend * len * Math.sin(Math.PI * t);
    const cx = base[0] + dx * t - uy * off;
    const cy = base[1] + dy * t + ux * off;
    left.push([cx - uy * w, cy + ux * w]);
    right.push([cx + uy * w, cy - ux * w]);
  }
  return [...left, ...right.reverse().slice(1, -1)];
}

// ───────────────────────────────────────────────────────────────────── çay

/**
 * The tea glass's half-width down its height, in the units of the owner's painting it is traced from (512 across): widest
 * at the lip, drawn in slowly to a waist, swelling as slowly to a belly low down and quickly in to a small foot. Measured,
 * because a tea glass drawn by eye comes out a tumbler.
 */
const TEA_GLASS: readonly Pt[] = [
  [85, 140], [107, 135], [120, 128.5], [134, 119.5], [148, 112], [161, 106], [175, 103], [189, 101], [203, 99.5], [216, 98.5], [230, 98],
  [244, 100], [260, 104], [282, 108.5], [304, 111.5], [326, 114], [348, 115], [369, 112.5], [391, 104], [413, 90], [429, 76], [438, 69],
];

const TEA: Tone = { base: '#a3301a', light: '#e2762f', shade: '#5c150c' };

function cay(dr: Drawing, rnd: Rnd): void {
  const k = 0.2;
  const X = 60;
  const row = (v: number): number => 12 + v * k;
  const halfAt = (v: number): number => {
    let i = TEA_GLASS.findIndex(([r]) => r >= v);
    if (i < 0) i = TEA_GLASS.length - 1;
    i = Math.max(1, i);
    const [ra, wa] = TEA_GLASS[i - 1]!;
    const [rb, wb] = TEA_GLASS[i]!;
    return (wa + ((wb - wa) * (v - ra)) / (rb - ra)) * k;
  };
  // the glass from row `from` to row `to`, `inset` in from its outside, with the far edge of an ellipse across its top
  // (`lid` deep) and the near edge of one across its foot, as a round thing seen from a little above has
  const body = (inset: number, from: number, to: number, lid: number, foot: number): Pt[] => {
    const rows: Pt[] = [[from, halfAt(from) - inset], ...TEA_GLASS.filter(([r]) => r > from && r < to).map(([r, w]): Pt => [r, w * k - inset]), [to, halfAt(to) - inset]];
    const out: Pt[] = rows.map(([r, w]): Pt => [X - w, row(r)]);
    const [rb, wb] = rows[rows.length - 1]!;
    for (let i = 1; i < 8; i++) out.push([X + wb * Math.cos(Math.PI - (i / 8) * Math.PI), row(rb) + foot * Math.sin(Math.PI - (i / 8) * Math.PI)]);
    for (const [r, w] of rows.slice().reverse()) out.push([X + w, row(r)]);
    const [rt, wt] = rows[0]!;
    for (let i = 1; i < 8; i++) out.push([X + wt * Math.cos(-(i / 8) * Math.PI), row(rt) + lid * Math.sin(-(i / 8) * Math.PI)]);
    return out;
  };

  // the saucer, broad and seen from above, its edge scalloped; a shape on it is given round the plate's own circle
  const S = { x: 60, y: row(374), rx: 226 * k, ry: 122 * k };
  const plate = (u: number, v: number): Pt => [S.x + u * S.rx, S.y + v * S.ry];
  const edge: Pt[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r = 1 + 0.02 * Math.cos(a * 12 + 0.4);
    edge.push(plate(Math.cos(a) * r, Math.sin(a) * r));
  }
  const saucer = tremble(edge, rnd, 0.25);
  floor(dr, rnd, S.x + 3, S.y + 3.5, S.rx, S.ry);
  paint(dr, outline(slab(saucer, 1.6)), CHINA.shade);
  paint(dr, outline(saucer), CHINA.base);
  side(dr, saucer, 2.2, 1.7, CHINA.shade, { grow: 0.975 });
  within(dr, outline(saucer), () => paint(dr, streaks(rnd, [S.x - S.rx, S.y - S.ry, S.x + S.rx, S.y + S.ry], 40, 0, 6, 0.7), CHINA.shade, 0.3));
  band(dr, saucer, scaleAbout(saucer, S.x, S.y, 0.975, 0.965), GOLD);
  band(dr, roundish(S.x, S.y + 5.2, 26.4, 13.4, rnd, { tremor: 0.2 }), roundish(S.x, S.y + 5.4, 25.2, 12.5, rnd, { tremor: 0.2 }), CHINA.shade);
  // coral strokes round the rim, each pointing at the middle, and a gold sprig between each and the next
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [vx, vy] = [-uy, ux];
    const stroke: Pt[] = [];
    for (let j = 0; j < 14; j++) {
      const t = (j / 14) * Math.PI * 2;
      const al = 0.72 + Math.cos(t) * 0.17;
      const ac = Math.sin(t) * (0.095 + 0.025 * Math.cos(t));
      stroke.push(plate(ux * al + vx * ac, uy * al + vy * ac));
    }
    const coral = tremble(stroke, rnd, 0.35);
    paint(dr, outline(coral), '#dc6748');
    side(dr, coral, 0.7, 0.7, '#f1977a');
    const b = a + Math.PI / 8;
    const [gx, gy] = plate(Math.cos(b) * 0.8, Math.sin(b) * 0.8);
    const near = 0.62 + 0.38 * Math.max(0, Math.sin(b));
    for (const t of [-1, 0, 1]) paint(dr, touch(gx + t * 1.6 * near, gy - Math.abs(t) * 0.5, 2.4 * near, 0.8 * near, t * 42), '#b5862e');
    paint(dr, ellipse(gx, gy + 0.9 * near, 0.55 * near, 0.5 * near), '#6a4a1e');
  }
  // what the glass casts: grey to its right, and before its foot the light that has come through the tea
  paint(dr, outline(roundish(X + 15, row(442), 17, 4.6, rnd)), CHINA.shade);
  paint(dr, outline(roundish(X + 6, row(466), 9.5, 2.8, rnd)), '#ee9645', 0.75);
  paint(dr, outline(roundish(X, row(441), 15, 2.6, rnd)), '#3a2418', 0.4);

  // a sugar cube on the plate, for the glass is drunk through one held in the teeth
  const cube = (cx: number, cy: number, s: number): void => {
    const pts = (corners: Pt[]): Pt[] => tremble(turn(runs(corners, 1.2), cx, cy, 8), rnd, 0.18);
    const topFace = pts([[cx - s * 0.55, cy - s * 0.42], [cx, cy - s * 0.68], [cx + s * 0.55, cy - s * 0.42], [cx, cy - s * 0.16]]);
    const leftFace = pts([[cx - s * 0.55, cy - s * 0.42], [cx, cy - s * 0.16], [cx, cy + s * 0.5], [cx - s * 0.55, cy + s * 0.24]]);
    const rightFace = pts([[cx, cy - s * 0.16], [cx + s * 0.55, cy - s * 0.42], [cx + s * 0.55, cy + s * 0.24], [cx, cy + s * 0.5]]);
    paint(dr, outline(roundish(cx + s * 0.5, cy + s * 0.42, s * 0.7, s * 0.22, rnd)), CHINA.shade);
    paint(dr, outline(leftFace), '#ebe2d3');
    paint(dr, outline(rightFace), '#cdbfa9');
    paint(dr, outline(topFace), '#fffdf8');
  };
  cube(...plate(-0.67, 0.34), 6.4);

  // the glass above the tea is clear: its far wall pale, with the room's light lying on it
  const outside = tremble(body(0, 85, 438, 61 * k, 11 * k), rnd, 0.1);
  const RIM = { y: row(85), rx: 140 * k, ry: 61 * k };
  const mouth = roundish(X, RIM.y, RIM.rx, RIM.ry, rnd, { wobble: 0.005, tremor: 0.1 });
  paint(dr, outline(outside), '#e4dfe7', 0.8);
  within(dr, outline(mouth), () => {
    paint(dr, brush([[X - 4, row(36)], [X + 14, row(34)], [X + 24, row(58)]], 5, rnd, { start: 0.5, end: 0.2 }), '#ffffff', 0.9);
    paint(dr, brush([[X - 25, row(80)], [X - 20, row(50)], [X - 12, row(36)]], 3.4, rnd, { start: 0.6, end: 0.2 }), '#ffffff', 0.6);
    paint(dr, brush([[X - 10, row(32)], [X - 6, row(58)], [X - 5, row(84)]], 3, rnd), '#9a94a0', 0.4);
  });

  // the tea: red, dark where the round glass turns it from the light, amber where the light comes through
  const tea = tremble(body(1.1, 121, 428, 25 * k, 9 * k), rnd, 0.08);
  const lens = (v: number, depth: number, reach: number, off: number): string => {
    const w = (halfAt(v) + 1.4) * reach;
    const cx = X + off * halfAt(v);
    const sag = w * 0.36;
    const y = row(v);
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push([cx - w + 2 * w * t, y + (sag + depth * k) * 4 * t * (1 - t)]);
    }
    for (let i = 9; i > 0; i--) {
      const t = i / 10;
      pts.push([cx - w + 2 * w * t, y + (sag - depth * k) * 4 * t * (1 - t)]);
    }
    return outline(tremble(pts, rnd, 1.1));
  };
  paint(dr, outline(tea), TEA.base);
  within(dr, outline(tea), () => {
    paint(dr, lens(148, 28, 1, 0), TEA.light);
    paint(dr, lens(200, 52, 0.92, -0.05), TEA.shade);
    paint(dr, lens(292, 44, 0.94, 0.05), TEA.shade);
    paint(dr, lens(392, 34, 0.84, 0), TEA.light);
    dr.add(`<path d="${outline(tea)}${outline(scaleAbout(tea, X, row(280), 0.82, 1))}" fill="${TEA.shade}" fill-rule="evenodd" fill-opacity="0.55"/>`);
    paint(dr, streaks(rnd, [X - 24, row(130), X + 24, row(420)], 22, 88, 7, 0.7), TEA.shade, 0.3);
  });
  // its surface in the mouth of the glass, lit along its far edge
  within(dr, outline(mouth), () => {
    const top = roundish(X, row(121), 111 * k, 25 * k, rnd, { wobble: 0.005, tremor: 0.15 });
    paint(dr, outline(top), TEA.light);
    paint(dr, outline(roundish(X + 5, row(127), 12, 1.8, rnd)), TEA.shade, 0.5);
    paint(dr, brush(along([[X - 19, row(115)], [X, row(98)], [X + 19, row(115)]], 8), 0.9, rnd, { start: 0.3, end: 0.3, peak: 0.5 }), '#f8b768');
  });

  // the glass itself: its foot, the line round it, the lip, and the white lights down it
  const foot = body(0, 424, 438, 0, 11 * k);
  paint(dr, outline(foot), '#a59d98', 0.95);
  paint(dr, brush([[X - 10, row(441)], [X - 1, row(450)], [X + 7, row(444)]], 0.8, rnd), '#fbf7f0', 0.85);
  const left = TEA_GLASS.map(([r, w]): Pt => [X - w * k, row(r)]);
  const right = TEA_GLASS.map(([r, w]): Pt => [X + w * k, row(r)]);
  const footArc: Pt[] = [];
  for (let i = 0; i <= 8; i++) footArc.push([X - 69 * k * Math.cos((i / 8) * Math.PI), row(438) + 11 * k * Math.sin((i / 8) * Math.PI)]);
  paint(dr, brush(left, 1.05, rnd, { start: 0.7, end: 0.6, peak: 0.5, count: 30 }), INK);
  paint(dr, brush(right, 1.05, rnd, { start: 0.7, end: 0.6, peak: 0.5, count: 30 }), INK);
  paint(dr, brush(footArc, 0.8, rnd, { start: 0.6, end: 0.6, peak: 0.5 }), INK);
  const near: Pt[] = [];
  const far: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    near.push([X - RIM.rx * Math.cos(a), RIM.y + RIM.ry * Math.sin(a)]);
    far.push([X - RIM.rx * Math.cos(a), RIM.y - RIM.ry * Math.sin(a)]);
  }
  paint(dr, brush(near, 1, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), INK);
  paint(dr, brush(far, 0.6, rnd, { start: 0.8, end: 0.5, peak: 0.4, count: 24 }), INK, 0.8);
  paint(dr, brush(near.slice(1, 6), 0.8, rnd), '#ffffff', 0.9);
  const light = (at: number, from: number, to: number, width: number, opacity: number): void => {
    const pts: Pt[] = [];
    for (let v = from; v <= to; v += 14) pts.push([X + at * halfAt(v), row(v)]);
    paint(dr, brush(pts, width, rnd, { start: 0.3, end: 0.05 }), '#fffaf3', opacity);
  };
  light(-0.8, 150, 262, 1.4, 0.85);
  light(-0.62, 170, 356, 0.7, 0.75);
  light(-0.18, 168, 320, 0.5, 0.6);
  light(0.82, 300, 392, 0.7, 0.5);
  paint(dr, brush([[X + 11, row(330)], [X + 11.6, row(340)], [X + 11, row(350)]], 0.8, rnd), '#f6b83a', 0.9);

  // steam rising off the tea, curling as it goes: a pale wisp with its shaded side
  const wisps: Array<[Pt[], number]> = [
    [[[51.5, 34.5], [48.6, 27], [53, 19.4], [48.4, 11], [51, 3.2]], 2.6],
    [[[61, 35.4], [64.6, 28.6], [61.2, 22], [65.4, 15.6], [64, 11]], 2],
    [[[70, 33.4], [72.6, 29], [70.2, 24.6]], 1.4],
  ];
  for (const [pts, w] of wisps) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#b9aca3', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#e2d9d1', 0.95);
  }
}

// ─────────────────────────────────────────────────────────────────── qehwe

const KILIM = { field: '#b5432f', fieldLight: '#cf6a50', fieldShade: '#7e2a20', border: '#2f3c68', ochre: '#dea43f', cream: '#f3e5c6' };
const CARDAMOM: Tone = { base: '#8da15d', light: '#b9cb8d', shade: '#5f7339' };

/** A cardamom pod `len` long, laid at `deg` degrees over its shadow; split open, it shows its seeds. */
function pod(dr: Drawing, rnd: Rnd, [cx, cy]: Pt, deg: number, len: number, open: boolean, [shadow, opacity]: readonly [string, number]): void {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [(Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2];
  const [nx, ny] = [-Math.sin(a), Math.cos(a)];
  const line: Pt[] = [[cx - ux, cy - uy], [cx + nx * 0.3, cy + ny * 0.3], [cx + ux, cy + uy]];
  const w = len * 0.46;
  const shape = { start: 0.22, end: 0.18, peak: 0.5 };
  paint(dr, brush(shift(line, 0.8, 1), w, rnd, shape), shadow, opacity);
  if (open) {
    paint(dr, brush(shift(line, nx * w * 0.45, ny * w * 0.45), w * 0.62, rnd, shape), CARDAMOM.shade);
    paint(dr, brush(shift(line, -nx * w * 0.45, -ny * w * 0.45), w * 0.62, rnd, shape), CARDAMOM.light);
    let seeds = '';
    for (let i = 0; i < 4; i++) seeds += outline(roundish(cx + (i - 1.5) * ux * 0.4, cy + (i - 1.5) * uy * 0.4, 0.9, 0.8, rnd, { count: 6, tremor: 0.12 }));
    paint(dr, seeds, '#3a2a20');
    return;
  }
  const body = brush(line, w, rnd, shape);
  paint(dr, body, CARDAMOM.base);
  within(dr, body, () => {
    paint(dr, brush(shift(line, -nx * w * 0.32, -ny * w * 0.32), w * 0.42, rnd), CARDAMOM.light);
    paint(dr, brush(shift(line, nx * w * 0.44, ny * w * 0.44), w * 0.4, rnd), CARDAMOM.shade);
    paint(dr, brush(shift(line, nx * w * 0.06, ny * w * 0.06), 0.35, rnd, { start: 0.2, end: 0.2, peak: 0.5 }), CARDAMOM.shade);
  });
}

function qehwe(dr: Drawing, rnd: Rnd): void {
  // the cloth: a small kilim laid corner-on across the table, seen from in front; (u, v) is a point across it
  const B: Pt = [66, 69];
  const R: Pt = [117, 86];
  const F: Pt = [57, 113];
  const L: Pt = [4, 91];
  const at = (u: number, v: number): Pt => [
    (1 - u) * (1 - v) * B[0] + u * (1 - v) * R[0] + u * v * F[0] + (1 - u) * v * L[0],
    (1 - u) * (1 - v) * B[1] + u * (1 - v) * R[1] + u * v * F[1] + (1 - u) * v * L[1],
  ];
  const quad = (u0: number, v0: number, u1: number, v1: number): Pt[] => runs([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], 4);
  const diamond = (u: number, v: number, du: number, dv: number): Pt[] => [at(u, v - dv), at(u + du, v), at(u, v + dv), at(u - du, v)];
  const cloth = tremble(quad(0, 0, 1, 1), rnd, 0.4);

  // the warp's ends, knotted into a fringe along two opposite edges: behind the cloth at the back, over it at the front
  const fringe = (from: Pt, to: Pt, out: Pt, len: number, count: number): void => {
    let d = '';
    for (let i = 0; i < count; i++) {
      const p = lerp(from, to, (i + 0.5) / count);
      const l = len * (0.8 + rnd() * 0.4);
      const deg = (Math.atan2(out[1], out[0]) * 180) / Math.PI + (rnd() - 0.5) * 16;
      d += touch(p[0] + (out[0] * l) / 2, p[1] + (out[1] * l) / 2, l + 0.6, 0.8, deg);
    }
    paint(dr, d, KILIM.cream);
  };
  fringe(B, R, [0.32, -0.95], 3.2, 15);
  paint(dr, outline(shift(cloth, 1.5, 2.6)), FLOOR, 0.14);
  paint(dr, outline(shift(cloth, 0, 1.3)), KILIM.fieldShade);
  paint(dr, outline(cloth), KILIM.field);
  within(dr, outline(cloth), () => {
    paint(dr, streaks(rnd, [6, 68, 116, 112], 46, 18, 7, 0.5), KILIM.fieldLight, 0.35);
    // the border: indigo, a row of ochre diamonds with cream eyes down its middle, an ochre line inside it
    dr.add(`<path d="${outline(quad(-0.05, -0.05, 1.05, 1.05))}${outline(tremble(quad(0.11, 0.11, 0.89, 0.89), rnd, 0.3))}" fill="${KILIM.border}" fill-rule="evenodd"/>`);
    band(dr, quad(0.12, 0.12, 0.88, 0.88), quad(0.135, 0.135, 0.865, 0.865), KILIM.ochre);
    let eyes = '';
    let marks = '';
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + (i / 8) * 0.8;
      for (const [u, v] of [[t, 0.055], [t, 0.945], [0.055, t], [0.945, t]] as const) {
        marks += polygon(diamond(u, v, 0.032, 0.032));
        eyes += polygon(diamond(u, v, 0.012, 0.012));
      }
    }
    paint(dr, marks, KILIM.ochre);
    paint(dr, eyes, KILIM.cream);
    // the field's stepped medallion, mostly under the saucer, and an eye in each corner of the field
    const stepped = (s: number): Pt[] => {
      const pts: Pt[] = [];
      const k = 5;
      for (let i = 0; i < k; i++) pts.push([0.5 + (s * i) / k, 0.5 - s + (s * i) / k], [0.5 + (s * (i + 1)) / k, 0.5 - s + (s * i) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 + s - (s * i) / k, 0.5 + (s * i) / k], [0.5 + s - (s * i) / k, 0.5 + (s * (i + 1)) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 - (s * i) / k, 0.5 + s - (s * i) / k], [0.5 - (s * (i + 1)) / k, 0.5 + s - (s * i) / k]);
      for (let i = 0; i < k; i++) pts.push([0.5 - s + (s * i) / k, 0.5 - (s * i) / k], [0.5 - s + (s * i) / k, 0.5 - (s * (i + 1)) / k]);
      return pts.map(([u, v]) => at(u, v));
    };
    paint(dr, polygon(stepped(0.3)), KILIM.ochre);
    paint(dr, polygon(stepped(0.22)), KILIM.border);
    paint(dr, polygon(stepped(0.13)), KILIM.cream);
    for (const [u, v] of [[0.27, 0.27], [0.73, 0.27], [0.73, 0.73], [0.27, 0.73]] as const) {
      paint(dr, polygon(diamond(u, v, 0.045, 0.045)), KILIM.cream);
      paint(dr, polygon(diamond(u, v, 0.022, 0.022)), KILIM.border);
    }
    // what the cup and saucer cast on it
    paint(dr, outline(roundish(67, 93, 35, 9, rnd, { rot: 6 })), '#2a0c0a', 0.3);
  });
  fringe(L, F, [-0.38, 0.92], 4.4, 16);
  pod(dr, rnd, [93, 101], 22, 8.2, true, ['#2a0c0a', 0.35]);

  // the saucer, the cup's shadow on it, and two pods laid by the cup
  const S = { x: 60, y: 86, rx: 32, ry: 9.8 };
  const saucer = roundish(S.x, S.y, S.rx, S.ry, rnd, { wobble: 0.01, tremor: 0.2, count: 40 });
  paint(dr, outline(slab(saucer, 1.6)), CHINA.shade);
  paint(dr, outline(saucer), CHINA.base);
  side(dr, saucer, 2.4, 1.6, CHINA.shade, { grow: 0.97 });
  band(dr, saucer, scaleAbout(saucer, S.x, S.y, 0.975, 0.945), GOLD);
  paint(dr, outline(roundish(66, 87.6, 15.5, 4.2, rnd)), CHINA.shade);
  pod(dr, rnd, [38.6, 89.2], -16, 8.4, false, [CHINA.shade, 1]);
  pod(dr, rnd, [48, 92.4], 6, 8, false, [CHINA.shade, 1]);

  // the cup: small and white, an indigo band painted round it with gold dots, gold at its lip; its handle a ring
  const X = 60;
  const LIP = { y: 52, rx: 19, ry: 5.6 };
  const profile: Pt[] = [[52, 19], [56, 18.9], [61, 18.2], [66, 17], [71, 15.2], [75.6, 13], [79.4, 10.8], [82.4, 9.4]];
  const cup: Pt[] = profile.map(([y, w]): Pt => [X - w, y]);
  for (let i = 1; i < 8; i++) cup.push([X - 9.4 * Math.cos((i / 8) * Math.PI), 82.4 + 2.4 * Math.sin((i / 8) * Math.PI)]);
  for (const [y, w] of profile.slice().reverse()) cup.push([X + w, y]);
  for (let i = 1; i < 8; i++) cup.push([X + LIP.rx * Math.cos((i / 8) * Math.PI), LIP.y - LIP.ry * Math.sin((i / 8) * Math.PI)]);
  const shell = tremble(cup, rnd, 0.12);
  const ringOut = roundish(80.4, 64.4, 7, 7.8, rnd, { wobble: 0.02, rot: 14, count: 24, tremor: 0.15 });
  const ringIn = roundish(81.2, 64.6, 3.5, 4.5, rnd, { wobble: 0.03, rot: 14, count: 18, tremor: 0.15 });
  band(dr, shift(ringOut, 0.5, 0.9), shift(ringIn, 0.5, 0.9), CHINA.shade);
  band(dr, ringOut, ringIn, CHINA.base);
  form(dr, shell, CHINA, [-2.8, -0.6], [1.8, 0.4]);
  within(dr, outline(shell), () => {
    const upper: Pt[] = [];
    const lower: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      upper.push([X - 20 * Math.cos(a), 57.6 + 5.2 * Math.sin(a)]);
      lower.push([X + 20 * Math.cos(a), 63.6 + 4.8 * Math.sin(a)]);
    }
    paint(dr, outline(tremble([...upper, ...lower], rnd, 0.25)), KILIM.border);
    let dots = '';
    for (let i = 0; i < 11; i++) {
      const a = 0.22 + (i / 10) * (Math.PI - 0.44);
      dots += ellipse(X - 18.4 * Math.cos(a), 60.7 + 5 * Math.sin(a), 0.75 * (0.35 + 0.65 * Math.sin(a)), 0.72);
    }
    paint(dr, dots, '#e6b552');
    paint(dr, streaks(rnd, [X - 18, 56, X + 18, 80], 10, 80, 5, 0.8), CHINA.shade, 0.16);
    paint(dr, brush([[X - 17.2, 55.6], [X - 16, 66], [X - 12.6, 77]], 1.8, rnd), CHINA.light, 0.9);
  });
  // inside the lip: the cup's far wall in shade, and the coffee under its foam
  const mouth = roundish(X, LIP.y, LIP.rx, LIP.ry, rnd, { wobble: 0.005, tremor: 0.1 });
  paint(dr, outline(mouth), CHINA.shade);
  const coffee = roundish(X, LIP.y + 1.3, 16.8, 4.2, rnd, { wobble: 0.01, tremor: 0.1 });
  paint(dr, outline(coffee), '#9a6a44');
  within(dr, outline(coffee), () => {
    paint(dr, outline(roundish(X + 3, LIP.y + 2.4, 10.4, 2.4, rnd, { wobble: 0.12 })), '#5f3a24');
    let bubbles = '';
    for (let i = 0; i < 16; i++) bubbles += ellipse(X - 14 + rnd() * 28, LIP.y - 1.6 + rnd() * 5, 0.4 + rnd() * 0.4, 0.3 + rnd() * 0.22);
    paint(dr, bubbles, '#d5b083');
  });
  const lipNear: Pt[] = [];
  const lipFar: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    lipNear.push([X - LIP.rx * Math.cos(a), LIP.y + LIP.ry * Math.sin(a)]);
    lipFar.push([X + LIP.rx * Math.cos(a), LIP.y - LIP.ry * Math.sin(a)]);
  }
  paint(dr, brush(lipNear, 0.9, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), GOLD);
  paint(dr, brush(lipFar, 0.55, rnd, { start: 0.6, end: 0.6, peak: 0.5, count: 24 }), '#a98a5e');

  // steam
  for (const [pts, w] of [
    [[[55, 49], [52, 41], [56, 33], [52, 25], [54.6, 18]], 2.4],
    [[[65, 49.6], [68, 42], [64.6, 35.4], [67.6, 29]], 1.8],
  ] as Array<[Pt[], number]>) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#b9aca3', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.5, end: 0.05, peak: 0.3 }), '#e2d9d1', 0.95);
  }
}

// ───────────────────────────────────────────────────────────────────── gul

const ROSE = { base: '#b8273a', light: '#e0626c', shade: '#801729', deep: '#52101b' };
const LEAF: Tone = { base: '#5d7f45', light: '#83a563', shade: '#3e5c2e' };
const TWINE: Tone = { base: '#c79a52', light: '#e2bd7c', shade: '#8f6a35' };

function gul(dr: Drawing, rnd: Rnd): void {
  // the stem, bending a little under the flower, its cut end pale, a few thorns
  const stem: Pt[] = [[62, 56], [59.6, 72], [56.6, 87], [54.6, 101], [54, 114]];
  paint(dr, brush(stem, 3.2, rnd, { start: 1, end: 0.8, peak: 0.5, count: 24 }), LEAF.shade);
  paint(dr, brush(shift(stem, -0.6, 0), 1.2, rnd, { start: 0.6, end: 0.6, peak: 0.5 }), LEAF.base);
  paint(dr, ellipse(54, 114.2, 1.5, 0.6), '#b9cc98');
  for (const [x, y, dx, dy] of [[59.2, 79, 2.6, 1.6], [55.4, 95.6, -2.6, 1.8], [61.2, 64, 2.4, 1.2]] as const) {
    paint(dr, outline([[x - 0.2, y - 1.4], [x + dx, y + dy], [x - 0.1, y + 1.2]]), '#86422e');
  }
  // a leaflet: toothed, its midrib pale, the light lying along one half of it and the shade along the other edge
  const leaf = (base: Pt, tip: Pt, width: number, bend: number): void => {
    const pts = tremble(blade(base, tip, width, { at: 0.42, bend, point: 0.85, teeth: 0.07, count: 12 }), rnd, 0.2);
    const [dx, dy] = [tip[0] - base[0], tip[1] - base[1]];
    const l = Math.hypot(dx, dy);
    const [nx, ny] = [-dy / l, dx / l];
    paint(dr, outline(pts), LEAF.base);
    side(dr, pts, -nx * 1.5, -ny * 1.5, LEAF.shade);
    within(dr, outline(pts), () => {
      const along3 = [0.12, 0.5, 0.86].map((t, i): Pt => {
        const p = lerp(base, tip, t);
        const o = width * [0.16, 0.22, 0.1][i]!;
        return [p[0] - nx * o, p[1] - ny * o];
      });
      paint(dr, brush(along3, width * 0.34, rnd, { start: 0.5, end: 0.2 }), LEAF.light, 0.9);
      let veins = '';
      for (const t of [0.3, 0.52, 0.72]) {
        const p = lerp(base, tip, t);
        for (const s of [-1, 1]) veins += brush([p, [p[0] + (s * nx * width * 0.36 + dx * 0.08), p[1] + (s * ny * width * 0.36 + dy * 0.08)]], 0.3, rnd, { count: 4, start: 1, end: 0.2 });
      }
      paint(dr, veins, '#a9c48a', 0.7);
      paint(dr, brush([base, lerp(base, tip, 0.5), tip], 0.55, rnd, { start: 0.9, end: 0.1 }), '#a9c48a');
    });
  };
  paint(dr, brush([[59.6, 74], [50, 70.4], [40, 68.8]], 1.1, rnd, { start: 1, end: 0.7 }), LEAF.shade);
  leaf([48.4, 70.6], [44.6, 60], 8.6, 0.08);
  leaf([48.8, 71.4], [41.4, 80], 8.6, -0.08);
  leaf([40.6, 68.8], [24, 62.6], 11.6, 0.06);
  paint(dr, brush([[56.8, 88], [66.6, 91], [77, 89.8]], 1.1, rnd, { start: 1, end: 0.7 }), LEAF.shade);
  leaf([67.4, 90.4], [72.4, 80.4], 8.2, -0.06);
  leaf([68.2, 91.2], [74.6, 99.8], 8.2, 0.06);
  leaf([76.6, 89.8], [93.4, 85.6], 11.2, -0.05);

  // twine tied round the stem in a bow
  const knot: Pt = [54.6, 102];
  const loops: Pt[][] = [
    [knot, [49.2, 98], [44.8, 98.4], [45.6, 102.2], [50.2, 103], knot],
    [knot, [60, 97.8], [64.6, 98.6], [63.8, 102.4], [59, 103.2], knot],
  ];
  const tails: Pt[][] = [
    [knot, [51.8, 107], [48.6, 112.6]],
    [knot, [57.4, 107.6], [59.6, 113.2]],
  ];
  for (const t of tails) paint(dr, brush(t, 1.5, rnd, { start: 0.9, end: 0.5 }), TWINE.shade);
  for (const l of loops) {
    paint(dr, brush(shift(l, 0.4, 0.5), 1.6, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 24 }), TWINE.shade);
    paint(dr, brush(l, 1.3, rnd, { start: 0.8, end: 0.8, peak: 0.5, count: 24 }), TWINE.base);
  }
  paint(dr, brush([[51.8, 100.6], [54.6, 101.2], [57.4, 100.6]], 1.2, rnd), TWINE.base);
  paint(dr, brush([[52, 103.6], [54.6, 104], [57.2, 103.4]], 1.1, rnd), TWINE.base);
  paint(dr, ellipse(knot[0], knot[1], 1.5, 1.3), TWINE.light);

  // the bloom, nodding a little toward the light. Its petals are shells: the ones behind in shade, the cup in the middle
  // with its spiral, the ones in front wrapping it, each lip rolled back into the light with the dark of the flower
  // showing above it
  dr.add('<g transform="translate(62 33) rotate(-8) scale(1.08)">');
  for (const [tx, ty, b] of [[-15, 25, 0.1], [-6, 29, 0.06], [7, 29, -0.06], [16, 24, -0.1]] as const) {
    paint(dr, outline(tremble(blade([tx * 0.12, 15], [tx, ty], 3.8, { at: 0.3, bend: b, point: 1 }), rnd, 0.15)), LEAF.base);
  }
  paint(dr, outline(roundish(0, -1, 24.5, 21.5, rnd, { wobble: 0.05, count: 28 })), ROSE.deep);
  const shellPetal = (pts: Pt[], lip: Pt[], face: string, light: string, shade: string | null): void => {
    const p = tremble(pts, rnd, 0.3);
    paint(dr, brush(shift(lip, 0, -0.9), 1.6, rnd, { start: 0.4, end: 0.3, peak: 0.5 }), ROSE.deep);
    paint(dr, outline(p), face);
    if (shade) side(dr, p, 0, -2.6, shade);
    within(dr, outline(p), () => paint(dr, brush(lip, 2.1, rnd, { start: 0.7, end: 0.05, peak: 0.25 }), light));
  };
  shellPetal([[-24.6, 3], [-25.4, -7], [-20.6, -15.6], [-11.6, -19.6], [-5, -14], [-10.4, -5.6], [-16.4, 2.4]], [[-24.8, -3], [-22.8, -11.6], [-16.6, -17.8], [-9.6, -19.6]], ROSE.shade, ROSE.base, null);
  shellPetal([[24.4, 1.4], [25.6, -8.6], [20.6, -16.6], [11, -20], [4.6, -14], [10, -5.4], [16.4, 1.8]], [[25.2, -5], [22.8, -13.6], [16.2, -18.8], [9, -20.4]], ROSE.shade, ROSE.base, null);
  shellPetal([[-11.6, -14.8], [-7, -21.6], [1.6, -24], [9.6, -21.8], [12.4, -15], [1.4, -12.2]], [[-9.2, -19.8], [-3.6, -23], [3.6, -23.8], [9.6, -21.4]], ROSE.shade, ROSE.base, null);
  // the cup, its mouth dark, the inner petals curled into a spiral
  const cupPts = roundish(0.6, -7.4, 11.6, 9.6, rnd, { wobble: 0.05, count: 20 });
  paint(dr, outline(cupPts), ROSE.base);
  side(dr, cupPts, -1.4, -1.6, ROSE.shade);
  const mouth = roundish(1, -11, 8.6, 4.2, rnd, { wobble: 0.08, count: 18, rot: -6 });
  paint(dr, outline(mouth), ROSE.deep);
  within(dr, outline(mouth), () => {
    paint(dr, brush([[-8, -9.6], [-3.4, -13.4], [4.4, -13.6], [8.6, -10.4]], 2.8, rnd, { start: 0.3, end: 0.4, peak: 0.5 }), ROSE.base);
    paint(dr, brush([[-6.4, -9.4], [-2, -12.2], [4, -12], [5.8, -9.8], [2.4, -8.2], [-1, -9.6]], 1.5, rnd, { start: 0.4, end: 0.2 }), ROSE.light);
    paint(dr, brush([[-0.6, -10.8], [1.6, -11.6], [2.8, -10.4]], 1, rnd), ROSE.base);
  });
  paint(dr, brush([[-11, -5.4], [-10, -11.6], [-4.4, -15.6]], 1.6, rnd, { start: 0.3, end: 0.2 }), ROSE.light);
  shellPetal([[-24, -0.6], [-21.4, 7.4], [-13.6, 13.6], [-3, 15.6], [3.4, 10.4], [-1.6, 4.2], [-9.4, 0.6], [-17.6, -1.4]], [[-23.6, -0.8], [-17.4, -1.2], [-10.6, 0.4], [-5, 2.8]], ROSE.base, ROSE.light, ROSE.shade);
  shellPetal([[23.8, -2.6], [20.6, 5.8], [12.4, 12.8], [1.6, 15.4], [-2.6, 10.6], [2.8, 4.4], [10.4, 0.2], [17.8, -2.2]], [[23.4, -2.8], [17.6, -2], [11.2, 0.2], [6, 2.8]], ROSE.base, ROSE.light, ROSE.shade);
  shellPetal([[-15.2, 8.6], [-8.4, 17.4], [1, 20.4], [10.6, 17.2], [14.6, 11.6], [8.4, 10.2], [0.4, 11], [-7.6, 9.4]], [[14.2, 11.8], [8.6, 10.6], [1.6, 11.2], [-4, 10.4]], ROSE.base, ROSE.light, ROSE.shade);
  dr.add('</g>');
}

// ─────────────────────────────────────────────────────────────────── pisîk

const GINGER: Tone = { base: '#dd8944', light: '#f0ad6b', shade: '#b0602e' };
const CREAM: Tone = { base: '#f5e6cb', light: '#fffaf0', shade: '#dcc39f' };
const CUSHION: Tone = { base: '#2e5872', light: '#46779a', shade: '#1d3d53' };

function pisik(dr: Drawing, rnd: Rnd): void {
  // the cushion: round, its top sewn round with a running stitch, a tassel at its corner
  const top = roundish(60, 89, 47, 14.5, rnd, { wobble: 0.025, count: 40 });
  floor(dr, rnd, 63, 99, 47, 12);
  paint(dr, outline(slab(top, 6.5)), CUSHION.shade);
  paint(dr, outline(top), CUSHION.base);
  side(dr, top, 2.2, 2.8, CUSHION.light, { grow: 0.97 });
  within(dr, outline(top), () => paint(dr, streaks(rnd, [14, 76, 106, 102], 30, 4, 9, 0.9), CUSHION.light, 0.3));
  let stitch = '';
  for (let i = 0; i < 44; i += 2) {
    const a0 = (i / 44) * Math.PI * 2;
    const a1 = ((i + 1) / 44) * Math.PI * 2;
    stitch += brush([[60 + 41 * Math.cos(a0), 89 + 10.6 * Math.sin(a0)], [60 + 41 * Math.cos(a1), 89 + 10.6 * Math.sin(a1)]], 0.8, rnd, { count: 4, start: 0.6, end: 0.6, peak: 0.5 });
  }
  paint(dr, stitch, '#e8d8b6');
  paint(dr, brush([[106, 93], [108.4, 97], [108, 103.6]], 2.2, rnd, { start: 0.6, end: 1, peak: 0.9 }), '#d9a443');
  paint(dr, ellipse(106.6, 93.4, 1.6, 1.4), '#b98426');

  // the kitten, curled with its back to the light: its body striped across, its hind leg
  const body = roundish(69, 72, 29, 18, rnd, { wobble: 0.04, rot: -5 });
  form(dr, body, GINGER, [-1.6, -2.6], [1.6, 2]);
  within(dr, outline(body), () => {
    let stripes = '';
    for (const [a, b] of [[[55, 56.6], [56.6, 63]], [[61.6, 54.8], [63, 62.2]], [[68.6, 54], [69, 60.4]], [[75.4, 54.4], [75.8, 62]], [[82.4, 57.2], [81, 63.2]], [[88.6, 62], [86, 67.8]]] as Array<[Pt, Pt]>) {
      stripes += brush([a, [(a[0] + b[0]) / 2 + (rnd() - 0.5), (a[1] + b[1]) / 2], b], 2 + rnd() * 0.8, rnd, { start: 0.9, end: 0.1, peak: 0.2 });
    }
    paint(dr, stripes, GINGER.shade);
    paint(dr, streaks(rnd, [42, 54, 98, 72], 30, -60, 3.4, 0.7), GINGER.light, 0.45);
    paint(dr, streaks(rnd, [44, 76, 98, 92], 18, -40, 3.4, 0.7), GINGER.shade, 0.35);
  });
  const haunch = roundish(85, 77, 13.6, 12, rnd, { wobble: 0.04 });
  form(dr, haunch, GINGER, [-1.6, -2.2], [1.2, 1.6]);
  within(dr, outline(haunch), () => {
    paint(dr, brush([[79, 68.5], [85, 66.6], [91, 70]], 2, rnd), GINGER.shade);
    paint(dr, brush([[78.4, 74], [85.4, 72.8], [92.6, 77]], 1.8, rnd), GINGER.shade);
  });
  // its head, laid on its paws and tipped toward us, its eyes shut
  dr.add('<g transform="rotate(-12 42 70)">');
  for (const [b0, tip, b1] of [[[30.6, 64.4], [29.4, 53], [40, 58.6]], [[44.4, 57.8], [52.4, 50.8], [53.8, 62]]] as Array<[Pt, Pt, Pt]>) {
    const ear = tremble(runs([b0, tip, b1], 1.4), rnd, 0.2);
    paint(dr, outline(ear), GINGER.base);
    side(dr, ear, 0.8, 0.8, GINGER.light);
    paint(dr, outline(scaleAbout(ear, (b0[0] + b1[0] + tip[0] * 1.4) / 3.4, (b0[1] + b1[1] + tip[1] * 1.4) / 3.4 + 1.2, 0.5)), '#e3a092');
  }
  const head = roundish(42, 70.5, 16, 13.4, rnd, { wobble: 0.03 });
  form(dr, head, GINGER, [-1.4, -2], [1.4, 1.6]);
  within(dr, outline(head), () => {
    let marks = '';
    for (const [a, b] of [[[37.8, 57.6], [38.6, 62.8]], [[42, 57], [42.2, 62.6]], [[46.2, 57.6], [45.4, 62.8]], [[26.4, 70], [32.4, 71.4]], [[57.4, 69.4], [52, 71]]] as Array<[Pt, Pt]>) {
      marks += brush([a, lerp(a, b, 0.5), b], 1.7, rnd, { start: 0.9, end: 0.15, peak: 0.25 });
    }
    paint(dr, marks, GINGER.shade);
    paint(dr, streaks(rnd, [28, 58, 56, 70], 14, -75, 2.8, 0.6), GINGER.light, 0.45);
    paint(dr, outline(roundish(42.4, 77.4, 7, 3.8, rnd, { wobble: 0.06 })), CREAM.base);
  });
  paint(dr, outline(tremble([[41, 73.8], [43.8, 73.6], [42.5, 75.4]], rnd, 0.15)), '#c47468');
  paint(dr, brush([[33.6, 69], [35.8, 70.2], [38.4, 69.6]], 0.75, rnd, { start: 0.4, end: 0.3, peak: 0.55 }), '#5a3426');
  paint(dr, brush([[45.8, 68.6], [48, 69.7], [50.6, 68.8]], 0.75, rnd, { start: 0.4, end: 0.3, peak: 0.55 }), '#5a3426');
  let whiskers = '';
  for (const [a, b] of [[[36, 76.4], [27.6, 74.4]], [[36, 77.6], [27.4, 78.2]], [[48.8, 76], [56.4, 73.4]], [[48.8, 77.2], [56.8, 77]]] as Array<[Pt, Pt]>) {
    whiskers += brush([a, lerp(a, b, 0.5), b], 0.42, rnd, { start: 1, end: 0.2 });
  }
  paint(dr, whiskers, '#fbf1df', 0.85);
  dr.add('</g>');
  // its front paws under its chin, and its tail curled round over them
  for (const [x, y] of [[37.4, 85.6], [48, 87]] as const) {
    const paw = roundish(x, y, 5.6, 3.4, rnd, { wobble: 0.03 });
    form(dr, paw, CREAM, [-1, -1.2], [0.8, 0.8]);
    paint(dr, brush([[x - 1.4, y + 0.4], [x - 1.2, y + 2.4]], 0.5, rnd) + brush([[x + 1.2, y + 0.4], [x + 1.4, y + 2.4]], 0.5, rnd), CREAM.shade);
  }
  const tail: Pt[] = [[98, 79], [95, 88.4], [81, 93], [63, 93.2], [49, 90.4], [39.6, 87.6]];
  const tailD = brush(tail, 8.6, rnd, { start: 0.85, end: 0.35, peak: 0.12, count: 28 });
  paint(dr, tailD, GINGER.base);
  within(dr, tailD, () => {
    paint(dr, brush(shift(tail, 0, -2.4), 2.4, rnd, { start: 0.6, end: 0.2, count: 24 }), GINGER.light);
    let rings = '';
    const spine = along(tail, 50);
    for (const t of [0.18, 0.34, 0.5, 0.66, 0.82]) {
      const p = spine[Math.round(t * 50)]!;
      rings += brush([[p[0] - 1.2, p[1] - 5], [p[0], p[1]], [p[0] + 0.6, p[1] + 5]], 2.2, rnd, { start: 0.4, end: 0.4, peak: 0.5 });
    }
    paint(dr, rings, GINGER.shade);
    paint(dr, brush(shift(tail, 0, 3), 2.4, rnd, { start: 0.6, end: 0.2, count: 24 }), GINGER.shade);
  });
}

// ─────────────────────────────────────────────────────────────────── belem

const WATER: Tone = { base: '#3f7c93', light: '#80b4c3', shade: '#2a5b70' };
const HULL: Tone = { base: '#a8452f', light: '#c96b4c', shade: '#76291f' };
const WOOD: Tone = { base: '#c99a62', light: '#e2bb84', shade: '#7c4f30' };
const LANTERN = '#ffd46b';

/**
 * A strip of water from x0 to x1 about row y, `h` deep, as a torn strip of paper: both edges ruffled in small uneven
 * waves, its ends drawn out to points.
 */
function waterStrip(rnd: Rnd, x0: number, x1: number, y: number, h: number, wave = 0.7): string {
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  const [p1, p2, p3] = [rnd() * 6.3, rnd() * 6.3, rnd() * 6.3];
  const steps = Math.round((x1 - x0) / 1.5);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const half = (h / 2) * Math.pow(Math.sin(Math.PI * t), 0.3);
    const ruffle = (ph: number, len: number): number => (Math.sin(x / len + ph) + 0.35 * Math.sin(x / (len * 0.47) + ph * 2)) * wave * Math.min(1, half);
    top.push([x, y - half + ruffle(p1, 2.6)]);
    bottom.push([x, y + half + ruffle(p2, 3.4) * 0.6 + Math.sin(x / 9 + p3) * 0.3]);
  }
  return outline(tremble([...top, ...bottom.reverse()], rnd, 0.2));
}

function belem(dr: Drawing, rnd: Rnd): void {
  // the water in torn strips: the far one pale with the sky in it, the near one lapping over the boat's foot
  paint(dr, waterStrip(rnd, 4, 116, 74.6, 8.6, 0.5), WATER.light);

  // the hull: gunwale, keel and a raked transom, the bow lifting; inside it the far gunwale, the boards and two thwarts
  const gunwale: Pt[] = [[16, 66], [32, 70.4], [52, 72.4], [72, 71], [90, 66.4], [104.6, 56.6]];
  const keel: Pt[] = [[104.6, 56.6], [97, 69.6], [83, 79.4], [62, 84], [40, 83.6], [24, 80.6], [18.6, 77.6]];
  const farGunwale: Pt[] = [[17.4, 62.6], [34, 65], [54, 66], [74, 64.6], [92, 60.6], [104.6, 56.6]];
  const hull = tremble([...along(gunwale, 18), ...along(keel, 18).slice(1), [17, 72]], rnd, 0.25);
  const inside = tremble([...along(farGunwale, 16), ...along(gunwale, 16).reverse().slice(1)], rnd, 0.2);
  paint(dr, outline(inside), WOOD.shade);
  within(dr, outline(inside), () => {
    paint(dr, outline(tremble(runs([[46.6, 74], [47.4, 63], [53.4, 63.4], [52.6, 74]], 1.6), rnd, 0.2)), WOOD.base);
    paint(dr, outline(tremble(runs([[20.6, 72], [21.6, 60], [26.4, 60.6], [25.6, 72]], 1.6), rnd, 0.2)), WOOD.base);
    paint(dr, brush([[19, 63.4], [56, 66.8], [100, 58.4]], 0.6, rnd), WOOD.light, 0.6);
  });
  // a coil of rope on the stern thwart
  for (const [rx, ry] of [[3.2, 1.3], [2, 0.8]] as const) {
    const coil: Pt[] = [];
    for (let i = 0; i <= 16; i++) coil.push([23.6 + rx * Math.cos((i / 16) * Math.PI * 2), 63.4 + ry * Math.sin((i / 16) * Math.PI * 2)]);
    paint(dr, brush(coil, 0.9, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 20 }), '#d8b06a');
  }
  paint(dr, outline(hull), HULL.base);
  within(dr, outline(hull), () => {
    paint(dr, brush(shift(gunwale, 0, 3.2), 5, rnd, { start: 0.9, end: 0.5, peak: 0.5, count: 24 }), HULL.light);
    paint(dr, brush(shift(along(keel, 12).reverse(), 0, -0.4), 6, rnd, { start: 0.3, end: 0.6, peak: 0.5, count: 24 }), HULL.shade);
    for (const dy of [6.4, 10.4]) paint(dr, brush(shift(gunwale.slice(0, 5), 0.4, dy), 0.6, rnd, { start: 0.4, end: 0.2, peak: 0.5, count: 20 }), HULL.shade, 0.8);
    paint(dr, streaks(rnd, [18, 68, 100, 84], 26, -6, 9, 0.7), HULL.shade, 0.3);
  });
  paint(dr, brush(gunwale, 2.2, rnd, { start: 0.9, end: 0.6, peak: 0.4, count: 24 }), '#e9d4a8');

  // the oar across the gunwale in its rowlock
  paint(dr, brush([[47, 62.6], [34, 70.6], [21, 81]], 1.9, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), WOOD.light);
  paint(dr, brush([[47, 63.4], [34, 71.4], [21, 81.8]], 0.7, rnd, { start: 0.9, end: 0.9, peak: 0.5 }), WOOD.shade, 0.8);
  paint(dr, ellipse(34.2, 70.8, 1, 0.9), '#3b2f2f');

  // the near water over the hull's foot: the boat's dark in it, ripples, the lantern's gold, and a darker lap in front
  const near = waterStrip(rnd, 1, 119, 88.6, 15.4, 0.8);
  paint(dr, near, WATER.base);
  within(dr, near, () => {
    let dark = '';
    for (const [x0, x1, y, w] of [[24, 88, 83.4, 1.9], [30, 80, 86.8, 1.6], [38, 72, 90, 1.3]] as const) dark += brush([[x0, y], [(x0 + x1) / 2, y + 0.4], [x1, y]], w, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, dark, WATER.shade);
    paint(dr, streaks(rnd, [2, 81, 118, 96], 22, 0, 10, 0.8), WATER.light, 0.3);
    let ripples = '';
    for (const [x, y, l] of [[10, 90.6, 9], [88, 89.6, 12], [70, 93.6, 10], [28, 93, 8], [104, 84.6, 6], [50, 94.4, 7], [16, 85.4, 5]] as const) {
      ripples += brush([[x - l / 2, y], [x, y - 0.3], [x + l / 2, y]], 1, rnd, { start: 0.2, end: 0.2, peak: 0.5 });
    }
    paint(dr, ripples, WATER.light);
    let gold = '';
    for (const [y, l] of [[83.4, 5], [86.4, 4.2], [89.4, 3.4], [92.4, 2.4], [95, 1.6]] as const) gold += brush([[101 - l / 2, y], [101, y - 0.2], [101 + l / 2, y]], 1.1, rnd, { start: 0.3, end: 0.3, peak: 0.5 });
    paint(dr, gold, '#f2c35c');
    paint(dr, brush([[16.6, 81.6], [21.4, 80.8], [26, 81.8]], 0.9, rnd, { start: 0.3, end: 0.3, peak: 0.5 }), WATER.light);
  });
  paint(dr, waterStrip(rnd, 14, 102, 97.2, 4.4, 0.5), WATER.shade);

  // the lantern at the bow on a crooked pole, and its light on the rail below it
  paint(dr, brush([[94, 64.4], [95.4, 50], [96.4, 37.6], [99.2, 35.2], [102.2, 36.6]], 1.3, rnd, { start: 1, end: 0.8, peak: 0.5 }), '#5a3a26');
  paint(dr, brush([[102.2, 36.8], [102.2, 39.4]], 0.4, rnd, { start: 1, end: 1 }), '#3b2f2f');
  paint(dr, outline(tremble(runs([[98.8, 50.4], [98.8, 43.2], [105.2, 43.2], [105.2, 50.4]], 1.2), rnd, 0.15)), LANTERN);
  paint(dr, outline(roundish(102, 47.2, 1.1, 1.7, rnd, { wobble: 0.05, count: 10 })), '#f08a32');
  paint(dr, outline(tremble([[98, 43.6], [102, 39.6], [106, 43.6]], rnd, 0.1)), '#3b2f2f');
  paint(dr, brush([[99.4, 43.4], [99.4, 50.4]], 0.5, rnd, { start: 1, end: 1 }) + brush([[104.6, 43.4], [104.6, 50.4]], 0.5, rnd, { start: 1, end: 1 }), '#3b2f2f');
  paint(dr, outline(roundish(102, 50.9, 3.6, 1, rnd, { count: 12 })), '#3b2f2f');
  paint(dr, brush([[88, 66.6], [96, 63.4], [102, 59.4]], 1.4, rnd), '#f2c35c', 0.7);
}

// ───────────────────────────────────────────────────────────────── mala gund

const MUD: Tone = { base: '#d8a46a', light: '#edc58c', shade: '#ae7845' };
const EARTH: Tone = { base: '#cdab7b', light: '#e2c596', shade: '#a98656' };
const DOOR: Tone = { base: '#8a5634', light: '#a86d44', shade: '#5f3820' };

function mal(dr: Drawing, rnd: Rnd): void {
  // the ground round it, the house's shadow on it, and tufts of grass
  const ground = roundish(60, 101, 55, 11, rnd, { wobble: 0.04, tremor: 0.6, count: 36 });
  paint(dr, outline(ground), EARTH.base);
  within(dr, outline(ground), () => {
    paint(dr, outline(tremble(runs([[77, 100.5], [101.5, 91.6], [116, 95.6], [92, 106]]), rnd, 0.6)), EARTH.shade);
    paint(dr, outline(roundish(38, 103.6, 14, 3, rnd)), EARTH.light);
  });
  // the walls: the face toward us in the light, the side in shade; the flat earth roof on top with its parapet
  const front = tremble(runs([[20, 45], [76, 48], [77.5, 100.5], [20.5, 98.6]]), rnd, 0.55);
  const sideWall = tremble(runs([[76, 48], [101, 39], [101.6, 91.6], [77.5, 100.5]]), rnd, 0.55);
  const roof = tremble(runs([[19.6, 45], [45, 36.6], [101.2, 39], [76, 48]]), rnd, 0.45);
  paint(dr, outline(sideWall), MUD.shade);
  within(dr, outline(sideWall), () => paint(dr, streaks(rnd, [78, 42, 101, 98], 9, -18, 7, 1), MUD.base, 0.3));
  paint(dr, outline(front), MUD.base);
  within(dr, outline(front), () => {
    paint(dr, streaks(rnd, [22, 54, 76, 97], 14, 2, 8, 1.2), MUD.light, 0.5);
    let straw = '';
    for (let i = 0; i < 16; i++) {
      const x = 23 + rnd() * 52;
      const y = 53 + rnd() * 44;
      const a = (rnd() - 0.5) * 1.2;
      straw += brush([[x, y], [x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8]], 0.35, rnd, { count: 4 });
    }
    paint(dr, straw, '#f3dca3', 0.85);
    paint(dr, brush([[18, 50], [48, 51.6], [78, 52.6]], 2.4, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), MUD.shade, 0.7);
  });
  paint(dr, outline(roof), MUD.light);
  paint(dr, brush([[45.6, 37.2], [74, 38], [100.6, 39.6]], 1.3, rnd, { start: 0.8, end: 0.8, peak: 0.5 }), MUD.shade, 0.8);
  paint(dr, brush([[19.4, 44.8], [34, 45.6], [48, 46.2], [62, 47], [76.2, 48]], 2, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 26 }), MUD.light);
  // a stack of hay on the roof against the winter, and a clay chimney with its smoke
  const hay = roundish(32.6, 38.6, 9, 5.6, rnd, { wobble: 0.06 });
  form(dr, hay, { base: '#ddb764', light: '#f0d38c', shade: '#b28c3e' }, [0, -2], [0.6, 1.6]);
  within(dr, outline(hay), () => paint(dr, streaks(rnd, [24, 33, 41, 44], 12, 70, 4, 0.5), '#b28c3e', 0.6));
  const chimney = tremble(runs([[55.6, 30.8], [61, 30.6], [61.4, 40.6], [55.2, 40.6]], 1.6), rnd, 0.25);
  paint(dr, outline(chimney), MUD.base);
  within(dr, outline(chimney), () => paint(dr, outline(runs([[58.6, 29], [63, 29], [63, 42], [58.6, 42]], 2)), MUD.shade));
  paint(dr, outline(roundish(58.3, 30.8, 2.8, 0.9, rnd, { count: 12 })), '#4a3326');
  for (const [pts, w] of [[[[58, 29.6], [55.6, 23], [59, 16.6], [55, 9.6], [57.6, 3.6]], 2.6], [[[59.6, 29], [62.8, 23.4], [61, 18.6]], 1.6]] as Array<[Pt[], number]>) {
    paint(dr, brush(shift(pts, 0.6, 0.2), w, rnd, { start: 0.6, end: 0.05, peak: 0.3 }), '#a99fae', 0.8);
    paint(dr, brush(pts, w, rnd, { start: 0.6, end: 0.05, peak: 0.3 }), '#d7d0da', 0.95);
  }
  // the ends of the poplar beams that carry the roof, under the parapet
  let ends = '';
  let lit = '';
  for (let i = 0; i < 6; i++) {
    const x = 25 + i * 9.2;
    const y = 49.6 + (x - 20) * 0.054;
    ends += ellipse(x, y, 1.5, 1.4);
    lit += ellipse(x - 0.4, y - 0.4, 0.6, 0.55);
  }
  for (const [x, y] of [[82.6, 45.8], [89.6, 43.2], [96.4, 40.8]] as const) ends += ellipse(x, y, 0.9, 1.3);
  paint(dr, ends, '#6a4428');
  paint(dr, lit, '#a87b4e');

  // the door: planks under a lintel, an iron ring to knock with, a stone step
  paint(dr, outline(tremble(runs([[30.4, 66.4], [47.8, 66.8], [47.8, 69.8], [30.2, 69.6]], 1.6), rnd, 0.3)), DOOR.shade);
  paint(dr, brush([[30.6, 66.8], [39, 67], [47.4, 67.2]], 0.8, rnd), DOOR.light);
  const door = tremble(runs([[32, 69.8], [44.8, 70], [45, 99.4], [32.2, 99.2]], 1.8), rnd, 0.3);
  paint(dr, outline(door), DOOR.base);
  within(dr, outline(door), () => {
    paint(dr, brush([[36.4, 70], [36.3, 85], [36.4, 99.4]], 0.6, rnd, { start: 1, end: 1 }) + brush([[40.6, 70], [40.7, 85], [40.6, 99.4]], 0.6, rnd, { start: 1, end: 1 }), DOOR.shade);
    paint(dr, brush([[33, 70.6], [33.2, 85], [33, 99]], 1.6, rnd, { start: 1, end: 1, peak: 0.5 }), DOOR.shade);
    paint(dr, brush([[38.4, 71], [38.5, 84], [38.4, 98]], 0.9, rnd), DOOR.light, 0.7);
  });
  dr.add(`<circle cx="42.8" cy="85.2" r="1.1" fill="none" stroke="#3a2a22" stroke-width="0.5"/>`);
  paint(dr, outline(roundish(38.6, 100.4, 9.2, 1.8, rnd, { count: 16 })), '#e3dccb');
  paint(dr, brush([[30.4, 101.4], [38.6, 102.2], [47, 101.4]], 0.9, rnd), '#c4b9a2');

  // the window, its frame painted blue, lamplight inside, geraniums in a pot on its sill
  const frame = tremble(runs([[55.4, 57.4], [68.6, 58], [68.6, 70.6], [55.4, 70.2]], 1.6), rnd, 0.25);
  paint(dr, outline(frame), '#3d6a94');
  const glass = tremble(runs([[57, 59.2], [67, 59.6], [67, 69], [57, 68.6]], 1.6), rnd, 0.2);
  paint(dr, outline(glass), '#f2b54e');
  within(dr, outline(glass), () => paint(dr, outline([[57, 59], [61.6, 59.2], [57, 64.6]]), '#f8e8cc'));
  paint(dr, brush([[62, 59.4], [62, 64], [62, 68.8]], 0.9, rnd, { start: 1, end: 1 }) + brush([[57, 64], [62, 64.1], [67, 64.2]], 0.9, rnd, { start: 1, end: 1 }), '#3d6a94');
  paint(dr, outline(tremble(runs([[53.8, 70.4], [70.2, 70.8], [70.2, 72.6], [53.8, 72.2]], 1.6), rnd, 0.2)), '#94643a');
  const pot = tremble(runs([[58.4, 66.2], [63.4, 66.2], [62.6, 70.6], [59.2, 70.6]], 1.2), rnd, 0.15);
  form(dr, pot, { base: '#c4643a', light: '#de8558', shade: '#93442a' }, [-1, 0], [0.5, 0]);
  let leaves = '';
  for (const [x, y, deg] of [[58.4, 65.2, -30], [61, 64.6, 10], [63.4, 65.4, 40], [60, 63, -60]] as const) leaves += outline(roundish(x, y, 1.6, 1.1, rnd, { count: 8, rot: deg, tremor: 0.1 }));
  paint(dr, leaves, '#5f8746');
  let petals = '';
  for (const [x, y] of [[59.2, 62.2], [61.8, 61.6], [60.6, 60.2], [63, 63]] as const) petals += outline(roundish(x, y, 1.15, 1.05, rnd, { count: 8, tremor: 0.1 }));
  paint(dr, petals, '#d43a3a');
  paint(dr, ellipse(60.4, 60.8, 0.35, 0.3) + ellipse(61.4, 61.4, 0.35, 0.3), '#f6a49a');

  // the ladder up to the roof, leant on the parapet, its poles standing above it
  const rails: Pt[][] = [
    [[84.2, 104], [83.2, 70], [82.2, 32.4]],
    [[91.6, 102.2], [90.4, 68], [89.2, 31.4]],
  ];
  let rungs = '';
  for (let y = 98; y > 36; y -= 6.6) {
    const t0 = (104 - y) / (104 - 32.4);
    const t1 = (102.2 - y) / (102.2 - 31.4);
    rungs += brush([[84.2 - t0 * 2, y], [87.6 - (t0 + t1), y - 0.5], [91.6 - t1 * 2.4, y - 0.6]], 1.1, rnd, { start: 0.9, end: 0.9, peak: 0.5, count: 6 });
  }
  paint(dr, rungs, WOOD.shade);
  for (const r of rails) {
    paint(dr, brush(r, 1.7, rnd, { start: 1, end: 0.85, peak: 0.5, count: 20 }), WOOD.base);
    paint(dr, brush(shift(r, -0.4, 0), 0.6, rnd, { start: 1, end: 0.85, peak: 0.5, count: 20 }), WOOD.light);
  }
  // tufts of grass at the walls' feet
  let grass = '';
  for (const [x, y, s] of [[13, 100, 1], [19.4, 103.6, 0.8], [104, 96, 1], [110.4, 99.4, 0.9], [72, 106, 0.7]] as const) {
    for (const a of [-0.5, -0.15, 0.2, 0.5]) grass += brush([[x, y], [x + Math.sin(a) * 2.5 * s, y - 2.8 * s], [x + Math.sin(a) * 4.6 * s, y - 4.8 * s]], 0.9 * s, rnd, { start: 1, end: 0.05, count: 6 });
  }
  paint(dr, grass, '#7d9a52');
}

// ──────────────────────────────────────────────────────────────────── heyv

const NIGHT: Tone = { base: '#283365', light: '#34427c', shade: '#1a2250' };
const MOON: Tone = { base: '#f2e5c1', light: '#fdf7e4', shade: '#d6c497' };
const CLOUD: Tone = { base: '#8c91c3', light: '#b8bce0', shade: '#6e73a8' };

function heyv(dr: Drawing, rnd: Rnd): void {
  const sky = roundish(60, 60, 54, 53, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), NIGHT.base);
  within(dr, outline(sky), () => {
    paint(dr, streaks(rnd, [6, 6, 114, 96], 34, -8, 16, 1.6), NIGHT.light, 0.4);
    paint(dr, outline(roundish(60, 50, 38, 37, rnd, { wobble: 0.04, tremor: 0.6 })), NIGHT.light);
    let stars = '';
    for (const [x, y, r] of [[22, 34, 1.1], [92, 22, 0.9], [100, 46, 1.2], [30, 18, 0.7], [16, 56, 0.8], [84, 12, 0.6], [104, 64, 0.7]] as const) stars += outline(roundish(x, y, r, r, rnd, { count: 7, tremor: 0.15 }));
    paint(dr, stars, '#f5e7bd');
    // the mountains, one ridge with snow on its peaks, and a village's lamps along its foot
    const ridge = outline(tremble([[0, 96], [12, 90], [24, 84.6], [33, 80], [40, 82.6], [50, 87.6], [60, 86], [72, 80.4], [82, 75.6], [90, 79], [100, 84], [112, 88], [120, 90], [120, 120], [0, 120]], rnd, 0.5));
    paint(dr, ridge, NIGHT.shade);
    within(dr, ridge, () => {
      paint(dr, outline(tremble([[26, 84.6], [33, 78.6], [40.4, 82], [37.6, 84.2], [35, 82.8], [32.4, 85.6], [29.6, 84]], rnd, 0.3)), '#7f88bb');
      paint(dr, outline(tremble([[74.6, 80.6], [82, 74.2], [91, 79.2], [88, 80.6], [85.4, 79.4], [82.6, 82], [79.6, 80.2], [77, 81.8]], rnd, 0.3)), '#7f88bb');
    });
    let lamps = '';
    for (const [x, y] of [[46, 96], [50, 97.4], [72, 94.6], [27, 100]] as const) lamps += ellipse(x, y, 0.75, 0.7);
    paint(dr, lamps, '#f4bf55');
  });
  side(dr, sky, 1.3, 1.3, NIGHT.light);
  // the moon: cream, a turn of shade at its lower edge and a paler one at its upper, its seas and craters soft blots
  const moon = roundish(60, 49, 27.5, 27.5, rnd, { wobble: 0.015, tremor: 0.3, count: 40 });
  paint(dr, outline(moon), MOON.base);
  within(dr, outline(moon), () => {
    side(dr, moon, 2.6, 2.6, MOON.light, { grow: 0.99 });
    let seas = '';
    for (const [x, y, rx, ry, rot] of [[51, 40, 8, 5.6, 20], [64, 37.6, 5.6, 4, -10], [63, 53.6, 9.6, 6, -18], [46, 54, 4.4, 3.4, 30], [72, 45, 4, 6, 10]] as const) seas += outline(roundish(x, y, rx, ry, rnd, { wobble: 0.1, rot, count: 14 }));
    paint(dr, seas, MOON.shade, 0.75);
    let stipple = '';
    for (let i = 0; i < 40; i++) stipple += touch(34 + rnd() * 52, 23 + rnd() * 52, 1.2 + rnd() * 1.4, 0.4 + rnd() * 0.3, rnd() * 180);
    paint(dr, stipple, MOON.shade, 0.45);
    for (const [x, y, r] of [[56.6, 64, 2.2], [42.4, 44.4, 1.6], [70, 61, 1.5], [60, 30, 1.3], [76, 52.6, 1.1]] as const) {
      const crater = roundish(x, y, r, r * 0.9, rnd, { count: 10, tremor: 0.15 });
      paint(dr, outline(crater), MOON.shade);
      side(dr, crater, -0.6, -0.6, MOON.light);
    }
    side(dr, moon, -3.2, -2.6, MOON.shade, { grow: 0.99 });
  });
  // clouds drifting across its foot in long strokes, lit along their tops
  const wisps: Array<[Pt[], number]> = [
    [[[15, 66.4], [32, 63.6], [52, 64.4], [73, 66.8]], 5.4],
    [[[25, 71], [44, 69.4], [65, 70.6]], 3.6],
    [[[57, 78.6], [74, 75.8], [92, 75.4], [107, 77.6]], 4.8],
    [[[66, 82], [82, 80.6], [99, 81.4]], 3],
  ];
  for (const [pts, w] of wisps) paint(dr, brush(pts, w, rnd, { start: 0.25, end: 0.15, peak: 0.45, count: 22 }), CLOUD.base);
  for (const [pts, w] of wisps) paint(dr, brush(shift(pts, 0.6, -w * 0.26), w * 0.36, rnd, { start: 0.2, end: 0.1, peak: 0.4, count: 18 }), CLOUD.light);
  for (const [pts, w] of wisps.slice(0, 1)) paint(dr, brush(shift(pts, -0.4, w * 0.3), w * 0.3, rnd, { start: 0.2, end: 0.1, peak: 0.55, count: 18 }), CLOUD.shade);
}

// ─────────────────────────────────────────────────────────────── rêya kadizê

const GALAXY_NIGHT: Tone = { base: '#201a45', light: '#2e2763', shade: '#17132f' };

function kadiz(dr: Drawing, rnd: Rnd): void {
  const sky = roundish(60, 60, 55, 54, rnd, { wobble: 0.035, tremor: 0.7, count: 44 });
  paint(dr, outline(sky), GALAXY_NIGHT.base);
  within(dr, outline(sky), () => paint(dr, streaks(rnd, [6, 6, 114, 114], 36, -24, 16, 1.6), GALAXY_NIGHT.light, 0.45));
  side(dr, sky, 1.3, 1.3, GALAXY_NIGHT.light);
  const TILT = -24;
  const SQUASH = 0.56;
  const place = (x: number, y: number): Pt => {
    const a = (TILT * Math.PI) / 180;
    const yy = y * SQUASH;
    return [60 + x * Math.cos(a) - yy * Math.sin(a), 60 + x * Math.sin(a) + yy * Math.cos(a)];
  };
  // the colours out from the heart: cream, gold, peach, rose, lilac, blue
  const COLOURS = ['#fff2d4', '#f5cd6e', '#f1a985', '#d98aa8', '#a89be2', '#86aee8'];
  const laid: string[] = COLOURS.map(() => '');
  const lay = (band: number, d: string): void => {
    const i = Math.max(0, Math.min(COLOURS.length - 1, band));
    laid[i] += d;
  };
  within(dr, outline(sky), () => {
    paint(dr, outline(turn(roundish(60, 60, 49, 27, rnd, { wobble: 0.08, tremor: 0.8 }), 60, 60, TILT)), GALAXY_NIGHT.light);
    // the dust between the arms, dim
    let dust = '';
    for (let i = 0; i < 80; i++) {
      const r = 6 + Math.sqrt(rnd()) * 42;
      const a = rnd() * Math.PI * 2;
      const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
      dust += touch(x, y, 1.8 + rnd() * 1.6, 0.6 + rnd() * 0.4, rnd() * 180);
    }
    paint(dr, dust, '#5a4f9e', 0.8);
    // stars far off
    let far = '';
    for (let i = 0; i < 34; i++) {
      const x = 8 + rnd() * 104;
      const y = 8 + rnd() * 104;
      const r = 0.3 + rnd() * rnd() * 0.9;
      far += ellipse(x, y, r, r);
    }
    paint(dr, far, '#efe6d0');
  });
  // the heart: gold touches laid thick over a small gold blot
  let glow = outline(turn(roundish(60, 60, 6.4, 4.2, rnd, { wobble: 0.14, count: 14, tremor: 0.6 }), 60, 60, TILT));
  for (let i = 0; i < 34; i++) {
    const r = Math.sqrt(rnd()) * 8;
    const a = rnd() * Math.PI * 2;
    const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
    glow += touch(x, y, 2.6 + rnd() * 1.6, 1.1 + rnd() * 0.4, TILT + (rnd() - 0.5) * 70);
  }
  paint(dr, glow, COLOURS[1]!);
  // two arms wound once and a half round the heart, laid on in touches of the brush along the way they turn
  for (let arm = 0; arm < 2; arm++) {
    const COUNT = 190;
    for (let s = 0; s < COUNT; s++) {
      const f = (s + rnd()) / COUNT;
      const theta = f * Math.PI * 1.55;
      const r = 6 + 40 * Math.pow(f, 0.9);
      const phi = theta + arm * Math.PI + 0.4;
      const rr = r + (rnd() - 0.5) * (3 + 9 * f);
      const swing = (rnd() - 0.5) * 0.14;
      const [x, y] = place(rr * Math.cos(phi + swing), rr * Math.sin(phi + swing));
      const [x2, y2] = place((rr + 1.4) * Math.cos(phi + swing + 0.12), (rr + 1.4) * Math.sin(phi + swing + 0.12));
      const deg = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      const len = 3.8 - 1.6 * f + rnd() * 0.9;
      lay(1 + Math.floor((f + (rnd() - 0.5) * 0.2) * (COLOURS.length - 1)), touch(x, y, len, len * 0.42, deg));
    }
  }
  for (let i = COLOURS.length - 1; i >= 1; i--) paint(dr, laid[i]!, COLOURS[i]!);
  let heart = '';
  for (let i = 0; i < 20; i++) {
    const r = Math.sqrt(rnd()) * 4.6;
    const a = rnd() * Math.PI * 2;
    const [x, y] = place(r * Math.cos(a), r * Math.sin(a));
    heart += touch(x, y, 2.2 + rnd() * 1.4, 1, TILT + (rnd() - 0.5) * 60);
  }
  paint(dr, outline(turn(roundish(60, 60, 3.4, 2.2, rnd, { wobble: 0.14, count: 10, tremor: 0.4 }), 60, 60, TILT)) + heart, COLOURS[0]!);
  // a few near stars, brighter
  let near = '';
  for (const [x, y, r] of [[24, 30, 1.2], [94, 86, 1.1], [98, 30, 0.9], [22, 88, 0.8]] as const) near += outline(roundish(x, y, r, r, rnd, { count: 7, tremor: 0.15 }));
  paint(dr, near, '#fff4da');
}

const PAINTERS: Readonly<Record<GiftArtId, (dr: Drawing, rnd: Rnd) => void>> = { cay, qehwe, gul, pisik, belem, mal, heyv, kadiz };
