/**
 * Hevalo's two currencies, drawn in colour: Zêr, a chunky gold coin with a
 * deer's head raised on its face, and the gem, a faceted green stone. They
 * replace the line glyphs both apps used to tint, so wherever money is shown
 * — the purse, the shop's prices, a gift, the daily reward, a chest — it is
 * the same two objects.
 *
 * The coin stands a little forward in flat cartoon colours: its face over a
 * darker edge that shows its thickness below, a thick yellow ring with two
 * bands of shine, and in the orange field at its middle the deer, raised in
 * gold with its shadow falling beside it. The gem is an elongated
 * hexagon cut with six bevels round a flat table, lit from the upper left so
 * each bevel is its own shade, with two bands of light across the table.
 *
 * Both are drawn bolder as they get smaller (`detail`): their outlines
 * thicken, and the thin facet lines, the coin's shadowed field edge and lit
 * lip and the gem's sparkle go, so a 15-pixel coin in the purse is still a
 * coin and not a smudge.
 */
import { curve, symmetric, type Knot } from '../characters/pen.js';
import { CANVAS, Drawing, checkSize, linearAt, n, prefixFor, type Detail, type Pt } from './svg.js';

export interface CurrencyOptions {
  /** how big it is drawn, in pixels (it is square) */
  size?: number;
  /** its text label; screens that say the amount beside it hide the picture from screen readers */
  title?: string;
  idPrefix?: string;
}

/** Below this many pixels the fine lines are left out. */
const FINE = 36;
/** Below this many pixels the outline is drawn heavier, so the shape holds. */
const TINY = 20;

const detailOf = (size: number): Detail => (size < TINY ? 0 : size < FINE ? 1 : 2);

const poly = (pts: readonly Pt[]): string => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;

/** A point on a circle round (cx, cy), `deg` degrees clockwise from the right. */
const on = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/** An arc of a circle from `a0` to `a1` degrees, clockwise. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = on(cx, cy, r, a0);
  const [x1, y1] = on(cx, cy, r, a1);
  return `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
}

/** A small four-pointed sparkle at (x, y), `r` from its middle to a point. */
function sparkle(x: number, y: number, r: number): string {
  const w = r * 0.22;
  return `M${n(x)} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${n(y)}Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${n(y)}Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - r)}Z`;
}

// ─────────────────────────────────────────────────────────── the coin

const GOLD = {
  outline: '#7d4f12',
  edge: '#e0960f',
  face: '#f6c51c',
  band: '#ffe236',
  rimLight: '#fff09a',
  field: '#ee8a14',
  fieldShadow: '#d2700c',
  raisedShadow: '#a95c06',
};

/** The coin's face: centre, radius, how far below it the edge shows, and the orange field inside the ring. */
const COIN = { cx: 60, cy: 56, r: 50, drop: 6, field: 31 };

/**
 * The deer, front on: a broad round head narrowing to its muzzle, leaf-shaped
 * ears out to the sides and two chunky antlers, each with three rounded tines.
 * One half is set down from the chin up round the ear and the antler to the
 * middle of the crown (a 0 marks a sharp corner), and mirrored for the other.
 */
