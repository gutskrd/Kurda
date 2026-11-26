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
 * (`HAND_STAMP_CARD`) between them. Each digit is a group marked `data-part`, turning about its own knuckle (its
 * `transform-origin`, in the frame's units); `handStampFlip` gives every part's transforms through one turn.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, smooth } from './hand-paint.js';

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
const shape = (points: readonly Pt[]): string => smooth(points.map(at));

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
 * A line as a brush draws it: along a smooth curve through `points`, swelling to `width` (in the frame's units) a
 * little before its middle and thinning away to nothing at both ends.
 */
function brush(points: readonly Pt[], width: number, opacity = 0.85, ink: string = INK.line): string {
  const pts = sampled(points.map(at), 24);
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
  const ring = [...sideA, ...sideB.reverse()];
  return `<path d="M${ring.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z" fill="${ink}" opacity="${n(opacity)}"/>`;
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

/** The digit's two sides, offset from its centre line, each point's direction taken along the whole digit. */
function sides(d: Digit): { a: Pt[]; b: Pt[]; along: Pt[] } {
  const m = d.centre.length;
  const along = d.centre.map((_, i): Pt => {
    const [p, q] = [d.centre[Math.max(0, i - 1)]!, d.centre[Math.min(m - 1, i + 1)]!];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  });
  const off = (i: number, h: number): Pt => [d.centre[i]![0] - along[i]![1] * h, d.centre[i]![1] + along[i]![0] * h];
  return { a: d.centre.map((_, i) => off(i, d.a[i]!)), b: d.centre.map((_, i) => off(i, -d.b[i]!)), along };
}

/**
 * A digit's outline from point `from` to point `to`: its sides, and at `to` a rounded end, a fingertip running on by
 * `tip` of its width when it is the digit's own tip, or a plain round where a joint is. The end at `from` is left open,
 * where it runs into the palm or under the piece before it.
 */
function outline(d: Digit, from: number, to: number, runBack = 0): Pt[] {
  const { a, b, along } = sides(d);
  // Run on back past the open end, for a face laid over the shade, so no shade shows across that end.
  const back = (side: Pt[]): Pt[] => {
    if (!runBack) return side.slice(from, to + 1);
    const [bx, by] = along[from]!;
    const [x, y] = side[from]!;
    const [cx, cy] = d.centre[from]!;
    // drawn in toward the middle as it runs back, so its corners stay well inside the piece it runs under
    const inward = (k: number): Pt => [x + (cx - x) * k - bx * runBack, y + (cy - y) * k - by * runBack];
    return [inward(0.3), [x - bx * runBack * 0.4 + (cx - x) * 0.05, y - by * runBack * 0.4 + (cy - y) * 0.05], ...side.slice(from, to + 1)];
  };
  const [tx, ty] = along[to]!;
  const [ex, ey] = d.centre[to]!;
  const [ra, rb] = [d.a[to]!, d.b[to]!];
  const run = to === d.centre.length - 1 ? d.tip : 0.9;
  const cap: Pt[] = [];
  for (let k = -3; k <= 3; k++) {
    const q = (k * 26 * Math.PI) / 180;
    const r = ra + ((rb - ra) * (k + 3)) / 6;
    // from the `a` side round the end to the `b` side, the end running on by `run`
    cap.push([ex + tx * r * Math.cos(q) * run + ty * r * Math.sin(q), ey + ty * r * Math.cos(q) * run - tx * r * Math.sin(q)]);
  }
  return [...back(a), ...cap, ...back(b).reverse()];
}

/** A digit's group, turning about its knuckle. */
const group = (part: string, knuckle: Pt, inner: string): string => {
  const [x, y] = at(knuckle);
  return `<g data-part="${part}" style="transform-origin:${n(x)}px ${n(y)}px">${inner}</g>`;
};

/**
 * A digit's flesh from point `from` to `to`: its face, and its one shade step along the side away from the light,
 * which falls from `light` (a direction on the frame); the face is laid again moved toward the light, leaving the
 * shade showing at the far edge. `tone` other than the face's paints it flat in that tone. A tip piece is `tuck`ed: its
 * open end runs on back under the piece before it, so no corner of it shows at the joint.
 */
function flesh(dr: Drawing, d: Digit, from: number, to: number, light: Pt, reach: number, tone: string = SKIN.face, tuck = 0): string {
  const own = shape(outline(d, from, to, tuck));
  if (tone !== SKIN.face) return flat(own, tone);
  const clip = dr.clip(own);
  return (
    `<g clip-path="url(#${clip})">${flat(own, SKIN.shade)}` +
    `<path d="${shape(outline(d, from, to, 60))}" fill="${SKIN.face}" transform="translate(${n(light[0] * reach)} ${n(light[1] * reach)})"/></g>`
  );
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

/**
 * The gaps in shadow: between the thumb and the index finger, running down out of the frame, above the reaching
 * finger, and above the curled one. Each lies partly under the digits beside it, so only the gap between them shows;
 * the deepest part of each, where no light reaches, is a step darker.
 */
const GAP_INDEX: readonly Pt[] = [[766, 522], [790, 556], [830, 600], [864, 646], [888, 698], [902, 760], [912, 900], [780, 900], [776, 800], [770, 700], [764, 600]];
const DEEP_INDEX: readonly Pt[] = [[774, 600], [800, 640], [834, 690], [856, 760], [866, 900], [786, 900], [782, 760]];
const GAP_REACHING: readonly Pt[] = [[590, 536], [650, 526], [656, 592], [622, 574]];
const DEEP_REACHING: readonly Pt[] = [[628, 548], [654, 544], [656, 586], [636, 572]];
const GAP_CURLED: readonly Pt[] = [[618, 668], [664, 662], [670, 720], [634, 714]];

/** The light falls from the upper left; each digit's face moves toward it this far, in the frame's units. */
const LIGHT: Pt = [-0.75, -0.66];

export interface HandStampOptions {
  /** `back`: the fingers behind the stamp; `front`: the thumb over its foot. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** The fingers behind the stamp: the curled one, the reaching one, and the index finger in two pieces. */
function backLayer(dr: Drawing): string {
  const curled = flat(shape(GAP_CURLED), INK.gap) + flesh(dr, CURLED, 0, CURLED.centre.length - 1, LIGHT, 0, SKIN.shade) + brush([[578, 676], [574, 692], [578, 708]], 0.8, 0.6);
  const reaching =
    flat(shape(GAP_REACHING), INK.gap) +
    flat(shape(DEEP_REACHING), INK.deep) +
    flesh(dr, REACHING, 0, REACHING.centre.length - 1, [0, -1], 2.6) +
    // the creases at its middle joint, on the pad's side, swelling where the skin folds deepest
    brush([[592, 590], [588, 606], [590, 624]], 1.1) +
    brush([[606, 594], [603, 607], [605, 620]], 0.7, 0.6);
  const j = INDEX.joint!;
  const indexTip = group(
    'index-tip',
    INDEX.centre[j]!,
    `<g clip-path="url(#${dr.clip(shape(outline(INDEX, j - 1, INDEX.centre.length - 1, 24)))})">` +
      flesh(dr, INDEX, j - 1, INDEX.centre.length - 1, [0.62, -0.78], 2.8, SKIN.face, 24) +
      // the nail's free edge, a sliver just showing past the fingertip
      brush([[724, 470], [730, 452], [744, 440], [760, 436]], 1.6, 1, INK.nailEdge) +
      `</g>` +
      // the crease at the last joint
      brush([[812, 512], [826, 506], [842, 498]], 0.8, 0.6),
  );
  const index = group(
    'index',
    KNUCKLES.index,
    flat(shape(GAP_INDEX), INK.gap) +
      flat(shape(DEEP_INDEX), INK.deep) +
      flesh(dr, INDEX, 0, j, [0.62, -0.78], 2.8) +
      // two creases at the middle joint, the lower one longer
      brush([[880, 626], [900, 612], [922, 598]], 1.2) +
      brush([[889, 638], [906, 627], [922, 617]], 0.7, 0.55) +
      indexTip,
  );
  return group('curled', KNUCKLES.curled, curled) + group('reaching', KNUCKLES.reaching, reaching) + index;
}

/** The thumb in front: its root and the fold where it meets the palm, and its tip with the nail, bending at its joint. */
function frontLayer(dr: Drawing): string {
  const j = THUMB.joint!;
  // The nail: a soft, nearly square shield across the tip, its free edge pale at the top, set into the skin.
  const nail: Pt[] = [[660, 470], [672, 456], [700, 452], [728, 456], [740, 470], [742, 512], [732, 536], [700, 542], [668, 536], [658, 512]];
  const freeEdge: Pt[] = [[662, 470], [674, 457], [700, 453], [726, 457], [738, 470], [726, 476], [700, 474], [674, 476]];
  const tip = group(
    'thumb-tip',
    THUMB.centre[j]!,
    flesh(dr, THUMB, j - 1, THUMB.centre.length - 1, [-0.8, -0.2], 3.2, SKIN.face, 24) +
      flat(shape(nail), INK.nail) +
      flat(shape(freeEdge), INK.nailEdge) +
      // the nail's sides and the cuticle, heaviest at the cuticle, and the skin's fold below it
      brush([[662, 476], [658, 504], [668, 532], [700, 543], [732, 532], [742, 504], [738, 476]], 1.2, 0.8) +
      brush([[668, 552], [700, 560], [732, 552]], 0.8, 0.5) +
      // the wrinkles over the joint
      brush([[684, 602], [702, 596], [722, 600]], 1.0, 0.7) +
      brush([[690, 614], [704, 610], [718, 613]], 0.6, 0.5),
  );
  return group(
    'thumb',
    KNUCKLES.thumb,
    flesh(dr, THUMB, 0, j, [-0.8, -0.2], 3.2) +
      // the fold where the thumb meets the palm, swelling as it turns down toward the wrist
      brush([[782, 650], [790, 690], [794, 730]], 1.3, 0.75) +
      brush([[652, 700], [678, 712], [706, 714]], 0.9, 0.55) +
      tip,
  );
}

/** One layer of the hand holding a stamp on its frame (`HAND_STAMP_VIEW`), clear all round. It is decoration. */
export function handStampSvg(opts: HandStampOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-stamp', opts.part));
  if (opts.part === 'back') dr.add(backLayer(dr));
  else if (opts.part === 'front') dr.add(frontLayer(dr));
  else throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}

/* ---- the turn ------------------------------------------------------------------------------------------------------ */

/** The parts a turn moves: the stamp, the whole hand, and each digit and fingertip about its joint. */
export const HAND_STAMP_PARTS = ['card', 'hand', 'thumb', 'thumb-tip', 'index', 'index-tip', 'reaching', 'curled'] as const;
export type HandStampPart = (typeof HAND_STAMP_PARTS)[number];

/** The wrist the whole hand turns about, in the frame's units. */
export const HAND_STAMP_WRIST: Pt = at([780, 800]);

/**
 * One turn, as poses 80 ms apart: the stamp straightens as the hand gathers itself; it turns a third of the way and
 * holds while the index finger lifts off its back and curls, and the middle finger rises behind it; then the fingers
 * push it over, the hand rolling up with it, the stamp swinging down past edge-on with its other face coming round;
 * and it lands upright and settles back to its lean. The stamp stays pinched under the thumb's pad all the while: its
 * poses are its lean from rest and its turn about its upright, in degrees, and where under the pad it is held, from
 * where it is held at rest (in the frame's units, across and down the stamp as it is seen): it slides through the
 * fingers as they turn it. The hand's and each digit's are a move and a turn about its wrist, knuckle or joint; the
 * hand's move keeps it in its place as it rolls, as a hand turning something over rolls about its middle.
 */
const FLIP_FRAME_MS = 80;
const CARD_POSES: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [-1.2, 0, 2.1, 1.6],
  [-5.2, 0, 4.7, 4.7],
  [-12.3, 0, 8, 7.8],
  [-15.8, 30, -1.1, 6.5],
  [-16.2, 33, -5.5, 3.3],
  [-16, 34, -5.9, 1.4],
  [-14.2, 32, -2.4, 2.1],
  [-59.4, 84, -38.7, -14.5],
  [-53.4, 92, -41.2, -13],
  [-75.6, 112, -35.1, 3.6],
  [-83.6, 136, -30.6, 5.3],
  [-52, 146, -11.8, -6.7],
  [-16.3, 156, -12.5, -8.7],
  [-5, 166, -2.7, -6.8],
  [-3.1, 174, -2, -4.5],
  [1.2, 178, 0.7, -2.7],
  [0, 180, 0, 0],
];
const HAND_POSES: Record<Exclude<HandStampPart, 'card'>, readonly (readonly number[])[]> = {
  hand: [[0, 0, 0], [0, 0, 0.5], [0, -1, 1], [0, -1.5, 1.5], [0, -2, 0], [0, -2, -1], [0, -2, -1], [5.7, -5.1, -5], [15.7, -12, -14], [22, -17, -20], [13.5, -9.3, -12], [5.7, -3.1, -5], [2.3, -1, -2], [0, 0, 0.8], [0, 0, 0.6], [0, 0, 0.2], [0, 0, 0], [0, 0, 0]],
  thumb: [[0, 0, 0], [0, 0, 0.5], [0, 0, 1], [0, -1, 2], [-2, -4, -6], [-3, -5, -8], [-3, -5, -9], [-2, -4, -6], [-1, -2, -4], [0, -1, -3], [0, 0, -1], [0, 0, 1], [0, 0, 1], [0, 0, 0.5], [0, 0, 0.3], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  'thumb-tip': [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, -1, 0.01], [0, 0, -2, 0.02], [0, 0, 4, 0.03], [0, 0, 6, 0.035], [0, 0, 6, 0.035], [0, 0, 8, 0.03], [0, 0, 12, 0.05], [0, 0, 14, 0.06], [0, 0, 8, 0.04], [0, 0, 2, 0.015], [0, 0, 0, 0.005], [0, 0, -1, 0], [0, 0, -0.5, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  index: [[0, 0, 0], [0, 0, 1], [0, 0, 3], [0, 0, 6], [0, 0, 20], [0, 0, 30], [0, 0, 34], [0, 0, 12], [0, 0, 8], [0, 0, 10], [0, 0, 4], [0, 0, -5], [0, 0, -6], [0, 0, -3], [0, 0, -1], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  'index-tip': [[0, 0, 0], [0, 0, 0], [0, 0, -1], [0, 0, -3], [0, 0, -16], [0, 0, -30], [0, 0, -36], [0, 0, -6], [0, 0, 18], [0, 0, 22], [0, 0, 10], [0, 0, -2], [0, 0, -1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  reaching: [[0, 0, 0], [0, 0, 0], [0, 0, 2], [0, 0, 6], [0, 0, 18], [0, 0, 30], [0, 0, 34], [0, 0, 24], [0, 0, 55], [0, 0, 62], [0, 0, 32], [0, 0, 10], [0, 0, 3], [0, 0, 0], [0, 0, -1], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  curled: [[0, 0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 5], [0, 0, 7], [0, 0, 8], [0, 0, 8], [0, 0, 18], [0, 0, 24], [0, 0, 14], [0, 0, 6], [0, 0, 2], [0, 0, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
};

/** How long one turn takes, and how far through it the stamp is edge-on and shows its other face. */
export const HAND_STAMP_FLIP = { ms: (CARD_POSES.length - 1) * FLIP_FRAME_MS, edgeOn: 9 / (CARD_POSES.length - 1) } as const;

/** Each part's pivot in the frame: the wrist, a knuckle, or a joint. */
const PIVOTS: Record<Exclude<HandStampPart, 'card'>, Pt> = {
  hand: HAND_STAMP_WRIST,
  thumb: at(KNUCKLES.thumb),
  'thumb-tip': at(THUMB.centre[THUMB.joint!]!),
  index: at(KNUCKLES.index),
  'index-tip': at(INDEX.centre[INDEX.joint!]!),
  reaching: at(KNUCKLES.reaching),
  curled: at(KNUCKLES.curled),
};
/** Where the thumb's pad pinches the stamp at rest. */
const PINCH: Pt = at(THUMB.centre[THUMB.centre.length - 1]!);

/** A curve through evenly spaced values, smooth through each (Catmull-Rom), at `t` from 0 to the last. */
function through(values: readonly number[], t: number): number {
  const i = Math.min(values.length - 2, Math.max(0, Math.floor(t)));
  const u = t - i;
  const [p0, p1, p2, p3] = [values[Math.max(0, i - 1)]!, values[i]!, values[i + 1]!, values[Math.min(values.length - 1, i + 2)]!];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/** A point moved and turned about a pivot as a transform `translate(d) rotate(deg)` about `pivot` moves it. */
function moveAbout([x, y]: Pt, pivot: Pt, [dx, dy, deg]: readonly number[]): Pt {
  const a = (deg! * Math.PI) / 180;
  const [u, v] = [x - pivot[0], y - pivot[1]];
  return [pivot[0] + dx! + u * Math.cos(a) - v * Math.sin(a), pivot[1] + dy! + u * Math.sin(a) + v * Math.cos(a)];
}

/**
 * Every part's transform through one turn, every `stepMs` (40 ms by default, so the curves run smooth between the
 * poses), to play from rest to rest, each about its own pivot (the stamp's about its own middle). The stamp's lean is
 * from `HAND_STAMP_CARD.turn`; it is placed where the thumb's pad holds it, and its turn ends at 180 degrees, the other
 * face showing, which an app then shows as the front at rest.
 */
export function handStampFlip(stepMs = 40): Record<HandStampPart, string[]> {
  if (!(stepMs > 0)) throw new RangeError(`art: a turn's step must be a positive number of milliseconds, got ${String(stepMs)}`);
  const count = Math.round(HAND_STAMP_FLIP.ms / stepMs);
  const times = Array.from({ length: count + 1 }, (_, k) => (k * (CARD_POSES.length - 1)) / count);
  const pose = (poses: readonly (readonly number[])[], t: number): number[] => poses[0]!.map((_, c) => through(poses.map((p) => p[c]!), t));
  const out = {} as Record<HandStampPart, string[]>;
  for (const part of HAND_STAMP_PARTS) {
    if (part === 'card') continue;
    out[part] = times.map((t) => {
      const [dx, dy, turn, squash] = pose(HAND_POSES[part], t);
      // a pad pressing on the stamp flattens a little against it, widening as it shortens
      const press = squash ? ` scale(${n(1 + squash * 0.6)}, ${n(1 - squash)})` : '';
      return `translate(${n(dx!)}px, ${n(dy!)}px) rotate(${n(turn!)}deg)${press}`;
    });
  }
  // Where the stamp is held, on the stamp: the pinch at rest, seen from the stamp's own lean.
  const c = HAND_STAMP_CARD;
  const rest = (c.turn * Math.PI) / 180;
  const [px, py] = [PINCH[0] - c.cx, PINCH[1] - c.cy];
  const held: Pt = [px * Math.cos(rest) + py * Math.sin(rest), -px * Math.sin(rest) + py * Math.cos(rest)];
  out.card = times.map((t) => {
    // The pad, carried by the tip's bend, the thumb's turn and the hand's.
    let pad = moveAbout(PINCH, PIVOTS['thumb-tip'], pose(HAND_POSES['thumb-tip'], t));
    pad = moveAbout(pad, PIVOTS.thumb, pose(HAND_POSES.thumb, t));
    pad = moveAbout(pad, PIVOTS.hand, pose(HAND_POSES.hand, t));
    const [lean, turn, across, down] = pose(CARD_POSES, t);
    const a = ((c.turn + lean!) * Math.PI) / 180;
    const [hx, hy] = [held[0] + across!, held[1] + down!];
    const [mx, my] = [pad[0] - (hx * Math.cos(a) - hy * Math.sin(a)), pad[1] - (hx * Math.sin(a) + hy * Math.cos(a))];
    return `translate(${n(mx - c.cx)}px, ${n(my - c.cy)}px) rotate(${n(c.turn + lean!)}deg) rotateY(${n(turn!)}deg)`;
  });
  return out;
}
