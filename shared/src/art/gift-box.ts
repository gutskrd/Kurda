/**
 * The wrapped gift, drawn alike by both apps: a box in three-quarter view with an overhanging lid, a ribbon crossing
 * the top in perspective under a bow (two loops, a knot and two folded tails), a tag, and a soft contact shadow. Each
 * tier has its own wrapping, richer as it rises: kraft paper in red wool twine with a sprig and a pomegranate tag,
 * teal paper with a satin ribbon and a slim kilim band, an amethyst box cut with facets under a gold-edged ribbon, and
 * night-blue paper scattered with gold stars under a gold ribbon. It is built as layers with stable ids, back to front,
 * because the renderers move them (gift-box-motion.ts); `giftBoxSvg` is the whole picture for a still. Flat cut-out
 * style: every plane is one flat colour, and the only gradients are the light and the ground shadow.
 */
import type { GiftTier } from '../gifts.js';
import { HUES } from '../hues.js';
import { GOLD } from './palette.js';
import { CANVAS, escapeXml, n, n2, prefixFor, radialAt, type Pt } from './svg.js';

/** The layers, back to front. */
export const GIFT_BOX_PARTS = [
  'shadow',
  'splash',
  'body',
  'ribbon',
  'lidShade',
  'inside',
  'light',
  'lid',
  'tag',
  'tailLeft',
  'tailRight',
  'loopLeft',
  'loopRight',
  'knot',
  'glint',
  'sparks',
] as const;
export type GiftBoxPart = (typeof GIFT_BOX_PARTS)[number];

/** The parts that ride on the lid, so a renderer lifts them off together. */
export const GIFT_BOX_LID_PARTS: readonly GiftBoxPart[] = ['lid', 'tag', 'tailLeft', 'tailRight', 'loopLeft', 'loopRight', 'knot'];

/** A box in the drawing's units. */
export interface GiftBoxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One layer: its markup (defs and shapes, no `<svg>`) and the box round everything it draws. */
export interface GiftBoxLayer {
  id: GiftBoxPart;
  box: GiftBoxBox;
  markup: string;
}

export interface GiftBoxDrawing {
  tier: GiftTier;
  /** The canvas every layer is drawn in. */
  view: GiftBoxBox;
  /** Where each part turns and scales: the box's foot, the lid's middle, the knot, the tag's hole, the box's mouth. */
  pivots: Readonly<Record<GiftBoxPart, Pt>>;
  layers: Readonly<Record<GiftBoxPart, GiftBoxLayer>>;
}

export interface GiftBoxOptions {
  /** Display width in pixels; below `GIFT_BOX_SMALL` the fine detail goes, below `GIFT_BOX_TINY` most of the rest. */
  size?: number;
  idPrefix?: string;
  /** A season's gift: a Newroz flame for its tag. A legendary gift is one unless told otherwise. */
  limited?: boolean;
}

export interface GiftBoxSvgOptions extends GiftBoxOptions {
  tier: GiftTier;
  /** Every layer, for a page that shows and moves them itself; otherwise only what the shut box shows. */
  allLayers?: boolean;
  /** The accessible label. */
  title?: string;
}

export const GIFT_BOX_VIEW: GiftBoxBox = { x: 0, y: 0, w: CANVAS, h: CANVAS };
/** Below this width in pixels the textures, small stars and grain go; below `GIFT_BOX_TINY` the box keeps only its big shapes. */
export const GIFT_BOX_SMALL = 72;
export const GIFT_BOX_TINY = 44;

// ─────────────────────────────────────────────────────────────── the view

/** The box seen from a little above and turned a third of the way, so its front, its right side and its top all show. */
const YAW = (31 * Math.PI) / 180;
const PITCH = (23 * Math.PI) / 180;
const CY = Math.cos(YAW);
const SY = Math.sin(YAW);
const CP = Math.cos(PITCH);
const SP = Math.sin(PITCH);

/** The box's width, depth and height, the lid's height and how far it overhangs, in the drawing's units. */
const W = 60;
const D = 60;
const H = 54;
const LID = 14;
const OVER = 3;
/** Where the middle of the box's footprint lands on the canvas. */
const GROUND: Pt = [60, 86];

/** A point of the box (x across, y up, z toward us from its middle) on the canvas. */
function at(x: number, y: number, z: number): Pt {
  const across = x * CY - z * SY;
  const toward = x * SY + z * CY;
  return [GROUND[0] + across, GROUND[1] - y * CP + toward * SP];
}

/** The planes, each as a map from its own (u across, v up) to the canvas; u starts at its left edge as we see it. */
type Plane = (u: number, v: number) => Pt;
const front = (z: number, x0: number): Plane => (u, v) => at(x0 + u, v, z);
const side = (x: number, z0: number): Plane => (u, v) => at(x, v, z0 - u);
/** The top at height y: u along the front edge, v from the front edge back. */
const top = (y: number, x0: number, z0: number): Plane => (u, v) => at(x0 + u, y, z0 - v);

const BODY_TOP = H - 1;
const SEAM = H - LID;
const BODY_FRONT = front(D / 2, -W / 2);
const BODY_SIDE = side(W / 2, D / 2);
const LW = W + OVER * 2;
const LD = D + OVER * 2;
const LID_FRONT = front(LD / 2, -LW / 2);
const LID_SIDE = side(LW / 2, LD / 2);
const LID_TOP = top(H, -LW / 2, LD / 2);

const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
const poly = (pts: readonly Pt[]): string => `M${pts.map(p).join('L')}Z`;
const line = (pts: readonly Pt[]): string => `M${pts.map(p).join('L')}`;
/** A rectangle of a plane, from (u0, v0) to (u1, v1). */
const rect = (plane: Plane, u0: number, v0: number, u1: number, v1: number): string => poly([plane(u0, v0), plane(u1, v0), plane(u1, v1), plane(u0, v1)]);

/** The knot sits where the ribbons cross on the lid's top; `KNOT_AT` is that crossing as (x, z). */
const KNOT_LIFT = 3;

// ─────────────────────────────────────────────────────────────── colours

/** A paper or a ribbon in its planes: the lit top, the face toward us, the side turned away, and its darkest tone. */
export interface GiftBoxTone {
  light: string;
  face: string;
  shade: string;
  deep: string;
}

/**
 * Every colour the box is drawn in. The papers and ribbons are Hevalo's own hues (hues.ts) and the badges' sun gold
 * (palette.ts), each with the steps a flat plane needs; the light, the leaf and the night are the few the art adds.
 */
export const GIFT_BOX_COLOURS = {
  kraft: { light: '#dcb07a', face: '#c4915a', shade: '#9f6c3a', deep: '#6e4521' },
  wool: { light: '#e65a68', face: HUES.light.red.base, shade: '#a3222e', deep: HUES.light.red.deep },
  teal: { light: '#38c7c0', face: HUES.light.teal.base, shade: '#067a7c', deep: HUES.light.teal.deep },
  satin: { light: '#f0646e', face: '#d1303d', shade: '#9c1a2a', deep: HUES.light.red.deep },
  cream: { light: '#fff8e8', face: '#f6e7c8', shade: '#d9c3a0', deep: '#a8875c' },
  amethyst: { light: '#9a6cf0', face: '#7444d6', shade: '#4f2aa6', deep: '#2c1466' },
  rose: { light: '#ff8cc8', face: HUES.light.pink.base, shade: '#9b2468', deep: HUES.light.pink.deep },
  night: { light: '#34407f', face: '#222b5c', shade: '#161c40', deep: '#0b0f26' },
  gold: { light: GOLD.light, face: GOLD.mid, shade: GOLD.dark, deep: GOLD.deep },
  leaf: { light: '#9ad66a', face: '#5fae4c', shade: '#3c7d36', deep: '#24521f' },
  pomegranate: { light: '#e8566a', face: '#c8243f', shade: '#8f1630', deep: '#5a0c1e' },
  flame: { light: '#ffe36b', face: '#ff8a1f', shade: '#e0441f', deep: '#8a2108' },
  light: { light: '#ffffff', face: '#fff6cc', shade: '#ffd75a', deep: '#ffc43a' },
} as const satisfies Record<string, GiftBoxTone>;
const C = GIFT_BOX_COLOURS;

