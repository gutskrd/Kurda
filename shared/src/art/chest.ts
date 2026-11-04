/**
 * The reward chest a finished quest pays out of, designed once and drawn the
 * same by the phone and the website: a chunky trunk seen from three quarters
 * and a little above — a barrel of a lid lying along the body, its planks
 * running the length of it and curving over at both ends, bound in broad
 * bevelled straps that run on down the body, a broad belt round the seam of
 * the two, an ornate shield of a lock plate hung on the belt under a knob on
 * the lid, a ring handle on the near end, and a soft pool of shadow on the
 * ground.
 *
 * Three tiers, all warm, by how much the chest holds: common is amber wood
 * bound in dark iron; rare the same wood bound in gold, with a gold lock
 * plate; epic is lacquered in a deep pomegranate red, gold-bound, with a
 * garnet for the knob and a few gold studs in its planks.
 *
 * It is drawn as layers with stable ids, back to front, because the
 * renderers move them: the lid swings open about its hinge, the light inside
 * blooms, a fan of rays turns slowly behind the body, the lock plate glints
 * now and then, sparkles burst as it opens. Each layer is its own markup,
 * carrying its own gradients and clips, in the one 120 × 120 canvas; the
 * phone stacks them as separate pictures over the same frame, the website
 * puts them in groups of one inline SVG. `chestSvg` is the whole picture in
 * one, for a still.
 *
 * Flat painted cut-outs: each form is a flat colour with one highlight and
 * one shade step, and nothing is outlined in a foreign ink — a piece's edge
 * is its own darkest tone. The metal's bevel is that one highlight, along
 * the edge the light falls on, and a nick or two in it at full size. The
 * only gradients are the soft lights, which fade to nothing, and the
 * ground's shadow.
 */
import type { ChestTier } from '../quests.js';
import { CANVAS, escapeXml, linearAt, n, n2, prefixFor, radialAt, type Pt } from './svg.js';

export type { ChestTier } from '../quests.js';

/** The layers, back to front. */
export const CHEST_LAYERS = ['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock', 'glint', 'lid', 'sparkle'] as const;
export type ChestLayerId = (typeof CHEST_LAYERS)[number];

/** A box in the drawing's units. */
export interface ChestBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One layer of the drawing: its markup (defs and shapes, no `<svg>`), and the box round everything it draws. */
export interface ChestLayer {
  id: ChestLayerId;
  box: ChestBox;
  markup: string;
}

export interface ChestDrawing {
  tier: ChestTier;
  /** the canvas every layer is drawn in */
  view: ChestBox;
  /** the shut chest with its shadow: what a renderer sizes by */
  box: ChestBox;
  /** where the lid turns: the renderers rotate the shut lid and swing the open one about it */
  hinge: Pt;
  /** the middle of the chest's mouth: where the light and the rays come from, and the rays turn about */
  mouth: Pt;
  layers: Readonly<Record<ChestLayerId, ChestLayer>>;
}

export interface ChestOptions {
  /** how wide the shut chest is shown, in pixels: under `CHEST_SMALL` the fine things are left out */
  size?: number;
  idPrefix?: string;
}

export interface ChestSvgOptions extends ChestOptions {
  tier: ChestTier;
  /** drawn open: the lid thrown back and the light out of it */
  open?: boolean;
  /** every layer, for a page that shows and moves them itself; otherwise only what the shut or the open chest shows */
  allLayers?: boolean;
  /** its text label */
  title?: string;
}

/** The canvas, and the shut chest's box in it (the lid's lip to the end cap, its top to the foot of its shadow). */
export const CHEST_VIEW: ChestBox = { x: 0, y: 0, w: CANVAS, h: CANVAS };
export const CHEST_BOX: ChestBox = { x: 6, y: 16, w: 108, h: 100 };
/** Under this width (in pixels) the rivets and the studs go; under `CHEST_TINY` the plank lines too, and the edges thicken. */
export const CHEST_SMALL = 56;
export const CHEST_TINY = 30;

/** How far the back of the chest sits from its front, seen from three quarters and a little above. */
const DEPTH: Pt = [18, -8];

// ─────────────────────────────────────────────────────────────── colours

/** A wood or a lacquer: its planks' face, the plank the light catches, the end turned away, the plank lines, its darkest tone, and the inside. */
interface Wood {
  face: string;
  light: string;
  shade: string;
  line: string;
  deep: string;
  inside: string;
}
/** A metal: its face, its highlight, its shade, its darkest tone, and the rivets' light. */
interface Metal {
  face: string;
  light: string;
  shade: string;
  deep: string;
  rivet: string;
}

const AMBER: Wood = { face: '#e3a044', light: '#f2c26e', shade: '#b9732b', line: '#a5611f', deep: '#5b300f', inside: '#7d4a1d' };
const POMEGRANATE: Wood = { face: '#a8233a', light: '#c9455c', shade: '#7c1528', line: '#6a1021', deep: '#3b0810', inside: '#5a0f1e' };
/** Dark iron, a warm grey rather than a blue one: the straps of a common chest, their bevels catching a little light. */
const IRON: Metal = { face: '#716e6b', light: '#a9a5a0', shade: '#4e4b48', deep: '#2b2927', rivet: '#bdb8b2' };
/** The sun's gold, as the badges wear it (palette.ts). */
const GOLD: Metal = { face: '#ffbd1f', light: '#ffe16a', shade: '#d9800b', deep: '#6b3500', rivet: '#fff8d1' };
/** The garnet in the epic chest's plate: a pomegranate seed. */
const GARNET = { face: '#c8243f', light: '#ff8aa0', deep: '#6b0d22' };
/** The light inside, and the rays: white-gold. */
const LIGHT = { core: '#fff6cc', glow: '#ffd75a', far: '#ffc43a', mouth: '#ffe08a' };

