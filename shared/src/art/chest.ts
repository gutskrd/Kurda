/**
 * The quest reward chest in three tiers, drawn alike by both apps as a sandûq, the painted wooden chest of the lesson
 * road (path-land.ts): seen from three quarters a little above, a barrel lid on a box standing on a plinth and feet,
 * metal arches over the lid's ends and down the corners, and a hasp over the seam. A common chest is plain oak in iron,
 * a rare one the road's amber wood in brass with a kilim strap, an epic one pomegranate lacquer in gold with a kilim
 * strap and a garnet. Flat painted planes lit from the upper left, one light and one shade step to a form and no
 * outlines; the only gradients are the soft lights and the ground shadow. It is built as layers with stable ids, back
 * to front, because the renderers animate them (lid, the light at its seam, the light inside, rays, the hasp's glint,
 * sparkles); each layer is self-contained markup on the one 120 × 120 canvas, and `chestSvg` is the whole picture.
 */
import type { ChestTier } from '../quests.js';
import { rad } from './geometry.js';
import { kilimAlong } from './paint.js';
import { CANVAS, escapeXml, linearAt, n, n2, prefixFor, radialAt, type Pt } from './svg.js';

export type { ChestTier } from '../quests.js';

/** The layers, back to front. */
export const CHEST_LAYERS = ['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock', 'glint', 'lid', 'seam', 'sparkle'] as const;
export type ChestLayerId = (typeof CHEST_LAYERS)[number];

/** A box in the drawing's units. */
export interface ChestBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One layer: its markup (defs and shapes, no `<svg>`) and the box round everything it draws. */
export interface ChestLayer {
  id: ChestLayerId;
  box: ChestBox;
  markup: string;
}

export interface ChestDrawing {
  tier: ChestTier;
  /** The canvas every layer is drawn in. */
  view: ChestBox;
  /** The shut chest with its shadow, which renderers size by. */
  box: ChestBox;
  /** Where the lid turns: renderers rotate the shut lid and swing the open one about it. */
  hinge: Pt;
  /** The middle of the chest's mouth, where the light and rays come from and the rays sway about. */
  mouth: Pt;
  layers: Readonly<Record<ChestLayerId, ChestLayer>>;
}

export interface ChestOptions {
  /** Display width of the shut chest in pixels; below `CHEST_SMALL` the fine detail is dropped. */
  size?: number;
  idPrefix?: string;
}

export interface ChestSvgOptions extends ChestOptions {
  tier: ChestTier;
  /** Draw it open: the lid thrown back and the light coming out. */
  open?: boolean;
  /** Every layer, for a page that shows and animates them itself; otherwise only what the shut or open chest shows. */
  allLayers?: boolean;
  /** The accessible label. */
  title?: string;
}

/** The canvas, and the shut chest's box in it (plinth to plinth and the lid's lift, the arches' tops to the shadow). */
export const CHEST_VIEW: ChestBox = { x: 0, y: 0, w: CANVAS, h: CANVAS };
export const CHEST_BOX: ChestBox = { x: 8, y: 24, w: 104, h: 90 };
/** Below this width in pixels the studs and grain go; below `CHEST_TINY` the plank lines and lozenges go too. */
export const CHEST_SMALL = 56;
export const CHEST_TINY = 30;

/** The offset from the chest's front to its back, seen from three quarters and a little above. */
const DEPTH: Pt = [16, -9];

// ─────────────────────────────────────────────────────────────── colours

/** A wood: plank face, lit plank, the end turned away, plank lines, darkest tone, and the inside. */
interface Wood {
  face: string;
  light: string;
  shade: string;
  line: string;
  deep: string;
  inside: string;
}
/** A metal: face, highlight, shade, darkest tone, and the nail heads' light. */
interface Metal {
  face: string;
  light: string;
  shade: string;
  deep: string;
  rivet: string;
}
/** A kilim strap: its ground, its edges and lozenges, and the lozenges' eyes. */
interface Strap {
  ground: string;
  light: string;
  eye: string;
}

/** Plain oak, weathered toward grey. */
const OAK: Wood = { face: '#a27a4f', light: '#bd9466', shade: '#7a5733', line: '#5e4226', deep: '#3e2b18', inside: '#4a3420' };
/** The road's sandûq wood (path-land.ts). */
const AMBER: Wood = { face: '#b86f35', light: '#d18a4b', shade: '#8c4f22', line: '#6e3b17', deep: '#4a2710', inside: '#4a2812' };
/** Pomegranate lacquer. */
const POMEGRANATE: Wood = { face: '#a8233a', light: '#c9455c', shade: '#7c1528', line: '#6a1021', deep: '#3b0810', inside: '#5a0f1e' };
/** Dark iron, a warm grey rather than blue. */
const IRON: Metal = { face: '#77716b', light: '#a49d96', shade: '#55504b', deep: '#2f2c29', rivet: '#bdb6ae' };
/** The road's brass (path-land.ts). */
const BRASS: Metal = { face: '#e2b24a', light: '#f3d27e', shade: '#b07f1e', deep: '#6b4510', rivet: '#fbe7b0' };
/** The badges' sun gold (palette.ts). */
const GOLD: Metal = { face: '#ffbd1f', light: '#ffe16a', shade: '#d9800b', deep: '#6b3500', rivet: '#fff8d1' };
/** The road's kilim strap: madder with cream lozenges; the epic chest's is aubergine with gold ones. */
const MADDER_STRAP: Strap = { ground: '#b8323a', light: '#f3e1b5', eye: '#5a1a1f' };
const AUBERGINE_STRAP: Strap = { ground: '#4a1c2a', light: '#ffd24a', eye: '#a8233a' };
/** The garnet on the epic chest's hasp: a pomegranate seed. */
const GARNET = { face: '#c8243f', light: '#ff8aa0', deep: '#6b0d22' };
/** The white-gold light inside, and the rays. */
const LIGHT = { core: '#fff6cc', glow: '#ffd75a', far: '#ffc43a', mouth: '#ffe08a' };
/** The gold heaped in an open chest. */
const COIN = { face: '#ffc93a', light: '#ffe58a', shade: '#d98f12' };