/** How the bow is tied: a cord of wool in loops, or a flat ribbon. */
type Bow = 'twine' | 'satin';
type TagShape = 'pomegranate' | 'flame' | 'star' | 'round';

interface Wrap {
  paper: GiftBoxTone;
  ribbon: GiftBoxTone;
  bow: Bow;
  /** A thin gold line along the ribbon's edges. */
  goldEdge: boolean;
  tag: TagShape;
  tagTone: GiftBoxTone;
  /** What is printed on or cut into the paper. */
  pattern: 'fibre' | 'kilim' | 'facets' | 'stars';
  sprig: boolean;
}

/** Each tier's wrapping, richer as it rises. */
export const GIFT_BOX_WRAPS: Readonly<Record<GiftTier, Wrap>> = {
  common: { paper: C.kraft, ribbon: C.wool, bow: 'twine', goldEdge: false, tag: 'pomegranate', tagTone: C.pomegranate, pattern: 'fibre', sprig: true },
  rare: { paper: C.teal, ribbon: C.satin, bow: 'satin', goldEdge: false, tag: 'round', tagTone: C.cream, pattern: 'kilim', sprig: false },
  legendary: { paper: C.amethyst, ribbon: C.rose, bow: 'satin', goldEdge: true, tag: 'pomegranate', tagTone: C.gold, pattern: 'facets', sprig: false },
  grand: { paper: C.night, ribbon: C.gold, bow: 'satin', goldEdge: false, tag: 'star', tagTone: C.gold, pattern: 'stars', sprig: false },
};

// ─────────────────────────────────────────────────────────────── a layer

/** How much is drawn: 0 the tiny box, 1 the small one, 2 the whole. */
type Detail = 0 | 1 | 2;
const detailOf = (size: number): Detail => (size < GIFT_BOX_TINY ? 0 : size < GIFT_BOX_SMALL ? 1 : 2);

/** A layer being built: its own ids, defs and shapes. */
class Layer {
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private count = 0;
  constructor(private readonly prefix: string) {}
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
  clip(d: string): string {
    const id = this.id('c');
    this.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return id;
  }
  markup(): string {
    return (this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '') + this.body.join('');
  }
}

interface Brush {
  wrap: Wrap;
  detail: Detail;
  /** The edge round the box's planes, thicker as it gets smaller so it stays a line. */
  edge: number;
  /** A cord's width. */
  cord: number;
}

const fill = (d: string, colour: string, more = ''): string => `<path d="${d}" fill="${colour}"${more}/>`;
const stroke = (d: string, colour: string, width: number, more = ''): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;

/** A four-pointed star, `r` from its middle to a point. */
function sparkle([x, y]: Pt, r: number): string {
  const w = r * 0.26;
  return `M${n(x)} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${n(y)}Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${n(y)}Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - r)}Z`;
}

/** A point `r` from (cx, cy), `deg` degrees clockwise from straight up. */
const spoke = ([cx, cy]: Pt, r: number, deg: number): Pt => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];

const add = ([x, y]: Pt, dx: number, dy: number): Pt => [x + dx, y + dy];
const mid = (a: Pt, b: Pt, t = 0.5): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ─────────────────────────────────────────────────────────────── where things are

/** The ribbons' middle lines: across the box at `RIBBON_X` (front to back) and `RIBBON_Z` (side to side). */
interface Lines {
  x: number;
  z: number;
  half: number;
}
const linesOf = (wrap: Wrap): Lines => (wrap.bow === 'twine' ? { x: -6, z: 5, half: 2.6 } : { x: 0, z: 0, half: 5 });

/** The knot: on the lid's top where the ribbons cross, raised a little. */
const knotOf = (l: Lines): Pt => add(at(l.x, H, l.z), 0, -KNOT_LIFT);

const MOUTH: Pt = at(0, BODY_TOP, 0);
const LID_MIDDLE: Pt = at(0, H - LID / 2, 0);
/** The point the box stands on, kept still while it squashes and stretches: the front corner's foot, in the middle. */
export const GIFT_BOX_FOOT: Pt = [GROUND[0], at(W / 2, 0, D / 2)[1] - 4];

// ─────────────────────────────────────────────────────────────── the layers