interface Tint {
  wood: Wood;
  metal: Metal;
  gem: boolean;
  studs: boolean;
}

export const CHEST_TINTS: Readonly<Record<ChestTier, Tint>> = {
  common: { wood: AMBER, metal: IRON, gem: false, studs: false },
  rare: { wood: AMBER, metal: GOLD, gem: false, studs: false },
  epic: { wood: POMEGRANATE, metal: GOLD, gem: true, studs: true },
};

// ─────────────────────────────────────────────────────────────── shapes

/** The body's front face, from under the belt to its foot. */
const FRONT = { x0: 14, x1: 90, y0: 58, y1: 104 };
/** The belt: the broad band round the seam of lid and body, lipped a little past both. */
const BELT = { x0: 12, x1: 92, y0: 55, y1: 65 };
/**
 * The lid: a barrel lying along the chest, as wide as the body. Its
 * cross-section is a half-ellipse standing on the belt, `rise` tall and the
 * chest's depth across, so the planks run the length of it and curve over at
 * both ends alike: the near end is the round cap, in the plane the depth
 * sweeps through; the far end is the shoulder where the front's planks turn
 * away out of sight. `THETA_TOP` is how far round from the front foot the
 * topmost plank line lies, where the outline turns from the front to the
 * back; from here the front shows up to it and the cap beyond it.
 */
const LID = { x0: FRONT.x0, x1: FRONT.x1, foot: BELT.y0, rise: 24 };
const THETA_TOP = Math.PI - Math.atan(LID.rise / (-DEPTH[1] / 2));
const rad = (deg: number): number => (deg * Math.PI) / 180;
/** The planks of the lid, as the seams between them: so far round the barrel each, so they close up toward the top, where it turns away. */
const LID_SEAMS: readonly number[] = [18, 36, 54, 72].map(rad);
/** The light lies on the barrel from here round to the top: the planks over the shoulder. */
const LID_LIT = rad(54);
/** The straps, as the x of each one's left and right edge, over the lid and down the body alike. */
const BANDS: readonly (readonly [number, number])[] = [
  [24, 34],
  [60, 70],
];
/** The chest's corners wear a strap each too: the rims of the lid's arches, and the body's upright edges under them. */
const CORNERS: readonly (readonly [number, number])[] = [
  [FRONT.x0, FRONT.x0 + 6],
  [FRONT.x1 - 6, FRONT.x1],
];
const STRAPS: readonly (readonly [number, number])[] = [...CORNERS, ...BANDS];
/** The lock plate: hung on the belt, its point down the body; the knob above it is the lid's, on the hasp. */
const LOCK = { cx: 52, top: BELT.y0, w: 28, point: 90 };
const MOUTH: Pt = [61, 54];
const HINGE: Pt = [66, 54];