interface Tint {
  wood: Wood;
  metal: Metal;
  /** The kilim strap over the lid and down the front; a common chest has none. */
  strap: Strap | null;
  /** The lid's lining, seen when it is thrown back. */
  lining: string;
  gem: boolean;
  /** Nail heads along the strap and painted lozenges on the front. */
  studs: boolean;
}

export const CHEST_TINTS: Readonly<Record<ChestTier, Tint>> = {
  common: { wood: OAK, metal: IRON, strap: null, lining: OAK.inside, gem: false, studs: false },
  rare: { wood: AMBER, metal: BRASS, strap: MADDER_STRAP, lining: '#9a2a33', gem: false, studs: false },
  epic: { wood: POMEGRANATE, metal: GOLD, strap: AUBERGINE_STRAP, lining: '#5a0f1e', gem: true, studs: true },
};

// ─────────────────────────────────────────────────────────────── shapes

/** The box's front face, from the seam to the plinth. */
const FRONT = { x0: 17, x1: 85, y0: 62, y1: 99 };
/** The plinth it stands on, a little wider, and the feet under it. */
const PLINTH = { x0: 15, x1: 87, y0: 97.5, y1: 103 };
const FEET: readonly (readonly [number, number])[] = [
  [18, 27],
  [75, 84],
];
const FOOT_DROP = 4;
/** The lid: a barrel as wide as the box and a little past it, standing `rise` above the seam. */
const LID = { x0: 16, x1: 86, foot: FRONT.y0, rise: 25 };
const THETA_TOP = Math.PI - Math.atan(LID.rise / (-DEPTH[1] / 2));
/** The lid's plank seams, as angles round the barrel. */
const LID_SEAMS: readonly number[] = [24, 52, 78].map(rad);
/** The light falls on the barrel from this angle round to the top. */
const LID_LIT = rad(50);
/** The metal arches over the lid's ends and the uprights down the box's front corners, as each one's left and right x. */
const ARCHES: readonly (readonly [number, number])[] = [
  [LID.x0, LID.x0 + 7],
  [LID.x1 - 7, LID.x1],
];
const CORNERS: readonly (readonly [number, number])[] = [
  [FRONT.x0, FRONT.x0 + 6],
  [FRONT.x1 - 6, FRONT.x1],
];
/**
 * The kilim strap over the lid and down the front; the lock plate on the box just under the seam, and the lid's hasp, a
 * tongue hanging from its edge over the plate's top with a knob at its foot.
 */
const STRAP = { cx: 51, w: 12 };
const LOCK = { cx: STRAP.cx, top: 64, bottom: 80, w: 13 };
const HASP = { cx: STRAP.cx, top: 54.5, foot: 68, w: 7 };
const MOUTH: Pt = [59, 57.5];
const HINGE: Pt = [67, 53];