function shadowLayer(l: Layer): GiftBoxBox {
  const id = l.id('s');
  const [cx, cy] = add(GROUND, 3, 7);
  l.def(
    radialAt(
      id,
      [
        [0, '#000000', 0.34],
        [0.6, '#000000', 0.16],
        [1, '#000000', 0],
      ],
      cx,
      cy,
      50,
    ),
  );
  l.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="50" ry="14" fill="url(#${id})"/>`);
  return { x: cx - 50, y: cy - 14, w: 100, h: 28 };
}

/** The gold pieces thrown out where the box lands, round its foot on either side. */
function splashLayer(l: Layer): GiftBoxBox {
  const left = at(-W / 2, 0, D / 2);
  const right = at(W / 2, 0, -D / 2);
  const pieces: readonly (readonly [Pt, number, number, number, number])[] = [
    [left, -9, 4, 2.6, 30],
    [left, -3, 8, 1.9, -20],
    [left, -14, -1, 1.7, 60],
    [right, 8, 4, 2.4, -40],
    [right, 13, -1, 1.7, 20],
    [right, 4, 8, 2.2, 70],
  ];
  const pts: Pt[] = [];
  for (const [base, dx, dy, r, turn] of pieces) {
    const c: Pt = add(base, dx, dy);
    const diamond = [spoke(c, r * 1.5, turn), spoke(c, r, turn + 90), spoke(c, r * 1.5, turn + 180), spoke(c, r, turn + 270)];
    l.add(fill(poly(diamond), C.gold.face));
    l.add(fill(poly([diamond[0]!, diamond[1]!, c]), C.gold.light));
    pts.push(...diamond);
  }
  return boxOf(pts, 1);
}

/** The box's two walls we see, lit and turned away, with what the paper carries. */
function bodyLayer(l: Layer, b: Brush): GiftBoxBox {
  const { paper } = b.wrap;
  const frontFace = rect(BODY_FRONT, 0, 0, W, BODY_TOP);
  const sideFace = rect(BODY_SIDE, 0, 0, D, BODY_TOP);
  l.add(fill(sideFace, paper.shade));
  l.add(fill(frontFace, paper.face));
  patternOn(l, b, 'body');
  l.add(stroke(poly([BODY_FRONT(0, 0), BODY_FRONT(0, BODY_TOP), BODY_SIDE(D, BODY_TOP), BODY_SIDE(D, 0), BODY_SIDE(0, 0)]), paper.deep, b.edge));
  if (b.detail > 0) l.add(stroke(line([BODY_SIDE(0, 0.5), BODY_SIDE(0, BODY_TOP)]), paper.deep, b.edge * 0.6, ' stroke-opacity="0.5"'));
  return boxOf([BODY_FRONT(0, 0), BODY_FRONT(0, BODY_TOP), BODY_SIDE(D, BODY_TOP), BODY_SIDE(D, 0), BODY_SIDE(0, 0)], b.edge);
}

/** The ribbon or twine down the box's walls, which pulls loose as the lid goes. */
function ribbonLayer(l: Layer, b: Brush): GiftBoxBox {
  const lines = linesOf(b.wrap);
  const { ribbon } = b.wrap;
  const pts: Pt[] = [];
  if (b.wrap.bow === 'twine') {
    // Two turns of cord, each round the box both ways.
    for (const off of [-1.3, 1.3]) {
      const fx = lines.x + W / 2 + off;
      const sz = D / 2 - lines.z + off;
      cord(l, b, [BODY_FRONT(fx, -0.5), BODY_FRONT(fx, SEAM + 1)], ribbon.face);
      cord(l, b, [BODY_SIDE(sz, -0.5), BODY_SIDE(sz, SEAM + 1)], ribbon.shade);
      pts.push(BODY_FRONT(fx, -0.5), BODY_FRONT(fx, SEAM + 1), BODY_SIDE(sz, -0.5), BODY_SIDE(sz, SEAM + 1));
    }
  } else {
    const fx = lines.x + W / 2;
    const sz = D / 2 - lines.z;
    const h = lines.half;
    const strips: readonly [Plane, number, string][] = [
      [BODY_SIDE, sz, ribbon.shade],
      [BODY_FRONT, fx, ribbon.face],
    ];
    for (const [plane, u, colour] of strips) {
      l.add(fill(rect(plane, u - h, 0, u + h, SEAM + 1), colour));
      pts.push(plane(u - h, 0), plane(u + h, SEAM + 1));
      if (b.wrap.goldEdge) for (const e of [u - h + 0.6, u + h - 0.6]) l.add(stroke(line([plane(e, 0.4), plane(e, SEAM + 1)]), C.gold.light, b.detail === 2 ? 1 : 1.4));
    }
    // The satin's sheen: one light stripe down the strip toward us.
    if (b.detail > 0 && !b.wrap.goldEdge) l.add(fill(rect(BODY_FRONT, fx - h + 1.3, 0.6, fx - h + 2.7, SEAM + 1), ribbon.light));
    l.add(stroke(rect(BODY_FRONT, fx - h, 0, fx + h, SEAM + 1), ribbon.deep, b.edge * 0.55, ' stroke-opacity="0.55"'));
  }
  return boxOf(pts, 3);
}

/** The lid's own shade on the walls under its overhang. */
function lidShadeLayer(l: Layer, b: Brush): GiftBoxBox {
  const { paper } = b.wrap;
  const band = 3.2;
  l.add(fill(rect(BODY_SIDE, 0, SEAM - band, D, SEAM + 0.5), paper.deep, ' fill-opacity="0.55"'));
  l.add(fill(rect(BODY_FRONT, 0, SEAM - band, W, SEAM + 0.5), paper.shade));
  return boxOf([BODY_FRONT(0, SEAM - band), BODY_SIDE(D, SEAM + 0.5), BODY_SIDE(0, SEAM - band)], 1);
}

/** The open box's mouth: the two far walls inside, seen once the lid is off. */
function insideLayer(l: Layer, b: Brush): GiftBoxBox {
  const { paper } = b.wrap;
  const t = 1.6;
  const rim = [at(-W / 2, BODY_TOP, D / 2), at(W / 2, BODY_TOP, D / 2), at(W / 2, BODY_TOP, -D / 2), at(-W / 2, BODY_TOP, -D / 2)];
  const inner = [at(-W / 2 + t, BODY_TOP, D / 2 - t), at(W / 2 - t, BODY_TOP, D / 2 - t), at(W / 2 - t, BODY_TOP, -D / 2 + t), at(-W / 2 + t, BODY_TOP, -D / 2 + t)];
  l.add(fill(poly(rim), paper.light));
  l.add(fill(poly(inner), paper.deep));
  // The far wall on the left catches what light falls in.
  const lit = [inner[3]!, inner[0]!, add(inner[0]!, 0, 10), add(inner[3]!, 0, 10)];
  l.add(`<g clip-path="url(#${l.clip(poly(inner))})">${fill(poly(lit), paper.shade)}</g>`);
  return boxOf(rim, 1);
}

/** The light pouring out of the open box: its mouth lit, a bloom, and a fan of beams rising. */
function lightLayer(l: Layer): GiftBoxBox {
  const [cx, cy] = MOUTH;
  const glow = l.id('g');
  l.def(
    radialAt(
      glow,
      [
        [0, C.light.face, 0.95],
        [0.45, C.light.shade, 0.55],
        [1, C.light.deep, 0],
      ],
      cx,
      cy - 8,
      46,
    ),
  );
  l.add(`<circle cx="${n(cx)}" cy="${n(cy - 8)}" r="46" fill="url(#${glow})"/>`);
  const t = 1.6;
  l.add(fill(poly([at(-W / 2 + t, BODY_TOP, D / 2 - t), at(W / 2 - t, BODY_TOP, D / 2 - t), at(W / 2 - t, BODY_TOP, -D / 2 + t), at(-W / 2 + t, BODY_TOP, -D / 2 + t)]), C.light.face));
  // Beams: wedges up out of the mouth, every other one shorter, flat and pale.
  const beams: string[] = [];
  for (const [deg, reach, half] of [
    [-58, 40, 5],
    [-30, 52, 6],
    [0, 60, 7],
    [30, 52, 6],
    [58, 40, 5],
  ] as const) {
    const root = add(MOUTH, Math.sin((deg * Math.PI) / 180) * 10, 0);
    beams.push(poly([add(root, -2.5, 0), spoke(root, reach, deg - half), spoke(root, reach, deg + half), add(root, 2.5, 0)]));
  }
  l.add(fill(beams.join(''), C.light.shade, ' fill-opacity="0.4"'));
  l.add(fill(beams.join(''), C.light.face, ' fill-opacity="0.35"'));
  l.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="22" ry="8" fill="${C.light.light}" fill-opacity="0.9"/>`);
  return { x: cx - 46, y: cy - 66, w: 92, h: 104 };
}

