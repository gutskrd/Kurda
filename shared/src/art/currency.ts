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
  raisedShadow: '#c4650a',
};

/** The coin's face: centre, radius, how far below it the edge shows, and the orange field inside the ring. */
const COIN = { cx: 60, cy: 56, r: 50, drop: 6, field: 31 };

/** The deer, front on and simple: a round head narrowing to its muzzle, ears out to the sides, two stubby branching antlers. */
const DEER = {
  head: 'M60 44.6C67.5 44.6 72 48.5 72 54C72 59 69.5 61.5 68 64.5C66.5 68 66.5 75.8 60 75.8C53.5 75.8 53.5 68 52 64.5C50.5 61.5 48 59 48 54C48 48.5 52.5 44.6 60 44.6Z',
  ears: [
    'M49.5 46.4C45.8 44 41.4 44.2 39.4 47.4C41.4 51.2 46.4 52.6 50.2 52.4Z',
    'M70.5 46.4C74.2 44 78.6 44.2 80.6 47.4C78.6 51.2 73.6 52.6 69.8 52.4Z',
  ],
  antlers: [
    'M56.4 45.6C54 42.4 49.6 41.4 46.6 40.4C44 39.5 42.6 37 42.8 32.8',
    'M50.6 41.8C50.2 39.6 50.8 37.4 52 35.8',
    'M46.8 40.4C46.3 38 46.5 35.4 47.7 33.4',
    'M63.6 45.6C66 42.4 70.4 41.4 73.4 40.4C76 39.5 77.4 37 77.2 32.8',
    'M69.4 41.8C69.8 39.6 69.2 37.4 68 35.8',
    'M73.2 40.4C73.7 38 73.5 35.4 72.3 33.4',
  ],
};

/** The deer in one colour, moved by (dx, dy): its shapes filled, its antlers stroked round. */
function deer(colour: string, dx: number, dy: number, antlerWidth: number): string {
  const move = dx || dy ? ` transform="translate(${n(dx)} ${n(dy)})"` : '';
  const shapes = [DEER.head, ...DEER.ears].map((d) => `<path d="${d}" fill="${colour}"/>`).join('');
  const antlers = DEER.antlers.map((d) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(antlerWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<g${move}>${antlers}${shapes}</g>`;
}

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

  // the deer, raised in gold, its shadow down and to the left
  dr.add(deer(GOLD.raisedShadow, -1.6, 1.9, 4.4));
  dr.add(deer(GOLD.face, 0, 0, 4.4));
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
