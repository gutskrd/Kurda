/**
 * A hand holding up a game's stamp to show it, for the front page's games moment, and how it turns the stamp over to
 * the next. Seen from the front and a little below: the thumb upright in front pinching the stamp's foot, its nail
 * toward us; the index finger behind it on the right, long and bent at its joints, running down to its knuckle; the
 * middle finger reaching out to the left under the stamp; and the ring finger curled below it. Flat colour, as the
 * reference paints it: one skin, that of the hand holding the phone (hand-paint.ts), with no shading, the gaps between
 * the digits in the reference's charcoal where its gaps are, and a few warm brown lines that swell in the creases and
 * thin away to nothing. The thumb, the index finger and the ring finger leave the frame at its foot.
 *
 * Two layers on one frame: `back` (the fingers behind the stamp) and `front` (the thumb), so an app can lay the stamp
 * (`HAND_STAMP_CARD`) between them. A turn is the reference's, frame for frame: each frame's pose is the skeleton
 * measured on it, and the poses are passed between by curves through every one of them. `handStampShapesAt` gives
 * every shape's path at any moment of it, and `handStampFlip` the stamp's transforms.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, line, smooth } from './hand-paint.js';

/** The frame in drawing units, room for the whole hand and the stamp all through a turn. */
export const HAND_STAMP_VIEW = { w: 312, h: 236 } as const;

/**
 * Where the stamp is held at rest: a box `w` by `h` centred on (`cx`, `cy`), turned `turn` degrees. The thumb covers
 * only its foot: the top `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 131.44, cy: 104.59, w: 100, h: 128, turn: 4.2, clear: 100 } as const;

/**
 * The hand's own colours beside the skin: the gaps in the reference's charcoal, the lines a warm brown, and the nail a
 * step paler than the skin with its free edge paler still.
 */
const INK = { gap: '#3b353c', line: '#8d5236', nail: '#eecbb0', nailEdge: '#f8e6d8' } as const;

/**
 * The hand is laid out on a grid three times the frame's size, which is the reference's own picture: its foot is the
 * frame's foot. This places a point of that grid on the frame.
 */
const K = 0.33;
const TOP = 720 - HAND_STAMP_VIEW.h / K;
const at = ([x, y]: Pt): Pt => [(x - 250) * K, (y - TOP) * K];
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
 * A digit's build: its half-width on each side at each point of its centre line, from root to tip (`a` the side to
 * its right looking toward the tip, `b` the other), and how far its tip runs on past the last point as a share of its
 * width there. Where its centre line runs in each pose comes from the turn's track below.
 */
interface Build {
  a: number[];
  b: number[];
  tip: number;
}

/*
 * The digits. The thumb is about two-thirds as long as the index finger from knuckle to tip and a little broader; each
 * finger narrows a touch between its joints and swells a little at them and at its pad, and its two sides differ, as
 * a real finger's do.
 */
const THUMB: Build = { a: [92, 86, 74, 66, 63, 62, 57], b: [66, 66, 66, 63, 60, 60, 55], tip: 1.12 };
const INDEX: Build = { a: [40, 46, 56, 58, 55, 53, 51, 48, 45], b: [66, 64, 62, 60, 56, 53, 51, 48, 44], tip: 1.15 };
const REACHING: Build = { a: [42, 40, 38, 37, 35], b: [44, 42, 41, 42, 39], tip: 1.15 };
const CURLED: Build = { a: [29, 28, 27, 26, 25], b: [30, 30, 29, 28, 27], tip: 1.1 };

/**
 * How much wider than its build each digit shows in each frame of the reference, on its `a` side and its `b` side:
 * fitted with the joints to the reference's outline, so the fingers stand where the reference's do and its shadows
 * fall against them. The ring finger, all but hidden below the frame, keeps its build, as does the middle finger curling
 * under the stamp in frame 10, whose last bone is too short for a broader round.
 */
type WidenedDigit = 'thumb' | 'index' | 'reaching';
const WIDTHS: Record<WidenedDigit, readonly (readonly [number, number])[]> = {
  thumb: [[1.18, 1.31], [1.18, 1.51], [1.25, 1.46], [1.42, 1.37], [1.27, 1.37], [1.27, 1.33], [1.19, 1.42], [1.20, 1.18], [1.19, 0.96], [1.45, 1.20], [0.74, 1.51], [1.28, 1.21], [1.04, 1.31], [1.05, 1.16], [1.14, 1.28], [1.18, 1.31], [1.20, 1.32], [1.20, 1.36], [1.17, 1.37], [1.17, 1.37], [1.17, 1.37], [1.17, 1.37]],
  index: [[1.09, 1.08], [1.08, 1.08], [1.10, 1.06], [1.04, 0.99], [1.10, 1.09], [1.09, 1.10], [1.14, 1.07], [1.17, 1.10], [1.18, 1.05], [1.18, 1.30], [1.18, 1.27], [1.18, 1.12], [1.21, 1.09], [1.29, 1.06], [1.14, 1.20], [1.15, 1.10], [1.08, 1.12], [1.11, 1.07], [1.04, 1.09], [1.04, 1.09], [1.04, 1.09], [1.04, 1.09]],
  reaching: [[1.42, 0.85], [1.41, 0.93], [1.50, 1.10], [1.26, 0.08], [1.23, 0.96], [1.12, 0.83], [1.01, 0.53], [1.41, 0.73], [1.88, 1.03], [1.49, 1.54], [1.11, 1.28], [1.06, 1.17], [1.30, 1.47], [1.51, 0.86], [1.70, 0.97], [1.40, 0.96], [1.38, 0.97], [1.36, 0.94], [1.40, 0.86], [1.40, 0.86], [1.40, 0.86], [1.40, 0.86]],
};

/** How far a tip's round runs past the point it rounds about: the half-width there times the tip's share. */
const reach = (b: Build): number => ((b.a.at(-1)! + b.b.at(-1)!) / 2) * b.tip;
/**
 * The bones the reference never shows, on the grid: the thumb's root bone and the index finger's knuckle and root, all
 * below the frame, and how far the middle and ring fingers run on under what covers them.
 */
const HIDDEN = { thumbRoot: 300, indexKnuckle: 150, indexRoot: 260, middleUnder: 60, ringUnder: 70, ringOn: 60 } as const;

/* ---- the turn ----------------------------------------------------------------------------------------------------- */

/**
 * One half of the reference's loop, frame by frame, 80 ms apart, measured on it and then fitted so the hand's outline
 * covers the reference's (the grid is its picture). Its other half shows the same hand turning the stamp back. For
 * each frame:
 * - `thumb`: its middle where it leaves the frame's foot, its joint (between its two creases), and its tip's outermost
 *   point on its centre line;
 * - `index`: its middle where it leaves the frame's foot, its middle joint and its tip joint (each the middle of the
 *   finger across its crease), and its tip: where it shows, its outermost point; where the thumb or the stamp hides it,
 *   along the way its visible edge runs, as long as the frames that show it measure;
 * - `middle`: where it goes under the thumb, its tip joint (no crease shows, so by its distance from the tip), and its
 *   tip; hidden behind the stamp in frame 3, it lies between frames 2 and 4;
 * - `ring`: three points of its upper edge, root to tip, the frame's foot cutting off the rest; below the frame in
 *   frames 10 to 13, it lies between frames 9 and 14;
 * - `card`: the stamp's lean and its turn about its upright, in degrees, and its middle;
 * - `web`: how far the web behind opens down between the index finger and the thumb, 0 to 1; the palm in front of it
 *   (`PALM_TRACK`) keeps the hand whole beside the thumb, so only the background the reference shows comes through.
 * The little finger never shows, behind the ring finger and below the frame, so it is not drawn.
 */