/** The lid: its top, its rim toward us and the rim turned away, the ribbon over it, and the sprig under the twine. */
function lidLayer(l: Layer, b: Brush): GiftBoxBox {
  const { paper, ribbon } = b.wrap;
  const lines = linesOf(b.wrap);
  const topFace = rect(LID_TOP, 0, 0, LW, LD);
  const frontFace = rect(LID_FRONT, 0, SEAM, LW, H);
  const sideFace = rect(LID_SIDE, 0, SEAM, LD, H);
  l.add(fill(sideFace, paper.shade));
  l.add(fill(frontFace, paper.face));
  l.add(fill(topFace, paper.light));
  patternOn(l, b, 'lid');
  const fx = lines.x + LW / 2;
  const sz = LD / 2 - lines.z;
  // The top's u runs along x and its v from the front edge back, so the ribbon across it sits at x and at z.
  const tu = lines.x + LW / 2;
  const tv = LD / 2 - lines.z;
  if (b.wrap.bow === 'twine') {
    for (const off of [-1.3, 1.3]) {
      cord(l, b, [LID_FRONT(fx + off, SEAM - 0.5), LID_FRONT(fx + off, H), LID_TOP(tu + off, 0), LID_TOP(tu + off, LD)], ribbon.face, [ribbon.face, ribbon.face, ribbon.light]);
      cord(l, b, [LID_SIDE(sz + off, SEAM - 0.5), LID_SIDE(sz + off, H), LID_TOP(LW, tv + off), LID_TOP(0, tv + off)], ribbon.shade, [ribbon.shade, ribbon.shade, ribbon.light]);
    }
  } else {
    const h = lines.half;
    l.add(fill(rect(LID_SIDE, sz - h, SEAM, sz + h, H), ribbon.shade));
    l.add(fill(rect(LID_FRONT, fx - h, SEAM, fx + h, H), ribbon.face));
    l.add(fill(rect(LID_TOP, tu - h, 0, tu + h, LD), ribbon.light));
    l.add(fill(rect(LID_TOP, 0, tv - h, LW, tv + h), ribbon.light));
    if (b.detail > 0 && !b.wrap.goldEdge) l.add(fill(rect(LID_FRONT, fx - h + 1.3, SEAM, fx - h + 2.7, H - 0.6), ribbon.light));
    if (b.wrap.goldEdge) {
      const g = b.detail === 2 ? 1 : 1.4;
      for (const e of [fx - h + 0.6, fx + h - 0.6]) l.add(stroke(line([LID_FRONT(e, SEAM), LID_FRONT(e, H), LID_TOP(e, 0), LID_TOP(e, LD)]), C.gold.light, g));
      for (const e of [sz - h + 0.6, sz + h - 0.6]) l.add(stroke(line([LID_SIDE(e, SEAM), LID_SIDE(e, H), LID_TOP(LW, LD - e), LID_TOP(0, LD - e)]), C.gold.face, g));
    }
    l.add(stroke(rect(LID_TOP, tu - h, 0, tu + h, LD), ribbon.shade, b.edge * 0.5, ' stroke-opacity="0.45"'));
    l.add(stroke(rect(LID_TOP, 0, tv - h, LW, tv + h), ribbon.shade, b.edge * 0.5, ' stroke-opacity="0.45"'));
  }
  const outline = [LID_FRONT(0, SEAM), LID_FRONT(0, H), LID_TOP(0, LD), LID_TOP(LW, LD), LID_SIDE(LD, SEAM), LID_SIDE(0, SEAM)];
  l.add(stroke(poly(outline), paper.deep, b.edge));
  // The lid's front edge catches the light.
  if (b.detail > 0) l.add(stroke(line([LID_FRONT(0.8, H - 0.4), LID_FRONT(LW, H - 0.4), LID_SIDE(LD - 0.8, H - 0.4)]), paper.light, 1.1, ' stroke-opacity="0.8"'));
  if (b.wrap.sprig) sprig(l, b, knotOf(lines));
  return boxOf(outline, b.edge);
}

/** A sprig of mint tucked under the twine, lying across the lid toward its right corner. */
function sprig(l: Layer, b: Brush, knot: Pt): void {
  const stem: Pt[] = [add(knot, -10, 5), add(knot, 4, -1), add(knot, 18, -5), add(knot, 28, -6)];
  l.add(stroke(`M${p(stem[0]!)}C${p(stem[1]!)} ${p(stem[2]!)} ${p(stem[3]!)}`, C.leaf.deep, b.detail === 0 ? 1.8 : 1.2));
  const leaves: readonly (readonly [number, number, number])[] =
    b.detail === 0
      ? [
          [0.55, -1, 5],
          [0.85, 1, 5],
          [1, 0, 5.5],
        ]
      : [
          [0.35, -1, 4],
          [0.42, 1, 4],
          [0.6, -1, 4.6],
          [0.68, 1, 4.6],
          [0.84, -1, 5],
          [0.9, 1, 5],
          [1, 0, 5.5],
        ];
  const bez = (t: number): Pt => {
    const [a, c1, c2, d] = stem as [Pt, Pt, Pt, Pt];
    const u = 1 - t;
    return [
      u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * d[1],
    ];
  };
  for (const [t, sideOf, len] of leaves) {
    const base = bez(t);
    const ahead = bez(Math.min(1, t + 0.05));
    const dir = Math.atan2(ahead[1] - base[1], ahead[0] - base[0]);
    const turn = dir + sideOf * 0.9;
    const tip: Pt = [base[0] + Math.cos(turn) * len, base[1] + Math.sin(turn) * len];
    const w = len * 0.42;
    const nx = -Math.sin(turn) * w;
    const ny = Math.cos(turn) * w;
    const m = mid(base, tip, 0.45);
    const leaf = `M${p(base)}Q${n(m[0] + nx)} ${n(m[1] + ny)} ${p(tip)}Q${n(m[0] - nx)} ${n(m[1] - ny)} ${p(base)}Z`;
    l.add(fill(leaf, sideOf > 0 ? C.leaf.shade : C.leaf.face));
    if (b.detail === 2) l.add(stroke(line([base, mid(base, tip, 0.7)]), sideOf > 0 ? C.leaf.face : C.leaf.light, 0.7));
  }
}

/** A run of cord: a strand of wool along the points, in its face colour or a colour per leg, twisted when large. */
function cord(l: Layer, b: Brush, pts: readonly Pt[], colour: string, legs?: readonly string[]): void {
  if (!legs) {
    l.add(stroke(line(pts), colour, b.cord));
  } else {
    for (let i = 0; i < pts.length - 1; i++) l.add(stroke(line([pts[i]!, pts[i + 1]!]), legs[i] ?? colour, b.cord));
  }
  if (b.detail < 2) return;
  // The twist of the wool: short dark ticks across the cord.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ux = (c[0] - a[0]) / len;
    const uy = (c[1] - a[1]) / len;
    const ticks: string[] = [];
    for (let s = 2; s < len - 1; s += 3.2) {
      const q: Pt = [a[0] + ux * s, a[1] + uy * s];
      const w = b.cord * 0.45;
      ticks.push(`M${p([q[0] - uy * w - ux * 0.6, q[1] + ux * w - uy * 0.6])}L${p([q[0] + uy * w + ux * 0.6, q[1] - ux * w + uy * 0.6])}`);
    }
    l.add(stroke(ticks.join(''), C.wool.deep, 0.5, ' stroke-opacity="0.55"'));
  }
}

/** What the paper carries, on the body's walls or on the lid. */
function patternOn(l: Layer, b: Brush, where: 'body' | 'lid'): void {
  const { pattern, paper } = b.wrap;
  if (pattern === 'fibre') {
    if (b.detail < 2) return;
    // Kraft's fibres: a few faint streaks in the paper.
    const streaks: readonly (readonly [Plane, number, number, number])[] =
      where === 'body'
        ? [
            [BODY_FRONT, 6, 30, 9],
            [BODY_FRONT, 34, 14, 7],
            [BODY_FRONT, 40, 32, 6],
            [BODY_SIDE, 30, 22, 8],
          ]
        : [
            [LID_FRONT, 40, SEAM + 6, 6],
            [LID_TOP, 10, 44, 8],
            [LID_TOP, 44, 14, 7],
          ];
    for (const [plane, u, v, len] of streaks) {
      const colour = plane === BODY_SIDE ? paper.deep : plane === LID_TOP ? paper.face : paper.light;
      l.add(stroke(line([plane(u, v), plane(u + len, v + 0.6)]), colour, 0.9, ' stroke-opacity="0.45"'));
    }
    return;
  }
  if (pattern === 'kilim') {
    if (where === 'body') kilimBand(l, b);
    return;
  }
  if (pattern === 'facets') {
    facets(l, b, where);
    return;
  }
  stars(l, b, where);
}