const back = ([x, y]: Pt): Pt => [x + DEPTH[0], y + DEPTH[1]];
const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
const poly = (pts: readonly Pt[]): string => `M${pts.map(p).join('L')}Z`;
const line = (a: Pt, b: Pt): string => `M${p(a)}L${p(b)}`;
/** A strap's front, upright between two x's and two y's, and the bevel the light catches down its left edge. */
const upright = (x0: number, x1: number, y0: number, y1: number): string => `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;

/** The body's front face, its bottom-left corner rounded; the right edge meets the end. */
const FRONT_FACE = `M${FRONT.x0} ${FRONT.y0}H${FRONT.x1}V${FRONT.y1}H${FRONT.x0 + 5}Q${FRONT.x0} ${FRONT.y1} ${FRONT.x0} ${FRONT.y1 - 5}Z`;
/** The body's end, turned away: the front face's right edge swept back. */
const END_FACE = poly([[FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x1, FRONT.y1]), [FRONT.x1, FRONT.y1]]);
/** The whole body, for its edge. */
const BODY = `M${FRONT.x0} ${FRONT.y0}H${FRONT.x1}L${p(back([FRONT.x1, FRONT.y0]))}L${p(back([FRONT.x1, FRONT.y1]))}L${FRONT.x1} ${FRONT.y1}H${FRONT.x0 + 5}Q${FRONT.x0} ${FRONT.y1} ${FRONT.x0} ${FRONT.y1 - 5}Z`;
/** The chest's mouth, seen into once the lid is up: the top of the body, inside the belt. */
const MOUTH_FACE = poly([[FRONT.x0, BELT.y0], [FRONT.x1, BELT.y0], back([FRONT.x1, BELT.y0]), back([FRONT.x0, BELT.y0])]);

/** The belt's front, its end turned away, and the bevel along its top edge. */
const BELT_FRONT = upright(BELT.x0, BELT.x1, BELT.y0, BELT.y1);
const BELT_END = poly([[BELT.x1, BELT.y0], back([BELT.x1, BELT.y0]), back([BELT.x1, BELT.y1]), [BELT.x1, BELT.y1]]);
const BELT_BEVEL = upright(BELT.x0, BELT.x1, BELT.y0, BELT.y0 + 2.2);

/** A point on the barrel at `x`, `theta` round from the front foot (0) over the top to the back foot (π). */
const barrel = (x: number, theta: number): Pt => {
  const z = (1 - Math.cos(theta)) / 2;
  return [x + DEPTH[0] * z, LID.foot - LID.rise * Math.sin(theta) + DEPTH[1] * z];
};
/** How that point moves as `theta` grows: the tangent, for the curves' control points. */
const barrelTangent = (theta: number): Pt => [(DEPTH[0] * Math.sin(theta)) / 2, -LID.rise * Math.cos(theta) + (DEPTH[1] * Math.sin(theta)) / 2];
/** The barrel's curve at `x` from one angle round to another, as cubic curves (one a sixth of a turn at most), to follow an `M` or an `L`. */
function arc(x: number, from: number, to: number): string {
  const pieces = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 3)));
  let d = '';
  for (let i = 0; i < pieces; i++) {
    const a = from + ((to - from) * i) / pieces;
    const c = from + ((to - from) * (i + 1)) / pieces;
    const k = (4 / 3) * Math.tan((c - a) / 4);
    const [ax, ay] = barrel(x, a);
    const [atx, aty] = barrelTangent(a);
    const [cx, cy] = barrel(x, c);
    const [ctx, cty] = barrelTangent(c);
    d += `C${n(ax + k * atx)} ${n(ay + k * aty)} ${n(cx - k * ctx)} ${n(cy - k * cty)} ${n(cx)} ${n(cy)}`;
  }
  return d;
}
/** A band of the barrel's front between two x's, from `low` round to `high`: up the far side, across, and down the near. */
const hoop = (x0: number, x1: number, low: number, high: number): string => `M${p(barrel(x0, low))}${arc(x0, low, high)}L${p(barrel(x1, high))}${arc(x1, high, low)}Z`;
/** A line along the barrel at `theta`, the length of the lid unless told otherwise. */
const along = (theta: number, x0 = LID.x0, x1 = LID.x1): string => line(barrel(x0, theta), barrel(x1, theta));

/** The lid's front: the planks from the belt round to where they turn away. */
const LID_FRONT = hoop(LID.x0, LID.x1, 0, THETA_TOP);
/** The planks over the shoulder, in the light. */
const LID_LIGHT = hoop(LID.x0, LID.x1, LID_LIT, THETA_TOP);
/** The end's cap: the whole half-ellipse, turned away from the light. */
const LID_END = `M${p(barrel(LID.x1, 0))}${arc(LID.x1, 0, Math.PI)}Z`;
/** The cap's rim where it shows past the front: from the top round and down to the back foot. */
const CAP_RIM = `M${p(barrel(LID.x1, THETA_TOP))}${arc(LID.x1, THETA_TOP, Math.PI)}`;
/** The whole lid, for its clip and its edge: up the far shoulder, along the top, round the cap and back along the belt. */
const LID_ALL = `M${p(barrel(LID.x0, 0))}${arc(LID.x0, 0, THETA_TOP)}L${p(barrel(LID.x1, THETA_TOP))}${arc(LID.x1, THETA_TOP, Math.PI)}L${p(barrel(LID.x1, 0))}Z`;

/** The lid thrown back: standing on the body's back edge, leaning away, its inside towards us. */
const OPEN = { x0: 33, x1: 109, y0: 52, top: 12 };
const OPEN_FACE = `M${OPEN.x0} ${OPEN.y0}C28 40 29 26 38 ${OPEN.top + 2}L108 ${OPEN.top - 2}C116 24 116 40 ${OPEN.x1} ${OPEN.y0}Z`;
const OPEN_RIM = `M36 ${OPEN.top + 2.5}L110 ${OPEN.top - 1.5}`;

/** The shield of the lock plate: square-shouldered at the top, drawn to a point below. */
const SHIELD = (cx: number, top: number, w: number, point: number): string => {
  const half = w / 2;
  const waist = top + (point - top) * 0.31;
  return `M${n(cx - half)} ${n(top)}H${n(cx + half)}V${n(waist)}C${n(cx + half)} ${n(top + (point - top) * 0.66)} ${n(cx + half * 0.57)} ${n(top + (point - top) * 0.88)} ${n(cx)} ${n(point)}` +
    `C${n(cx - half * 0.57)} ${n(top + (point - top) * 0.88)} ${n(cx - half)} ${n(top + (point - top) * 0.66)} ${n(cx - half)} ${n(waist)}Z`;
};
const PLATE = SHIELD(LOCK.cx, LOCK.top, LOCK.w, LOCK.point);
const PLATE_INNER = SHIELD(LOCK.cx, LOCK.top + 2.2, LOCK.w - 4.4, LOCK.point - 2.8);
/** The round medallion on the plate the keyhole sits in. */
const MEDALLION = { cy: LOCK.top + 15, r: 7.6 };
/** The hasp: the tongue down from the lid's foot that the knob sits on, over the plate's top. */
const HASP = { top: 46.5, w: 12, knob: 50.2 };
const LOCK_BOX: ChestBox = { x: 36, y: 53, w: 32, h: 39 };

/** A four-pointed star, `r` from its middle to a point. */
function star(x: number, y: number, r: number): string {
  const w = r * 0.24;
  return `M${n(x)} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${n(y)}Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${n(y)}Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - r)}Z`;
}

/** A point `r` from (cx, cy), `deg` degrees clockwise from straight up. */
const spoke = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];

// ─────────────────────────────────────────────────────────────── a layer

/** How much is drawn: 0 the tiny chest, 1 the small one, 2 the whole. */
type Detail = 0 | 1 | 2;
const detailOf = (size: number): Detail => (size < CHEST_TINY ? 0 : size < CHEST_SMALL ? 1 : 2);

/** A layer in the making: ids of its own, its defs, its shapes. */
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
  tint: Tint;
  detail: Detail;
  /** the edge round a wooden form, and round a metal one */
  edge: number;
  thin: number;
}

const fill = (d: string, colour: string, more = ''): string => `<path d="${d}" fill="${colour}"${more}/>`;
const stroke = (d: string, colour: string, width: number, more = ''): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;

/** A rivet: a bead of light with its shade under it. */
function rivet(x: number, y: number, metal: Metal, r = 1.7): string {
  return `<circle cx="${n(x + 0.4)}" cy="${n(y + 0.5)}" r="${n(r)}" fill="${metal.deep}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${metal.rivet}"/>`;
}

/** A gold stud in a plank: a smaller bead. */
const stud = (x: number, y: number): string => rivet(x, y, GOLD, 1.4);

// ─────────────────────────────────────────────────────────────── the layers

function shadowLayer(l: Layer): ChestBox {
  const id = l.id('s');
  l.def(
    radialAt(
      id,
      [
        [0, '#000000', 0.32],
        [0.55, '#000000', 0.18],
        [1, '#000000', 0],
      ],
      62,
      109,
      50,
    ),
  );
  // the pool is wider than tall: a radial fade squashed by the ellipse it fills
  l.add(`<ellipse cx="62" cy="109" rx="50" ry="6.5" fill="url(#${id})"/>`);
  return { x: 12, y: 102, w: 100, h: 14 };
}

function bodyLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal } = b.tint;
  l.add(fill(END_FACE, wood.shade));
  l.add(fill(FRONT_FACE, wood.face));
  if (b.detail > 0) {
    // the planks: three seams across the front, and across the end with them
    for (const y of [75, 85, 95]) {
      l.add(stroke(line([FRONT.x0 + 1.5, y], [FRONT.x1, y]), wood.line, 1.5));
      l.add(stroke(line([FRONT.x1, y], back([FRONT.x1 - 1.5, y])), wood.line, 1.3));
    }
  }
  if (b.detail === 2) {
    // the grain: a few short light streaks along the planks, between the straps
    for (const [x0, x1, y] of [[72, 82, 70.5], [73, 80, 80], [71, 83, 90.5], [74, 81, 100.5]] as const) l.add(stroke(line([x0, y], [x1, y]), wood.light, 1.3, ' stroke-opacity="0.5"'));
  }
  if (b.tint.studs && b.detail === 2) for (const [x, y] of [[77, 75], [77, 98]] as const) l.add(stud(x, y));
  // the straps down the front, the corners' and the two in line with the lid's, each bevelled down its left edge and shaded down its right
  for (const [x0, x1] of STRAPS) {
    l.add(fill(upright(x0, x1, FRONT.y0, FRONT.y1), metal.face));
    l.add(fill(upright(x0, x0 + 2.2, FRONT.y0, FRONT.y1), metal.light));
    l.add(fill(upright(x1 - 1.4, x1, FRONT.y0, FRONT.y1), metal.shade));
    if (b.detail > 0) l.add(stroke(upright(x0, x1, FRONT.y0, FRONT.y1), metal.deep, b.thin));
  }
  if (b.detail === 2) for (const [x0, x1] of BANDS) for (const y of [73, 99]) l.add(rivet((x0 + x1) / 2, y, metal));
  // one strap round the end, and the handle on it: a bracket with a ring hanging from it
  const ex = 97;
  const slope = DEPTH[1] / DEPTH[0];
  const at = (x: number, y: number): Pt => [x, y + (x - FRONT.x1) * slope];
  l.add(fill(poly([at(ex, FRONT.y0), at(ex + 6, FRONT.y0), at(ex + 6, FRONT.y1), at(ex, FRONT.y1)]), metal.shade));
  if (b.detail > 0) {
    l.add(fill(poly([at(ex - 1, 71), at(ex + 7, 71), at(ex + 7, 75.5), at(ex - 1, 75.5)]), metal.face));
    l.add(stroke(`M${p(at(ex + 0.5, 75.5))}C${p(at(ex - 1.5, 87))} ${p(at(ex + 7.5, 87))} ${p(at(ex + 5.5, 75.5))}`, metal.face, 2.8));
    l.add(stroke(`M${p(at(ex + 0.5, 75.5))}C${p(at(ex - 1.5, 87))} ${p(at(ex + 7.5, 87))} ${p(at(ex + 5.5, 75.5))}`, metal.deep, b.thin, ' stroke-opacity="0.6"'));
  }
  l.add(stroke(BODY, wood.deep, b.edge));
  // the belt round the seam, over the straps: its end turned away, its front, and the bevel along its top
  l.add(fill(BELT_END, metal.shade));
  l.add(fill(BELT_FRONT, metal.face));
  l.add(fill(BELT_BEVEL, metal.light));
  if (b.detail > 0) {
    l.add(stroke(BELT_FRONT, metal.deep, b.thin));
    l.add(stroke(BELT_END, metal.deep, b.thin));
  }
  if (b.detail === 2) {
    for (const x of [17, 87]) l.add(rivet(x, 60.4, metal));
    // a nick or two in the metal
    for (const [a, c] of [[[74, 58.8], [78, 59.3]], [[21.5, 62], [24.5, 62.5]]] as const) l.add(stroke(line(a, c), metal.light, 1.1));
  }
  return { x: 12, y: 46, w: 98, h: 60 };
}

/** The lid shut: the barrel's front, the light over its shoulder, its end cap, the straps over it, and the hasp with the knob over the lock plate. */
function lidLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal, gem } = b.tint;
  const clip = l.clip(LID_ALL);
  // the front, the planks over the shoulder catching the light, the end cap turned away
  l.add(fill(LID_FRONT, wood.face));
  l.add(fill(LID_LIGHT, wood.light));
  l.add(fill(LID_END, wood.shade));
  l.add(`<g clip-path="url(#${clip})">`);
  if (b.detail > 0) for (const theta of LID_SEAMS) l.add(stroke(along(theta), wood.line, 1.5));
  if (b.detail === 2) {
    // the grain: a few short light streaks along the planks, between the straps; and the planks' ends across the cap
    for (const [x0, x1, deg] of [[38, 52, 8], [72, 82, 24], [44, 56, 30], [40, 50, 40], [74, 82, 46]] as const) l.add(stroke(along(rad(deg), x0, x1), wood.light, 1.3, ' stroke-opacity="0.55"'));
    for (const theta of LID_SEAMS.slice(0, 2)) l.add(stroke(line(barrel(LID.x1 + 0.6, theta), barrel(LID.x1 + 0.6, Math.PI - theta)), wood.line, 1.2));
  }
  if (b.tint.studs && b.detail === 2) for (const x of [44, 52]) l.add(stud(...barrel(x, rad(46))));
  // the straps, in line with the body's: up the barrel and over the shoulder, each bevelled down its left edge and shaded down its right
  for (const [x0, x1] of STRAPS) {
    const strap = hoop(x0, x1, 0, THETA_TOP);
    l.add(fill(strap, metal.face));
    l.add(fill(hoop(x0, x0 + 2.2, 0, THETA_TOP), metal.light));
    l.add(fill(hoop(x1 - 1.4, x1, 0, THETA_TOP), metal.shade));
    if (b.detail > 0) l.add(stroke(strap, metal.deep, b.thin));
  }
  if (b.detail === 2) for (const [x0, x1] of BANDS) for (const deg of [16, 50]) l.add(rivet(...barrel((x0 + x1) / 2, rad(deg)), metal));
  // the cap's rim, where it shows past the front
  l.add(stroke(CAP_RIM, metal.shade, 5));
  if (b.detail > 0) l.add(stroke(CAP_RIM, metal.deep, b.thin, ' transform="translate(-2.6 0)" stroke-opacity="0.7"'));
  if (b.detail === 2) {
    // a nick or two in the metal
    for (const [x0, d0, x1, d1] of [[27.6, 33, 28.3, 39], [66.6, 60, 67.2, 68], [88.5, 122, 88.5, 131]] as const) l.add(stroke(line(barrel(x0, rad(d0)), barrel(x1, rad(d1))), metal.light, 1.1));
  }
  l.add('</g>');
  l.add(stroke(LID_ALL, wood.deep, b.edge));
  // the hasp, down from the lid's foot over the plate's top, with the knob on it: the epic chest's garnet
  const { cx } = LOCK;
  const h = HASP.w / 2;
  l.add(fill(`M${n(cx - h)} ${n(LID.foot + 1)}V${n(HASP.top + 2.5)}Q${n(cx - h)} ${n(HASP.top)} ${n(cx - h + 2.5)} ${n(HASP.top)}H${n(cx + h - 2.5)}Q${n(cx + h)} ${n(HASP.top)} ${n(cx + h)} ${n(HASP.top + 2.5)}V${n(LID.foot + 1)}Z`, metal.face));
  if (b.detail > 0) l.add(stroke(`M${n(cx - h)} ${n(LID.foot + 1)}V${n(HASP.top + 2.5)}Q${n(cx - h)} ${n(HASP.top)} ${n(cx - h + 2.5)} ${n(HASP.top)}H${n(cx + h - 2.5)}Q${n(cx + h)} ${n(HASP.top)} ${n(cx + h)} ${n(HASP.top + 2.5)}V${n(LID.foot + 1)}`, metal.deep, b.thin));
  const knob = gem ? GARNET : { face: metal.rivet, light: '#ffffff', deep: metal.deep };
  l.add(`<circle cx="${cx}" cy="${n(HASP.knob)}" r="3.2" fill="${knob.deep}"/>`);
  l.add(`<circle cx="${cx}" cy="${n(HASP.knob)}" r="2.3" fill="${knob.face}"/>`);
  if (b.detail === 2) l.add(`<circle cx="${n(cx - 0.8)}" cy="${n(HASP.knob - 0.8)}" r="0.8" fill="${knob.light}"/>`);
  return { x: 6, y: 16, w: 108, h: 50 };
}

/** The lid thrown back: its inside towards us, the rim along its top, the bands' undersides down it. */
function lidOpenLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal } = b.tint;
  const clip = l.clip(OPEN_FACE);
  l.add(fill(OPEN_FACE, wood.inside));
  l.add(`<g clip-path="url(#${clip})">`);
  // the plank by the rim, catching the light
  l.add(fill(`M20 24H120V0H20Z`, wood.shade));
  if (b.detail > 0) for (const y of [24, 37]) l.add(stroke(line([26, y], [116, y]), wood.deep, 1.4, ' stroke-opacity="0.7"'));
  for (const [x0, x1] of STRAPS) {
    const dx = DEPTH[0] + 2;
    l.add(fill(`M${n(x0 + dx)} 0H${n(x1 + dx)}V60H${n(x0 + dx)}Z`, metal.shade));
    l.add(fill(`M${n(x0 + dx)} 0H${n(x0 + dx + 2.5)}V60H${n(x0 + dx)}Z`, metal.face));
  }
  l.add('</g>');
  l.add(stroke(OPEN_FACE, wood.deep, b.edge));
  l.add(stroke(OPEN_RIM, metal.face, 6));
  l.add(stroke(`M36 ${OPEN.top + 0.5}L110 ${OPEN.top - 3.5}`, metal.light, 2));
  if (b.detail === 2) for (const x of [44, 72, 100]) l.add(rivet(x, OPEN.top + 1 - (x - 36) * 0.054, metal, 1.5));
  // the hasp, up off the rim
  const hx = LOCK.cx + DEPTH[0] + 2;
  l.add(fill(`M${hx - 5} ${OPEN.top + 1}H${hx + 5}V${OPEN.top - 7}Q${hx + 5} ${OPEN.top - 9} ${hx + 3} ${OPEN.top - 9}H${hx - 3}Q${hx - 5} ${OPEN.top - 9} ${hx - 5} ${OPEN.top - 7}Z`, metal.face));
  return { x: 26, y: 2, w: 92, h: 54 };
}

/** The light inside, drawn open: the mouth lit from within, a bloom out of it, a bright core. */
function lightLayer(l: Layer): ChestBox {
  const [cx, cy] = MOUTH;
  const glow = l.id('g');
  l.def(
    radialAt(
      glow,
      [
        [0, LIGHT.core, 0.95],
        [0.4, LIGHT.glow, 0.6],
        [1, LIGHT.far, 0],
      ],
      cx,
      cy,
      36,
    ),
  );
  l.add(fill(MOUTH_FACE, LIGHT.mouth));
  l.add(`<circle cx="${cx}" cy="${cy}" r="36" fill="url(#${glow})"/>`);
  l.add(`<ellipse cx="${cx}" cy="${n(cy + 1)}" rx="24" ry="5" fill="#ffffff" fill-opacity="0.85"/>`);
  return { x: cx - 36, y: cy - 36, w: 72, h: 72 };
}

/** A fan of rays out of the mouth, long and short by turns, fading away from it; a renderer turns it about the mouth. */
function raysLayer(l: Layer): ChestBox {
  const [cx, cy] = MOUTH;
  const r = 60;
  const fade = l.id('r');
  l.def(
    radialAt(
      fade,
      [
        [0, LIGHT.core, 0.85],
        [0.45, LIGHT.glow, 0.5],
        [1, LIGHT.far, 0],
      ],
      cx,
      cy,
      r,
    ),
  );
  const rays: string[] = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const deg = (i * 360) / count;
    const reach = i % 2 === 0 ? r : r * 0.72;
    const half = i % 2 === 0 ? 3.6 : 2.6;
    rays.push(poly([[cx, cy], spoke(cx, cy, reach, deg - half), spoke(cx, cy, reach, deg + half)]));
  }
  l.add(`<path d="${rays.join('')}" fill="url(#${fade})"/>`);
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}

/** The lock plate: a shield of the chest's metal hung on the belt, square-shouldered with a scroll at each shoulder, a round medallion on it with the keyhole, drawn to a point down the body. */
function lockLayer(l: Layer, b: Brush): ChestBox {
  const { metal } = b.tint;
  const { cx } = LOCK;
  const { cy, r } = MEDALLION;
  l.add(fill(PLATE, metal.deep));
  l.add(fill(PLATE_INNER, metal.face));
  if (b.detail > 0) l.add(stroke(line([cx - LOCK.w / 2 + 2.2, LOCK.top + 2.3], [cx + LOCK.w / 2 - 2.2, LOCK.top + 2.3]), metal.light, 1.8));
  if (b.detail === 2) {
    // the scrolls at the shoulders, engraved
    for (const side of [-1, 1]) {
      const x = cx + side * 9.2;
      l.add(stroke(`M${n(x - 2.6)} ${n(LOCK.top + 6.6)}A2.6 2.6 0 0 1 ${n(x + 2.6)} ${n(LOCK.top + 6.6)}`, metal.shade, 1.6));
    }
  }
  // the medallion: a ring of the metal's shade with the face inside and a glint of light on its upper left
  l.add(`<circle cx="${cx}" cy="${n(cy)}" r="${n(r)}" fill="${metal.shade}"/>`);
  l.add(`<circle cx="${cx}" cy="${n(cy)}" r="${n(r - 2)}" fill="${metal.face}"/>`);
  if (b.detail > 0) l.add(`<path d="M${n(cx - r + 2.6)} ${n(cy - 1)}A${n(r - 2)} ${n(r - 2)} 0 0 1 ${n(cx - 1)} ${n(cy - r + 2.6)}" fill="none" stroke="${metal.light}" stroke-width="1.6" stroke-linecap="round"/>`);
  // the keyhole in the medallion
  const ky = cy - 1.4;
  l.add(fill(`M${cx} ${n(ky - 2.2)}A2.2 2.2 0 1 1 ${n(cx - 0.01)} ${n(ky - 2.2)}ZM${n(cx - 1.3)} ${n(ky + 1)}H${n(cx + 1.3)}L${n(cx + 1.9)} ${n(ky + 5.4)}H${n(cx - 1.9)}Z`, metal.deep));
  if (b.detail === 2) for (const x of [cx - 10.2, cx + 10.2]) l.add(rivet(x, cy - 2, metal, 1.3));
  return LOCK_BOX;
}

/** A band of light across the lock plate at `phase` (0 left of it, 1 past it): the frames of a glint passing over it. */
function glintLayer(l: Layer, phase: number): ChestBox {
  const clip = l.clip(PLATE);
  const band = l.id('b');
  l.def(
    linearAt(
      band,
      [
        [0, '#ffffff', 0],
        [0.5, '#ffffff', 0.55],
        [1, '#ffffff', 0],
      ],
      -5,
      0,
      5,
      0,
    ),
  );
  const x = LOCK.cx - LOCK.w / 2 - 12 + phase * (LOCK.w + 24);
  l.add(`<g clip-path="url(#${clip})"><g transform="translate(${n(x)} ${n(LOCK.top + 14)}) rotate(24)"><rect x="-5" y="-30" width="10" height="60" fill="url(#${band})"/></g></g>`);
  return LOCK_BOX;
}

/** A few stars round the chest, for the moment it opens. */
function sparkleLayer(l: Layer): ChestBox {
  const stars: readonly (readonly [number, number, number])[] = [
    [18, 34, 8],
    [104, 20, 10],
    [114, 72, 6],
    [8, 84, 7],
    [72, 6, 6],
  ];
  l.add(`<path d="${stars.map(([x, y, r]) => star(x, y, r)).join('')}" fill="#ffffff"/>`);
  l.add(`<path d="${stars.map(([x, y, r]) => star(x, y, r * 0.45)).join('')}" fill="${LIGHT.glow}"/>`);
  return CHEST_VIEW;
}

// ─────────────────────────────────────────────────────────────── the drawing

const isTier = (tier: unknown): tier is ChestTier => tier === 'common' || tier === 'rare' || tier === 'epic';

function brush(tier: ChestTier, size: number): Brush {
  const detail = detailOf(size);
  return { tint: CHEST_TINTS[tier], detail, edge: detail === 0 ? 4 : detail === 1 ? 3 : 2.4, thin: detail === 0 ? 1.6 : 1.1 };
}

/** One layer, drawn with ids of its own. */
function layer(id: ChestLayerId, prefix: string, draw: (l: Layer) => ChestBox): ChestLayer {
  const l = new Layer(`${prefix}${id}`);
  const box = draw(l);
  return { id, box, markup: l.markup() };
}

/** The chest at `tier`, as layers a renderer stacks and moves; `size` is how wide the shut chest is shown. */
export function chestDrawing(tier: ChestTier, opts: ChestOptions = {}): ChestDrawing {
  if (!isTier(tier)) throw new RangeError(`art: no chest for tier ${String(tier)}`);
  const size = opts.size ?? 96;
  if (!Number.isFinite(size) || size <= 0) throw new RangeError(`art: size must be a positive number, got ${String(size)}`);
  const b = brush(tier, size);
  const prefix = prefixFor(opts.idPrefix, 'chest', tier, b.detail);
  return {
    tier,
    view: CHEST_VIEW,
    box: CHEST_BOX,
    hinge: HINGE,
    mouth: MOUTH,
    layers: {
      shadow: layer('shadow', prefix, shadowLayer),
      lidOpen: layer('lidOpen', prefix, (l) => lidOpenLayer(l, b)),
      rays: layer('rays', prefix, raysLayer),
      body: layer('body', prefix, (l) => bodyLayer(l, b)),
      light: layer('light', prefix, lightLayer),
      lock: layer('lock', prefix, (l) => lockLayer(l, b)),
      glint: layer('glint', prefix, (l) => glintLayer(l, 0.5)),
      lid: layer('lid', prefix, (l) => lidLayer(l, b)),
      sparkle: layer('sparkle', prefix, sparkleLayer),
    },
  };
}

/** The glint over the lock plate at `phase` (0–1) of its way across, as a layer of its own: a renderer steps through phases. */
export function chestGlint(phase: number, opts: { idPrefix?: string } = {}): ChestLayer {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) throw new RangeError(`art: phase must be 0–1, got ${String(phase)}`);
  const prefix = prefixFor(opts.idPrefix, 'chestglint', n2(phase));
  return layer('glint', prefix, (l) => glintLayer(l, phase));
}

/** A layer as a picture of its own, its box as its viewBox, for a renderer that stacks the layers itself. */
export function chestLayerSvg(l: ChestLayer): string {
  const { x, y, w, h } = l.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">${l.markup}</svg>`;
}