interface Frame {
  thumb: readonly [Pt, Pt, Pt];
  index: readonly [Pt, Pt, Pt, Pt];
  middle: readonly [Pt, Pt, Pt];
  ring: readonly [Pt, Pt, Pt];
  card: readonly [number, number, number, number];
  web: number;
}
const TRACK: readonly Frame[] = [
  { thumb: [[726.5, 719], [719, 672.4], [681.1, 439.8]], index: [[963.6, 719], [933.8, 637.1], [840.1, 549.4], [677.6, 458.1]], middle: [[598.1, 572.3], [587.5, 578.2], [470.1, 613]], ring: [[601.1, 675], [548.5, 688.4], [498.5, 708.8]], card: [4.2, 0, 648.1, 321.2], web: 1 },
  { thumb: [[723.2, 719], [724.1, 672.1], [688.4, 432.8]], index: [[968.8, 719], [945.4, 640.5], [851.9, 546.3], [673.8, 453.6]], middle: [[591.2, 562.9], [585, 567.1], [465.1, 602.8]], ring: [[584.7, 676], [525.5, 689], [478.5, 707.6]], card: [3.8, 0, 643.8, 315.5], web: 1 },
  { thumb: [[712.2, 719], [713, 670.3], [675.4, 429.7]], index: [[970.6, 719], [957.9, 647], [862.8, 533.3], [677.8, 448.5]], middle: [[596.5, 522.1], [576.4, 525.6], [444, 513.1]], ring: [[597.5, 674.8], [514, 686], [445.5, 708.4]], card: [2.5, 0, 626.6, 305.2], web: 1 },
  { thumb: [[697.4, 719], [697.9, 681.7], [664.8, 439.2]], index: [[984, 719], [975.9, 630.2], [880.2, 523.6], [717.8, 435.4]], middle: [[565, 507.1], [561.5, 506.2], [488.3, 443.2]], ring: [[559.6, 672.4], [468.4, 672.6], [400.4, 702]], card: [-0.1, 0, 598.4, 297.3], web: 1 },
  { thumb: [[675.4, 719], [669.7, 662.6], [653.4, 410.9]], index: [[1021, 719], [1031.7, 630.5], [947, 522.3], [771, 437.3]], middle: [[578.4, 534.4], [529.3, 510.8], [429.5, 421]], ring: [[536.8, 675], [453.6, 676.9], [390.4, 703.8]], card: [-7.6, 19.1, 574.3, 306.5], web: 1 },
  { thumb: [[682, 719], [677.3, 667.5], [648.5, 412.1]], index: [[1030.5, 719], [1052.8, 629.1], [975.8, 509.8], [788.7, 442.1]], middle: [[581.3, 537.1], [529.5, 504.9], [438.2, 421.2]], ring: [[542.5, 679], [469.6, 680], [403, 704]], card: [-7.1, 19.1, 572.8, 314.4], web: 1 },
  { thumb: [[692.3, 719], [691, 667.5], [655.9, 416.6]], index: [[1031, 719], [1058.5, 629.5], [988.8, 505.9], [799.7, 445.2]], middle: [[572.8, 539.4], [550.6, 522.5], [467.2, 411.9]], ring: [[550.3, 684.6], [471, 686], [411.5, 706]], card: [-7.1, 17.5, 570.1, 320.8], web: 1 },
  { thumb: [[729.6, 719], [730, 672.9], [675.5, 441.1]], index: [[997, 719], [953.4, 599.4], [865.4, 474.9], [673.2, 373.4]], middle: [[589.7, 536.5], [548.2, 510.2], [455.6, 423.9]], ring: [[613.9, 698], [518.1, 693.8], [444.4, 709.4]], card: [-10.9, 11, 590.2, 318.2], web: 1 },
  { thumb: [[779.5, 719], [775.5, 667.5], [652.1, 484.1]], index: [[978.4, 719], [924, 600.6], [830.7, 468.6], [694.8, 324.2]], middle: [[671.9, 535.2], [599.7, 470.8], [501.9, 379.9]], ring: [[632.2, 715.8], [530.6, 698.8], [466.6, 712.1]], card: [-49.8, 77.3, 566.1, 325.4], web: 0.4 },
  { thumb: [[696.8, 719], [693.7, 670.1], [628.2, 407.2]], index: [[963.8, 719], [913.5, 613.2], [832.8, 475.8], [713.1, 311.5]], middle: [[601.9, 437.7], [613.5, 428.7], [529.6, 354.9]], ring: [[547.1, 703.1], [484.5, 699.8], [429.6, 712.8]], card: [-45, 90, 588.5, 308.1], web: 0 },
  { thumb: [[693.2, 719], [668.7, 642.8], [619, 406.3]], index: [[963, 719], [893.1, 616.8], [814.2, 501.6], [657.3, 371]], middle: [[642, 617.4], [564.9, 619.1], [498.2, 641.1]], ring: [[541, 724], [500, 724.6], [452, 735]], card: [-65.8, 124.6, 562.3, 395.8], web: 0.2 },
  { thumb: [[696.8, 719], [683.4, 671.4], [637, 425.7]], index: [[935.9, 719], [869.1, 628.8], [766.3, 513.8], [595.3, 393.6]], middle: [[562, 652.5], [575.2, 654.9], [491.8, 691]], ring: [[557, 724], [515.5, 719.2], [474, 760]], card: [-55.1, 180, 547.6, 437.7], web: 0 },
  { thumb: [[688.6, 719], [696.8, 669.6], [658.1, 427.7]], index: [[916.5, 719], [883.9, 645.5], [783, 530.5], [588.5, 437.3]], middle: [[605.4, 654.7], [605.4, 654.7], [547.4, 713.9]], ring: [[573, 730], [540, 725.8], [496, 737]], card: [-36.8, 169.9, 586.1, 426.9], web: 0.1 },
  { thumb: [[718.5, 719], [714.7, 664.9], [666.2, 430.7]], index: [[926.5, 719], [893.7, 635.4], [799.6, 538.8], [630.9, 426.2]], middle: [[600.8, 630.5], [593.3, 617.8], [508.1, 701.6]], ring: [[589, 724], [560, 726.4], [518, 738]], card: [-9.9, 168.5, 648.8, 364.3], web: 0.2 },
  { thumb: [[725.9, 719], [712.6, 660.5], [678.2, 431.2]], index: [[947, 719], [928.9, 641.9], [841.7, 551.8], [677.8, 445.2]], middle: [[611.7, 596.2], [595.8, 600], [484.2, 659.2]], ring: [[593, 699], [575.5, 702], [536.6, 714]], card: [-2.9, 180, 646.2, 343.2], web: 1 },
  { thumb: [[726.4, 719], [716.1, 660.1], [683.5, 437]], index: [[952.9, 719], [931, 644.1], [842.2, 555], [691.3, 452.3]], middle: [[601.1, 581.5], [585.7, 589.7], [471.7, 631.9]], ring: [[609.5, 685.6], [556.2, 697], [509.2, 713]], card: [0.1, 180, 646.1, 330.2], web: 1 },
  { thumb: [[727.5, 719], [717, 659.6], [682, 439]], index: [[961.2, 719], [932.5, 638.2], [845.3, 552.1], [677.2, 448.9]], middle: [[578.5, 574.9], [582.9, 583.3], [469.6, 619.7]], ring: [[601.6, 682], [545.1, 695], [498.9, 712]], card: [2.4, 180, 647.5, 327], web: 1 },
  { thumb: [[727.5, 719], [719.3, 660.2], [685.4, 441.1]], index: [[960.5, 719], [932.8, 640], [845.2, 553.9], [689.8, 458.9]], middle: [[597.3, 571.3], [582.1, 580.2], [468.6, 616]], ring: [[593.8, 679.6], [544, 692], [499.6, 710]], card: [3.2, 180, 648.3, 324.3], web: 1 },
  { thumb: [[728, 719], [720.5, 661.6], [685.5, 437.9]], index: [[967, 719], [935.7, 637.2], [847.7, 551.6], [681.9, 451.5]], middle: [[598.1, 569], [587.8, 577.8], [469.6, 611.8]], ring: [[593.4, 676.6], [545.5, 690], [500, 708]], card: [4.2, 180, 648.3, 321.9], web: 1 },
  { thumb: [[728, 719], [720.5, 661.6], [685.5, 437.9]], index: [[967, 719], [935.7, 637.2], [847.7, 551.6], [681.9, 451.5]], middle: [[598.1, 569], [587.8, 577.8], [469.6, 611.8]], ring: [[593.4, 676.6], [545.5, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 1 },
  { thumb: [[728, 719], [720.5, 661.6], [685.5, 437.9]], index: [[967, 719], [935.7, 637.2], [847.7, 551.6], [681.9, 451.5]], middle: [[598.1, 569], [587.8, 577.8], [469.6, 611.8]], ring: [[593.4, 676.6], [545.5, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 1 },
  { thumb: [[728, 719], [720.5, 661.6], [685.5, 437.9]], index: [[967, 719], [935.7, 637.2], [847.7, 551.6], [681.9, 451.5]], middle: [[598.1, 569], [587.8, 577.8], [469.6, 611.8]], ring: [[593.4, 676.6], [545.5, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 1 },
];
const FLIP_FRAME_MS = 80;
/**
 * A turn starts and ends at the hand's resting pose, the reference's last frame, and runs through the rest of its
 * frames in order, so turns played back to back are the reference's loop.
 */
const ORDER = [TRACK.length - 1, ...TRACK.map((_, i) => i)];

/** How long one turn takes, and how far through it the stamp is edge-on and shows its other face. */
export const HAND_STAMP_FLIP = { ms: (ORDER.length - 1) * FLIP_FRAME_MS, edgeOn: 10 / (ORDER.length - 1) } as const;

/** The wrist, on the grid, toward which the web sags as it opens. */
const WRIST: Pt = [780, 800];

/** A digit as it stands in a pose: its centre line and its half-widths, on the grid. */
interface Posed {
  centre: Pt[];
  a: number[];
  b: number[];
  tip: number;
}
type DigitName = 'thumb' | 'index' | 'reaching' | 'curled';

const step = ([x, y]: Pt, [dx, dy]: Pt, k: number): Pt => [x + dx * k, y + dy * k];
const unit = ([x, y]: Pt): Pt => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const from = (p: Pt, q: Pt): Pt => unit([q[0] - p[0], q[1] - p[1]]);
/** A centre line along a digit's bones: its joints from root to tip, each bone cut into so many equal steps. */
function along(joints: readonly Pt[], cuts: readonly number[]): Pt[] {
  const out: Pt[] = [joints[0]!];
  cuts.forEach((c, i) => {
    const [p, q] = [joints[i]!, joints[i + 1]!];
    for (let k = 1; k <= c; k++) out.push([p[0] + ((q[0] - p[0]) * k) / c, p[1] + ((q[1] - p[1]) * k) / c]);
  });
  return out;
}

/**
 * A digit as the turn's track places it: its build, as wide on each side as the frame measures it, along its joints
 * from root to tip, each bone cut into so many steps.
 */
const placed = (b: Build, joints: readonly Pt[], cuts: readonly number[], [wa, wb]: readonly [number, number] = [1, 1]): Posed => ({
  centre: along(joints, cuts),
  a: b.a.map((x) => x * wa),
  b: b.b.map((x) => x * wb),
  tip: b.tip,
});

/** The thumb: its joint as measured, its tip rounded about a point inside the measured tip, its root bone on below the frame. */
function thumbIn(f: Frame, w: readonly [number, number]): Posed {
  const [base, joint, tip] = f.thumb;
  const middle = step(tip, from(joint, tip), -reach(THUMB) * ((w[0] + w[1]) / 2));
  return placed(THUMB, [step(joint, from(joint, base), HIDDEN.thumbRoot), joint, middle], [3, 3], w);
}

/** The index finger: its two joints as measured, its tip rounded inside the measured tip, its knuckle and root below the frame. */
function indexIn(f: Frame, w: readonly [number, number]): Posed {
  const [base, middle, last, tip] = f.index;
  const down = from(middle, base);
  const joints = [step(middle, down, HIDDEN.indexRoot), step(middle, down, HIDDEN.indexKnuckle), middle, last, step(tip, from(last, tip), -reach(INDEX) * ((w[0] + w[1]) / 2))];
  return placed(INDEX, joints, [1, 2, 3, 2], w);
}

/** The middle finger: its joint and tip as measured, its root on under the thumb past where it goes under. */
function middleIn(f: Frame, w: readonly [number, number]): Posed {
  const [under, joint, tip] = f.middle;
  const shown = Math.hypot(under[0] - joint[0], under[1] - joint[1]);
  const out = shown > 15 ? from(joint, under) : from(tip, joint);
  const root = step(under, out, HIDDEN.middleUnder + Math.max(0, 15 - shown));
  return placed(REACHING, [root, joint, step(tip, from(joint, tip), -reach(REACHING) * ((w[0] + w[1]) / 2))], [2, 2], w);
}

/** The ring finger: its centre a half-width in from its measured upper edge, on under the thumb at its root and below the frame at its tip. */
function ringIn(f: Frame): Posed {
  const edge = f.ring;
  const centre = edge.map((p, i): Pt => {
    const d = from(edge[Math.max(0, i - 1)]!, edge[Math.min(edge.length - 1, i + 1)]!);
    return step(p, [-d[1], d[0]], -CURLED.a[i + 1]!);
  });
  const root = step(centre[0]!, from(centre[1]!, centre[0]!), HIDDEN.ringUnder);
  const tip = step(centre[2]!, from(centre[1]!, centre[2]!), HIDDEN.ringOn);
  return { centre: [root, ...centre, tip], a: CURLED.a, b: CURLED.b, tip: CURLED.tip };
}

/**
 * The shadows between the digits, in the reference's charcoal and where it paints them: each is cast by one digit onto
 * the fingers beside it, so it starts at that digit's edge and lies on the fingers out to where the reference's shadow
 * ends. They run right of the thumb, left of it under the stamp and down, under the middle finger, and along the middle
 * finger's inner side, where at the turn the dark between it and the thumb's tip shows below the stamp and slips back
 * behind it. `GAP_TRACK` holds, for each frame of the reference, how far out from the edge the shadow ends at
 * `GAP_SAMPLES` places spaced evenly along the digit (`evenlyAlong`), on the grid, fitted so each shadow as drawn covers
 * the reference's own; 0 is no shadow there.
 */
const GAP_NAMES = ['slit', 'wedge', 'ring', 'cleft'] as const;
type GapName = (typeof GAP_NAMES)[number];
const GAP_SAMPLES = 24;
/**
 * Each shadow's digit and side, and the stretch of it sampled, from its root to `toBack` short of its tip, or past it
 * where negative: the shadow left of the thumb runs on beside its round tip, where the reference shades the finger
 * behind right up to the stamp. A shadow cast by the thumb in front begins under it (`under`), along its middle, so no
 * seam shows at its edge. One that lies `into` the digit is the dark that shows where the reference's finger is
 * narrower than ours: it reaches in from the edge, so its far side is the finger's edge as the reference draws it.
 */
const GAP_EDGES: Record<GapName, { digit: DigitName; side: 1 | -1; from: number; toBack: number; under: boolean; into?: true }> = {
  slit: { digit: 'thumb', side: 1, from: 0, toBack: 0, under: true },
  wedge: { digit: 'thumb', side: -1, from: 0, toBack: -1, under: true },
  ring: { digit: 'reaching', side: -1, from: 0, toBack: 2, under: false },
  cleft: { digit: 'reaching', side: 1, from: 0, toBack: 0, under: false, into: true },
};
const GAP_TRACK: Record<GapName, readonly (readonly number[])[]> = {
  slit: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 62, 55, 52, 48, 41, 34, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 67, 53, 41, 36, 25, 6, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 49, 35, 24, 9, 3, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 72, 58, 37, 26, 5, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 69, 51, 26, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 47, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 58, 43, 32, 32, 18, 2, 0, 0, 0, 0, 0],
    [34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 40, 31, 19, 2, 0, 0, 0, 0, 0, 0, 0, 0],
    [87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 84, 79, 75, 70, 63, 56, 47, 39, 30, 20, 9],
    [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 119, 125, 119, 112, 113, 116, 92, 30, 0, 0, 0, 61, 61, 26],
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 39, 40, 42, 41, 43, 35, 24, 1, 0, 0, 0, 5, 5],
    [62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 73, 47, 32, 28, 23, 0, 0, 0, 0, 21, 21],
    [39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 43, 35, 24, 12, 1, 0, 0, 0, 0, 30, 30, 18],
    [44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 54, 44, 41, 36, 34, 27, 27, 14, 0, 0, 0, 16, 16],
    [49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 58, 50, 46, 43, 38, 36, 27, 19, 0, 0, 0, 0, 0],
    [51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 52, 48, 45, 42, 38, 32, 26, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 54, 50, 44, 40, 36, 25, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 51, 48, 44, 40, 30, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 51, 48, 44, 40, 30, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 51, 48, 44, 40, 30, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 59, 51, 48, 44, 40, 30, 0, 0, 0, 0, 0],
  ],
  wedge: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 31, 37, 0, 0, 0, 0, 0, 32, 48, 42, 42],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 19, 36, 0, 0, 0, 0, 0, 8, 23, 41, 35, 35],
    [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 15, 32, 0, 0, 0, 0, 0, 6, 50, 81, 69, 69],
    [33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 26, 48, 42, 0, 0, 0, 0, 0, 0, 8, 33, 27],
    [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 73, 47, 0, 0, 0, 4, 38, 56, 47, 47, 47, 47],
    [38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 37, 0, 0, 0, 0, 0, 18, 62, 32, 32, 32, 32],
    [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 13, 53, 0, 0, 0, 0, 0, 14, 55, 44, 44, 44, 44],
    [45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 44, 0, 0, 0, 0, 0, 30, 55, 77, 81, 75, 75],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 85, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 35, 43, 41, 66, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 37, 52, 52, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 31, 25, 25, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 29, 42, 49, 0, 0, 0, 0, 0],
    [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 27, 0, 0, 0, 0, 1, 20, 43, 37, 37, 37, 37],
    [29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 27, 34, 0, 0, 0, 0, 9, 15, 46, 39, 39, 39],
    [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 24, 35, 0, 0, 0, 0, 0, 6, 30, 50, 44, 44],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 23, 31, 46, 0, 0, 0, 0, 0, 27, 46, 39, 39],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 21, 33, 27, 0, 0, 0, 0, 0, 32, 47, 41, 41],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 21, 33, 27, 0, 0, 0, 0, 0, 32, 47, 41, 41],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 21, 33, 27, 0, 0, 0, 0, 0, 32, 47, 41, 41],
    [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 21, 33, 27, 0, 0, 0, 0, 0, 32, 47, 41, 41],
  ],
  ring: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 3, 2, 2, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 19, 13, 7, 11, 0, 0, 0, 0, 3, 1, 4, 10, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 10, 9, 9, 5, 5, 6, 5, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 58, 45],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  cleft: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 79, 72, 66, 60, 54, 47, 41, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
};