/** A slim woven band round the body: cream between two red lines, with a row of hooked diamonds. */
function kilimBand(l: Layer, b: Brush): void {
  const v0 = 12;
  const v1 = 22;
  const walls: readonly [Plane, number, GiftBoxTone][] = [
    [BODY_SIDE, D, C.cream],
    [BODY_FRONT, W, C.cream],
  ];
  for (const [plane, len, tone] of walls) {
    const shaded = plane === BODY_SIDE;
    l.add(fill(rect(plane, 0, v0, len, v1), shaded ? tone.shade : tone.face));
    for (const v of [v0 + 0.8, v1 - 0.8]) l.add(stroke(line([plane(0.6, v), plane(len - 0.2, v)]), shaded ? C.satin.shade : C.satin.face, b.detail === 0 ? 1.6 : 1.1));
    if (b.detail === 0) continue;
    const step = 9.3;
    for (let u = step / 2; u < len; u += step) {
      const k = (u - step / 2) / step;
      const outer = [plane(u, v1 - 2), plane(u + 3.4, (v0 + v1) / 2), plane(u, v0 + 2), plane(u - 3.4, (v0 + v1) / 2)];
      l.add(fill(poly(outer), Math.round(k) % 2 === 0 ? (shaded ? C.satin.shade : C.satin.face) : shaded ? C.teal.deep : C.teal.shade));
      if (b.detail === 2) {
        const inner = [plane(u, v1 - 3.8), plane(u + 1.6, (v0 + v1) / 2), plane(u, v0 + 3.8), plane(u - 1.6, (v0 + v1) / 2)];
        l.add(fill(poly(inner), shaded ? C.gold.shade : C.gold.light));
        // The hooks: little horns off the diamond's side points.
        const hooks = [
          [plane(u + 3.4, (v0 + v1) / 2), plane(u + 4.6, (v0 + v1) / 2 + 1.4)],
          [plane(u - 3.4, (v0 + v1) / 2), plane(u - 4.6, (v0 + v1) / 2 - 1.4)],
        ];
        for (const h of hooks) l.add(stroke(line(h), shaded ? C.satin.shade : C.satin.face, 0.8));
      }
    }
  }
}

/**
 * Flat facets cut in the amethyst: triangles a step lighter than the plane they sit on, pointing every way as the cuts of
 * a stone do, and a few small white glints.
 */
function facets(l: Layer, b: Brush, where: 'body' | 'lid'): void {
  const { paper } = b.wrap;
  type Facet = readonly [Plane, number, number, number, number];
  const all: readonly Facet[] =
    where === 'body'
      ? [
          [BODY_FRONT, 10, 31, 9, 0],
          [BODY_FRONT, 17, 8, 7, 1],
          [BODY_FRONT, 46, 25, 8, 2],
          [BODY_FRONT, 50, 6, 5, 0],
          [BODY_FRONT, 6, 18, 4.5, 3],
          [BODY_FRONT, 40, 36, 4, 1],
          [BODY_SIDE, 13, 26, 8, 2],
          [BODY_SIDE, 45, 10, 7, 0],
          [BODY_SIDE, 42, 33, 4.5, 1],
        ]
      : [
          [LID_TOP, 12, 44, 9, 1],
          [LID_TOP, 52, 50, 6, 0],
          [LID_TOP, 52, 13, 8, 2],
          [LID_TOP, 13, 12, 5, 3],
          [LID_FRONT, 10, SEAM + 4, 6, 2],
          [LID_FRONT, 54, SEAM + 4, 5, 1],
        ];
  const shown = b.detail === 2 ? all : b.detail === 1 ? all.filter((f) => f[3] >= 6) : all.filter((f) => f[3] >= 8);
  for (const [plane, u, v, s, turn] of shown) {
    const tri: Pt[] =
      turn === 0
        ? [plane(u - s / 2, v), plane(u + s / 2, v), plane(u, v + s * 0.9)]
        : turn === 1
          ? [plane(u - s / 2, v + s * 0.9), plane(u + s / 2, v + s * 0.9), plane(u, v)]
          : turn === 2
            ? [plane(u, v), plane(u + s, v + s / 2), plane(u, v + s)]
            : [plane(u + s, v), plane(u, v + s / 2), plane(u + s, v + s)];
    const tone = plane === BODY_SIDE ? paper.face : paper.light;
    l.add(fill(poly(tri), tone));
    // the brightest cut of each catches a white glint at its point
    if (b.detail === 2 && s >= 8) l.add(fill(poly([tri[0]!, mid(tri[0]!, tri[1]!, 0.35), mid(tri[0]!, tri[2]!, 0.35)]), C.light.light, ' fill-opacity="0.85"'));
  }
}

/** Gold stars on the night paper: a few four-pointed ones and fine dots. */
function stars(l: Layer, b: Brush, where: 'body' | 'lid'): void {
  type Star = readonly [Plane, number, number, number];
  const all: readonly Star[] =
    where === 'body'
      ? [
          [BODY_FRONT, 10, 30, 3.2],
          [BODY_FRONT, 44, 12, 2.6],
          [BODY_FRONT, 16, 8, 1.6],
          [BODY_FRONT, 47, 32, 1.4],
          [BODY_FRONT, 6, 18, 1],
          [BODY_SIDE, 12, 26, 2.4],
          [BODY_SIDE, 42, 12, 1.8],
          [BODY_SIDE, 44, 34, 1],
        ]
      : [
          [LID_TOP, 12, 42, 3],
          [LID_TOP, 47, 46, 2],
          [LID_TOP, 49, 14, 2.6],
          [LID_TOP, 14, 13, 1.4],
          [LID_FRONT, 10, SEAM + 6, 1.6],
          [LID_FRONT, 52, SEAM + 6, 1.2],
        ];
  const shown = b.detail === 2 ? all : b.detail === 1 ? all.filter((s) => s[3] >= 1.6) : all.filter((s) => s[3] >= 2.4);
  const big: string[] = [];
  const dots: string[] = [];
  for (const [plane, u, v, r] of shown) {
    const c = plane(u, v);
    const scale = b.detail === 0 ? 1.4 : 1;
    if (r >= 1.6) big.push(sparkle(c, r * 1.25 * scale));
    else dots.push(`M${n(c[0] - r * 0.6)} ${n(c[1])}a${n(r * 0.6)} ${n(r * 0.6)} 0 1 0 ${n(r * 1.2)} 0a${n(r * 0.6)} ${n(r * 0.6)} 0 1 0 ${n(-r * 1.2)} 0Z`);
  }
  if (big.length) l.add(fill(big.join(''), C.gold.light));
  if (dots.length) l.add(fill(dots.join(''), C.gold.face));
}

// ─────────────────────────────────────────────────────────────── the bow

/** The bow's shapes about its knot `k`, in the canvas's units: drawn facing us, a little larger for a richer tier. */
interface BowShape {
  scale: number;
}
const bowOf = (tier: GiftTier): BowShape => ({ scale: tier === 'grand' ? 1.08 : tier === 'legendary' ? 1.06 : tier === 'rare' ? 1 : 0.92 });

/** A point about the knot, mirrored for the right side. */
const around = (k: Pt, s: number, mirror: boolean) => (dx: number, dy: number): Pt => [k[0] + (mirror ? -dx : dx) * s, k[1] + dy * s];