const back = ([x, y]: Pt): Pt => [x + DEPTH[0], y + DEPTH[1]];
const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
const poly = (pts: readonly Pt[]): string => `M${pts.map(p).join('L')}Z`;
const line = (a: Pt, b: Pt): string => `M${p(a)}L${p(b)}`;
const rect = (x0: number, x1: number, y0: number, y1: number): string => `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;
/** A point on the box's end at `x` past its front edge (along the depth) and `y` down its front edge. */
const onEnd = (along: number, y: number): Pt => [FRONT.x1 + along * DEPTH[0], y + along * DEPTH[1]];

/** The box's front face, its foot corners rounded a little. */
const FRONT_FACE = `M${FRONT.x0} ${FRONT.y0}H${FRONT.x1}V${FRONT.y1}H${FRONT.x0}Z`;
/** The box's end, turned away. */
const END_FACE = poly([[FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x1, FRONT.y1]), [FRONT.x1, FRONT.y1]]);
/** The plinth's front and its end, and its lit top edge. */
const PLINTH_FRONT = `M${PLINTH.x0} ${PLINTH.y0}H${PLINTH.x1}V${PLINTH.y1 - 1.5}Q${PLINTH.x1} ${PLINTH.y1} ${PLINTH.x1 - 1.5} ${PLINTH.y1}H${PLINTH.x0 + 1.5}Q${PLINTH.x0} ${PLINTH.y1} ${PLINTH.x0} ${PLINTH.y1 - 1.5}Z`;
const PLINTH_END = poly([[PLINTH.x1, PLINTH.y0], back([PLINTH.x1, PLINTH.y0]), back([PLINTH.x1, PLINTH.y1]), [PLINTH.x1, PLINTH.y1]]);
/** The chest's mouth, seen once the lid is up: the top of the box. */
const MOUTH_FACE = poly([[FRONT.x0, FRONT.y0], [FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x0, FRONT.y0])]);

/** A point on the barrel at `x`, `theta` round from the front foot (0) over the top to the back foot (π). */
const barrel = (x: number, theta: number): Pt => {
  const z = (1 - Math.cos(theta)) / 2;
  return [x + DEPTH[0] * z, LID.foot - LID.rise * Math.sin(theta) + DEPTH[1] * z];
};
/** The barrel's tangent at `theta`, for curve control points. */
const barrelTangent = (theta: number): Pt => [(DEPTH[0] * Math.sin(theta)) / 2, -LID.rise * Math.cos(theta) + (DEPTH[1] * Math.sin(theta)) / 2];
/** The barrel's curve at `x` between two angles as cubics (at most a sixth of a turn each), continuing an `M` or `L`. */
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
/** A line along the barrel at `theta`, the lid's length by default. */
const along = (theta: number, x0 = LID.x0, x1 = LID.x1): string => line(barrel(x0, theta), barrel(x1, theta));

/** The lid's front: the planks from the seam round to where they turn away. */
const LID_FRONT = hoop(LID.x0, LID.x1, 0, THETA_TOP);
/** The lit planks over the shoulder. */
const LID_LIGHT = hoop(LID.x0, LID.x1, LID_LIT, THETA_TOP);
/** The end cap: the whole half-ellipse, turned away from the light. */
const LID_END = `M${p(barrel(LID.x1, 0))}${arc(LID.x1, 0, Math.PI)}Z`;
/** The whole lid, for its clip: up the far shoulder, along the top, round the cap and back along the seam. */
const LID_ALL = `M${p(barrel(LID.x0, 0))}${arc(LID.x0, 0, THETA_TOP)}L${p(barrel(LID.x1, THETA_TOP))}${arc(LID.x1, THETA_TOP, Math.PI)}L${p(barrel(LID.x1, 0))}Z`;
/** The right arch as it runs on round the end cap's rim to the back. */
const CAP_RIM = `M${p(barrel(LID.x1, THETA_TOP))}${arc(LID.x1, THETA_TOP, Math.PI)}`;

/**
 * The lid thrown back on its hinge along the box's back edge, leaning away, its lining toward us: its foot on the back
 * edge, its far edge (the shut lid's front) high above, bowed as the barrel is.
 */
const OPEN = { l: back([FRONT.x0, FRONT.y0]), r: back([FRONT.x1, FRONT.y0]), topL: [31, 18] as Pt, topR: [103, 13] as Pt, bow: 5 };
const OPEN_FACE =
  `M${p(OPEN.l)}C${n(OPEN.l[0] - 1.5)} ${n(OPEN.l[1] - 14)} ${n(OPEN.topL[0] - 1.5)} ${n(OPEN.topL[1] + 12)} ${p(OPEN.topL)}` +
  `Q${n((OPEN.topL[0] + OPEN.topR[0]) / 2)} ${n((OPEN.topL[1] + OPEN.topR[1]) / 2 - OPEN.bow)} ${p(OPEN.topR)}` +
  `C${n(OPEN.topR[0] + 1.5)} ${n(OPEN.topR[1] + 12)} ${n(OPEN.r[0] + 1.5)} ${n(OPEN.r[1] - 14)} ${p(OPEN.r)}Z`;
/** The open lid's rim along its far edge. */
const OPEN_RIM = `M${p(OPEN.topL)}Q${n((OPEN.topL[0] + OPEN.topR[0]) / 2)} ${n((OPEN.topL[1] + OPEN.topR[1]) / 2 - OPEN.bow)} ${p(OPEN.topR)}`;

/** A plate `w` wide from `top` to `bottom`, square-shouldered and rounded below, `inset` in from its edge. */
function plate(cx: number, top: number, bottom: number, w: number, inset = 0): string {
  const h = w / 2 - inset;
  const t = top + inset;
  const b = bottom - inset;
  const r = Math.min(2, h);
  return `M${n(cx - h)} ${n(t + r)}Q${n(cx - h)} ${n(t)} ${n(cx - h + r)} ${n(t)}H${n(cx + h - r)}Q${n(cx + h)} ${n(t)} ${n(cx + h)} ${n(t + r)}V${n(b - h)}Q${n(cx + h)} ${n(b)} ${n(cx)} ${n(b)}Q${n(cx - h)} ${n(b)} ${n(cx - h)} ${n(b - h)}Z`;
}
const PLATE = plate(LOCK.cx, LOCK.top, LOCK.bottom, LOCK.w);
const LOCK_BOX: ChestBox = { x: LOCK.cx - LOCK.w / 2 - 1, y: LOCK.top - 1, w: LOCK.w + 2, h: LOCK.bottom - LOCK.top + 2 };

/** A four-pointed star, `r` from its middle to a point. */
function star(x: number, y: number, r: number): string {
  const w = r * 0.24;
  return `M${n(x)} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${n(y)}Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${n(y)}Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - r)}Z`;
}

/** A point `r` from (cx, cy), `deg` degrees clockwise from straight up. */
const spoke = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;

// ─────────────────────────────────────────────────────────────── a layer

/** How much is drawn: 0 the tiny chest, 1 the small one, 2 the whole. */
type Detail = 0 | 1 | 2;
const detailOf = (size: number): Detail => (size < CHEST_TINY ? 0 : size < CHEST_SMALL ? 1 : 2);

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
  tint: Tint;
  detail: Detail;
}

const fill = (d: string, colour: string, more = ''): string => `<path d="${d}" fill="${colour}"${more}/>`;
const stroke = (d: string, colour: string, width: number, more = ''): string =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;

/** A nail head: a bead of light over its shade. */
function rivet(x: number, y: number, metal: Metal, r = 1.3): string {
  return `<circle cx="${n(x + 0.3)}" cy="${n(y + 0.4)}" r="${n(r)}" fill="${metal.deep}" fill-opacity="0.55"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${metal.rivet}"/>`;
}

/** A metal upright on the front between two x's: its face, the lit edge toward the light and the shade away from it. */
function upright(x0: number, x1: number, y0: number, y1: number, metal: Metal): string {
  return fill(rect(x0, x1, y0, y1), metal.face) + fill(rect(x0, x0 + 1.6, y0, y1), metal.light) + fill(rect(x1 - 1.3, x1, y0, y1), metal.shade);
}

// ─────────────────────────────────────────────────────────────── the layers

function shadowLayer(l: Layer): ChestBox {
  const id = l.id('s');
  l.def(
    radialAt(
      id,
      [
        [0, '#000000', 0.3],
        [0.6, '#000000', 0.16],
        [1, '#000000', 0],
      ],
      61,
      104,
      50,
    ),
  );
  // The pool lies under the plinth, wider than tall: a radial fade squashed by its ellipse.
  l.add(`<ellipse cx="61" cy="104" rx="50" ry="7.5" fill="url(#${id})"/>`);
  return { x: 11, y: 96, w: 100, h: 16 };
}

function bodyLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal, strap, studs } = b.tint;
  // The feet under the plinth: the two in front, and the far one at the back of the end.
  const feet = FEET.map(([x0, x1]) => rect(x0, x1, PLINTH.y1 - 1, PLINTH.y1 + FOOT_DROP)).join('');
  const far = poly([back([PLINTH.x1 - 9, PLINTH.y1 - 1]), back([PLINTH.x1 - 1, PLINTH.y1 - 1]), back([PLINTH.x1 - 1, PLINTH.y1 + FOOT_DROP]), back([PLINTH.x1 - 9, PLINTH.y1 + FOOT_DROP])]);
  l.add(fill(far + feet, wood.deep));
  // The end, turned away, and the lit front.
  l.add(fill(END_FACE, wood.shade));
  l.add(fill(FRONT_FACE, wood.face));
  // The lid's lip throws a narrow shade along the top of the box.
  l.add(fill(rect(FRONT.x0, FRONT.x1, FRONT.y0, FRONT.y0 + 3), wood.shade));
  l.add(fill(poly([[FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x1, FRONT.y0 + 3]), [FRONT.x1, FRONT.y0 + 3]]), wood.deep, ' fill-opacity="0.35"'));
  if (b.detail > 0) {
    // The planks: two seams across the front and on round the end.
    for (const y of [75, 87]) {
      l.add(stroke(line([FRONT.x0, y], [FRONT.x1, y]), wood.line, 1.1));
      l.add(stroke(line([FRONT.x1, y], back([FRONT.x1, y])), wood.line, 1, ' stroke-opacity="0.8"'));
    }
  }
  if (b.detail === 2) {
    // The grain: a few short light streaks along the planks.
    for (const [x0, x1, y] of [[27, 38, 69], [62, 74, 70.5], [28, 36, 81], [60, 70, 82], [64, 76, 93], [26, 40, 93.5]] as const) {
      l.add(stroke(line([x0, y], [x1, y]), wood.light, 1.1, ' stroke-opacity="0.55"'));
    }
  }
  if (studs && b.detail === 2) {
    // Painted lozenges either side of the strap, in the metal's colour.
    for (const cx of [35, 67]) l.add(kilimAlong([{ p: [cx, 81] as Pt, angle: 0 }], 9, metal.face, wood.deep));
  }
  // The plinth: its end, its front, and the light along its top edge.
  l.add(fill(PLINTH_END, wood.deep));
  l.add(fill(PLINTH_FRONT, wood.shade));
  l.add(fill(rect(PLINTH.x0 + 0.6, PLINTH.x1, PLINTH.y0, PLINTH.y0 + 1.4), wood.face));
  // The kilim strap down the front, from under the hasp to the plinth.
  if (strap) {
    const { cx, w } = STRAP;
    l.add(fill(rect(cx - w / 2, cx + w / 2, FRONT.y0, FRONT.y1), strap.ground));
    if (b.detail > 0) {
      l.add(stroke(`M${n(cx - w / 2 + 1.6)} ${FRONT.y0}V${FRONT.y1}M${n(cx + w / 2 - 1.6)} ${FRONT.y0}V${FRONT.y1}`, strap.light, 0.9));
      l.add(kilimAlong([80, 91].map((y) => ({ p: [cx, y] as Pt, angle: 0 })), 6.2, strap.light, strap.eye));
    }
    if (studs && b.detail === 2) for (const y of [70, 80, 90]) for (const side of [-1, 1]) l.add(rivet(cx + side * (w / 2 + 1.6), y, metal, 1));
  }
  // The metal uprights down the front corners, and the one on the end's far edge, foreshortened.
  for (const [x0, x1] of CORNERS) l.add(upright(x0, x1, FRONT.y0, FRONT.y1, metal));
  l.add(fill(poly([onEnd(0.8, FRONT.y0), onEnd(1, FRONT.y0), onEnd(1, FRONT.y1), onEnd(0.8, FRONT.y1)]), metal.shade));
  if (b.detail === 2) for (const [x0, x1] of CORNERS) for (const y of [68, 92]) l.add(rivet((x0 + x1) / 2, y, metal));
  // A ring handle on the end, hanging from its bracket.
  if (b.detail > 0) {
    const [hx, hy] = onEnd(0.5, 74);
    l.add(fill(poly([[hx - 2.6, hy - 1.2], [hx + 2.6, hy - 2.7], [hx + 2.6, hy + 0.6], [hx - 2.6, hy + 2.1]]), metal.shade));
    l.add(stroke(`M${n(hx - 2.2)} ${n(hy + 1.6)}C${n(hx - 3)} ${n(hy + 9)} ${n(hx + 3.6)} ${n(hy + 7)} ${n(hx + 2.2)} ${n(hy + 0.2)}`, metal.deep, 1.6));
  }
  return { x: 13, y: 52, w: 92, h: 56 };
}