/** The layers a shut chest shows, and an open one. */
const SHUT: readonly ChestLayerId[] = ['shadow', 'body', 'lock', 'lid'];
const OPENED: readonly ChestLayerId[] = ['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock'];

/**
 * The whole chest in one picture, shut or open, on the 120 × 120 canvas:
 * each layer in a group named for it (`data-part`), so a page can move the
 * groups; `allLayers` puts every layer in, hidden or not, for a page that
 * shows and hides them itself.
 */
export function chestSvg(opts: ChestSvgOptions): string {
  const { tier, open = false, allLayers = false } = opts;
  const drawing = chestDrawing(tier, opts);
  const size = opts.size ?? 96;
  const shown = allLayers ? CHEST_LAYERS : open ? OPENED : SHUT;
  const t = `${prefixFor(opts.idPrefix, 'chest', tier, detailOf(size))}t`;
  const groups = shown.map((id) => `<g data-part="${id}">${drawing.layers[id].markup}</g>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(size)}" height="${n2(size)}" viewBox="0 0 ${CANVAS} ${CANVAS}" role="img" aria-labelledby="${t}">` +
    `<title id="${t}">${escapeXml(opts.title ?? 'Chest')}</title>${groups}</svg>`
  );
}

// ─────────────────────────────────────────────────────────────── the hop