/**
 * Where the slit's shadow begins out from the thumb's edge, for each frame at the slit's places, on the grid: low down
 * the reference shows a band of palm between the thumb and its shadow, painted over the shadow's inner part.
 */
const SLIT_FROM: readonly (readonly number[])[] = [
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 47, 17, 6, 4, 7, 8, 4, 6, 6, 5, 5],
    [42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 55, -6, -3, -3, -3, -4, -4, -4, -4, -4],
    [37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 49, 17, 1, -2, -3, -3, -3, -3, -3],
    [49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 67, 28, 7, -6, -6, -5, -5, -5],
    [53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 69, 28, 16, 23, 23, 23, 23, 23],
    [39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 42, 39, 39, 39, 39, 39, 39],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 47, 21, 19, -6, 3, 2, 5, 5, 5, 5, 5],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 15, 2, 6, 6, 6, 6, 6, 6, 6, 6],
    [25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 19, 17, 13, 0, -6, -6, -6, -6, -6, -6, -6],
    [60, 60, 60, 60, 60, 60, 60, 60, 60, 85, 61, 33, 68, 70, 67, 57, 45, 21, 29, 29, 31, 31, 19, 18],
    [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 11, -4, -6, -6, -5, -4, -4, -4, -4, -4, -5, -5, -5],
    [22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 22, 32, 8, 5, 12, 18, 0, 6, 6, 5, 5, 4],
    [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 12, -3, -3, -3, -2, -2, -2, 4, 4, 4, 4, 4],
    [21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 54, 20, 2, 2, 11, 14, 1, 10, 5, 5, 2, 2, 1],
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 58, 46, 22, 5, -5, 4, 7, 12, 3, 3, 1, 1, 1],
    [43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 49, 25, 10, 4, 4, 8, 10, -2, 4, 2, 2, 2],
    [35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 41, 14, -1, 0, 0, 4, 1, 1, 1, 1, 1],
    [38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 46, 15, 5, 6, 5, 7, 0, 3, 3, 2, 2],
    [38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 46, 15, 5, 6, 5, 7, 0, 3, 3, 2, 2],
    [38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 46, 15, 5, 6, 5, 7, 0, 3, 3, 2, 2],
    [38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38, 46, 15, 5, 6, 5, 7, 0, 3, 3, 2, 2],
];

