/**
 * The reward chest a finished quest pays out of, designed once and drawn the
 * same by the phone and the website: a chunky trunk seen from three quarters
 * and a little above — a domed lid of planks wider than the boxy body under
 * it, bands with chipped corners and rivets wrapping over both, a
 * shield-shaped lock plate hanging from the lid's rim, a handle on the near
 * end, and a soft pool of shadow on the ground.
 *
 * Three tiers, all warm, by how much the chest holds: common is amber wood
 * bound in dark iron; rare the same wood bound in gold, with a gold lock
 * plate; epic is lacquered in a deep pomegranate red, gold-bound, with a
 * garnet set in its plate and a few gold studs in its planks.
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
 * is its own darkest tone. The only gradients are the soft lights, which
 * fade to nothing, and the ground's shadow.
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
/** Dark iron, warm rather than blue: the bands of a common chest. */
const IRON: Metal = { face: '#6a6560', light: '#8f8983', shade: '#4a4642', deep: '#2b2825', rivet: '#a39d96' };
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

const FRONT = { x0: 14, x1: 90, y0: 60, y1: 104 };
/** The bands, as the x of each one's left and right edge, on the lid and the body alike. */
const BANDS: readonly (readonly [number, number])[] = [
  [26, 36],
  [68, 78],
];
const LOCK = { cx: 52, top: 62, w: 22 };
const MOUTH: Pt = [61, 54];
const HINGE: Pt = [66, 54];

const back = ([x, y]: Pt): Pt => [x + DEPTH[0], y + DEPTH[1]];
const p = ([x, y]: Pt): string => `${n(x)} ${n(y)}`;
const poly = (pts: readonly Pt[]): string => `M${pts.map(p).join('L')}Z`;
const line = (a: Pt, b: Pt): string => `M${p(a)}L${p(b)}`;

/** The body's front face, its bottom-left corner rounded; the right edge meets the end. */
const FRONT_FACE = `M${FRONT.x0} ${FRONT.y0}H${FRONT.x1}V${FRONT.y1}H${FRONT.x0 + 5}Q${FRONT.x0} ${FRONT.y1} ${FRONT.x0} ${FRONT.y1 - 5}Z`;
/** The body's end, turned away: the front face's right edge swept back. */
const END_FACE = poly([[FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x1, FRONT.y1]), [FRONT.x1, FRONT.y1]]);
/** The whole body, for its edge. */
const BODY = `M${FRONT.x0} ${FRONT.y0}H${FRONT.x1}L${p(back([FRONT.x1, FRONT.y0]))}L${p(back([FRONT.x1, FRONT.y1]))}L${FRONT.x1} ${FRONT.y1}H${FRONT.x0 + 5}Q${FRONT.x0} ${FRONT.y1} ${FRONT.x0} ${FRONT.y1 - 5}Z`;
/** The chest's mouth, seen into once the lid is up. */
const MOUTH_FACE = poly([[FRONT.x0, FRONT.y0], [FRONT.x1, FRONT.y0], back([FRONT.x1, FRONT.y0]), back([FRONT.x0, FRONT.y0])]);

