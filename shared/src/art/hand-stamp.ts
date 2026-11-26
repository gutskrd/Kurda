/**
 * A hand holding up a game's stamp to show it, for the front page's games moment, and how it turns the stamp over to
 * the next. Seen from the front and a little below: the thumb upright in front pinching the stamp's foot, its nail
 * toward us; the index finger behind it on the right, long and bent at its joints, running down to its knuckle; the
 * middle finger reaching out to the left under the stamp; and the ring finger curled below it. Flat colour in the skin
 * of the hand holding the phone (hand-paint.ts), one shade step on the far side of each finger and under the stamp's
 * edge, the gaps between the digits in the antlers' brown with a deeper accent where they are deepest, and a few warm
 * brown lines that swell in the creases and thin away to nothing. Only the roots of the thumb and the index finger,
 * where they become the palm, leave the frame, at its foot.
 *
 * Two layers on one frame: `back` (the fingers behind the stamp) and `front` (the thumb), so an app can lay the stamp
 * (`HAND_STAMP_CARD`) between them. A turn is drawn as whole poses of the hand, passed between by smooth curves:
 * `handStampShapesAt` gives every shape's path at any moment of it, and `handStampFlip` the stamp's transforms.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, smooth } from './hand-paint.js';

/** The frame in drawing units, room for the whole hand and the stamp all through a turn. */
export const HAND_STAMP_VIEW = { w: 312, h: 236 } as const;

/**
 * Where the stamp is held at rest: a box `w` by `h` centred on (`cx`, `cy`), turned `turn` degrees. The thumb covers
 * only its foot: the top `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 130.4, cy: 90.1, w: 100, h: 128, turn: 9, clear: 100 } as const;

/**
 * The hand's own colours beside the skin: the gaps in the dark brown of Hevalo's antlers and their deepest part a step
 * darker, the lines a warm brown, and the nail a step paler than the skin with its free edge paler still.
 */
const INK = { gap: '#4f3029', deep: '#47241f', line: '#8d5236', nail: '#eecbb0', nailEdge: '#f8e6d8' } as const;

/** The hand is laid out on a grid three times the frame's size; this places a point of that grid on the frame. */
const K = 0.33;
const at = ([x, y]: Pt): Pt => [(x - 250) * K, (y - 30) * K];