/** One satin loop: the ribbon's outside, the inside seen through the loop, and the light along its upper curve. */
function satinLoop(l: Layer, b: Brush, k: Pt, right: boolean, tier: GiftTier): GiftBoxBox {
  const { ribbon } = b.wrap;
  const s = bowOf(tier).scale;
  const q = around(k, s, right);
  // the right loop stands a touch higher, as a hand-tied bow never sits even
  const up = right ? 1.08 : 1;
  const v = (dx: number, dy: number): Pt => q(dx, dy * up);
  const outer = `M${p(v(-2, 1.5))}C${p(v(-6, -9))} ${p(v(-17, -22))} ${p(v(-25, -20))}C${p(v(-31, -18.5))} ${p(v(-29, -8))} ${p(v(-23, -3))}C${p(v(-17, 1.5))} ${p(v(-8, 3.5))} ${p(v(-2, 3.5))}Z`;
  const hole = `M${p(v(-10.5, -5.5))}C${p(v(-13, -11))} ${p(v(-19, -16.5))} ${p(v(-23.5, -15.5))}C${p(v(-27, -14))} ${p(v(-25, -8.5))} ${p(v(-20.5, -6))}C${p(v(-17, -4))} ${p(v(-13.5, -4))} ${p(v(-10.5, -5.5))}Z`;
  // the ribbon gathered into the knot: a fold of shade where the loop is pinched
  const pinch = `M${p(v(-2, 1.5))}C${p(v(-4, -3))} ${p(v(-6, -5))} ${p(v(-8.5, -6))}C${p(v(-8, -2))} ${p(v(-6, 1.5))} ${p(v(-2, 3.5))}Z`;
  l.add(fill(outer, ribbon.face));
  if (b.detail > 0 || tier !== 'common') l.add(fill(hole, ribbon.shade));
  if (b.detail > 0) l.add(fill(pinch, ribbon.shade));
  // the light along its upper curve
  if (b.detail > 0) l.add(stroke(`M${p(v(-7, -6))}C${p(v(-11, -12))} ${p(v(-17, -18.5))} ${p(v(-24, -18))}`, ribbon.light, b.detail === 2 ? 2 : 2.4));
  if (b.wrap.goldEdge) l.add(stroke(outer, C.gold.light, b.detail === 2 ? 0.9 : 1.3));
  l.add(stroke(outer, ribbon.deep, b.edge * 0.7, ' stroke-opacity="0.75"'));
  return boxOf([v(-31, -24), q(0, 5)], 2);
}

/** One satin tail: out from under the knot, turned over once so its back shows, ending in a swallowtail. */
function satinTail(l: Layer, b: Brush, k: Pt, right: boolean, tier: GiftTier): GiftBoxBox {
  const { ribbon } = b.wrap;
  const s = bowOf(tier).scale;
  const q = around(k, s, right);
  // the left tail falls toward the front corner on the left; the right one, a little longer, toward the near corner
  const reach = right ? 1.1 : 1;
  const r = (dx: number, dy: number): Pt => q(dx * (right ? 0.72 : 1), dy * reach);
  // the strip widens a little as it falls, turns over once (its back in shade) and ends in a swallowtail
  const first = `M${p(r(-2, 0))}L${p(r(4, 1.5))}C${p(r(2, 5))} ${p(r(-1, 8.5))} ${p(r(-3, 11))}L${p(r(-10.5, 9.5))}C${p(r(-8, 7))} ${p(r(-5, 3.5))} ${p(r(-2, 0))}Z`;
  const fold = poly([r(-10.5, 9.5), r(-3, 11), r(-7, 14), r(-13.5, 12.5)]);
  const last = `M${p(r(-13.5, 12.5))}L${p(r(-7, 14))}C${p(r(-8, 17))} ${p(r(-9.5, 20))} ${p(r(-10.5, 23))}L${p(r(-13.6, 19.6))}L${p(r(-17.5, 21.5))}C${p(r(-16, 18.5))} ${p(r(-14.5, 15.5))} ${p(r(-13.5, 12.5))}Z`;
  l.add(fill(first, ribbon.face));
  l.add(fill(fold, ribbon.shade));
  l.add(fill(last, ribbon.face));
  if (b.detail === 2 && !b.wrap.goldEdge) l.add(stroke(`M${p(r(0.5, 2.5))}C${p(r(-1, 5.5))} ${p(r(-3, 8))} ${p(r(-4.5, 9.8))}`, ribbon.light, 1.4));
  if (b.wrap.goldEdge) for (const d of [first, last]) l.add(stroke(d, C.gold.light, b.detail === 2 ? 0.8 : 1.2));
  for (const d of [first, fold, last]) l.add(stroke(d, ribbon.deep, b.edge * 0.6, ' stroke-opacity="0.65"'));
  return boxOf([r(-19, -1), r(5, 24)], 2);
}

/** The knot: a short wrap of ribbon over the middle, lit on its upper half. */
function satinKnot(l: Layer, b: Brush, k: Pt, tier: GiftTier): GiftBoxBox {
  const { ribbon } = b.wrap;
  const s = bowOf(tier).scale;
  const q = around(k, s, false);
  const knot = `M${p(q(-4.2, -3.5))}C${p(q(-1.5, -5))} ${p(q(1.5, -5))} ${p(q(4.2, -3.5))}C${p(q(5.4, -0.5))} ${p(q(5, 2.5))} ${p(q(3.8, 4.4))}C${p(q(1.2, 5.6))} ${p(q(-1.2, 5.6))} ${p(q(-3.8, 4.4))}C${p(q(-5, 2.5))} ${p(q(-5.4, -0.5))} ${p(q(-4.2, -3.5))}Z`;
  l.add(fill(knot, ribbon.face));
  l.add(fill(`M${p(q(-3.6, -3.2))}C${p(q(-1.2, -4.4))} ${p(q(1.2, -4.4))} ${p(q(3.6, -3.2))}C${p(q(4.2, -1.8))} ${p(q(4.3, -0.8))} ${p(q(4.3, 0))}L${p(q(-4.3, 0))}C${p(q(-4.3, -0.8))} ${p(q(-4.2, -1.8))} ${p(q(-3.6, -3.2))}Z`, ribbon.light));
  if (b.wrap.goldEdge) l.add(stroke(knot, C.gold.light, b.detail === 2 ? 0.9 : 1.3));
  l.add(stroke(knot, ribbon.deep, b.edge * 0.7, ' stroke-opacity="0.75"'));
  if (tier === 'grand' && b.detail > 0) l.add(fill(sparkle(q(0, 0.4), 2.6), C.gold.light === ribbon.light ? C.light.light : C.gold.light));
  return boxOf([q(-6, -6), q(6, 6)], 1);
}

/** A twine loop: two strands of wool in a long loop. */
function twineLoop(l: Layer, b: Brush, k: Pt, right: boolean): GiftBoxBox {
  const s = 0.95;
  const q = around(k, s, right);
  const lift = right ? -1.5 : 0;
  for (const [off, colour] of [
    [0, C.wool.face],
    [1.5, C.wool.shade],
  ] as const) {
    l.add(stroke(`M${p(q(-1, 0.5))}C${p(q(-8, -9 + lift - off))} ${p(q(-20, -16 + lift - off))} ${p(q(-21, -9 + lift - off * 0.5))}C${p(q(-21.5, -3 + off))} ${p(q(-10, 0 + off))} ${p(q(-1, 1.5))}`, colour, b.cord));
  }
  return boxOf([q(-24, -20), q(1, 4)], 2);
}

/** A twine tail: two strands hanging, their ends frayed. */
function twineTail(l: Layer, b: Brush, k: Pt, right: boolean): GiftBoxBox {
  const q = around(k, 1, right);
  const len = right ? 1.15 : 1;
  for (const [off, colour] of [
    [0, C.wool.face],
    [1.6, C.wool.shade],
  ] as const) {
    const end = q(-9 + off * 0.5, 17 * len + off * 0.4);
    l.add(stroke(`M${p(q(0, 1))}C${p(q(-2 + off, 6))} ${p(q(-7 + off, 10 * len))} ${p(end)}`, colour, b.cord));
    if (b.detail > 0) l.add(stroke(`M${p(end)}l${n(right ? 1.2 : -1.2)} 1.6M${p(end)}l${n(right ? -0.5 : 0.5)} 1.9`, colour, b.cord * 0.45));
  }
  return boxOf([q(-12, -1), q(2, 22)], 2);
}