/** The lid's front: the barrel face, domed, a lip wider than the body each side, down over the body's top edge. */
const LID = { x0: 10, x1: 92, y0: 26, y1: 64, rim: 58 };
const LID_FACE = `M${LID.x0} ${LID.y1}V44C${LID.x0} 32 18 ${LID.y0} 32 ${LID.y0}H70C84 ${LID.y0} ${LID.x1} 32 ${LID.x1} 44V${LID.y1}Z`;
/** The lid's right profile, front corner up and over the dome: what the end's arch band follows. */
const LID_RIGHT = `M${LID.x1} ${LID.y1}V44C${LID.x1} 32 84 ${LID.y0} 70 ${LID.y0}`;
const LID_LEFT = `M${LID.x0} ${LID.y1}V44C${LID.x0} 32 18 ${LID.y0} 32 ${LID.y0}`;
/** The lid's end, turned away: the right profile swept back, the top of the dome with it. */
const LID_END = `M${LID.x1} ${LID.y1}L${p(back([LID.x1, LID.y1]))}L${p(back([LID.x1, 44]))}C${p(back([LID.x1, 32]))} ${p(back([84, LID.y0]))} ${p(back([70, LID.y0]))}L70 ${LID.y0}C84 ${LID.y0} ${LID.x1} 32 ${LID.x1} 44Z`;
/** The arch of the far rim of the end. */
const LID_END_ARCH = `M${p(back([LID.x1, LID.y1]))}L${p(back([LID.x1, 44]))}C${p(back([LID.x1, 32]))} ${p(back([84, LID.y0]))} ${p(back([70, LID.y0]))}`;
/** The whole lid, for its edge and its clip. */
const LID_ALL = `M${LID.x0} ${LID.y1}V44C${LID.x0} 32 18 ${LID.y0} 32 ${LID.y0}H70C84 ${LID.y0} ${LID.x1} 32 ${LID.x1} 44V${LID.y1}Z` +
  `M${LID.x1} ${LID.y1}L${p(back([LID.x1, LID.y1]))}L${p(back([LID.x1, 44]))}C${p(back([LID.x1, 32]))} ${p(back([84, LID.y0]))} ${p(back([70, LID.y0]))}L70 ${LID.y0}C84 ${LID.y0} ${LID.x1} 32 ${LID.x1} 44Z`;
/** The rim band along the lid's bottom edge, with its lip; its top-left corner chipped. */
const RIM = `M8 ${LID.rim + 2}L10 ${LID.rim}H94V${LID.y1}H8Z`;
const RIM_END = poly([[94, LID.rim], back([94, LID.rim]), back([94, LID.y1]), [94, LID.y1]]);

/** The lid thrown back: standing on the body's back edge, leaning away, its inside towards us. */
const OPEN = { x0: 33, x1: 109, y0: 52, top: 12 };
const OPEN_FACE = `M${OPEN.x0} ${OPEN.y0}C28 40 29 26 38 ${OPEN.top + 2}L108 ${OPEN.top - 2}C116 24 116 40 ${OPEN.x1} ${OPEN.y0}Z`;
const OPEN_RIM = `M36 ${OPEN.top + 2.5}L110 ${OPEN.top - 1.5}`;