/**
 * How a chest opens: not a lid lifting off a box that stands still, but the
 * whole chest jumping for joy. It crouches, with a shiver of effort, springs
 * up stretching tall, and the lid bursts open at the top of the hop; it lands
 * wide and short, rebounds, and settles while the lid rocks back onto its
 * hinge and the stars fly. One second, end to end.
 *
 * Pure numbers, as shares of `CHEST_HOP_MS`, so the phone (one value run
 * straight through them) and the website (keyframes at the same shares,
 * quests.css) play the same hop, and it is tested without a screen.
 * Everything but the shadow moves as one piece about the chest's foot
 * (`CHEST_FOOT`), which a squash and a stretch keep still; the shadow stays
 * on the ground and shrinks while the chest is in the air.
 */
export const CHEST_HOP_MS = 1000;
/** The point the chest stands on, in the drawing's units. */
export const CHEST_FOOT: Pt = [60, 104];

/** The chest's body at one moment of the hop: how high (as a share of its box's height, up), how wide and tall, and its lean. */
export interface ChestHopFrame {
  at: number;
  rise: number;
  wide: number;
  tall: number;
  tilt: number;
}

export const CHEST_HOP: readonly ChestHopFrame[] = [
  { at: 0, rise: 0, wide: 1, tall: 1, tilt: 0 },
  // the crouch, and a shiver in it
  { at: 0.12, rise: 0, wide: 1.1, tall: 0.86, tilt: 0 },
  { at: 0.15, rise: 0, wide: 1.1, tall: 0.86, tilt: -3 },
  { at: 0.18, rise: 0, wide: 1.1, tall: 0.86, tilt: 3 },
  { at: 0.21, rise: 0, wide: 1.1, tall: 0.86, tilt: -2 },
  { at: 0.24, rise: 0, wide: 1.08, tall: 0.9, tilt: 0 },
  // up, stretching; the top of the hop is where the lid bursts open
  { at: 0.34, rise: 0.24, wide: 0.92, tall: 1.12, tilt: 0 },
  { at: 0.44, rise: 0.3, wide: 0.96, tall: 1.06, tilt: 0 },
  { at: 0.52, rise: 0.2, wide: 0.94, tall: 1.1, tilt: 0 },
  // the landing, wide and short, and the settling
  { at: 0.6, rise: 0, wide: 1.14, tall: 0.84, tilt: 0 },
  { at: 0.72, rise: 0, wide: 0.97, tall: 1.05, tilt: 0 },
  { at: 0.84, rise: 0, wide: 1.01, tall: 0.98, tilt: 0 },
  { at: 1, rise: 0, wide: 1, tall: 1, tilt: 0 },
];

