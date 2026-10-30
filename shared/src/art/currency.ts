/**
 * Hevalo's two currencies, drawn in colour: Zêr, a chunky gold coin with a
 * deer's head carved into its face, and the gem, a faceted green stone. They
 * replace the line glyphs both apps used to tint, so wherever money is shown
 * — the purse, the shop's prices, a gift, the daily reward, a chest — it is
 * the same two objects.
 *
 * The coin stands a little forward: its face over a darker edge that shows
 * its thickness below, a raised rim round a recessed field, and in the field
 * the deer, cut in (a light lip along its lower edges, a shadow along its
 * upper ones), with its eyes left standing in gold. The gem is an elongated
 * hexagon cut with six bevels round a flat table, lit from the upper left so
 * each bevel is its own shade, with two bands of light across the table.
 *
 * Both are drawn bolder as they get smaller (`detail`): the thin facet lines,
 * the coin's inner bevel and the sparkle go below 36 pixels, so a 15-pixel
 * coin in the purse is still a coin and not a smudge.
 */
import { CANVAS, Drawing, checkSize, linearAt, n, prefixFor, radialAt, type Detail, type Pt } from './svg.js';

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
  outline: '#7a4706',
  edgeTop: '#e2a11d',
  edgeLow: '#a2650a',
  faceLight: '#ffeaa0',
  face: '#ffd04a',
  faceDeep: '#f0aa18',
  fieldTop: '#e39d12',
  fieldLow: '#f7c23a',
  rimShadow: '#c08008',
  rimLight: '#fff2bd',
  carve: '#b8740b',
  carveShadow: '#8f5606',
  carveLight: '#ffe7a0',
};

/** The coin's face: centre, radius, and how far below it the edge shows. */
const COIN = { cx: 60, cy: 55, r: 49, drop: 8, field: 37 };

/** The deer, front on, as the carving: a round head, ears out to the sides, two branching antlers. */
const DEER = {
  head: 'M60 46C70 46 74.5 52.5 73.5 59.5C72.5 67 66.5 76.5 60 78C53.5 76.5 47.5 67 46.5 59.5C45.5 52.5 50 46 60 46Z',
  ears: [
    'M48.6 53.5C43 49.5 36.5 49.5 33 52.5C37 57 43.5 58.5 48.9 57Z',
    'M71.4 53.5C77 49.5 83.5 49.5 87 52.5C83 57 76.5 58.5 71.1 57Z',
  ],
  antlers: [
    'M55.2 47C53.6 40 50 35 44 31.6',
    'M51.9 38.6C52.6 34.6 52.1 31.6 50.6 28.6',
    'M47.4 33.8C45.4 30.2 44.7 27.4 45.4 24.2',
    'M64.8 47C66.4 40 70 35 76 31.6',
    'M68.1 38.6C67.4 34.6 67.9 31.6 69.4 28.6',
    'M72.6 33.8C74.6 30.2 75.3 27.4 74.6 24.2',
  ],
  eyes: [
    [54.6, 59.5],
    [65.4, 59.5],
  ] as Pt[],
  nose: [60, 71.6] as Pt,
};

/** The deer in one colour, moved by (dx, dy): its shapes filled, its antlers stroked. */
function deer(colour: string, dx: number, dy: number, antlerWidth: number): string {
  const move = dx || dy ? ` transform="translate(${n(dx)} ${n(dy)})"` : '';
  const shapes = [DEER.head, ...DEER.ears].map((d) => `<path d="${d}" fill="${colour}"/>`).join('');
  const antlers = DEER.antlers.map((d) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(antlerWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<g${move}>${antlers}${shapes}</g>`;
}

/** Zêr: a gold coin, standing a little forward, with Hevalo's deer carved into its face. */
export function coinSvg(opts: CurrencyOptions = {}): string {
  const size = checkSize(opts.size, 24);
  const detail = detailOf(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'coin', detail));
  const { cx, cy, r, drop, field } = COIN;
  const line = detail === 0 ? 7 : detail === 1 ? 5.5 : 4.5;

  // the outline round the whole coin, its face and the edge below it
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  // the edge: the coin's thickness, showing below the face
  const edge = dr.id('e');
  dr.def(linearAt(edge, [[0, GOLD.edgeTop], [1, GOLD.edgeLow]], 0, cy, 0, cy + drop + r));
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${r}" fill="url(#${edge})"/>`);
  // the face, brightest towards the upper left
  const face = dr.id('f');
  dr.def(radialAt(face, [[0, GOLD.faceLight], [0.55, GOLD.face], [1, GOLD.faceDeep]], cx - 16, cy - 20, r * 1.25));
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${face})"/>`);
  // the field inside the rim, sunk a little: shaded at the top, lit at the bottom
  const fieldFill = dr.id('d');
  dr.def(linearAt(fieldFill, [[0, GOLD.fieldTop], [1, GOLD.fieldLow]], 0, cy - field, 0, cy + field));
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${field}" fill="url(#${fieldFill})"/>`);
  if (detail > 0) {
    // the rim's inner bevel: in shadow along the top, catching the light along the bottom
    dr.add(`<path d="${arc(cx, cy, field, 180, 360)}" fill="none" stroke="${GOLD.rimShadow}" stroke-width="2.6"/>`);
    dr.add(`<path d="${arc(cx, cy, field, 0, 180)}" fill="none" stroke="${GOLD.rimLight}" stroke-width="2.2"/>`);
  }

  // the deer, cut in: a light lip below, a shadow above, then the cut itself
  dr.add(deer(GOLD.carveLight, 0, 1.8, 4.6));
  if (detail > 0) dr.add(deer(GOLD.carveShadow, 0, -1.2, 4.6));
  dr.add(deer(GOLD.carve, 0, 0, 4.6));
  // its eyes left standing in gold, and its nose cut deeper
  for (const [x, y] of DEER.eyes) dr.add(`<circle cx="${n(x)}" cy="${n(y)}" r="2.6" fill="${GOLD.face}"/>`);
  dr.add(`<ellipse cx="${n(DEER.nose[0])}" cy="${n(DEER.nose[1])}" rx="3.4" ry="2.5" fill="${GOLD.carveShadow}"/>`);

  // the shine: a glint across the rim at the upper left, and a sparkle when there is room
  dr.add(`<path d="${arc(cx, cy, r - 5.5, 200, 255)}" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="${detail === 0 ? 5 : 4}" stroke-linecap="round"/>`);
  if (detail === 2) {
    dr.add(`<path d="${arc(cx, cy, r - 5.5, 268, 280)}" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="4" stroke-linecap="round"/>`);
    dr.add(`<path d="${sparkle(97, 17, 9)}" fill="#ffffff"/>`);
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