/** The twine's knot: a small round wrap where the loops meet. */
function twineKnot(l: Layer, b: Brush, k: Pt): GiftBoxBox {
  l.add(`<ellipse cx="${n(k[0])}" cy="${n(k[1])}" rx="3.3" ry="2.6" fill="${C.wool.face}"/>`);
  l.add(stroke(`M${p(add(k, -2.2, -0.9))}Q${p(add(k, 0, -2.4))} ${p(add(k, 2.2, -0.9))}`, C.wool.light, b.detail === 2 ? 1 : 1.3));
  l.add(`<ellipse cx="${n(k[0])}" cy="${n(k[1])}" rx="3.3" ry="2.6" fill="none" stroke="${C.wool.deep}" stroke-width="${n(b.edge * 0.6)}" stroke-opacity="0.7"/>`);
  return boxOf([add(k, -4, -4), add(k, 4, 4)], 1);
}

// ─────────────────────────────────────────────────────────────── the tag

/** Where the tag hangs from: tied to the ribbon's left edge on the lid's rim, dangling over the wall below. */
const tagOf = (lines: Lines): { hole: Pt; at: Pt } => {
  const hole = LID_FRONT(lines.x + LW / 2 - lines.half - 0.5, SEAM + 3);
  return { hole, at: add(hole, -5.5, 11) };
};