/**
 * The palm beside the thumb, toward the index finger. The reference paints it as one with the thumb, in front of the
 * fingers, with the slit's shadow lying on it, and shows the background between it and the index finger as the hand
 * opens. For each frame, how far out from the thumb's edge it reaches at the slit's places, on the grid: to the
 * background, or a little past the index finger's inner side where that lies against it.
 */
const PALM_TRACK: readonly (readonly number[])[] = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 54, 54, 51, 47, 44, 33, 13, 0, 0, 0, 0],
    [67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 60, 50, 42, 34, 25, 16, 0, 0, 0, 0],
    [77, 77, 77, 77, 77, 77, 77, 77, 77, 77, 77, 77, 77, 77, 66, 55, 47, 36, 27, 15, 3, 0, 0, 0],
    [87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 74, 63, 52, 38, 26, 13, 1, 0, 0],
    [87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 87, 80, 75, 66, 58, 49, 37, 23, 9, 4, 4, 3],
    [86, 86, 86, 86, 86, 86, 86, 86, 86, 86, 86, 86, 86, 79, 71, 64, 55, 46, 35, 23, 9, 5, 5, 5],
    [89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 82, 73, 62, 54, 45, 36, 22, 8, 3, 3, 3],
    [51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 43, 34, 29, 20, 10, 4, 2, 1, 1, 0],
    [43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 43, 38, 20, 12, 11, 11, 10, 8, 5, 4, 3, 2],
    [71, 71, 71, 71, 71, 71, 71, 71, 71, 71, 71, 71, 71, 66, 60, 56, 52, 48, 44, 40, 35, 30, 20, 9],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 8, 95, 95, 93, 90, 85, 59, 18, 18, 18, 18, 18, 10],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40, 40, 38, 32, 25, 17, 8, 0, 0, 0, 0, 0],
    [62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 48, 37, 28, 25, 15, 0, 0, 0, 0, 0],
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 32, 24, 15, 7, 1, 0, 0, 0, 0, 0, 0],
    [44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 41, 36, 33, 33, 28, 20, 1, 0, 0, 0, 0],
    [49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 46, 42, 38, 36, 34, 25, 7, 0, 0, 0, 0],
    [51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 49, 46, 42, 39, 37, 28, 9, 0, 0, 0, 0],
    [54, 54, 54, 54, 54, 54, 54, 54, 54, 54, 54, 54, 54, 52, 48, 44, 41, 39, 31, 12, 0, 0, 0, 0],
    [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 56, 51, 47, 44, 43, 32, 13, 0, 0, 0, 0],
    [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 56, 51, 47, 44, 43, 32, 13, 0, 0, 0, 0],
    [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 56, 51, 47, 44, 43, 32, 13, 0, 0, 0, 0],
    [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 56, 51, 47, 44, 43, 32, 13, 0, 0, 0, 0],
];

/**
 * A row of the slit's widths up to where its shadow first ends: further up, by the thumb's tip, the reference shows the
 * stamp's dark edge, not a shadow on the hand.
 */