const DEER_HALF: readonly Knot[] = [
  [60, 80.1], [56.7, 80], [54.2, 79], [52.4, 76.9], [51.5, 74.7], [51.1, 72.6], [49.9, 70.1], [48.3, 67.6], [47.2, 64.7], [46.8, 61.2], [46.8, 58, 0],
  // the ear, out along its underside to the tip and back along its top
  [45.1, 57.6], [43.1, 56.8], [41.1, 55.4], [39.4, 53.7], [38.3, 52], [37.9, 50.3], [38.6, 49.1], [41.1, 48.8], [44.4, 49.7], [47.1, 51], [49, 52.1], [49.9, 52.5, 0],
  // the antler: up its outer edge to the tallest tine, then the middle tine and the inner one
  [50, 51], [49.1, 49.8], [47.7, 48.5], [46.1, 47.5], [44.4, 46.7], [42.7, 45.7], [41.1, 43.9], [40.1, 41.8], [39.8, 39.7], [39.9, 36.7], [40.5, 34.8], [42.4, 33.9],
  [43.8, 34.5], [44.2, 35.9], [44.1, 37.7], [43.9, 39.3], [44.4, 40.2], [45.1, 39.7], [45.7, 38.3], [46.6, 37.4], [47.6, 37.1], [48.6, 37.4], [49.2, 38.3], [49.2, 39.7],
  [48.7, 41.3], [48.2, 43], [48.5, 44.4], [49.2, 44.6], [50.4, 43.7], [51.7, 42.3], [52.7, 41.7], [53.7, 42], [54.2, 43.2], [54, 45], [53.7, 47], [53.9, 48.7], [54.3, 49.5, 0],
  // the crown between the antlers
  [55.7, 48.5], [57.7, 47.7], [60, 47.4],
];
const DEER = curve(symmetric(DEER_HALF, 60));

/** The deer in one colour, moved by (dx, dy). */
const deer = (colour: string, dx = 0, dy = 0): string =>
  `<path d="${DEER}" fill="${colour}"${dx || dy ? ` transform="translate(${n(dx)} ${n(dy)})"` : ''}/>`;

/** A band of a ring between radii r0 and r1, from `a0` to `a1` degrees clockwise. */
function ringBand(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [ax, ay] = on(cx, cy, r1, a0);
  const [bx, by] = on(cx, cy, r1, a1);
  const [px, py] = on(cx, cy, r0, a1);
  const [qx, qy] = on(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${n(ax)} ${n(ay)}A${n(r1)} ${n(r1)} 0 ${large} 1 ${n(bx)} ${n(by)}L${n(px)} ${n(py)}A${n(r0)} ${n(r0)} 0 ${large} 0 ${n(qx)} ${n(qy)}Z`;
}

/**
 * Zêr: a gold coin in flat cartoon colours, standing a little forward, its
 * thick yellow ring crossed by two bands of shine, and in its orange field
 * Hevalo's deer raised in gold, its shadow falling down and to the left.
 */
export function coinSvg(opts: CurrencyOptions = {}): string {
  const size = checkSize(opts.size, 24);
  const detail = detailOf(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'coin', detail));
  const { cx, cy, r, drop, field } = COIN;
  const line = detail === 0 ? 6 : detail === 1 ? 4.2 : 3;

  // the outline round the whole coin, its face and the edge below it
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  // the edge: the coin's thickness, showing below the face
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${r}" fill="${GOLD.edge}"/>`);
  // the face, and two bands of shine across its ring
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GOLD.face}"/>`);
  dr.add(`<path d="${ringBand(cx, cy, field, r, 208, 252)}" fill="${GOLD.band}"/>`);
  dr.add(`<path d="${ringBand(cx, cy, field, r, 28, 62)}" fill="${GOLD.band}"/>`);
  if (detail === 2) {
    // a lighter lip round the upper left of the ring
    dr.add(`<path d="${arc(cx, cy, r - 2.6, 165, 290)}" fill="none" stroke="${GOLD.rimLight}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  // the orange field, sunk inside the ring: its top in the ring's shadow
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${field}" fill="${GOLD.field}"/>`);
  if (detail > 0) dr.add(`<path d="${arc(cx, cy, field - 1.4, 195, 345)}" fill="none" stroke="${GOLD.fieldShadow}" stroke-width="2.8" stroke-linecap="round"/>`);

  // the deer, raised in gold, its shadow down and to the left; large, its upper edges catch the light
  dr.add(deer(GOLD.raisedShadow, -0.9, 1.3));
  if (detail === 2) {
    dr.add(deer(GOLD.rimLight));
    dr.add(`<g clip-path="url(#${dr.clip(DEER)})">${deer(GOLD.face, 0.3, 0.8)}</g>`);
  } else {
    dr.add(deer(GOLD.face));
  }
  return dr.svg(size, opts.title ?? 'Zêr');
}