/** A part's own measure through the hop: `[share of the hop, value]`, straight lines between. */
export type ChestHopCurve = readonly (readonly [number, number])[];

/** When the chest lands: the moment it is felt, the ring widens and the gold is thrown. */
export const CHEST_HOP_LAND = 0.6;
/**
 * The lid, 0 shut → 1 open, as the renderers already read it: shut through
 * the crouch, thrown open on the way up, past open as the chest lands, and
 * rocking back onto its hinge.
 */
export const CHEST_HOP_LID: ChestHopCurve = [
  [0, 0],
  [0.3, 0],
  [0.5, 1],
  [0.62, 1.18],
  [0.74, 0.94],
  [0.86, 1.02],
  [1, 1],
];
/** The light inside, 0 → 1: blooming as the lid opens. */
export const CHEST_HOP_LIGHT: ChestHopCurve = [
  [0, 0],
  [0.4, 0],
  [0.62, 1],
  [1, 1],
];
/** The shadow's size, 1 at rest: smallest under the chest at the top of its hop, pressed wide as it lands. */
export const CHEST_HOP_SHADOW: ChestHopCurve = [
  [0, 1],
  [0.24, 1.04],
  [0.44, 0.8],
  [0.6, 1.1],
  [0.72, 1],
  [1, 1],
];
/** The stars, 0 → 1 through their burst: from the landing to the end of the hop. */
export const CHEST_HOP_SPARKLE: ChestHopCurve = [
  [0, 0],
  [CHEST_HOP_LAND - 0.02, 0],
  [1, 1],
];

/** A curve's value at `share` of the hop, straight lines between its points; held flat beyond its ends. */
export function chestHopAt(curve: ChestHopCurve, share: number): number {
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (first === undefined || last === undefined) throw new RangeError('art: an empty hop curve');
  if (share <= first[0]) return first[1];
  if (share >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, v1] = curve[i] as readonly [number, number];
    if (share > t1) continue;
    const [t0, v0] = curve[i - 1] as readonly [number, number];
    return t1 === t0 ? v1 : v0 + ((share - t0) / (t1 - t0)) * (v1 - v0);
  }
  return last[1];
}