/** The tag on its string: a pomegranate, a Newroz flame, a star, or a round paper tag with a kilim diamond. */
function tagLayer(l: Layer, b: Brush, shape: TagShape): GiftBoxBox {
  const lines = linesOf(b.wrap);
  const { hole, at: c } = tagOf(lines);
  const tone = shape === 'flame' ? C.flame : b.wrap.tagTone;
  const string = b.wrap.bow === 'twine' ? C.wool.shade : C.gold.shade;
  const s = b.detail === 0 ? 1.3 : 1;
  const r = 5.2 * s;
  const [cx, cy] = add(c, 0, (s - 1) * 4);
  // the string: a little loop round the ribbon, then down to the tag's top
  const top: Pt = [cx + r * 0.1, cy - r * (shape === 'pomegranate' ? 1.4 : shape === 'star' ? 1.05 : 0.95)];
  l.add(stroke(`M${p(add(hole, 1.2, -1.6))}Q${p(add(hole, -1.6, -1))} ${p(hole)}Q${p(add(mid(hole, top), 1.4, 0))} ${p(top)}`, string, b.detail === 0 ? 1.4 : 1));
  if (shape === 'pomegranate') {
    // A round fruit with its crown of points on top.
    const fruit = `M${n(cx)} ${n(cy - r)}C${n(cx + r * 0.75)} ${n(cy - r)} ${n(cx + r)} ${n(cy - r * 0.4)} ${n(cx + r)} ${n(cy + r * 0.15)}C${n(cx + r)} ${n(cy + r * 0.8)} ${n(cx + r * 0.5)} ${n(cy + r)} ${n(cx)} ${n(cy + r)}C${n(cx - r * 0.5)} ${n(cy + r)} ${n(cx - r)} ${n(cy + r * 0.8)} ${n(cx - r)} ${n(cy + r * 0.15)}C${n(cx - r)} ${n(cy - r * 0.4)} ${n(cx - r * 0.75)} ${n(cy - r)} ${n(cx)} ${n(cy - r)}Z`;
    const crown = poly([
      [cx - r * 0.42, cy - r * 0.86],
      [cx - r * 0.5, cy - r * 1.42],
      [cx - r * 0.18, cy - r * 1.12],
      [cx, cy - r * 1.5],
      [cx + r * 0.18, cy - r * 1.12],
      [cx + r * 0.5, cy - r * 1.42],
      [cx + r * 0.42, cy - r * 0.86],
    ]);
    l.add(fill(crown, tone.shade));
    l.add(fill(fruit, tone.face));
    if (b.detail > 0) l.add(fill(`M${n(cx - r * 0.62)} ${n(cy - r * 0.1)}C${n(cx - r * 0.6)} ${n(cy - r * 0.6)} ${n(cx - r * 0.25)} ${n(cy - r * 0.78)} ${n(cx + r * 0.05)} ${n(cy - r * 0.8)}C${n(cx - r * 0.3)} ${n(cy - r * 0.5)} ${n(cx - r * 0.45)} ${n(cy - r * 0.3)} ${n(cx - r * 0.62)} ${n(cy - r * 0.1)}Z`, tone.light));
    l.add(stroke(fruit, tone.deep, b.edge * 0.6, ' stroke-opacity="0.7"'));
  } else if (shape === 'flame') {
    const flame = `M${n(cx)} ${n(cy + r)}C${n(cx - r * 1.1)} ${n(cy + r)} ${n(cx - r * 1.05)} ${n(cy - r * 0.2)} ${n(cx - r * 0.35)} ${n(cy - r * 1.3)}C${n(cx - r * 0.3)} ${n(cy - r * 0.5)} ${n(cx + r * 0.1)} ${n(cy - r * 0.6)} ${n(cx + r * 0.15)} ${n(cy - r * 1.05)}C${n(cx + r * 0.85)} ${n(cy - r * 0.45)} ${n(cx + r * 1.1)} ${n(cy + r)} ${n(cx)} ${n(cy + r)}Z`;
    l.add(fill(flame, tone.face));
    l.add(fill(`M${n(cx)} ${n(cy + r)}C${n(cx - r * 0.6)} ${n(cy + r)} ${n(cx - r * 0.55)} ${n(cy + r * 0.1)} ${n(cx - r * 0.1)} ${n(cy - r * 0.35)}C${n(cx + r * 0.1)} ${n(cy + r * 0.05)} ${n(cx + r * 0.6)} ${n(cy + r * 0.3)} ${n(cx)} ${n(cy + r)}Z`, tone.light));
    l.add(stroke(flame, tone.deep, b.edge * 0.6, ' stroke-opacity="0.7"'));
  } else if (shape === 'star') {
    const pts: Pt[] = [];
    for (let i = 0; i < 10; i++) pts.push(spoke([cx, cy], i % 2 === 0 ? r * 1.15 : r * 0.5, i * 36));
    l.add(fill(poly(pts), tone.face));
    if (b.detail > 0) l.add(fill(poly([[cx, cy], pts[9]!, pts[0]!, pts[1]!]), tone.light));
    l.add(stroke(poly(pts), tone.deep, b.edge * 0.6, ' stroke-opacity="0.7"'));
  } else {
    const disc = `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
    l.add(fill(disc, tone.face));
    if (b.detail > 0) l.add(fill(poly([[cx, cy - r * 0.62], [cx + r * 0.5, cy], [cx, cy + r * 0.62], [cx - r * 0.5, cy]]), C.satin.face));
    if (b.detail === 2) l.add(fill(poly([[cx, cy - r * 0.26], [cx + r * 0.2, cy], [cx, cy + r * 0.26], [cx - r * 0.2, cy]]), C.gold.face));
    l.add(stroke(disc, tone.deep, b.edge * 0.6, ' stroke-opacity="0.7"'));
  }
  return boxOf([add(hole, 2, -3), [cx - r * 1.3, cy - r * 1.6], [cx + r * 1.3, cy + r * 1.3]], 2);
}

// ─────────────────────────────────────────────────────────────── light passing over

/** The box's outline, shut, for the glint to stay inside. */
const SILHOUETTE = poly([LID_FRONT(0, H), LID_TOP(0, LD), LID_TOP(LW, LD), LID_SIDE(LD, SEAM), BODY_SIDE(D, SEAM), BODY_SIDE(D, 0), BODY_SIDE(0, 0), BODY_FRONT(0, 0), BODY_FRONT(0, SEAM), LID_FRONT(0, SEAM)]);
const SILHOUETTE_BOX: GiftBoxBox = boxOf([LID_FRONT(0, SEAM), LID_TOP(0, LD), LID_TOP(LW, LD), LID_SIDE(LD, SEAM), BODY_SIDE(0, 0), BODY_FRONT(0, 0)], 0);

/** A band of light across the box at `phase` (0 left of it, 1 past it): one frame of the glint, flat and pale. */
function glintLayer(l: Layer, phase: number): GiftBoxBox {
  const clip = l.clip(SILHOUETTE);
  const x = SILHOUETTE_BOX.x - 14 + phase * (SILHOUETTE_BOX.w + 28);
  const y = SILHOUETTE_BOX.y + SILHOUETTE_BOX.h / 2;
  const band = (dx: number, w: number): string => poly([[x + dx - w / 2 + 24, y - 60], [x + dx + w / 2 + 24, y - 60], [x + dx + w / 2 - 24, y + 60], [x + dx - w / 2 - 24, y + 60]]);
  l.add(`<g clip-path="url(#${clip})">${fill(band(0, 9), C.light.light, ' fill-opacity="0.5"')}${fill(band(9, 3), C.light.light, ' fill-opacity="0.4"')}</g>`);
  return SILHOUETTE_BOX;
}

/** Spark dashes over the bow, popping as it hops: short strokes fanned upward, and a few gold stars. */
function sparksLayer(l: Layer, knot: Pt): GiftBoxBox {
  const c = add(knot, 0, -10);
  const dashes: string[] = [];
  for (const deg of [-50, -18, 18, 50]) dashes.push(line([spoke(c, 18, deg), spoke(c, 25, deg)]));
  l.add(stroke(dashes.join(''), C.gold.face, 2.4));
  l.add(fill([sparkle(spoke(c, 30, -34), 3), sparkle(spoke(c, 31, 34), 2.4), sparkle(spoke(c, 27, 0), 2)].join(''), C.gold.light));
  return { x: c[0] - 34, y: c[1] - 36, w: 68, h: 24 };
}

// ─────────────────────────────────────────────────────────────── the drawing

/** The box round some points, grown by `pad`. */
function boxOf(pts: readonly Pt[], pad: number): GiftBoxBox {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x = Math.floor((Math.min(...xs) - pad) * 10) / 10;
  const y = Math.floor((Math.min(...ys) - pad) * 10) / 10;
  return { x, y, w: Math.ceil((Math.max(...xs) + pad - x) * 10) / 10, h: Math.ceil((Math.max(...ys) + pad - y) * 10) / 10 };
}

const isTier = (tier: unknown): tier is GiftTier => tier === 'common' || tier === 'rare' || tier === 'legendary' || tier === 'grand';

function brush(tier: GiftTier, size: number): Brush {
  const detail = detailOf(size);
  return { wrap: GIFT_BOX_WRAPS[tier], detail, edge: detail === 0 ? 2.6 : detail === 1 ? 1.8 : 1.3, cord: detail === 0 ? 2.4 : detail === 1 ? 1.9 : 1.5 };
}

/** One layer, drawn with its own ids. */
function layer(id: GiftBoxPart, prefix: string, draw: (l: Layer) => GiftBoxBox): GiftBoxLayer {
  const l = new Layer(`${prefix}${id}`);
  const box = draw(l);
  return { id, box, markup: l.markup() };
}

/** The box at `tier` as layers a renderer stacks and moves; `size` is its display width. */
export function giftBoxDrawing(tier: GiftTier, opts: GiftBoxOptions = {}): GiftBoxDrawing {
  if (!isTier(tier)) throw new RangeError(`art: no gift box for tier ${String(tier)}`);
  const size = opts.size ?? 96;
  if (!Number.isFinite(size) || size <= 0) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const b = brush(tier, size);
  const limited = opts.limited ?? tier === 'legendary';
  const prefix = prefixFor(opts.idPrefix, 'giftbox', tier, b.detail, limited);
  const lines = linesOf(b.wrap);
  const knot = knotOf(lines);
  const tag = limited ? 'flame' : b.wrap.tag;
  const twine = b.wrap.bow === 'twine';
  const draw: Record<GiftBoxPart, (l: Layer) => GiftBoxBox> = {
    shadow: shadowLayer,
    splash: splashLayer,
    body: (l) => bodyLayer(l, b),
    ribbon: (l) => ribbonLayer(l, b),
    lidShade: (l) => lidShadeLayer(l, b),
    inside: (l) => insideLayer(l, b),
    light: lightLayer,
    lid: (l) => lidLayer(l, b),
    tag: (l) => tagLayer(l, b, tag),
    tailLeft: (l) => (twine ? twineTail(l, b, knot, false) : satinTail(l, b, knot, false, tier)),
    tailRight: (l) => (twine ? twineTail(l, b, knot, true) : satinTail(l, b, knot, true, tier)),
    loopLeft: (l) => (twine ? twineLoop(l, b, knot, false) : satinLoop(l, b, knot, false, tier)),
    loopRight: (l) => (twine ? twineLoop(l, b, knot, true) : satinLoop(l, b, knot, true, tier)),
    knot: (l) => (twine ? twineKnot(l, b, knot) : satinKnot(l, b, knot, tier)),
    glint: (l) => glintLayer(l, 0.5),
    sparks: (l) => sparksLayer(l, knot),
  };
  const layers = Object.fromEntries(GIFT_BOX_PARTS.map((id) => [id, layer(id, prefix, draw[id])])) as Record<GiftBoxPart, GiftBoxLayer>;
  const tagHole = tagOf(lines).hole;
  const pivots: Record<GiftBoxPart, Pt> = {
    shadow: add(GROUND, 3, 7),
    splash: add(GROUND, 0, 8),
    body: GIFT_BOX_FOOT,
    ribbon: GIFT_BOX_FOOT,
    lidShade: GIFT_BOX_FOOT,
    inside: MOUTH,
    light: MOUTH,
    lid: LID_MIDDLE,
    tag: tagHole,
    tailLeft: knot,
    tailRight: knot,
    loopLeft: knot,
    loopRight: knot,
    knot,
    glint: MOUTH,
    sparks: add(knot, 0, -10),
  };
  return { tier, view: GIFT_BOX_VIEW, pivots, layers };
}

/** The glint at `phase` (0–1) as its own layer; renderers step through phases. */
export function giftBoxGlint(phase: number, opts: { idPrefix?: string } = {}): GiftBoxLayer {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) throw new RangeError(`art: phase must be 0–1, got ${String(phase)}`);
  const prefix = prefixFor(opts.idPrefix, 'giftboxglint', n2(phase));
  return layer('glint', prefix, (l) => glintLayer(l, phase));
}

/** A layer as a standalone picture with its box as viewBox, for renderers that stack layers themselves. */
export function giftBoxLayerSvg(l: GiftBoxLayer): string {
  const { x, y, w, h } = l.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">${l.markup}</svg>`;
}

/** The layers the shut box shows. */
export const GIFT_BOX_SHUT: readonly GiftBoxPart[] = ['shadow', 'body', 'ribbon', 'lidShade', 'lid', 'tag', 'tailLeft', 'tailRight', 'loopLeft', 'loopRight', 'knot'];

/**
 * The whole box in one picture on the 120 × 120 canvas, each layer in a group named by `data-part` so a page can move
 * the groups; `allLayers` includes the open box's parts and the effects too, for a page that shows them itself.
 */
export function giftBoxSvg(opts: GiftBoxSvgOptions): string {
  const { tier, allLayers = false } = opts;
  const drawing = giftBoxDrawing(tier, opts);
  const size = opts.size ?? 96;
  const shown = allLayers ? GIFT_BOX_PARTS : GIFT_BOX_SHUT;
  const t = `${prefixFor(opts.idPrefix, 'giftbox', tier, detailOf(size), opts.limited ?? tier === 'legendary')}t`;
  const groups = shown.map((id) => `<g data-part="${id}">${drawing.layers[id].markup}</g>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(opts.title ?? 'Gift')}</title>${groups}</svg>`
  );
}