/** The shield of the lock plate, hanging from the rim down the front: its top under the lid's lip. */
const SHIELD = (cx: number, top: number, w: number, tall: number): string => {
  const half = w / 2;
  const waist = top + tall * 0.45;
  return `M${n(cx - half)} ${n(top)}H${n(cx + half)}V${n(waist)}C${n(cx + half)} ${n(top + tall * 0.8)} ${n(cx + half * 0.55)} ${n(top + tall * 0.95)} ${n(cx)} ${n(top + tall)}` +
    `C${n(cx - half * 0.55)} ${n(top + tall * 0.95)} ${n(cx - half)} ${n(top + tall * 0.8)} ${n(cx - half)} ${n(waist)}Z`;
};
const PLATE = SHIELD(LOCK.cx, LOCK.top, LOCK.w, 28);
const PLATE_INNER = SHIELD(LOCK.cx, LOCK.top + 2.4, LOCK.w - 4.8, 23.6);
const LOCK_BOX: ChestBox = { x: 38, y: 54, w: 28, h: 40 };

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
    // the planks: two lines across the front, and across the end with it
    for (const y of [75, 89]) {
      l.add(stroke(line([FRONT.x0 + 1.5, y], [FRONT.x1, y]), wood.line, 1.6));
      l.add(stroke(line([FRONT.x1, y], back([FRONT.x1 - 1.5, y])), wood.line, 1.4));
    }
  }
  if (b.tint.studs && b.detail === 2) for (const [x, y] of [[48, 68], [56, 68], [48, 96], [56, 96]] as const) l.add(stud(x, y));
  // the bands down the front, each with its bottom corner chipped, wrapped under the rim above
  for (const [x0, x1] of BANDS) {
    l.add(fill(`M${x0} ${FRONT.y0}H${x1}V${FRONT.y1 - 3}L${n(x1 - 2.5)} ${FRONT.y1}H${x0}Z`, metal.face));
    l.add(fill(`M${x0} ${FRONT.y0}H${n(x0 + 2.5)}V${FRONT.y1}H${x0}Z`, metal.light));
    if (b.detail > 0) l.add(stroke(`M${x0} ${FRONT.y0}H${x1}V${FRONT.y1 - 3}L${n(x1 - 2.5)} ${FRONT.y1}H${x0}Z`, metal.deep, b.thin));
    if (b.detail === 2) for (const y of [70, 96]) l.add(rivet((x0 + x1) / 2, y, metal));
  }
  // one band round the end, and the handle on it: a bracket with a ring hanging from it
  const ex = 97;
  const slope = DEPTH[1] / DEPTH[0];
  const at = (x: number, y: number): Pt => [x, y + (x - FRONT.x1) * slope];
  l.add(fill(poly([at(ex, FRONT.y0), at(ex + 6, FRONT.y0), at(ex + 6, FRONT.y1), at(ex, FRONT.y1)]), metal.shade));
  if (b.detail > 0) {
    l.add(fill(poly([at(ex - 1, 69), at(ex + 7, 69), at(ex + 7, 73.5), at(ex - 1, 73.5)]), metal.face));
    l.add(stroke(`M${p(at(ex + 0.5, 73.5))}C${p(at(ex - 1, 84))} ${p(at(ex + 7, 84))} ${p(at(ex + 5.5, 73.5))}`, metal.face, 2.6));
    l.add(stroke(`M${p(at(ex + 0.5, 73.5))}C${p(at(ex - 1, 84))} ${p(at(ex + 7, 84))} ${p(at(ex + 5.5, 73.5))}`, metal.deep, b.thin, ' stroke-opacity="0.6"'));
  }
  l.add(stroke(BODY, wood.deep, b.edge));
  return { x: 12, y: 50, w: 98, h: 56 };
}

