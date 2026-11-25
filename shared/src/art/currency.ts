/**
 * The currency, drawn in colour wherever money is shown: Zêr, a gold coin with a raised deer's head. It gets bolder as it
 * shrinks (`detail`): the outline thickens and the fine lines are dropped, so a 15-pixel coin still reads as a coin.
 */
import { curve, symmetric, type Knot } from '../characters/pen.js';
import { CANVAS, Drawing, checkSize, n, prefixFor, type Detail, type Pt } from './svg.js';

export interface CurrencyOptions {
  /** Size in pixels; the drawing is square. */
  size?: number;
  /** The accessible label; screens that print the amount beside it hide the picture from screen readers. */
  title?: string;
  idPrefix?: string;
}

/** Below this many pixels the fine lines are left out. */
const FINE = 36;
/** Below this many pixels the outline is drawn heavier, so the shape holds. */
const TINY = 20;

const detailOf = (size: number): Detail => (size < TINY ? 0 : size < FINE ? 1 : 2);

/** A point on a circle round (cx, cy), `deg` degrees clockwise from the right. */
const on = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/** An arc of a circle from `a0` to `a1` degrees, clockwise. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = on(cx, cy, r, a0);
  const [x1, y1] = on(cx, cy, r, a1);
  return `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
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
 * The deer, front on: round head, leaf-shaped ears and two three-tined antlers. One half runs from the chin round the
 * ear and antler to the middle of the crown and is mirrored for the other; a 0 marks a sharp corner.
 */
const DEER_HALF: readonly Knot[] = [
  [60, 80.1], [56.7, 80], [54.2, 79], [52.4, 76.9], [51.5, 74.7], [51.1, 72.6], [49.9, 70.1], [48.3, 67.6], [47.2, 64.7], [46.8, 61.2], [46.8, 58, 0],
  // The ear: out along its underside to the tip and back along its top.
  [45.1, 57.6], [43.1, 56.8], [41.1, 55.4], [39.4, 53.7], [38.3, 52], [37.9, 50.3], [38.6, 49.1], [41.1, 48.8], [44.4, 49.7], [47.1, 51], [49, 52.1], [49.9, 52.5, 0],
  // The antler: up its outer edge to the tallest tine, then the middle and inner tines.
  [50, 51], [49.1, 49.8], [47.7, 48.5], [46.1, 47.5], [44.4, 46.7], [42.7, 45.7], [41.1, 43.9], [40.1, 41.8], [39.8, 39.7], [39.9, 36.7], [40.5, 34.8], [42.4, 33.9],
  [43.8, 34.5], [44.2, 35.9], [44.1, 37.7], [43.9, 39.3], [44.4, 40.2], [45.1, 39.7], [45.7, 38.3], [46.6, 37.4], [47.6, 37.1], [48.6, 37.4], [49.2, 38.3], [49.2, 39.7],
  [48.7, 41.3], [48.2, 43], [48.5, 44.4], [49.2, 44.6], [50.4, 43.7], [51.7, 42.3], [52.7, 41.7], [53.7, 42], [54.2, 43.2], [54, 45], [53.7, 47], [53.9, 48.7], [54.3, 49.5, 0],
  // The crown between the antlers.
  [55.7, 48.5], [57.7, 47.7], [60, 47.4],
];
const DEER = curve(symmetric(DEER_HALF, 60));
/** The coin's deer, half of it, on the 120 canvas about (60, 57): Impostor's players take its ears and antlers. */
export const ZER_DEER_HALF = DEER_HALF;

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

/** Zêr: a gold coin with two shine bands across its ring and the deer raised in gold on its orange field. */
export function coinSvg(opts: CurrencyOptions = {}): string {
  const size = checkSize(opts.size, 24);
  const detail = detailOf(size);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'coin', detail));
  const { cx, cy, r, drop, field } = COIN;
  const line = detail === 0 ? 6 : detail === 1 ? 4.2 : 3;

  // The outline round the whole coin, face and edge.
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${n(r + line / 2)}" fill="${GOLD.outline}"/>`);
  // The edge: the coin's thickness, below the face.
  dr.add(`<circle cx="${cx}" cy="${cy + drop}" r="${r}" fill="${GOLD.edge}"/>`);
  // The face, and two bands of shine across its ring.
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GOLD.face}"/>`);
  dr.add(`<path d="${ringBand(cx, cy, field, r, 208, 252)}" fill="${GOLD.band}"/>`);
  dr.add(`<path d="${ringBand(cx, cy, field, r, 28, 62)}" fill="${GOLD.band}"/>`);
  if (detail === 2) {
    // A lighter lip round the upper left of the ring.
    dr.add(`<path d="${arc(cx, cy, r - 2.6, 165, 290)}" fill="none" stroke="${GOLD.rimLight}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  // The orange field, sunk inside the ring, its top in the ring's shadow.
  dr.add(`<circle cx="${cx}" cy="${cy}" r="${field}" fill="${GOLD.field}"/>`);
  if (detail > 0) dr.add(`<path d="${arc(cx, cy, field - 1.4, 195, 345)}" fill="none" stroke="${GOLD.fieldShadow}" stroke-width="2.8" stroke-linecap="round"/>`);

  // The deer and its shadow down and to the left; at large sizes its upper edges catch the light.
  dr.add(deer(GOLD.raisedShadow, -0.9, 1.3));
  if (detail === 2) {
    dr.add(deer(GOLD.rimLight));
    dr.add(`<g clip-path="url(#${dr.clip(DEER)})">${deer(GOLD.face, 0.3, 0.8)}</g>`);
  } else {
    dr.add(deer(GOLD.face));
  }
  return dr.svg(size, opts.title ?? 'Zêr');
}

/** The canvas the coin is drawn on, for a caller that sizes them itself. */
export const CURRENCY_CANVAS = CANVAS;