/** A smooth curve through `points`, sampled `count` times along its length (Catmull-Rom). */
function sampled(points: readonly Pt[], count: number): Pt[] {
  const m = points.length;
  const out: Pt[] = [];
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * (m - 1);
    const i = Math.min(m - 2, Math.floor(t));
    const u = t - i;
    const [p0, p1, p2, p3] = [points[Math.max(0, i - 1)]!, points[i]!, points[i + 1]!, points[Math.min(m - 1, i + 2)]!];
    const c = (a: number, b: number, d: number, e: number): number =>
      0.5 * (2 * b + (-a + d) * u + (2 * a - 5 * b + 4 * d - e) * u * u + (-a + 3 * b - 3 * d + e) * u * u * u);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/**
 * A line as a brush draws it, as the ring round it: along a smooth curve through `points` (on the frame), swelling to
 * `width` a little before its middle and thinning away to nothing at both ends.
 */
function brushRing(points: readonly Pt[], width: number): string {
  const pts = sampled(points, 24);
  const sideA: Pt[] = [];
  const sideB: Pt[] = [];
  pts.forEach(([x, y], k) => {
    const [a, b] = [pts[Math.max(0, k - 1)]!, pts[Math.min(pts.length - 1, k + 1)]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const t = k / (pts.length - 1);
    const h = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.75);
    sideA.push([x + nx * h, y + ny * h]);
    sideB.push([x - nx * h, y - ny * h]);
  });
  return `M${[...sideA, ...sideB.reverse()].map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
}

/**
 * A digit: its centre line from base to tip, its half-width on each side at each point (`a` the side to its right
 * looking toward the tip, `b` the other), how far its tip runs on past the last point as a share of its width there,
 * and the joint its tip bends at.
 */
interface Digit {
  centre: Pt[];
  a: number[];
  b: number[];
  tip: number;
  joint?: number;
}

/*
 * The digits. The thumb is about two-thirds as long as the index finger from knuckle to tip and a little broader; each
 * finger narrows a touch between its joints and swells a little at them and at its pad, and its two sides differ, as
 * a real finger's do.
 */
const THUMB: Digit = {
  centre: [[736, 900], [730, 800], [722, 722], [714, 660], [706, 600], [700, 540], [697, 498]],
  a: [92, 86, 74, 66, 63, 62, 57],
  b: [66, 66, 66, 63, 60, 60, 55],
  tip: 1.12,
  joint: 4,
};
const INDEX: Digit = {
  centre: [[974, 900], [966, 800], [957, 728], [938, 664], [902, 612], [866, 570], [824, 532], [788, 503], [766, 486]],
  a: [54, 56, 56, 55, 53, 50, 47, 46, 43],
  b: [68, 65, 61, 57, 58, 52, 47, 46, 42],
  tip: 1.18,
  joint: 5,
};
const REACHING: Digit = {
  centre: [[702, 598], [640, 604], [586, 611], [546, 616], [516, 620]],
  a: [42, 40, 38, 37, 35],
  b: [44, 42, 41, 42, 39],
  tip: 1.15,
};
const CURLED: Digit = {
  centre: [[702, 688], [630, 690], [580, 692], [552, 694]],
  a: [29, 27, 26, 25],
  b: [30, 29, 28, 27],
  tip: 1.1,
};
const KNUCKLES = { thumb: [716, 760] as Pt, index: [960, 760] as Pt, reaching: [690, 600] as Pt, curled: [690, 692] as Pt };


/* ---- poses --------------------------------------------------------------------------------------------------------- */

/**
 * One turn, as whole poses of the hand 80 ms apart, drawn from the reference's frames: the stamp straightens as the hand
 * gathers itself; it turns a third of the way and holds while the index finger lifts off its back and curls, and the
 * middle finger rises behind it; then the fingers push it over, the hand rolling up with it, the stamp swinging down
 * past edge-on with its other face coming round; and it lands upright and settles back to its lean.
 *
 * Each pose says how the hand stands: the whole hand's move (in the frame's units) and turn about the wrist; the
 * thumb's move and turn about its root, its tip's bend and how much its pad flattens against the stamp; and the index
 * finger's turn and the bend at its middle joint, and the middle and ring fingers' turns. Every pose is drawn whole
 * from that, each digit one continuous outline along its bent centre line, and the turn passes from pose to pose by
 * moving every point of every shape along a smooth curve.
 */
interface Pose {
  hand: readonly [number, number, number];
  thumb: readonly [number, number, number];
  thumbTip: readonly [number, number];
  index: number;
  indexTip: number;
  reaching: number;
  curled: number;
}
const FLIP_FRAME_MS = 80;
const POSES: readonly Pose[] = [
  { hand: [0, 0, 0], thumb: [0, 0, 0], thumbTip: [0, 0], index: 0, indexTip: 0, reaching: 0, curled: 0 },
  { hand: [0, 0, 0.5], thumb: [0.1, -0.8, 0.5], thumbTip: [0, 0], index: 1, indexTip: 0, reaching: 0, curled: 0 },
  { hand: [0, -1, 1], thumb: [0.2, -3.3, 1], thumbTip: [-1, 0.01], index: 3, indexTip: -1, reaching: 2, curled: 1 },
  { hand: [0, -1.5, 1.5], thumb: [-0.4, -7.2, 2], thumbTip: [-2, 0.02], index: 6, indexTip: -3, reaching: 6, curled: 2 },
  { hand: [0, -2, 0], thumb: [-2.6, -8.9, -6], thumbTip: [4, 0.03], index: 20, indexTip: -16, reaching: 18, curled: 5 },
  { hand: [0, -2, -1], thumb: [-3.2, -6.9, -8], thumbTip: [6, 0.035], index: 30, indexTip: -30, reaching: 30, curled: 7 },
  { hand: [0, -2, -1], thumb: [-3, -5.2, -9], thumbTip: [6, 0.035], index: 34, indexTip: -36, reaching: 34, curled: 8 },
  { hand: [5.7, -5.1, -5], thumb: [-2, -4.4, -6], thumbTip: [8, 0.03], index: 12, indexTip: -6, reaching: 24, curled: 8 },
  { hand: [15.7, -12, -14], thumb: [-1, -2, -4], thumbTip: [12, 0.05], index: 8, indexTip: 18, reaching: 55, curled: 18 },
  { hand: [22, -17, -20], thumb: [0, -1, -3], thumbTip: [14, 0.06], index: 10, indexTip: 22, reaching: 62, curled: 24 },
  { hand: [13.5, -9.3, -12], thumb: [0, 0, -1], thumbTip: [8, 0.04], index: 4, indexTip: 10, reaching: 32, curled: 14 },
  { hand: [5.7, -3.1, -5], thumb: [-0.4, -0.1, 1], thumbTip: [2, 0.015], index: -5, indexTip: -2, reaching: 10, curled: 6 },
  { hand: [2.3, -1, -2], thumb: [0, 0, 1], thumbTip: [0, 0.005], index: -6, indexTip: -1, reaching: 3, curled: 2 },
  { hand: [0, 0, 0.8], thumb: [0, 0, 0.5], thumbTip: [-1, 0], index: -3, indexTip: 0, reaching: 0, curled: 1 },
  { hand: [0, 0, 0.6], thumb: [0, 0, 0.3], thumbTip: [-0.5, 0], index: -1, indexTip: 0, reaching: -1, curled: 0 },
  { hand: [0, 0, 0.2], thumb: [0, 0, 0], thumbTip: [0, 0], index: 0, indexTip: 0, reaching: 0, curled: 0 },
  { hand: [0, 0, 0], thumb: [0, 0, 0], thumbTip: [0, 0], index: 0, indexTip: 0, reaching: 0, curled: 0 },
  { hand: [0, 0, 0], thumb: [0, 0, 0], thumbTip: [0, 0], index: 0, indexTip: 0, reaching: 0, curled: 0 },
];
/**
 * The stamp in each pose: its lean from rest and its turn about its upright, in degrees, as measured from the
 * reference, and where under the thumb's pad it is held, from where it is held at rest (in the frame's units, across
 * and down the stamp): it slides a little through the fingers as they turn it, the thumb riding up with it as it is
 * lifted, so the pad never leaves the stamp's foot.
 */
const CARD_POSES: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [-1.2, 0, 2, 0.8],
  [-5.2, 0, 4.7, 1.4],
  [-12.3, 0, 8, 1.6],
  [-15.8, 30, -1, 1.6],
  [-16.2, 33, -5, 1.4],
  [-16, 34, -6, 1.2],
  [-14.2, 32, -2.4, 1.6],
  [-59.4, 84, -6, -2],
  [-53.4, 92, -8, -3],
  [-75.6, 112, -10, 0],
  [-83.6, 136, -8, 1.6],
  [-52, 146, -6, -3],
  [-16.3, 156, -6, -4],
  [-5, 166, -3, -4],
  [-3.1, 174, -2, -3],
  [1.2, 178, 0.5, -1.5],
  [0, 180, 0, 0],
];

/** How long one turn takes, and how far through it the stamp is edge-on and shows its other face. */
export const HAND_STAMP_FLIP = { ms: (POSES.length - 1) * FLIP_FRAME_MS, edgeOn: 9 / (POSES.length - 1) } as const;

/** The wrist the whole hand turns about, on the grid. */
const WRIST: Pt = [780, 800];

/** `p` turned `deg` degrees about `o` (clockwise on the screen, as CSS turns). */
function turn([x, y]: Pt, [ox, oy]: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  const [u, v] = [x - ox, y - oy];
  return [ox + u * Math.cos(r) - v * Math.sin(r), oy + u * Math.sin(r) + v * Math.cos(r)];
}

/** A digit as it stands in a pose: its centre line and its half-widths, on the grid. */
interface Posed {
  centre: Pt[];
  a: number[];
  b: number[];
  tip: number;
}

/**
 * A digit in a pose: turned about its knuckle and moved, its tip bent about the joint and flattened a little along
 * itself (`squash`, widening as it shortens), then carried with the whole hand.
 */
function posed(d: Digit, knuckle: Pt, by: { move?: readonly [number, number]; turn: number; bend?: number; squash?: number }, hand: Pose['hand']): Posed {
  const [mx, my] = by.move ?? [0, 0];
  let centre = d.centre.map((p) => {
    const q = turn(p, knuckle, by.turn);
    return [q[0] + mx / K, q[1] + my / K] as Pt;
  });
  const a = [...d.a];
  const b = [...d.b];
  if (d.joint !== undefined) {
    const j = d.joint;
    const joint = centre[j]!;
    centre = centre.map((p, i) => (i > j ? turn(p, joint, by.bend ?? 0) : p));
    const sq = by.squash ?? 0;
    if (sq) {
      const end = centre[centre.length - 1]!;
      const len = Math.hypot(end[0] - joint[0], end[1] - joint[1]) || 1;
      const [ux, uy] = [(end[0] - joint[0]) / len, (end[1] - joint[1]) / len];
      centre = centre.map((p, i) => {
        if (i <= j) return p;
        const along = (p[0] - joint[0]) * ux + (p[1] - joint[1]) * uy;
        const across = -(p[0] - joint[0]) * uy + (p[1] - joint[1]) * ux;
        const [s, c] = [along * (1 - sq), across * (1 + sq * 0.6)];
        return [joint[0] + s * ux - c * uy, joint[1] + s * uy + c * ux] as Pt;
      });
      for (let i = j + 1; i < a.length; i++) {
        a[i] = a[i]! * (1 + sq * 0.6);
        b[i] = b[i]! * (1 + sq * 0.6);
      }
    }
  }
  const carried = centre.map((p) => {
    const q = turn(p, WRIST, hand[2]);
    return [q[0] + hand[0] / K, q[1] + hand[1] / K] as Pt;
  });
  return { centre: carried, a, b, tip: d.tip };
}

/** The direction along a posed digit at a point of its centre line, from its neighbours. */
function alongAt(d: Posed, i: number): Pt {
  const m = d.centre.length;
  const [p, q] = [d.centre[Math.max(0, i - 1)]!, d.centre[Math.min(m - 1, i + 1)]!];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
}

/**
 * A point held on a digit: `u` along its centre line (a point's number, fractions between; past the last, on along
 * its tip by that share of its last stretch) and `v` across it (toward its `a` side when positive). Shapes drawn on a
 * digit (its nail, its creases) are held this way, so they ride on it however it stands.
 */
function onDigit(d: Posed, u: number, v: number): Pt {
  const m = d.centre.length;
  const i = Math.max(0, Math.min(m - 2, Math.floor(u)));
  const f = u - i;
  const [p, q] = [d.centre[i]!, d.centre[i + 1]!];
  const [t0, t1] = [alongAt(d, i), alongAt(d, i + 1)];
  let [tx, ty] = [t0[0] + (t1[0] - t0[0]) * Math.min(1, f), t0[1] + (t1[1] - t0[1]) * Math.min(1, f)];
  const tl = Math.hypot(tx, ty) || 1;
  [tx, ty] = [tx / tl, ty / tl];
  const [x, y] = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  return [x - ty * v, y + tx * v];
}

/** Where a point drawn at rest sits on a digit at rest, as `onDigit` holds it: found by searching along the digit. */
function holdOn(d: Posed, [x, y]: Pt): [number, number] {
  const m = d.centre.length;
  let best: [number, number, number] = [0, 0, Infinity];
  for (let u = 0; u <= m - 1 + 0.8; u += 0.005) {
    const base = onDigit(d, u, 0);
    const side = onDigit(d, u, 1);
    const [nx, ny] = [side[0] - base[0], side[1] - base[1]];
    const [dx, dy] = [x - base[0], y - base[1]];
    const v = dx * nx + dy * ny;
    const off = Math.abs(dx * ny - dy * nx);
    if (off < best[2]) best = [u, v, off];
  }
  return [best[0], best[1]];
}

/** A posed digit's two sides and its tip, from its `a` side round to its `b` side. */
function digitSides(d: Posed): { a: Pt[]; b: Pt[]; cap: Pt[] } {
  const m = d.centre.length;
  const a = d.centre.map((_, i) => onDigit(d, i, d.a[i]!));
  const b = d.centre.map((_, i) => onDigit(d, i, -d.b[i]!));
  const [tx, ty] = alongAt(d, m - 1);
  const [ex, ey] = d.centre[m - 1]!;
  const [ra, rb] = [d.a[m - 1]!, d.b[m - 1]!];
  const cap: Pt[] = [];
  for (let k = -2; k <= 2; k++) {
    const q = (k * 34 * Math.PI) / 180;
    const r = ra + ((rb - ra) * (k + 2)) / 4;
    cap.push([ex + tx * r * Math.cos(q) * d.tip + ty * r * Math.sin(q), ey + ty * r * Math.cos(q) * d.tip - tx * r * Math.sin(q)]);
  }
  return { a, b, cap };
}

/** The hand's digits in a pose. */
function digitsIn(p: Pose): Record<'thumb' | 'index' | 'reaching' | 'curled', Posed> {
  return {
    thumb: posed(THUMB, KNUCKLES.thumb, { move: [p.thumb[0], p.thumb[1]], turn: p.thumb[2], bend: p.thumbTip[0], squash: p.thumbTip[1] }, p.hand),
    index: posed(INDEX, KNUCKLES.index, { turn: p.index, bend: p.indexTip }, p.hand),
    reaching: posed(REACHING, KNUCKLES.reaching, { turn: p.reaching }, p.hand),
    curled: posed(CURLED, KNUCKLES.curled, { turn: p.curled }, p.hand),
  };
}
/** A point of the palm, carried with the whole hand. */
const onHand = (p: Pose, q: Pt): Pt => {
  const r = turn(q, WRIST, p.hand[2]);
  return [r[0] + p.hand[0] / K, r[1] + p.hand[1] / K];
};

/* ---- the shapes ---------------------------------------------------------------------------------------------------- */

const REST = digitsIn(POSES[0]!);
type DigitName = keyof typeof REST;
/** A shape's points held on a digit, from where they are drawn at rest. */
const held = (digit: DigitName, points: readonly Pt[]): { digit: DigitName; at: [number, number][] } => ({ digit, at: points.map((q) => holdOn(REST[digit], q)) });
const ride = (h: { digit: DigitName; at: [number, number][] }, ds: Record<DigitName, Posed>): Pt[] => h.at.map(([u, v]) => onDigit(ds[h.digit], u, v));

/** A point on a digit's side, its width found between its points: `side` 1 for its `a` side, -1 for its `b`, `inset` in from the edge. */
function sideAt(d: Posed, u: number, side: 1 | -1, inset = 0): Pt {
  const w = side > 0 ? d.a : d.b;
  const i = Math.max(0, Math.min(w.length - 2, Math.floor(u)));
  return onDigit(d, u, side * (w[i]! + (w[i + 1]! - w[i]!) * Math.min(1, u - i) - inset));
}

/**
 * The web between the index finger and the thumb, as far along each as it reaches. Held close, the index finger's
 * inner side runs under the thumb's edge and the web is where they cross; held apart, it is where they come nearest,
 * at their tips. As the index finger lifts away (`open`), the web sinks to their roots, so the hand opens between
 * them as a hand does, rather than showing a dark hollow.
 */
function webIn(p: Pose, ds: Record<DigitName, Posed>): { index: number; thumb: number; open: number } {
  const steps = (from: number, to: number): number[] => Array.from({ length: 121 }, (_, k) => from + ((to - from) * k) / 120);
  const [iu, tu] = [steps(2, 8), steps(0, 6)];
  const ie = iu.map((u) => sideAt(ds.index, u, -1));
  const te = tu.map((u) => sideAt(ds.thumb, u, 1));
  let closed: [number, number] | null = null;
  for (let i = 0; i < 120 && !closed; i++) {
    for (let j = 0; j < 120; j++) {
      const [p1, p2, q1, q2] = [ie[i]!, ie[i + 1]!, te[j]!, te[j + 1]!];
      const [rx, ry, sx, sy] = [p2[0] - p1[0], p2[1] - p1[1], q2[0] - q1[0], q2[1] - q1[1]];
      const den = rx * sy - ry * sx;
      if (!den) continue;
      const [qx, qy] = [q1[0] - p1[0], q1[1] - p1[1]];
      const [f, g] = [(qx * sy - qy * sx) / den, (qx * ry - qy * rx) / den];
      if (f >= 0 && f <= 1 && g >= 0 && g <= 1) {
        // just past the crossing on the index finger, under the thumb, and just short of it on the thumb
        closed = [iu[i]! + f * 0.05 + 0.15, tu[j]! + g * 0.05 - 0.15];
        break;
      }
    }
  }
  if (!closed) {
    let best = Infinity;
    ie.forEach((q, i) =>
      te.forEach((r, j) => {
        const d = Math.hypot(q[0] - r[0], q[1] - r[1]);
        if (d < best) [best, closed] = [d, [iu[i]!, tu[j]!]];
      }),
    );
  }
  const open = Math.min(1, Math.max(0, (p.index - 2) / 30));
  const [ci, ct] = closed!;
  // (no higher on the index finger than where its tip begins, so its points along the side never crowd its tip)
  return { index: Math.min(7.3, ci) + (2.5 - Math.min(7.3, ci)) * open, thumb: ct + (2.3 - ct) * open, open };
}

/** The palm's points the outline of the fingers behind runs through below the frame, and the wedge's, above the middle finger. */
const BELOW: readonly Pt[] = [[690, 900], [1060, 940]];
const WEDGE_TOP = held('reaching', [[650, 524], [590, 536]]);
const WEDGE_DEEP = held('reaching', [[646, 544], [624, 556], [612, 566]]);
/** Where the wedge and its deepest part close, under the thumb: held on the middle finger like the rest of them, so neither can fold. */
const WEDGE_SHUT = held('reaching', [[652, 544]]);
const WEDGE_DEEP_SHUT = held('reaching', [[650, 568]]);

/** The nail: a soft, nearly square shield across the thumb's tip, its free edge pale, set into the skin. */
const NAIL = held('thumb', [[660, 470], [672, 456], [700, 452], [728, 456], [740, 470], [742, 512], [732, 536], [700, 542], [668, 536], [658, 512]]);
const FREE_EDGE = held('thumb', [[662, 470], [674, 457], [700, 453], [726, 457], [738, 470], [726, 476], [700, 474], [674, 476]]);

/** The lines, each held on its digit: where, how wide at its fullest, how strong, and in what ink. */
const LINES: readonly { name: string; on: ReturnType<typeof held>; width: number; opacity: number; ink?: string; layer: 'back' | 'front' }[] = [
  { name: 'nail-rim', on: held('thumb', [[662, 476], [658, 504], [668, 532], [700, 543], [732, 532], [742, 504], [738, 476]]), width: 1.2, opacity: 0.8, layer: 'front' },
  { name: 'cuticle', on: held('thumb', [[668, 552], [700, 560], [732, 552]]), width: 0.8, opacity: 0.5, layer: 'front' },
  { name: 'thumb-joint', on: held('thumb', [[684, 602], [702, 596], [722, 600]]), width: 1, opacity: 0.7, layer: 'front' },
  { name: 'thumb-joint-2', on: held('thumb', [[690, 614], [704, 610], [718, 613]]), width: 0.6, opacity: 0.5, layer: 'front' },
  { name: 'thumb-fold', on: held('thumb', [[782, 650], [790, 690], [794, 730]]), width: 1.3, opacity: 0.75, layer: 'front' },
  { name: 'thumb-root', on: held('thumb', [[652, 700], [678, 712], [706, 714]]), width: 0.9, opacity: 0.55, layer: 'front' },
  { name: 'index-joint', on: held('index', [[880, 626], [900, 612], [922, 598]]), width: 1.2, opacity: 0.85, layer: 'back' },
  { name: 'index-joint-2', on: held('index', [[889, 638], [906, 627], [922, 617]]), width: 0.7, opacity: 0.55, layer: 'back' },
  { name: 'index-last', on: held('index', [[812, 512], [826, 506], [842, 498]]), width: 0.8, opacity: 0.6, layer: 'back' },
  { name: 'index-nail', on: held('index', [[719, 472], [722, 458], [732, 446], [746, 440]]), width: 1.1, opacity: 0.8, ink: INK.nail, layer: 'back' },
  { name: 'reaching-joint', on: held('reaching', [[592, 590], [588, 606], [590, 624]]), width: 1.1, opacity: 0.85, layer: 'back' },
  { name: 'reaching-joint-2', on: held('reaching', [[606, 594], [603, 607], [605, 620]]), width: 0.7, opacity: 0.6, layer: 'back' },
  { name: 'curled-joint', on: held('curled', [[578, 676], [574, 692], [578, 708]]), width: 0.8, opacity: 0.6, layer: 'back' },
];

/**
 * Every shape of the hand in a pose, on the grid, each with the same points in the same order in every pose, so the
 * turn can move each point along its own curve from pose to pose:
 * - `back`, the fingers behind the stamp as one outline: up the index finger's outer side, round its tip, a little way
 *   down its inner side, across the palm behind the thumb to the middle finger, out along it and back, out along the
 *   ring finger and back, and round under the frame's foot;
 * - `thumb`, the thumb in front, one outline from its root round its tip;
 * - the shapes on them: the ring finger's shade, the gaps and their deepest parts, the nail and its free edge, and the
 *   thumb's pad, where it holds the stamp (a single point, for placing the stamp).
 */
function shapesIn(p: Pose): Record<string, Pt[]> {
  const ds = digitsIn(p);
  const I = digitSides(ds.index);
  const R = digitSides(ds.reaching);
  const C = digitSides(ds.curled);
  const T = digitSides(ds.thumb);
  const wedgeTop = ride(WEDGE_TOP, ds);
  // The web's edge: from the index finger's inner side, sagging toward the palm as it opens, to just under the thumb,
  // from where the outline runs on under the thumb to the middle finger.
  const web = webIn(p, ds);
  const [wa, wb] = [sideAt(ds.index, web.index, -1), sideAt(ds.thumb, web.thumb, 1, 4)];
  const palm = onHand(p, WRIST);
  const [ex, ey] = [wb[0] - wa[0], wb[1] - wa[1]];
  const toward = Math.sign(-ey * (palm[0] - wa[0]) + ex * (palm[1] - wa[1])) || 1;
  const sag = 0.3 * web.open * toward;
  const webEdge = [1 / 3, 2 / 3].map((f): Pt => [wa[0] + ex * f - ey * sag * 4 * f * (1 - f), wa[1] + ey * f + ex * sag * 4 * f * (1 - f)]);
  webEdge.push(wb);
  const back = [
    ...I.a,
    ...I.cap,
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => sideAt(ds.index, 8 + ((web.index - 8) * k) / 6, -1)),
    ...webEdge,
    ...wedgeTop,
    ...R.a.slice(2),
    ...R.cap,
    ...R.b.slice().reverse(),
    ...C.a,
    ...C.cap,
    ...C.b.slice().reverse(),
    ...BELOW.map((q) => onHand(p, q)),
  ];
  const thumb = [...T.a, ...T.cap, ...T.b.slice().reverse()];
  const curled = [...C.a, ...C.cap, ...C.b.slice().reverse()];
  const tIn = (u: number, inset: number, side: 1 | -1): Pt => {
    const i = Math.min(ds.thumb.a.length - 1, Math.round(u));
    const h = side > 0 ? ds.thumb.a[i]! : ds.thumb.b[i]!;
    return onDigit(ds.thumb, u, side * (h - inset));
  };
  const iOut = (u: number, extra: number): Pt => {
    const i = Math.min(ds.index.b.length - 1, Math.round(u));
    return onDigit(ds.index, u, -(ds.index.b[i]! + extra));
  };
  // The gap between the index finger and the thumb, below the web: down the finger's inner side from the web, across
  // the palm, up under the thumb's edge and back along the web.
  const slit = [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => sideAt(ds.index, web.index * (1 - k / 7), -1)),
    onHand(p, [910, 935]),
    ...[0, 1, 2, 3, 4, 5].map((k) => sideAt(ds.thumb, (web.thumb * k) / 5, 1, 24 - k)),
    ...webEdge.slice().reverse(),
  ];
  const slitDeep = [iOut(4, 10), iOut(3, 16), iOut(2, 22), iOut(0.5, 28), onHand(p, [880, 935]), tIn(0.5, 8, 1), tIn(2, 6, 1), tIn(3.5, 6, 1)];
  const wedge = [...wedgeTop, R.a[2]!, R.a[1]!, R.a[0]!, ...ride(WEDGE_SHUT, ds)];
  const wedgeDeep = [...ride(WEDGE_DEEP, ds), onDigit(ds.reaching, 1.2, ds.reaching.a[1]! + 6), ...ride(WEDGE_DEEP_SHUT, ds)];
  return {
    back,
    curled,
    slit,
    slitDeep,
    wedge,
    wedgeDeep,
    thumb,
    nail: ride(NAIL, ds),
    freeEdge: ride(FREE_EDGE, ds),
    pad: [onDigit(ds.thumb, ds.thumb.centre.length - 1, 0)],
    ...Object.fromEntries(LINES.map((l) => [l.name, ride(l.on, ds)])),
  };
}

/** Each shape's points in every pose, on the frame. */
const KEYS: Record<string, Pt[][]> = (() => {
  const all = POSES.map(shapesIn);
  return Object.fromEntries(Object.keys(all[0]!).map((name) => [name, all.map((s) => s[name]!.map(at))]));
})();

/**
 * Smooth curves through the poses: for each point's each coordinate, a natural cubic spline through its place in
 * every pose, so its path, speed and acceleration all run on unbroken from pose to pose (C2). `bends` holds each
 * curve's second derivative at each pose.
 */
function splineBends(values: readonly number[]): number[] {
  const m = values.length;
  const bend = new Array<number>(m).fill(0);
  const c = new Array<number>(m).fill(0);
  const d = new Array<number>(m).fill(0);
  for (let i = 1; i < m - 1; i++) {
    const rhs = 6 * (values[i + 1]! - 2 * values[i]! + values[i - 1]!);
    const den = 4 - (i > 1 ? c[i - 1]! : 0);
    c[i] = 1 / den;
    d[i] = (rhs - (i > 1 ? d[i - 1]! : 0)) / den;
  }
  for (let i = m - 2; i >= 1; i--) bend[i] = d[i]! - c[i]! * bend[i + 1]!;
  return bend;
}
const onSpline = (values: readonly number[], bends: readonly number[], t: number): number => {
  const i = Math.max(0, Math.min(values.length - 2, Math.floor(t)));
  const u = t - i;
  const w = 1 - u;
  return w * values[i]! + u * values[i + 1]! + ((w * w * w - w) * bends[i]! + (u * u * u - u) * bends[i + 1]!) / 6;
};
const SPLINES: Record<string, { xs: number[][]; ys: number[][]; bx: number[][]; by: number[][] }> = Object.fromEntries(
  Object.entries(KEYS).map(([name, poses]) => {
    const xs = poses[0]!.map((_, k) => poses.map((pts) => pts[k]![0]));
    const ys = poses[0]!.map((_, k) => poses.map((pts) => pts[k]![1]));
    return [name, { xs, ys, bx: xs.map(splineBends), by: ys.map(splineBends) }];
  }),
);
const CARD_BENDS = [0, 1, 2, 3].map((c) => splineBends(CARD_POSES.map((q) => q[c]!)));

/** Every shape's points at `ms` into a turn, on the frame. */
function pointsAt(ms: number): Record<string, Pt[]> {
  const t = (Math.max(0, Math.min(HAND_STAMP_FLIP.ms, ms)) / HAND_STAMP_FLIP.ms) * (POSES.length - 1);
  return Object.fromEntries(
    Object.entries(SPLINES).map(([name, s]) => [name, s.xs.map((x, k) => [onSpline(x, s.bx[k]!, t), onSpline(s.ys[k]!, s.by[k]!, t)] as Pt)]),
  );
}

/** How each shape is painted: in which layer, in what, and whether it is a smooth outline or a brush's ring. */
const PAINT: readonly { name: string; layer: 'back' | 'front'; fill: string; brush?: { width: number; opacity: number } }[] = [
  { name: 'curled', layer: 'back', fill: SKIN.shade },
  { name: 'slit', layer: 'back', fill: INK.gap },
  { name: 'slitDeep', layer: 'back', fill: INK.deep },
  { name: 'wedge', layer: 'back', fill: INK.gap },
  { name: 'wedgeDeep', layer: 'back', fill: INK.deep },
  { name: 'nail', layer: 'front', fill: INK.nail },
  { name: 'freeEdge', layer: 'front', fill: INK.nailEdge },
  ...LINES.map((l) => ({ name: l.name, layer: l.layer, fill: l.ink ?? INK.line, brush: { width: l.width, opacity: l.opacity } })),
];
const BRUSHED = new Map(PAINT.filter((q) => q.brush).map((q) => [q.name, q.brush!]));

/** A shape's path from its points on the frame: a smooth closed outline, or a brush's ring for a line. */
function pathOf(name: string, pts: readonly Pt[]): string {
  const b = BRUSHED.get(name);
  if (!b) return smooth(pts);
  return brushRing(pts, b.width);
}

/** The outlines' shading: the light falls from the upper left, and each outline's face moves toward it this far. */
const SHADING: Record<'back' | 'thumb', Pt> = { back: [-1.6, -1.9], thumb: [-2.6, -0.6] };

export interface HandStampOptions {
  /** `back`: the fingers behind the stamp; `front`: the thumb over its foot. */
  part: 'back' | 'front';
  idPrefix?: string;
  /** Drawn this far into a turn, in milliseconds; at rest by default. */
  at?: number;
}

/**
 * One layer of the hand holding a stamp on its frame (`HAND_STAMP_VIEW`), clear all round. It is decoration. Every
 * shape that moves in a turn is a path marked `data-shape`, so an app can redraw it from `handStampShapesAt`.
 */
export function handStampSvg(opts: HandStampOptions): string {
  if (opts.part !== 'back' && opts.part !== 'front') throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-stamp', opts.part));
  const ds = handStampShapesAt(opts.at ?? 0);
  const outline = opts.part === 'back' ? 'back' : 'thumb';
  // The outline's face over its one shade step, which shows at the edge away from the light.
  const clip = dr.id('c');
  dr.def(`<clipPath id="${clip}"><path data-shape="${outline}" d="${ds[outline]}"/></clipPath>`);
  const [lx, ly] = SHADING[outline];
  // Everything painted on the layer stays inside its outline, so a gap drawn between the fingers ends at the web.
  const paint = PAINT.filter((q) => q.layer === opts.part).map((q) => {
    const opacity = q.brush ? ` opacity="${n(q.brush.opacity)}"` : '';
    return `<path data-shape="${q.name}" d="${ds[q.name]}" fill="${q.fill}"${opacity}/>`;
  });
  dr.add(
    `<g clip-path="url(#${clip})"><path data-shape="${outline}" d="${ds[outline]}" fill="${SKIN.shade}"/>` +
      `<path data-shape="${outline}" d="${ds[outline]}" fill="${SKIN.face}" transform="translate(${n(lx)} ${n(ly)})"/>${paint.join('')}</g>`,
  );
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}

/** Every shape's path `ms` into a turn, by its `data-shape` name, for redrawing the hand each frame of a turn. */
export function handStampShapesAt(ms: number): Record<string, string> {
  const pts = pointsAt(ms);
  return Object.fromEntries(Object.entries(pts).filter(([name]) => name !== 'pad').map(([name, p]) => [name, pathOf(name, p)]));
}

/** Every shape's points `ms` into a turn, on the frame, for checking the drawing. */
export function handStampPointsAt(ms: number): Record<string, Pt[]> {
  return pointsAt(ms);
}

/** Where the thumb's pad pinches the stamp at rest, and where it is held on the stamp then, seen from the stamp. */
const PINCH: Pt = KEYS.pad![0]![0]!;
const HELD: Pt = (() => {
  const c = HAND_STAMP_CARD;
  const r = (c.turn * Math.PI) / 180;
  const [px, py] = [PINCH[0] - c.cx, PINCH[1] - c.cy];
  return [px * Math.cos(r) + py * Math.sin(r), -px * Math.sin(r) + py * Math.cos(r)];
})();

/**
 * The stamp `ms` into a turn: its middle, its lean and its turn about its upright, placed where the thumb's pad holds
 * it. Turned about its upright, the held point comes in toward the stamp's middle as the stamp narrows to its edge, so
 * the pad stays on it.
 */
export function handStampCardAt(ms: number): { cx: number; cy: number; lean: number; turn: number } {
  const c = HAND_STAMP_CARD;
  const t = (Math.max(0, Math.min(HAND_STAMP_FLIP.ms, ms)) / HAND_STAMP_FLIP.ms) * (POSES.length - 1);
  const [lean, flip, across, down] = [0, 1, 2, 3].map((k) => onSpline(CARD_POSES.map((q) => q[k]!), CARD_BENDS[k]!, t));
  const pad = pointsAt(ms).pad![0]!;
  const a = ((c.turn + lean!) * Math.PI) / 180;
  const [hx, hy] = [(HELD[0] + across!) * Math.abs(Math.cos((flip! * Math.PI) / 180)), HELD[1] + down!];
  return { cx: pad[0] - (hx * Math.cos(a) - hy * Math.sin(a)), cy: pad[1] - (hx * Math.sin(a) + hy * Math.cos(a)), lean: c.turn + lean!, turn: flip! };
}

/** The stamp's transforms through one turn, every `stepMs`, about its own middle, from rest to rest with its other face showing. */
export function handStampFlip(stepMs = 20): string[] {
  if (!(stepMs > 0)) throw new RangeError(`art: a turn's step must be a positive number of milliseconds, got ${String(stepMs)}`);
  const c = HAND_STAMP_CARD;
  const count = Math.round(HAND_STAMP_FLIP.ms / stepMs);
  return Array.from({ length: count + 1 }, (_, k) => {
    const s = handStampCardAt((k * HAND_STAMP_FLIP.ms) / count);
    return `translate(${n(s.cx - c.cx)}px, ${n(s.cy - c.cy)}px) rotate(${n(s.lean)}deg) rotateY(${n(s.turn)}deg)`;
  });
}