/** The shut lid: the barrel's front, its lit shoulder and the cap turned away, the arches, and the strap over the top. */
function lidLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal, strap, studs, gem } = b.tint;
  const clip = l.clip(LID_ALL);
  l.add(fill(LID_FRONT, wood.face));
  l.add(fill(LID_LIGHT, wood.light));
  l.add(fill(LID_END, wood.shade));
  l.add(`<g clip-path="url(#${clip})">`);
  if (b.detail > 0) for (const theta of LID_SEAMS) l.add(stroke(along(theta), wood.line, 1.1, ' stroke-opacity="0.85"'));
  if (b.detail === 2) {
    // The grain between the arches, and the plank ends across the cap.
    for (const [x0, x1, deg] of [[28, 40, 12], [62, 74, 14], [30, 42, 38], [60, 70, 40], [36, 46, 64], [64, 74, 66]] as const) {
      l.add(stroke(along(rad(deg), x0, x1), wood.shade, 1, ' stroke-opacity="0.3"'));
    }
    for (const theta of LID_SEAMS.slice(0, 2)) l.add(stroke(line(barrel(LID.x1 + 0.6, theta), barrel(LID.x1 + 0.6, Math.PI - theta)), wood.line, 1, ' stroke-opacity="0.7"'));
  }
  // The kilim strap over the barrel, under the hasp.
  if (strap) {
    const { cx, w } = STRAP;
    l.add(fill(hoop(cx - w / 2, cx + w / 2, 0, THETA_TOP), strap.ground));
    if (b.detail > 0) {
      l.add(stroke(`M${p(barrel(cx - w / 2 + 1.6, 0))}${arc(cx - w / 2 + 1.6, 0, THETA_TOP)}M${p(barrel(cx + w / 2 - 1.6, 0))}${arc(cx + w / 2 - 1.6, 0, THETA_TOP)}`, strap.light, 0.9));
      l.add(kilimAlong([{ p: barrel(cx, rad(62)), angle: 0 }], 6, strap.light, strap.eye));
    }
    if (studs && b.detail === 2) for (const deg of [22, 52]) for (const side of [-1, 1]) l.add(rivet(...barrel(cx + side * (w / 2 + 1.6), rad(deg)), metal, 1));
  }
  // The arches over the lid's ends, lit along their left edge, shaded along their right.
  for (const [x0, x1] of ARCHES) {
    l.add(fill(hoop(x0, x1, 0, THETA_TOP), metal.face));
    l.add(fill(hoop(x0, x0 + 1.6, 0, THETA_TOP), metal.light));
    l.add(fill(hoop(x1 - 1.3, x1, 0, THETA_TOP), metal.shade));
  }
  // The right arch runs on round the cap's rim.
  l.add(stroke(CAP_RIM, metal.shade, 4.4));
  if (b.detail === 2) for (const [x0, x1] of ARCHES) for (const deg of [16, 48, 80]) l.add(rivet(...barrel((x0 + x1) / 2, rad(deg)), metal));
  l.add('</g>');
  // The hasp, hanging from the lid's edge over the lock plate, with a knob at its foot (the epic chest's garnet).
  const { cx, top, foot, w } = HASP;
  l.add(fill(plate(cx, top, foot, w), metal.shade));
  l.add(fill(plate(cx, top, foot, w, 0.9), metal.face));
  if (b.detail > 0) l.add(fill(rect(cx - w / 2 + 0.9, cx - w / 2 + 2, top + 1.5, foot - 4), metal.light));
  const knob = gem ? GARNET : { face: metal.rivet, light: '#ffffff', deep: metal.deep };
  const ky = foot - 3.4;
  l.add(`<circle cx="${cx}" cy="${n(ky)}" r="${gem ? 3.9 : 2.6}" fill="${metal.shade}"/>`);
  l.add(`<circle cx="${cx}" cy="${n(ky)}" r="${gem ? 3 : 1.8}" fill="${knob.deep}"/>`);
  l.add(`<circle cx="${n(cx + 0.2)}" cy="${n(ky + 0.2)}" r="${gem ? 2.3 : 1.3}" fill="${knob.face}"/>`);
  if (b.detail > 0) l.add(`<circle cx="${n(cx - 0.7)}" cy="${n(ky - 0.8)}" r="${gem ? 0.9 : 0.6}" fill="${knob.light}"/>`);
  return { x: 13, y: 26, w: 92, h: 46 };
}

/** The lid thrown back: its lining toward us, the arches' undersides down its sides, the rim along its far edge. */
function lidOpenLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal, lining, strap, gem } = b.tint;
  const clip = l.clip(OPEN_FACE);
  l.add(fill(OPEN_FACE, wood.inside));
  l.add(`<g clip-path="url(#${clip})">`);
  // The lining within the frame of the lid's planks, lit toward its top.
  const inset = (pt: Pt, dx: number, dy: number): Pt => [pt[0] + dx, pt[1] + dy];
  const lin = [inset(OPEN.l, 6, 0), inset(OPEN.topL, 5.5, 5), inset(OPEN.topR, -5.5, 5), inset(OPEN.r, -6, 0)] as const;
  l.add(fill(`M${p(lin[0])}L${p(lin[1])}Q${n((lin[1][0] + lin[2][0]) / 2)} ${n((lin[1][1] + lin[2][1]) / 2 - OPEN.bow + 1)} ${p(lin[2])}L${p(lin[3])}Z`, lining));
  // The light out of the mouth falls warm on the lining's lower half.
  const warmth = l.id('w');
  l.def(
    radialAt(
      warmth,
      [
        [0, LIGHT.glow, 0.55],
        [0.55, LIGHT.far, 0.2],
        [1, LIGHT.far, 0],
      ],
      MOUTH[0] + 8,
      MOUTH[1] - 4,
      44,
    ),
  );
  l.add(fill(OPEN_FACE, `url(#${warmth})`));
  if (b.detail > 0) {
    if (strap) {
      // A woven band across the lining near its top.
      const marks = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => ({ p: [lin[1][0] + (lin[2][0] - lin[1][0]) * f, lin[1][1] + (lin[2][1] - lin[1][1]) * f + 4.5 - Math.sin(Math.PI * f) * (OPEN.bow - 1)] as Pt, angle: -4 }));
      l.add(kilimAlong(marks, 5, strap.light, strap.eye));
    } else for (const y of [28, 38, 47]) l.add(stroke(line([lin[1][0], y], [lin[2][0], y - 4.5]), wood.line, 1, ' stroke-opacity="0.7"'));
  }
  // The arches seen from inside, narrow along the lid's two sides.
  l.add(fill(`M${n(OPEN.l[0] - 3)} 60L${n(OPEN.topL[0] - 3)} 0H${n(OPEN.topL[0] + 2.5)}L${n(OPEN.l[0] + 2.5)} 60Z`, metal.shade));
  l.add(fill(`M${n(OPEN.r[0] - 2.5)} 60L${n(OPEN.topR[0] - 2.5)} 0H${n(OPEN.topR[0] + 3)}L${n(OPEN.r[0] + 3)} 60Z`, metal.shade));
  l.add('</g>');
  // The rim along the far edge, catching the light.
  l.add(stroke(OPEN_RIM, wood.face, 4.2));
  l.add(stroke(OPEN_RIM, wood.light, 1.4, ' transform="translate(0 -1.4)"'));
  // The hasp, up off the rim.
  const hx = (OPEN.topL[0] + OPEN.topR[0]) / 2 + 4;
  const hy = (OPEN.topL[1] + OPEN.topR[1]) / 2 - OPEN.bow / 2;
  l.add(fill(`M${n(hx - 3.5)} ${n(hy + 1)}H${n(hx + 3.5)}V${n(hy - 8)}Q${n(hx + 3.5)} ${n(hy - 11.5)} ${n(hx)} ${n(hy - 11.5)}Q${n(hx - 3.5)} ${n(hy - 11.5)} ${n(hx - 3.5)} ${n(hy - 8)}Z`, metal.face));
  l.add(fill(rect(hx - 3.5, hx - 2.4, hy - 8, hy + 1), metal.light));
  const knob = gem ? GARNET.face : metal.rivet;
  l.add(`<circle cx="${n(hx)}" cy="${n(hy - 8)}" r="${gem ? 2.4 : 1.6}" fill="${knob}"/>`);
  return { x: 20, y: 2, w: 94, h: 54 };
}