function oneRun(row: readonly number[]): number[] {
  const start = row.findIndex((v) => v > 0);
  const end = start < 0 ? -1 : row.findIndex((v, k) => k > start && v <= 0);
  return row.map((v, k) => (end >= 0 && k >= end ? 0 : v));
}
const SLIT = GAP_TRACK.slit.map(oneRun);

/**
 * A row of widths made one smooth stroke, as the reference's brush draws each shadow: a place missing between two with
 * a shadow is filled, and each run of places is smoothed within itself, so it neither spreads past its ends nor thins
 * at them, and its edge runs on without notches.
 */
const STROKE = { sigma: 1.2, reach: 3 } as const;
function stroke(row: readonly number[]): number[] {
  const w = row.map((v, k) => (v <= 0 && row[k - 1]! > 0 && row[k + 1]! > 0 ? (row[k - 1]! + row[k + 1]!) / 2 : v));
  return w.map((v, k) => {
    if (v <= 0) return v;
    let [sum, weight] = [0, 0];
    for (const way of [-1, 1]) {
      for (let j = way > 0 ? k : k - 1, step = 0; step <= STROKE.reach && j >= 0 && j < w.length && w[j]! > 0; j += way, step++) {
        const g = Math.exp(-((j - k) ** 2) / (2 * STROKE.sigma ** 2));
        sum += g * w[j]!;
        weight += g;
      }
    }
    return sum / weight;
  });
}