// ─────────────────────────────────────────────────────────── the gem

const GREEN = {
  outline: '#0a4d1f',
  topLeft: '#a3f5b2',
  topRight: '#58e46f',
  right: '#14a63a',
  bottomRight: '#0b7a2b',
  bottomLeft: '#119134',
  left: '#3fd35f',
  tableLight: '#5ae874',
  table: '#18c444',
};

/** The gem's outer corners and its table's, clockwise from the top. */
const GEM_OUTER: readonly Pt[] = [
  [60, 5],
  [101, 28],
  [101, 92],
  [60, 115],
  [19, 92],
  [19, 28],
];
const GEM_TABLE: readonly Pt[] = [
  [60, 28],
  [81, 40],
  [81, 80],
  [60, 92],
  [39, 80],
  [39, 40],
];

/** The gem: an elongated hexagon, six bevels round a flat table, green as the meadows. */
export function gemSvg(opts: CurrencyOptions = {}): string {
  const size = checkSize(opts.size, 24);
  const detail = detailOf(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'gem', detail));
  const line = detail === 0 ? 8 : detail === 1 ? 6.5 : 5;

  dr.add(`<path d="${poly(GEM_OUTER)}" fill="${GREEN.outline}" stroke="${GREEN.outline}" stroke-width="${n(line)}" stroke-linejoin="round"/>`);
  // the bevels, each from an outer edge in to the table's edge, lit from the upper left
  const shades = [GREEN.topRight, GREEN.right, GREEN.bottomRight, GREEN.bottomLeft, GREEN.left, GREEN.topLeft];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    dr.add(`<path d="${poly([GEM_OUTER[i]!, GEM_OUTER[j]!, GEM_TABLE[j]!, GEM_TABLE[i]!])}" fill="${shades[i]}"/>`);
  }
  // the table, and two bands of light across it rising to the right
  const table = dr.id('t');
  dr.def(linearAt(table, [[0, GREEN.tableLight], [1, GREEN.table]], 39, 28, 81, 92));
  const tableD = poly(GEM_TABLE);
  dr.add(`<path d="${tableD}" fill="url(#${table})"/>`);
  const clip = dr.clip(tableD);
  const band = (y: number, h: number, a: number): string =>
    `<path d="${poly([[36, y], [84, y - 27], [84, y - 27 + h], [36, y + h]])}" fill="#ffffff" fill-opacity="${a}" clip-path="url(#${clip})"/>`;
  dr.add(band(66, 13, 0.32));
  dr.add(band(86, 6, 0.22));
  if (detail > 0) {
    // the edges between the bevels, catching the light
    for (let i = 0; i < 6; i++) {
      const [x0, y0] = GEM_OUTER[i]!;
      const [x1, y1] = GEM_TABLE[i]!;
      dr.add(`<path d="M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}" stroke="#ffffff" stroke-opacity="0.32" stroke-width="1.4"/>`);
    }
    dr.add(`<path d="${poly(GEM_TABLE)}" fill="none" stroke="#ffffff" stroke-opacity="0.38" stroke-width="1.6" stroke-linejoin="round"/>`);
  }
  // a glint along the upper-left bevel, and a sparkle when there is room
  dr.add(`<path d="M27 29.5L54 14.5" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${detail === 0 ? 5 : 3.6}" stroke-linecap="round"/>`);
  if (detail === 2) dr.add(`<path d="${sparkle(99, 14, 10)}" fill="#ffffff"/>`);
  return dr.svg(size, opts.title ?? 'Gem');
}

/** The canvas both are drawn on, for a caller that sizes them itself. */
export const CURRENCY_CANVAS = CANVAS;