/** The light inside the open chest: the mouth lit from within, the gold heaped in it, a bloom out of it and its core. */
function lightLayer(l: Layer, b: Brush): ChestBox {
  const [cx, cy] = MOUTH;
  const glow = l.id('g');
  l.def(
    radialAt(
      glow,
      [
        [0, LIGHT.core, 0.8],
        [0.42, LIGHT.glow, 0.42],
        [1, LIGHT.far, 0],
      ],
      cx,
      cy - 4,
      38,
    ),
  );
  l.add(fill(MOUTH_FACE, LIGHT.mouth));
  // The gold heaped in the mouth, catching the light along its tops.
  const heap: readonly (readonly [number, number, number, number])[] = [
    [36, 59, 11, 4.4],
    [52, 56.5, 13, 5.4],
    [70, 55, 12, 5],
    [86, 53.5, 9, 3.8],
  ];
  l.add(fill(heap.map(([x, y, rx, ry]) => ellipse(x, y, rx, ry)).join(''), COIN.shade));
  l.add(fill(heap.map(([x, y, rx, ry]) => ellipse(x, y - 1, rx * 0.92, ry * 0.82)).join(''), COIN.face));
  if (b.detail > 0) l.add(fill(heap.map(([x, y, rx, ry]) => ellipse(x - rx * 0.2, y - ry * 0.55, rx * 0.36, ry * 0.3)).join(''), COIN.light));
  l.add(`<circle cx="${cx}" cy="${n(cy - 4)}" r="38" fill="url(#${glow})"/>`);
  l.add(`<ellipse cx="${cx}" cy="${n(cy - 1.5)}" rx="16" ry="3.4" fill="#ffffff" fill-opacity="0.55"/>`);
  return { x: cx - 38, y: cy - 42, w: 76, h: 80 };
}

/** Soft beams of light fanning up out of the mouth, fading as they go; renderers sway them about the mouth. */
function raysLayer(l: Layer): ChestBox {
  const [cx, cy] = MOUTH;
  const r = 62;
  const fade = l.id('r');
  l.def(
    radialAt(
      fade,
      [
        [0, LIGHT.core, 0.5],
        [0.5, LIGHT.glow, 0.24],
        [1, LIGHT.far, 0],
      ],
      cx,
      cy,
      r,
    ),
  );
  const beams: readonly (readonly [number, number, number])[] = [
    [-50, 0.66, 7],
    [-26, 0.86, 8],
    [0, 1, 9],
    [26, 0.84, 8],
    [50, 0.64, 7],
  ];
  const rays = beams.map(([deg, reach, half]) => {
    const [ax, ay] = spoke(cx, cy, 4, deg - 90);
    const [bx, by] = spoke(cx, cy, 4, deg + 90);
    return `M${n(ax)} ${n(ay)}L${p(spoke(cx, cy, r * reach, deg - half))}Q${p(spoke(cx, cy, r * reach * 1.06, deg))} ${p(spoke(cx, cy, r * reach, deg + half))}L${n(bx)} ${n(by)}Z`;
  });
  l.add(`<path d="${rays.join('')}" fill="url(#${fade})"/>`);
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}

/** The lock plate on the box under the seam, lit down its left edge, with its keyhole below where the hasp's knob rests. */
function lockLayer(l: Layer, b: Brush): ChestBox {
  const { metal } = b.tint;
  const { cx, top, bottom, w } = LOCK;
  l.add(fill(PLATE, metal.shade));
  l.add(fill(plate(cx, top, bottom, w, 1.1), metal.face));
  if (b.detail > 0) l.add(fill(rect(cx - w / 2 + 1.1, cx - w / 2 + 2.5, top + 1.5, bottom - 6), metal.light));
  const ky = bottom - 6.6;
  l.add(fill(`M${cx} ${n(ky - 2)}A1.8 1.8 0 1 1 ${n(cx - 0.01)} ${n(ky - 2)}ZM${n(cx - 0.9)} ${n(ky - 0.6)}H${n(cx + 0.9)}L${n(cx + 1.4)} ${n(ky + 3.2)}H${n(cx - 1.4)}Z`, metal.deep));
  if (b.detail === 2) for (const side of [-1, 1]) l.add(rivet(cx + side * 4, ky + 0.5, metal, 0.9));
  return LOCK_BOX;
}

/** A band of light across the lock plate at `phase` (0 left of it, 1 past it): one frame of the glint. */
function glintLayer(l: Layer, phase: number): ChestBox {
  const clip = l.clip(PLATE);
  const band = l.id('b');
  l.def(
    linearAt(
      band,
      [
        [0, '#ffffff', 0],
        [0.5, '#ffffff', 0.6],
        [1, '#ffffff', 0],
      ],
      -4,
      0,
      4,
      0,
    ),
  );
  const x = LOCK.cx - LOCK.w / 2 - 8 + phase * (LOCK.w + 16);
  l.add(`<g clip-path="url(#${clip})"><g transform="translate(${n(x)} ${n((LOCK.top + LOCK.bottom) / 2)}) rotate(24)"><rect x="-4" y="-24" width="8" height="48" fill="url(#${band})"/></g></g>`);
  return LOCK_BOX;
}

/**
 * The light that leaks out at the seam of a chest waiting to be opened: a thin bright crack under the lid's edge,
 * strongest in the middle and fading toward the corners, with a soft glow spilling out over the wood either side.
 */