/** The lid shut, with its rim band and the hasp over the lock plate's top. */
function lidLayer(l: Layer, b: Brush): ChestBox {
  const { wood, metal } = b.tint;
  const clip = l.clip(LID_ALL);
  l.add(fill(LID_END, wood.shade));
  l.add(fill(LID_FACE, wood.face));
  l.add(`<g clip-path="url(#${clip})">`);
  // the plank the light catches, along the top of the dome
  l.add(fill(`M${LID.x0} 36H${LID.x1}V${LID.y0 - 2}H${LID.x0}Z`, wood.light));
  if (b.detail > 0) {
    for (const y of [36, 47]) {
      l.add(stroke(line([LID.x0, y], [LID.x1, y]), wood.line, 1.6));
      l.add(stroke(line([LID.x1, y], back([LID.x1, y])), wood.line, 1.4));
    }
  }
  if (b.tint.studs && b.detail === 2) for (const [x, y] of [[48, 52], [56, 52]] as const) l.add(stud(x, y));
  // the bands over the dome, in line with the body's
  for (const [x0, x1] of BANDS) {
    l.add(fill(`M${x0} ${LID.y0 - 4}H${x1}V${LID.y1}H${x0}Z`, metal.face));
    l.add(fill(`M${x0} ${LID.y0 - 4}H${n(x0 + 2.5)}V${LID.y1}H${x0}Z`, metal.light));
    if (b.detail > 0) l.add(stroke(`M${x0} ${LID.y0 - 4}H${x1}V${LID.y1}H${x0}Z`, metal.deep, b.thin));
    if (b.detail === 2) for (const y of [34, 50]) l.add(rivet((x0 + x1) / 2, y, metal));
  }
  // the arches: up and over at the lid's left end, at its right front corner, and along the far rim of the end
  l.add(stroke(LID_LEFT, metal.face, 5));
  l.add(stroke(LID_RIGHT, metal.face, 6));
  l.add(stroke(LID_END_ARCH, metal.shade, 5));
  if (b.detail > 0) {
    l.add(stroke(LID_LEFT, metal.deep, b.thin, ' transform="translate(2 0)"'));
    l.add(stroke(LID_RIGHT, metal.deep, b.thin, ' transform="translate(-3 0)"'));
  }
  l.add('</g>');
  l.add(stroke(LID_ALL, wood.deep, b.edge));
  // the rim band along the bottom edge, lipped a little wider than the lid, and round the end
  l.add(fill(RIM_END, metal.shade));
  l.add(fill(RIM, metal.face));
  l.add(fill(`M10 ${LID.rim}H94V${LID.rim + 2.5}H8.5Z`, metal.light));
  if (b.detail > 0) {
    l.add(stroke(RIM, metal.deep, b.thin));
    l.add(stroke(RIM_END, metal.deep, b.thin));
  }
  if (b.detail === 2) for (const x of [16, 52 + 14, 88]) l.add(rivet(x, 61, metal));
  // the hasp, down from the rim over the plate
  const hasp = `M${LOCK.cx - 5} ${LID.rim}H${LOCK.cx + 5}V${LID.y1 + 5}Q${LOCK.cx + 5} ${LID.y1 + 7} ${LOCK.cx + 3} ${LID.y1 + 7}H${LOCK.cx - 3}Q${LOCK.cx - 5} ${LID.y1 + 7} ${LOCK.cx - 5} ${LID.y1 + 5}Z`;
  l.add(fill(hasp, metal.face));
  l.add(stroke(hasp, metal.deep, b.thin));
  if (b.detail === 2) l.add(rivet(LOCK.cx, LID.y1 + 2, metal, 1.5));
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
  for (const [x0, x1] of BANDS) {
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

/** The lock plate: a shield of the chest's metal under the lid's lip, a keyhole in it, and the epic chest's garnet. */
function lockLayer(l: Layer, b: Brush): ChestBox {
  const { metal } = b.tint;
  const { cx } = LOCK;
  l.add(fill(PLATE, metal.deep));
  l.add(fill(PLATE_INNER, metal.face));
  if (b.detail > 0) l.add(stroke(`M${n(cx - LOCK.w / 2 + 2.4)} ${n(LOCK.top + 2.4)}H${n(cx + LOCK.w / 2 - 2.4)}`, metal.light, 2));
  if (b.tint.gem) {
    // the garnet, a rounded seed, its light at the upper left
    const gy = LOCK.top + 9.5;
    l.add(fill(`M${cx} ${n(gy - 4.2)}Q${n(cx + 4.2)} ${n(gy - 4.2)} ${n(cx + 4.2)} ${n(gy)}Q${n(cx + 4.2)} ${n(gy + 4.2)} ${cx} ${n(gy + 4.2)}Q${n(cx - 4.2)} ${n(gy + 4.2)} ${n(cx - 4.2)} ${n(gy)}Q${n(cx - 4.2)} ${n(gy - 4.2)} ${cx} ${n(gy - 4.2)}Z`, GARNET.deep));
    l.add(`<circle cx="${cx}" cy="${n(gy)}" r="3.3" fill="${GARNET.face}"/>`);
    if (b.detail > 0) l.add(`<circle cx="${n(cx - 1.1)}" cy="${n(gy - 1.2)}" r="1.1" fill="${GARNET.light}"/>`);
    const ky = LOCK.top + 18.5;
    l.add(fill(`M${cx} ${n(ky - 2.3)}A2.3 2.3 0 1 1 ${n(cx - 0.01)} ${n(ky - 2.3)}ZM${n(cx - 1.4)} ${n(ky + 1)}H${n(cx + 1.4)}L${n(cx + 2)} ${n(ky + 6.5)}H${n(cx - 2)}Z`, metal.deep));
  } else {
    const ky = LOCK.top + 12;
    l.add(fill(`M${cx} ${n(ky - 3)}A3 3 0 1 1 ${n(cx - 0.01)} ${n(ky - 3)}ZM${n(cx - 1.8)} ${n(ky + 1.5)}H${n(cx + 1.8)}L${n(cx + 2.6)} ${n(ky + 9)}H${n(cx - 2.6)}Z`, metal.deep));
  }
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