/** `count` places along a digit's centre line, evenly spaced by length, from `first` to `toBack` short of its last point. */
function evenlyAlong(d: Posed, count: number, first: number, toBack: number): number[] {
  const last = d.centre.length - 1 - toBack;
  const fine = Array.from({ length: 401 }, (_, k) => first + ((last - first) * k) / 400);
  const lengths = [0];
  for (let k = 1; k < fine.length; k++) {
    const [p, q] = [onDigit(d, fine[k - 1]!, 0), onDigit(d, fine[k]!, 0)];
    lengths.push(lengths[k - 1]! + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const total = lengths[lengths.length - 1]!;
  return Array.from({ length: count }, (_, j) => {
    const want = (total * j) / (count - 1);
    // (the last place's length can round a hair past the whole: it is the last point)
    const found = lengths.findIndex((l) => l >= want);
    const k = found < 0 ? lengths.length - 1 : Math.max(1, found);
    const [l0, l1] = [lengths[k - 1]!, lengths[k]!];
    return fine[k - 1]! + (fine[k]! - fine[k - 1]!) * (l1 > l0 ? (want - l0) / (l1 - l0) : 0);
  });
}

/**
 * Straight out from a digit's edge at each sampled place, square to the edge as it runs over a few places either side,
 * so that where the edge curves the gap's far side does not fold back on itself.
 */
function gapNormals(d: Posed, us: readonly number[], side: 1 | -1): Pt[] {
  const edge = us.map((u) => sideAt(d, u, side));
  return us.map((u, k) => {
    const [p, q] = [edge[Math.max(0, k - 2)]!, edge[Math.min(edge.length - 1, k + 2)]!];
    const n = unit([q[1] - p[1], p[0] - q[0]]);
    const away = [edge[k]![0] - onDigit(d, u, 0)[0], edge[k]![1] - onDigit(d, u, 0)[1]];
    return n[0] * away[0]! + n[1] * away[1]! >= 0 ? n : ([-n[0], -n[1]] as Pt);
  });
}

/** The way a shadow's widths are measured at its sampled places: out from its digit's edge, or in from it (`into`). */
function gapRays(name: GapName, d: Posed, us: readonly number[]): Pt[] {
  const { side, into } = GAP_EDGES[name];
  return gapNormals(d, us, side).map(([x, y]) => (into ? [-x, -y] : [x, y]));
}

/** How far short of the thumb's tip, along its middle, a shadow's hidden near side stops. */
const UNDER_SHORT = 0.75;

/**
 * A shadow in a pose: its near side along the digit's edge, or its middle where the digit hides it, and its far side
 * where it ends. Where the frame has no shadow at a place, the far side closes onto the edge, so the shadow tapers off
 * along it.
 */
function gapIn(name: GapName, ds: Record<DigitName, Posed>, measured: readonly number[]): Pt[] {
  const { digit, side, from: first, toBack, under } = GAP_EDGES[name];
  const d = ds[digit];
  const us = evenlyAlong(d, GAP_SAMPLES, first, toBack);
  const outward = gapRays(name, d, us);
  const near: Pt[] = [];
  const far: Pt[] = [];
  us.forEach((u, k) => {
    const p = sideAt(d, u, side);
    // under the thumb, along its middle at the same places in every pose, short of the tip, which curls back toward us
    near.push(under ? onDigit(d, ((d.centre.length - 1 - UNDER_SHORT) * k) / (GAP_SAMPLES - 1), 0) : p);
    // (and there a place with no shadow tucks its far side under the thumb's edge, as `firm` asks, so no hair of it shows)
    far.push(step(p, outward[k]!, under ? (measured[k] ?? 0) : Math.max(0, measured[k] ?? 0)));
  });
  return [...near, ...far.reverse()];
}

/** A shadow's places on its digit's edge in a pose, where its widths are measured from. */
function gapEdge(name: GapName, ds: Record<DigitName, Posed>): Pt[] {
  const { digit, side, from: first, toBack } = GAP_EDGES[name];
  return evenlyAlong(ds[digit], GAP_SAMPLES, first, toBack).map((u) => sideAt(ds[digit], u, side));
}

/** The poses, one per frame of a turn, from rest to rest. */
interface Pose {
  digits: Record<DigitName, Posed>;
  web: number;
  /** The frame's shadows beside the digits (`GAP_TRACK`). */
  gaps: Record<GapName, readonly number[]>;
  /** How far the palm beside the thumb reaches (`PALM_TRACK`), and where the slit's shadow on it begins (`SLIT_FROM`). */
  palm: readonly number[];
  slitFrom: readonly number[];
}
const POSES: readonly Pose[] = ORDER.map((i) => {
  const f = TRACK[i]!;
  const gaps = { slit: stroke(SLIT[i]!), wedge: stroke(GAP_TRACK.wedge[i]!), ring: stroke(GAP_TRACK.ring[i]!), cleft: stroke(GAP_TRACK.cleft[i]!) };
  const digits = { thumb: thumbIn(f, WIDTHS.thumb[i]!), index: indexIn(f, WIDTHS.index[i]!), reaching: middleIn(f, WIDTHS.reaching[i]!), curled: ringIn(f) };
  return { digits, web: f.web, gaps, palm: stroke(PALM_TRACK[i]!), slitFrom: stroke(SLIT_FROM[i]!) };
});
/** The stamp through a turn: its lean from rest, its turn, its middle; it ends where it began but turned over. */
const CARD_TRACK: readonly (readonly [number, number, number, number])[] = ORDER.map((i, k) => {
  const [lean, turn, x, y] = TRACK[i]!.card;
  return [lean - TRACK.at(-1)!.card[0], k === 0 ? 0 : turn, x, y] as const;
});


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
  for (let u = 0; u <= m - 1 + 1.6; u += 0.005) {
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

/* ---- the shapes ---------------------------------------------------------------------------------------------------- */

const REST = POSES[0]!.digits;
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
 * at their tips. Where the reference shows background between them (`open`), the web sinks to their roots, and the
 * palm in front beside the thumb leaves only that background showing.
 */
function webIn(p: Pose, ds: Record<DigitName, Posed>): { index: number; thumb: number; open: number; shut: number } {
  const steps = (from: number, to: number): number[] => Array.from({ length: 121 }, (_, k) => from + ((to - from) * k) / 120);
  // the thumb's side on round its tip to its outermost point, where a broad thumb meets the finger as it turns
  const [iu, tu] = [steps(2, 8), [...steps(0, 6), 6, 6, 6]];
  const ie = iu.map((u) => sideAt(ds.index, u, -1));
  const te = [...steps(0, 6).map((u) => sideAt(ds.thumb, u, 1)), ...digitSides(ds.thumb).cap.slice(0, 3)];
  let closed: [number, number] | null = null;
  for (let i = 0; i < 120 && !closed; i++) {
    for (let j = 0; j + 1 < te.length; j++) {
      const [p1, p2, q1, q2] = [ie[i]!, ie[i + 1]!, te[j]!, te[j + 1]!];
      const [rx, ry, sx, sy] = [p2[0] - p1[0], p2[1] - p1[1], q2[0] - q1[0], q2[1] - q1[1]];
      const den = rx * sy - ry * sx;
      if (!den) continue;
      const [qx, qy] = [q1[0] - p1[0], q1[1] - p1[1]];
      const [f, g] = [(qx * sy - qy * sx) / den, (qx * ry - qy * rx) / den];
      if (f >= 0 && f <= 1 && g >= 0 && g <= 1) {
        // just past the crossing on the index finger, under the thumb, and just short of it on the thumb
        closed = [iu[i]! + f * 0.05 + 0.15, tu[j]! + g * (tu[j + 1]! - tu[j]!) - 0.15];
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
  const open = p.web;
  const [ci, ct] = closed!;
  // (no higher on the index finger than where its tip begins, so its points along the side never crowd its tip)
  return { index: Math.min(7.3, ci) + (2.5 - Math.min(7.3, ci)) * open, thumb: ct + (2.3 - ct) * open, open, shut: ct };
}

/**
 * The palm's points the outline of the fingers behind runs through below the frame, and the wedge's above the middle
 * finger. Between the web and the wedge the outline passes under the thumb through the middle finger's root, low
 * enough to stay clear of the index finger's tip.
 */
const BELOW: readonly Pt[] = [[690, 900], [1060, 940]];
const WEDGE_TOP = held('reaching', [[668, 470], [608, 488]]);
const CROTCH = held('reaching', [[690, 540]]);

/**
 * Whether a point of the outline's pass under the thumb would show past the thumb's tip on its index finger's side,
 * poking out beside the tip as a spur. A point well off to the thumb's other side, where the wedge shows, never does.
 */
function spurs(q: Pt, ds: Record<DigitName, Posed>): boolean {
  const c = ds.thumb.centre;
  const [root, tip] = [c[1]!, c[c.length - 1]!];
  const ax = unit([tip[0] - root[0], tip[1] - root[1]]);
  const along = (q[0] - root[0]) * ax[0] + (q[1] - root[1]) * ax[1];
  const across = (q[0] - root[0]) * -ax[1] + (q[1] - root[1]) * ax[0];
  // measured from the tip's outermost point and the thumb as it is built, so a thumb drawn wider holds the same pass
  const end = tipOf(ds.thumb);
  const top = (end[0] - root[0]) * ax[0] + (end[1] - root[1]) * ax[1] - reach(THUMB) - UNDER_TIP;
  return across >= -(THUMB.a.at(-1)! + THUMB.b.at(-1)!) / 2 && along > top;
}
/** How far below the thumb's tip, on the grid, the outline's pass under it may reach. */
const UNDER_TIP = 30;

/** The nail: a soft, nearly square shield across the thumb's tip, its free edge pale, set into the skin. */
const NAIL = held('thumb', [[660, 470], [672, 456], [700, 452], [728, 456], [740, 470], [742, 512], [732, 536], [700, 542], [668, 536], [658, 512]]);
const FREE_EDGE = held('thumb', [[662, 470], [674, 457], [700, 453], [726, 457], [738, 470], [726, 476], [700, 474], [674, 476]]);

/** The lines, each held on its digit: where, how wide at its fullest, how strong, and in what ink. */
const LINES: readonly { name: string; on: ReturnType<typeof held>; width: number; opacity: number; ink?: string; layer: 'back' | 'front' }[] = [
  { name: 'nail-rim', on: held('thumb', [[662, 476], [658, 504], [668, 532], [700, 543], [732, 532], [742, 504], [738, 476]]), width: 1.2, opacity: 0.8, layer: 'front' },
  { name: 'cuticle', on: held('thumb', [[668, 552], [700, 560], [732, 552]]), width: 0.8, opacity: 0.5, layer: 'front' },
  { name: 'thumb-joint', on: held('thumb', [[704, 654], [722, 648], [742, 652]]), width: 1, opacity: 0.7, layer: 'front' },
  { name: 'thumb-joint-2', on: held('thumb', [[710, 666], [724, 662], [738, 665]]), width: 0.6, opacity: 0.5, layer: 'front' },
  { name: 'thumb-fold', on: held('thumb', [[782, 650], [790, 690], [794, 730]]), width: 1.3, opacity: 0.75, layer: 'front' },
  { name: 'thumb-root', on: held('thumb', [[668, 720], [692, 730], [716, 732]]), width: 0.9, opacity: 0.55, layer: 'front' },
  { name: 'index-joint', on: held('index', [[908, 666], [924, 652], [942, 638]]), width: 1.2, opacity: 0.85, layer: 'back' },
  { name: 'index-joint-2', on: held('index', [[915, 676], [930, 664], [946, 650]]), width: 0.7, opacity: 0.55, layer: 'back' },
  { name: 'index-last', on: held('index', [[822, 572], [833, 558], [845, 544]]), width: 0.8, opacity: 0.6, layer: 'back' },
  { name: 'index-nail', on: held('index', [[693, 471], [696, 458], [705, 448], [718, 443]]), width: 1.1, opacity: 0.8, ink: INK.nail, layer: 'back' },
  { name: 'reaching-joint', on: held('reaching', [[592, 536], [588, 552], [590, 570]]), width: 1.1, opacity: 0.85, layer: 'back' },
  { name: 'reaching-joint-2', on: held('reaching', [[606, 540], [603, 553], [605, 566]]), width: 0.7, opacity: 0.6, layer: 'back' },
];

/**
 * How far out a shadow reaches, on the grid, given how far out what covers it reaches (the palm laid over the slit, or
 * nothing): one thinner than a hair is drawn just under the cover, so its edge never shows as a dark line, and it eases
 * out from there as it widens.
 */
const HAIR = 2.5;
function firm(width: number, cover: number): number {
  const shown = width - cover;
  return cover + shown - HAIR * Math.pow(Math.min(1, Math.max(0, 1 - shown / (3 * HAIR))), 2);
}

/**
 * How far out the band of palm between the thumb and its shadow is drawn, from how far it reaches at that moment of the
 * turn: one only a few hairs wide would show as a sliver of skin inside the shadow, so it closes up, and it opens out as
 * it widens.
 */
const SLIVER = { shut: 5.5, open: 12 } as const;
function bandOf(width: number): number {
  const t = Math.max(0, Math.min(1, (width - SLIVER.shut) / (SLIVER.open - SLIVER.shut)));
  return width * t * t * (3 - 2 * t);
}

/**
 * A band measured in a frame as only a few hairs wide, taken as none or as wide enough to read, whichever is nearer, so
 * the turn never rests on one (`bandOf` closes it between frames, where it only passes through).
 */
function readable(width: number): number {
  if (width <= SLIVER.shut || width >= SLIVER.open) return width;
  return 2 * width < SLIVER.shut + SLIVER.open ? 0 : SLIVER.open;
}

/** A digit's tip: the outermost point of its round, on its centre line. */
function tipOf(d: Posed): Pt {
  const m = d.centre.length;
  return step(d.centre[m - 1]!, alongAt(d, m - 1), ((d.a[m - 1]! + d.b[m - 1]!) / 2) * d.tip);
}
/** How far in from the thumb's tip, on the grid, its pad presses on the stamp. */
const PAD_IN = 24;

/**
 * Every shape of the hand in a pose, on the grid, each with the same points in the same order in every pose, so the
 * turn can move each point along its own curve from pose to pose:
 * - `back`, the fingers behind the stamp as one outline: up the index finger's outer side, round its tip, a little way
 *   down its inner side, across the palm behind the thumb to the middle finger, out along it and back, out along the
 *   ring finger and back, and round under the frame's foot;
 * - `thumb`, the thumb in front, one outline from its root round its tip, and `palm`, the palm beside it in front;
 * - the shapes on them: the gaps beside the digits (`gapIn`), the band of palm over the slit's inner part, the nail and
 *   its free edge, and the thumb's pad, where it holds the stamp (a single point, for placing the stamp).
 */
function shapesIn(p: Pose): Record<string, Pt[]> {
  const ds = p.digits;
  const I = digitSides(ds.index);
  const R = digitSides(ds.reaching);
  const C = digitSides(ds.curled);
  const T = digitSides(ds.thumb);
  const wedgeTop = ride(WEDGE_TOP, ds);
  // The web's edge: from the index finger's inner side, sagging toward the palm as it opens, to just under the thumb,
  // from where the outline runs on under the thumb to the middle finger.
  const web = webIn(p, ds);
  const [wa, wb] = [sideAt(ds.index, web.index, -1), sideAt(ds.thumb, web.thumb, 1, 4)];
  const palm = WRIST;
  const [ex, ey] = [wb[0] - wa[0], wb[1] - wa[1]];
  const toward = Math.sign(-ey * (palm[0] - wa[0]) + ex * (palm[1] - wa[1])) || 1;
  const sag = 0.3 * web.open * toward;
  const webEdge = [1 / 3, 2 / 3].map((f): Pt => [wa[0] + ex * f - ey * sag * 4 * f * (1 - f), wa[1] + ey * f + ex * sag * 4 * f * (1 - f)]);
  webEdge.push(wb);
  // Under the thumb to the middle finger: through its root and over the wedge, or, where that would spur out past the
  // thumb's tip, straight across under it from the thumb's middle as high as the web shuts, so the way across never
  // cuts through the middle finger's root however far the web has opened.
  const crotch = ride(CROTCH, ds)[0]!;
  const into = R.a[2]!;
  const shut = onDigit(ds.thumb, web.shut, 0);
  const pass = spurs(crotch, ds) || spurs(wedgeTop[1]!, ds) ? [shut, [(shut[0] + into[0]) / 2, (shut[1] + into[1]) / 2] as Pt] : [crotch, wedgeTop[1]!];
  const back = [
    ...I.a,
    ...I.cap,
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => sideAt(ds.index, 8 + ((web.index - 8) * k) / 6, -1)),
    ...webEdge,
    ...pass,
    ...R.a.slice(2),
    ...R.cap,
    ...R.b.slice().reverse(),
    ...C.a,
    ...C.cap,
    ...C.b.slice().reverse(),
    ...BELOW,
  ];
  const thumb = [...T.a, ...T.cap, ...T.b.slice().reverse()];
  const curled = [...C.a, ...C.cap, ...C.b.slice().reverse()];
  // Below where the slit's shadow begins the band keeps its measured reach, so the shadow ends there in a point at the
  // band's edge, as the reference paints it; further up the band never reaches past the shadow.
  const first = p.gaps.slit.findIndex((w) => w > 0);
  const band = p.slitFrom.map((w, k) => Math.max(0, readable(first >= 0 && k < first ? w : Math.min(w, p.gaps.slit[k] ?? 0))));
  return {
    back,
    curled,
    // the palm at the slit's places, out at least as far as the slit's shadow, which lies on it (tucked under the thumb
    // where it is thinner than a hair)
    palm: gapIn('slit', ds, p.palm.map((w, k) => firm(Math.max(w, p.gaps.slit[k] ?? 0), 0))),
    slit: gapIn('slit', ds, p.gaps.slit.map((w, k) => firm(w, bandOf(band[k]!)))),
    // and the band of palm between the thumb and the slit's shadow, out to where the shadow begins, drawn as `bandOf` its
    // width at each moment (`pointsAt`), from the thumb's edge at the slit's places
    band: gapIn('slit', ds, band),
    'check:slit-edge': gapEdge('slit', ds),
    wedge: gapIn('wedge', ds, p.gaps.wedge.map((w) => firm(w, 0))),
    ring: gapIn('ring', ds, p.gaps.ring.map((w) => firm(w, 0))),
    cleft: gapIn('cleft', ds, p.gaps.cleft.map((w) => firm(w, 0))),
    thumb,
    nail: ride(NAIL, ds),
    freeEdge: ride(FREE_EDGE, ds),
    pad: [step(tipOf(ds.thumb), alongAt(ds.thumb, ds.thumb.centre.length - 1), -PAD_IN)],
    // for checking the drawing, not drawn: each digit's joints, root to tip, and the index finger's whole outline
    'check:thumb': [0, 3, 6].map((i) => ds.thumb.centre[i]!),
    'check:index': [1, 3, 6, 8].map((i) => ds.index.centre[i]!),
    'check:reaching': [0, 2, 4].map((i) => ds.reaching.centre[i]!),
    'check:index-outline': [...I.a, ...I.cap, ...I.b.slice().reverse()],
    // and each digit's tip, its outermost point on its centre line, and the ring finger's centre line
    'check:tips': (['thumb', 'index', 'reaching'] as const).map((d) => tipOf(ds[d])),
    'check:ring': ds.curled.centre.slice(),
    ...Object.fromEntries(LINES.map((l) => [l.name, ride(l.on, ds)])),
  };
}

/** Each shape's points in every pose, on the frame. */
const KEYS: Record<string, Pt[][]> = (() => {
  const all = POSES.map(shapesIn);
  return Object.fromEntries(Object.keys(all[0]!).map((name) => [name, all.map((s) => s[name]!.map(at))]));
})();

/**
 * Curves through the poses that pass through every one of them and never swing past it: for each point's each
 * coordinate, a monotone cubic through its place in every pose (its slope at a pose the harmonic mean of the steps
 * either side, and nil where it turns back), so a finger eases into a pose it reverses at and runs on through one it
 * passes, with nothing drifting from the measured poses between them. The turn's ends meet as the loop's do: the slope
 * at either end is taken across the seam, the stamp's turn carried on by half a turn.
 */
function slopes(values: readonly number[], seam = 0): number[] {
  const m = values.length;
  const before = values[m - 2]! - seam;
  const after = values[1]! + seam;
  const steps = values.map((v, i) => (i + 1 < m ? values[i + 1]! - v : after - v));
  return values.map((v, i) => {
    const [l, r] = [i > 0 ? v - values[i - 1]! : v - before, steps[i]!];
    return l * r <= 0 ? 0 : (2 * l * r) / (l + r);
  });
}
const onCurve = (values: readonly number[], slope: readonly number[], t: number): number => {
  const i = Math.max(0, Math.min(values.length - 2, Math.floor(t)));
  const u = t - i;
  const [u2, u3] = [u * u, u * u * u];
  return (2 * u3 - 3 * u2 + 1) * values[i]! + (u3 - 2 * u2 + u) * slope[i]! + (-2 * u3 + 3 * u2) * values[i + 1]! + (u3 - u2) * slope[i + 1]!;
};
const CURVES: Record<string, { xs: number[][]; ys: number[][]; sx: number[][]; sy: number[][] }> = Object.fromEntries(
  Object.entries(KEYS).map(([name, poses]) => {
    const xs = poses[0]!.map((_, k) => poses.map((pts) => pts[k]![0]));
    const ys = poses[0]!.map((_, k) => poses.map((pts) => pts[k]![1]));
    return [name, { xs, ys, sx: xs.map((v) => slopes(v)), sy: ys.map((v) => slopes(v)) }];
  }),
);
const CARD_SLOPES = [0, 1, 2, 3].map((c) => slopes(CARD_TRACK.map((q) => q[c]!), c === 1 ? 180 : 0));

/** How far through the poses `ms` into a turn falls. */
const poseAt = (ms: number): number => (Math.max(0, Math.min(HAND_STAMP_FLIP.ms, ms)) / HAND_STAMP_FLIP.ms) * (POSES.length - 1);

/** Every shape's points at `ms` into a turn, on the frame. */
function pointsAt(ms: number): Record<string, Pt[]> {
  const t = poseAt(ms);
  const pts: Record<string, Pt[]> = Object.fromEntries(
    Object.entries(CURVES).map(([name, c]) => [name, c.xs.map((x, k) => [onCurve(x, c.sx[k]!, t), onCurve(c.ys[k]!, c.sy[k]!, t)] as Pt)]),
  );
  // The band of palm over the slit closes up wherever it is only a few hairs wide, between frames too, where it narrows
  // as it closes, and once closed it tucks under the thumb's edge, so no hair of skin shows beside the thumb.
  const [edge, band] = [pts['check:slit-edge']!, pts.band!];
  for (let k = 0; k < GAP_SAMPLES; k++) {
    const [e, f, inner] = [edge[k]!, band[2 * GAP_SAMPLES - 1 - k]!, band[k]!];
    const out = unit([e[0] - inner[0], e[1] - inner[1]]);
    const width = ((f[0] - e[0]) * out[0] + (f[1] - e[1]) * out[1]) / K;
    const keep = width > 0 ? bandOf(width) / width : 0;
    band[2 * GAP_SAMPLES - 1 - k] = step([e[0] + (f[0] - e[0]) * keep, e[1] + (f[1] - e[1]) * keep], out, -HAIR * K);
  }
  // Where a gap is all but shut between frames, or one of its sides has passed the other, its two sides meet exactly,
  // so it never shows a hair of dark or turns inside out.
  for (const name of GAP_NAMES) {
    const g = pts[name]!;
    const far = (k: number): Pt => g[2 * GAP_SAMPLES - 1 - k]!;
    // Which side of the digit a place's far side lies on, against the shadow's run from end to end, which a kink at
    // the tip cannot turn round.
    const [p, q] = [g[0]!, g[GAP_SAMPLES - 1]!];
    const across = (k: number): number => {
      const f = far(k);
      return (q[0] - p[0]) * (f[1] - g[k]![1]) - (q[1] - p[1]) * (f[0] - g[k]![0]);
    };
    const widest = Array.from({ length: GAP_SAMPLES }, (_, k) => k).reduce((w, k) => (Math.hypot(far(k)[0] - g[k]![0], far(k)[1] - g[k]![1]) > Math.hypot(far(w)[0] - g[w]![0], far(w)[1] - g[w]![1]) ? k : w), 0);
    const way = Math.sign(across(widest));
    for (let k = 0; k < GAP_SAMPLES; k++) {
      const [a, b] = [g[k]!, far(k)];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= GAP_SHUT && Math.sign(across(k)) === way) continue;
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      g[k] = mid;
      g[2 * GAP_SAMPLES - 1 - k] = mid;
    }
  }
  return pts;
}
/** How narrow a gap may get, on the frame, before its sides are taken as meeting. */
const GAP_SHUT = 0.6;

/** A layer's lines, each a brush's ring in its ink. */
function brushed(layer: 'back' | 'front'): { name: string; layer: 'back' | 'front'; fill: string; brush: { width: number; opacity: number } }[] {
  return LINES.filter((l) => l.layer === layer).map((l) => ({ name: l.name, layer, fill: l.ink ?? INK.line, brush: { width: l.width, opacity: l.opacity } }));
}

/** How each shape is painted: in which layer, in what, and whether it is a smooth outline or a brush's ring. */
const PAINT: readonly { name: string; layer: 'back' | 'front'; fill: string; brush?: { width: number; opacity: number } }[] = [
  { name: 'back', layer: 'back', fill: SKIN.face },
  // the creases behind lie under the shadows, which hide them as the reference's dark hides its lines
  ...brushed('back'),
  { name: 'wedge', layer: 'back', fill: INK.gap },
  { name: 'ring', layer: 'back', fill: INK.gap },
  { name: 'cleft', layer: 'back', fill: INK.gap },
  // in front, the palm beside the thumb with the slit's shadow on it, and over both the thumb and its lines
  { name: 'palm', layer: 'front', fill: SKIN.face },
  { name: 'slit', layer: 'front', fill: INK.gap },
  { name: 'band', layer: 'front', fill: SKIN.face },
  { name: 'thumb', layer: 'front', fill: SKIN.face },
  { name: 'nail', layer: 'front', fill: INK.nail },
  { name: 'freeEdge', layer: 'front', fill: INK.nailEdge },
  ...brushed('front'),
];
const BRUSHED = new Map(PAINT.filter((q) => q.brush).map((q) => [q.name, q.brush!]));

/** The shapes laid out from under the thumb (`gapIn`), whose near side the thumb hides. */
const UNDER = new Set(['slit', 'wedge', 'palm', 'band']);

/**
 * A shape's path from its points on the frame: a smooth closed outline, or a brush's ring for a line. One laid out from
 * under the thumb runs straight along its hidden near side and meets its smooth far side in corners, so where it ends
 * beside the thumb its outline never swells out past the thumb's edge.
 */
function pathOf(name: string, pts: readonly Pt[]): string {
  const b = BRUSHED.get(name);
  if (b) return brushRing(pts, b.width);
  if (!UNDER.has(name)) return smooth(pts);
  const half = pts.length / 2;
  return `M${pts.slice(0, half).map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}L${line(pts.slice(half)).slice(1)}Z`;
}

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
  // The outline in the one skin, as the reference paints it, with no shade step at any edge; in front, the thumb's with
  // the palm beside it.
  const outlines = opts.part === 'back' ? ['back'] : ['thumb', 'palm'];
  const clip = dr.id('c');
  dr.def(`<clipPath id="${clip}">${outlines.map((o) => `<path data-shape="${o}" d="${ds[o]}"/>`).join('')}</clipPath>`);
  // Everything painted on the layer stays inside its outline, so a gap drawn between the fingers ends at the hand's edge.
  const paint = PAINT.filter((q) => q.layer === opts.part).map((q) => {
    const opacity = q.brush ? ` opacity="${n(q.brush.opacity)}"` : '';
    return `<path data-shape="${q.name}" d="${ds[q.name]}" fill="${q.fill}"${opacity}/>`;
  });
  dr.add(`<g clip-path="url(#${clip})">${paint.join('')}</g>`);
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}

/** Every shape's path `ms` into a turn, by its `data-shape` name, for redrawing the hand each frame of a turn. */
export function handStampShapesAt(ms: number): Record<string, string> {
  const pts = pointsAt(ms);
  return Object.fromEntries(Object.entries(pts).filter(([name]) => PAINT.some((q) => q.name === name)).map(([name, p]) => [name, pathOf(name, p)]));
}

/**
 * For checking the drawing, `ms` into a turn, on the frame: each digit's joints from root to tip (the thumb's, the
 * index finger's from its knuckle, the middle finger's), each one's outermost tip, the ring finger's centre line, the
 * index finger's whole outline, and the thumb's pad.
 */
export function handStampBonesAt(ms: number): {
  joints: Record<'thumb' | 'index' | 'reaching', Pt[]>;
  tips: Record<'thumb' | 'index' | 'reaching', Pt>;
  ring: Pt[];
  index: Pt[];
  pad: Pt;
} {
  const pts = pointsAt(ms);
  const [thumb, index, reaching] = pts['check:tips']!;
  return {
    joints: { thumb: pts['check:thumb']!, index: pts['check:index']!, reaching: pts['check:reaching']! },
    tips: { thumb: thumb!, index: index!, reaching: reaching! },
    ring: pts['check:ring']!,
    index: pts['check:index-outline']!,
    pad: pts.pad![0]!,
  };
}

/** Every shape's points `ms` into a turn, on the frame, for checking the drawing. */
export function handStampPointsAt(ms: number): Record<string, Pt[]> {
  return pointsAt(ms);
}

/** The stamp `ms` into a turn: its middle on the frame, its lean and its turn about its upright, as the reference moves it. */
export function handStampCardAt(ms: number): { cx: number; cy: number; lean: number; turn: number } {
  const t = poseAt(ms);
  const [lean, flip, x, y] = [0, 1, 2, 3].map((k) => onCurve(CARD_TRACK.map((q) => q[k]!), CARD_SLOPES[k]!, t));
  const [cx, cy] = at([x!, y!]);
  return { cx, cy, lean: HAND_STAMP_CARD.turn + lean!, turn: flip! };
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