function seamLayer(l: Layer): ChestBox {
  const [cx, cy] = [(FRONT.x0 + FRONT.x1) / 2, FRONT.y0 + 0.4];
  const [rx, ry] = [(FRONT.x1 - FRONT.x0) * 0.62, 7];
  const glow = l.id('g');
  l.def(
    `<radialGradient id="${glow}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(rx)}" gradientTransform="translate(0 ${n(cy)}) scale(1 ${n2(ry / rx)}) translate(0 ${n(-cy)})">` +
      `<stop offset="0" stop-color="${LIGHT.glow}" stop-opacity="0.85"/><stop offset="0.5" stop-color="${LIGHT.far}" stop-opacity="0.35"/><stop offset="1" stop-color="${LIGHT.far}" stop-opacity="0"/></radialGradient>`,
  );
  const crack = l.id('c');
  l.def(
    linearAt(
      crack,
      [
        [0, LIGHT.core, 0],
        [0.22, LIGHT.core, 1],
        [0.78, LIGHT.core, 1],
        [1, LIGHT.core, 0],
      ],
      FRONT.x0 + 2,
      0,
      FRONT.x1 - 2,
      0,
    ),
  );
  l.add(`<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${glow})"/>`);
  l.add(`<path d="M${n(FRONT.x0 + 2)} ${n(cy)}H${n(FRONT.x1 - 2)}" stroke="url(#${crack})" stroke-width="1.2" stroke-linecap="round" fill="none"/>`);
  return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
}

/** The gold and the stars thrown up as the chest opens. */
function sparkleLayer(l: Layer): ChestBox {
  const stars: readonly (readonly [number, number, number])[] = [
    [20, 30, 7],
    [102, 18, 9],
    [112, 64, 5.5],
    [10, 72, 6],
    [64, 6, 6],
  ];
  const coins: readonly (readonly [number, number, number])[] = [
    [36, 14, -20],
    [84, 8, 25],
    [98, 40, 60],
    [24, 50, -55],
    [58, 22, 8],
  ];
  l.add(fill(coins.map(([x, y]) => ellipse(x, y + 0.8, 4.2, 4.2)).join(''), COIN.shade));
  l.add(fill(coins.map(([x, y]) => ellipse(x, y, 4.2, 4.2)).join(''), COIN.face));
  l.add(fill(coins.map(([x, y]) => ellipse(x - 1, y - 1, 1.8, 1.4)).join(''), COIN.light));
  l.add(`<path d="${stars.map(([x, y, r]) => star(x, y, r)).join('')}" fill="#ffffff"/>`);
  l.add(`<path d="${stars.map(([x, y, r]) => star(x, y, r * 0.45)).join('')}" fill="${LIGHT.glow}"/>`);
  return CHEST_VIEW;
}

// ─────────────────────────────────────────────────────────────── the drawing

const isTier = (tier: unknown): tier is ChestTier => tier === 'common' || tier === 'rare' || tier === 'epic';

function brush(tier: ChestTier, size: number): Brush {
  return { tint: CHEST_TINTS[tier], detail: detailOf(size) };
}

/** One layer, drawn with its own ids. */
function layer(id: ChestLayerId, prefix: string, draw: (l: Layer) => ChestBox): ChestLayer {
  const l = new Layer(`${prefix}${id}`);
  const box = draw(l);
  return { id, box, markup: l.markup() };
}

/** The chest at `tier` as layers a renderer stacks and animates; `size` is the shut chest's display width. */
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
      light: layer('light', prefix, (l) => lightLayer(l, b)),
      lock: layer('lock', prefix, (l) => lockLayer(l, b)),
      glint: layer('glint', prefix, (l) => glintLayer(l, 0.5)),
      lid: layer('lid', prefix, (l) => lidLayer(l, b)),
      seam: layer('seam', prefix, seamLayer),
      sparkle: layer('sparkle', prefix, sparkleLayer),
    },
  };
}

/** The hasp's glint at `phase` (0–1) as its own layer; renderers step through phases. */
export function chestGlint(phase: number, opts: { idPrefix?: string } = {}): ChestLayer {
  if (!Number.isFinite(phase) || phase < 0 || phase > 1) throw new RangeError(`art: phase must be 0–1, got ${String(phase)}`);
  const prefix = prefixFor(opts.idPrefix, 'chestglint', n2(phase));
  return layer('glint', prefix, (l) => glintLayer(l, phase));
}

/** A layer as a standalone picture with its box as viewBox, for renderers that stack layers themselves. */
export function chestLayerSvg(l: ChestLayer): string {
  const { x, y, w, h } = l.box;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">${l.markup}</svg>`;
}

/** The layers a shut chest shows, and an open one. */
const SHUT: readonly ChestLayerId[] = ['shadow', 'body', 'lock', 'lid'];
const OPENED: readonly ChestLayerId[] = ['shadow', 'lidOpen', 'rays', 'body', 'light', 'lock'];

/**
 * The whole chest in one picture, shut or open, on the 120 × 120 canvas, each layer in a group named by `data-part` so
 * a page can animate the groups; `allLayers` includes every layer, hidden or not, for a page that toggles them itself.
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
 * How a chest opens: the whole chest hops. It crouches with a shiver, springs up stretching, the lid bursts open at the
 * top, it lands wide and short, rebounds and settles while the lid rocks back and the stars fly; one second in all.
 * Values are shares of `CHEST_HOP_MS`, so the phone (one value run through them) and the web (keyframes at the same
 * shares, quests.css) play the same hop, and it can be tested without a screen. Everything but the shadow moves as one
 * piece about `CHEST_FOOT`, which squash and stretch keep still; the shadow stays on the ground and shrinks in the air.
 */
export const CHEST_HOP_MS = 1000;
/** The point the chest stands on, in the drawing's units. */
export const CHEST_FOOT: Pt = [60, 104];

/** The body at one moment of the hop: height (a share of its box's height, up), width and height scale, and lean. */
export interface ChestHopFrame {
  at: number;
  rise: number;
  wide: number;
  tall: number;
  tilt: number;
}

export const CHEST_HOP: readonly ChestHopFrame[] = [
  { at: 0, rise: 0, wide: 1, tall: 1, tilt: 0 },
  // The crouch, with a shiver.
  { at: 0.12, rise: 0, wide: 1.1, tall: 0.86, tilt: 0 },
  { at: 0.15, rise: 0, wide: 1.1, tall: 0.86, tilt: -3 },
  { at: 0.18, rise: 0, wide: 1.1, tall: 0.86, tilt: 3 },
  { at: 0.21, rise: 0, wide: 1.1, tall: 0.86, tilt: -2 },
  { at: 0.24, rise: 0, wide: 1.08, tall: 0.9, tilt: 0 },
  // Up, stretching; the lid bursts open at the top of the hop.
  { at: 0.34, rise: 0.24, wide: 0.92, tall: 1.12, tilt: 0 },
  { at: 0.44, rise: 0.3, wide: 0.96, tall: 1.06, tilt: 0 },
  { at: 0.52, rise: 0.2, wide: 0.94, tall: 1.1, tilt: 0 },
  // The landing, wide and short, then settling.
  { at: 0.6, rise: 0, wide: 1.14, tall: 0.84, tilt: 0 },
  { at: 0.72, rise: 0, wide: 0.97, tall: 1.05, tilt: 0 },
  { at: 0.84, rise: 0, wide: 1.01, tall: 0.98, tilt: 0 },
  { at: 1, rise: 0, wide: 1, tall: 1, tilt: 0 },
];

/** One part's values through the hop as `[share of the hop, value]` points, linear between them. */
export type ChestHopCurve = readonly (readonly [number, number])[];

/** When the chest lands: the impact, the widening ring and the thrown gold. */
export const CHEST_HOP_LAND = 0.6;
/** The lid, 0 shut to 1 open as the renderers read it: shut through the crouch, open on the way up, past open on landing, rocking back. */
export const CHEST_HOP_LID: ChestHopCurve = [
  [0, 0],
  [0.3, 0],
  [0.5, 1],
  [0.62, 1.18],
  [0.74, 0.94],
  [0.86, 1.02],
  [1, 1],
];
/** The inner light, 0 to 1, blooming as the lid opens. */
export const CHEST_HOP_LIGHT: ChestHopCurve = [
  [0, 0],
  [0.4, 0],
  [0.62, 1],
  [1, 1],
];
/** The shadow's scale, 1 at rest: smallest at the top of the hop, pressed wide on landing. */
export const CHEST_HOP_SHADOW: ChestHopCurve = [
  [0, 1],
  [0.24, 1.04],
  [0.44, 0.8],
  [0.6, 1.1],
  [0.72, 1],
  [1, 1],
];
/** The stars, 0 to 1 through their burst, from the landing to the end of the hop. */
export const CHEST_HOP_SPARKLE: ChestHopCurve = [
  [0, 0],
  [CHEST_HOP_LAND - 0.02, 0],
  [1, 1],
];

/** The light along the seam through the hop: brightening through the crouch as if it would burst, gone once the lid is off. */
export const CHEST_HOP_SEAM: ChestHopCurve = [
  [0, 0.35],
  [0.12, 0.85],
  [0.24, 1],
  [0.32, 1],
  [0.4, 0],
  [1, 0],
];

// ─────────────────────────────────────────────────────────────── the knock

/**
 * How a chest waiting to be opened knocks, as if something inside wanted out: twice the lid jumps a little on its hinge
 * and drops back, quick up and falling under its weight, the light at the seam flaring as it lifts, and the box
 * squatting a touch on each landing; then it rests, glowing softly at the seam. One loop of `CHEST_KNOCK_MS`, values
 * at shares of it as the hop's are, so both apps play the same knock. `lid` is a share of `CHEST_KNOCK_LIFT`.
 */
export const CHEST_KNOCK_MS = 3600;
/** The lid at full lift: turned this many degrees about the hinge, its front up, and raised this many units. */
export const CHEST_KNOCK_LIFT = { deg: 6, rise: 2 } as const;

export interface ChestKnockFrame {
  at: number;
  /** The lid's lift, 0 shut to 1 at full lift. */
  lid: number;
  /** The seam's light, 0 to 1. */
  seam: number;
  /** The box's width and height scale about its foot. */
  wide: number;
  tall: number;
}

export const CHEST_KNOCK: readonly ChestKnockFrame[] = [
  { at: 0, lid: 0, seam: 0.35, wide: 1, tall: 1 },
  // The first knock: up quick, easing at the top, falling faster and faster, landing with a squat.
  { at: 0.012, lid: 0.62, seam: 0.8, wide: 0.995, tall: 1.008 },
  { at: 0.024, lid: 0.93, seam: 1, wide: 0.993, tall: 1.012 },
  { at: 0.032, lid: 1, seam: 1, wide: 0.993, tall: 1.012 },
  { at: 0.044, lid: 0.78, seam: 0.95, wide: 0.996, tall: 1.006 },
  { at: 0.056, lid: 0.28, seam: 0.85, wide: 1, tall: 1 },
  { at: 0.062, lid: 0, seam: 0.7, wide: 1.022, tall: 0.972 },
  // The second, smaller.
  { at: 0.074, lid: 0.4, seam: 0.85, wide: 1.004, tall: 0.996 },
  { at: 0.084, lid: 0.56, seam: 0.95, wide: 0.997, tall: 1.004 },
  { at: 0.094, lid: 0.4, seam: 0.9, wide: 0.998, tall: 1.002 },
  { at: 0.106, lid: 0.05, seam: 0.8, wide: 1, tall: 1 },
  { at: 0.11, lid: 0, seam: 0.75, wide: 1.014, tall: 0.982 },
  // A last rattle, then rest.
  { at: 0.122, lid: 0.1, seam: 0.7, wide: 1.002, tall: 0.998 },
  { at: 0.134, lid: 0, seam: 0.65, wide: 1, tall: 1 },
  { at: 0.4, lid: 0, seam: 0.35, wide: 1, tall: 1 },
  { at: 1, lid: 0, seam: 0.35, wide: 1, tall: 1 },
];

/** A curve's value at `share` of the hop, linear between points and held flat beyond its ends. */
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
