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
import { SKIN, smooth } from './hand-paint.js';

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

/** How far a tip's round runs past the point it rounds about: the half-width there times the tip's share. */
const reach = (b: Build): number => ((b.a.at(-1)! + b.b.at(-1)!) / 2) * b.tip;
/**
 * The bones the reference never shows, on the grid: the thumb's root bone and the index finger's knuckle and root, all
 * below the frame, and how far the middle and ring fingers run on under what covers them.
 */
const HIDDEN = { thumbRoot: 300, indexKnuckle: 150, indexRoot: 260, middleUnder: 60, ringUnder: 70, ringOn: 60 } as const;

/* ---- the turn ----------------------------------------------------------------------------------------------------- */

/**
 * One half of the reference's loop, frame by frame, 80 ms apart, as measured on it (the grid is its picture). Its other
 * half shows the same hand turning the stamp back. For each frame:
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
 * - `web`: how far the background shows down between the index finger and the thumb, 0 to 1.
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
  { thumb: [[728, 719], [725, 671.6], [688.6, 431.2]], index: [[956.5, 719], [937.2, 637.9], [848, 549.4], [667.1, 458.9]], middle: [[623.6, 575.7], [590.5, 579], [463.7, 605.5]], ring: [[600, 681], [550, 688], [500, 708]], card: [4.2, 0, 648.1, 321.2], web: 0 },
  { thumb: [[722.5, 719], [722.6, 671.7], [688.4, 427.2]], index: [[962, 719], [948, 642.7], [852.3, 546.3], [670.8, 457]], middle: [[613.7, 568.5], [588, 570.5], [461.3, 596.8]], ring: [[590, 676], [530, 689], [480, 708]], card: [3.8, 0, 643.8, 315.5], web: 0.1 },
  { thumb: [[717.5, 719], [716.4, 672.5], [685.1, 425.2]], index: [[968, 719], [959, 643.2], [864.3, 533.3], [680, 450]], middle: [[590.5, 518], [578.6, 517.4], [450.4, 531.5]], ring: [[590, 677], [520, 686], [450, 708]], card: [2.5, 0, 626.6, 305.2], web: 0.4 },
  { thumb: [[703, 719], [697.1, 673.8], [681.7, 422]], index: [[979.5, 719], [976.2, 633.6], [884.7, 524.4], [708, 426]], middle: [[575.5, 529.2], [554.7, 514.1], [436.9, 485.2]], ring: [[560, 675], [480, 673], [400, 702]], card: [-0.1, 0, 598.4, 297.3], web: 0.9 },
  { thumb: [[675, 719], [669.7, 660], [656.4, 409]], index: [[1013.5, 719], [1030.6, 629.8], [949.3, 524.5], [769.1, 449.7]], middle: [[560.4, 540.4], [530.8, 510.8], [423.5, 439]], ring: [[530, 681], [460, 678], [390, 703]], card: [-7.6, 19.1, 574.3, 306.5], web: 1 },
  { thumb: [[682, 719], [676.9, 664.5], [647.7, 412.1]], index: [[1021.5, 719], [1053.2, 635.5], [981.8, 515.4], [785.3, 442.8]], middle: [[560.3, 545.4], [529.5, 512], [435.2, 422.7]], ring: [[550, 688], [470, 683], [400, 704]], card: [-7.1, 19.1, 572.8, 314.4], web: 1 },
  { thumb: [[691.5, 719], [691, 670.5], [656.6, 416.2]], index: [[1026.5, 719], [1060.7, 634.7], [989.2, 508.5], [797.1, 438.5]], middle: [[565.3, 545.4], [544.6, 522.9], [459.7, 424.6]], ring: [[560, 697], [480, 686], [410, 706]], card: [-7.1, 17.5, 570.1, 320.8], web: 1 },
  { thumb: [[730, 719], [729.2, 668], [693.5, 441.1]], index: [[983.5, 719], [957.9, 599], [859.4, 468.9], [688.2, 361.4]], middle: [[580.4, 540.3], [549.3, 511.7], [453.4, 423.9]], ring: [[600, 698], [520, 696], [440, 709]], card: [-10.9, 11, 590.2, 318.2], web: 1 },
  { thumb: [[781, 719], [774, 664.5], [654.7, 494.6]], index: [[969, 719], [927.8, 600.6], [830.7, 469], [700.8, 318.2]], middle: [[626.9, 521.8], [591.5, 471.1], [514.6, 366.3]], ring: [[600, 709], [540, 701], [470, 711]], card: [-49.8, 77.3, 566.1, 325.4], web: 0.4 },
  { thumb: [[693, 719], [693.7, 670.1], [621.1, 425.1]], index: [[960, 719], [920.2, 612], [833.5, 476.9], [712, 312.2]], middle: [[608.3, 429.8], [608.3, 429.8], [531.5, 351.2]], ring: [[525, 702], [480, 702], [430, 712]], card: [-45, 90, 588.5, 308.1], web: 0 },
  { thumb: [[673, 719], [657, 655.1], [616.7, 400.3]], index: [[954, 719], [900.6, 611.5], [812, 503.1], [682.8, 349.2]], middle: [[612, 602], [548, 618], [500.5, 646.7]], ring: [[541, 724], [500, 724.6], [452, 735]], card: [-65.8, 124.6, 562.3, 395.8], web: 0.2 },
  { thumb: [[694.5, 719], [684.9, 671.8], [645.3, 418.2]], index: [[929.5, 719], [875.1, 625.8], [767.8, 513], [619.3, 375.6]], middle: [[590.5, 654.8], [590.2, 654.9], [487.3, 694]], ring: [[557, 724], [520, 725.2], [474, 736]], card: [-55.1, 180, 547.6, 437.7], web: 0 },
  { thumb: [[699, 719], [695.3, 669.2], [667.9, 425.1]], index: [[916.5, 719], [897, 645.9], [759, 556], [597.5, 434.3]], middle: [[605.4, 654.7], [605.4, 654.7], [538.4, 706.4]], ring: [[573, 724], [540, 725.8], [496, 737]], card: [-36.8, 169.9, 586.1, 426.9], web: 0.1 },
  { thumb: [[718.5, 719], [708.7, 661.9], [675.2, 429.2]], index: [[925, 719], [907.2, 636.9], [781.6, 556.4], [621.9, 432.2]], middle: [[606.8, 628.3], [606.8, 628.3], [493.1, 668.2]], ring: [[589, 724], [560, 726.4], [518, 738]], card: [-9.9, 168.5, 648.8, 364.3], web: 0.2 },
  { thumb: [[725.5, 719], [715.6, 662], [684.2, 428.2]], index: [[944, 719], [928.1, 645.6], [844, 553.3], [665.8, 457.6]], middle: [[620.7, 603], [600.7, 606], [479.3, 647.6]], ring: [[605, 699], [580, 702], [540, 714]], card: [-2.9, 180, 646.2, 343.2], web: 0 },
  { thumb: [[726, 719], [716.1, 662], [689.5, 426.1]], index: [[949.5, 719], [934.7, 646], [845.2, 553.5], [668.4, 455.3]], middle: [[618, 586], [592.5, 590.8], [467.9, 626.6]], ring: [[605, 698], [560, 697], [510, 713]], card: [0.1, 180, 646.1, 330.2], web: 0 },
  { thumb: [[727.5, 719], [717, 660], [689.9, 431.1]], index: [[953, 719], [935.9, 642.8], [844.9, 551.7], [666.3, 456.8]], middle: [[620.9, 578.7], [592.6, 583.3], [467.4, 616.7]], ring: [[605, 700], [550, 695], [500, 712]], card: [2.4, 180, 647.5, 327], web: 0 },
  { thumb: [[727.5, 719], [717.8, 660.2], [691, 432.1]], index: [[954.5, 719], [937.3, 640], [846.7, 551.6], [665.8, 461.1]], middle: [[621.7, 577.3], [592.2, 581], [466.3, 611.5]], ring: [[605, 698], [550, 692], [500, 710]], card: [3.2, 180, 648.3, 324.3], web: 0 },
  { thumb: [[728, 719], [720.5, 662], [690.8, 434.1]], index: [[956.5, 719], [936.8, 638], [847.7, 550.9], [669.9, 454.5]], middle: [[623.6, 575], [593.8, 578.2], [467.3, 605.8]], ring: [[605, 695], [550, 690], [500, 708]], card: [4.2, 180, 648.3, 321.9], web: 0 },
  { thumb: [[728, 719], [720.5, 662], [690.8, 434.1]], index: [[956.5, 719], [936.8, 638], [847.7, 550.9], [669.9, 454.5]], middle: [[623.6, 575], [593.8, 578.2], [467.3, 605.8]], ring: [[605, 695], [550, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 0 },
  { thumb: [[728, 719], [720.5, 662], [690.8, 434.1]], index: [[956.5, 719], [936.8, 638], [847.7, 550.9], [669.9, 454.5]], middle: [[623.6, 575], [593.8, 578.2], [467.3, 605.8]], ring: [[605, 695], [550, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 0 },
  { thumb: [[728, 719], [720.5, 662], [690.8, 434.1]], index: [[956.5, 719], [936.8, 638], [847.7, 550.9], [669.9, 454.5]], middle: [[623.6, 575], [593.8, 578.2], [467.3, 605.8]], ring: [[605, 695], [550, 690], [500, 708]], card: [4.2, 180, 648.3, 321.8], web: 0 },
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

/** A digit as the turn's track places it: its build, along its joints from root to tip, each bone cut into so many steps. */
const placed = (b: Build, joints: readonly Pt[], cuts: readonly number[]): Posed => ({ centre: along(joints, cuts), a: b.a, b: b.b, tip: b.tip });

/** The thumb: its joint as measured, its tip rounded about a point inside the measured tip, its root bone on below the frame. */
function thumbIn(f: Frame): Posed {
  const [base, joint, tip] = f.thumb;
  const middle = step(tip, from(joint, tip), -reach(THUMB));
  return placed(THUMB, [step(joint, from(joint, base), HIDDEN.thumbRoot), joint, middle], [3, 3]);
}

/** The index finger: its two joints as measured, its tip rounded inside the measured tip, its knuckle and root below the frame. */
function indexIn(f: Frame): Posed {
  const [base, middle, last, tip] = f.index;
  const down = from(middle, base);
  const joints = [step(middle, down, HIDDEN.indexRoot), step(middle, down, HIDDEN.indexKnuckle), middle, last, step(tip, from(last, tip), -reach(INDEX))];
  return placed(INDEX, joints, [1, 2, 3, 2]);
}

/** The middle finger: its joint and tip as measured, its root on under the thumb past where it goes under. */
function middleIn(f: Frame): Posed {
  const [under, joint, tip] = f.middle;
  const shown = Math.hypot(under[0] - joint[0], under[1] - joint[1]);
  const out = shown > 15 ? from(joint, under) : from(tip, joint);
  const root = step(under, out, HIDDEN.middleUnder + Math.max(0, 15 - shown));
  return placed(REACHING, [root, joint, step(tip, from(joint, tip), -reach(REACHING))], [2, 2]);
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
 * ends. They run right of the thumb, left of it under the stamp and down, and under the middle finger. `GAP_TRACK`
 * holds, for each frame of the reference, how far out from the edge the shadow ends at `GAP_SAMPLES` places spaced
 * evenly along the digit (`evenlyAlong`), on the grid; 0 is no shadow there.
 */
const GAP_NAMES = ['slit', 'wedge', 'ring'] as const;
type GapName = (typeof GAP_NAMES)[number];
const GAP_SAMPLES = 24;
/**
 * Each shadow's digit and side, and the stretch of it sampled, from its root to `toBack` short of its tip: the one right
 * of the thumb stops short of the tip, which curls over it as the thumb turns. A shadow cast by the thumb in front
 * begins under it (`under`), along its middle, so no seam shows at its edge.
 */
const GAP_EDGES: Record<GapName, { digit: DigitName; side: 1 | -1; from: number; toBack: number; under: boolean }> = {
  slit: { digit: 'thumb', side: 1, from: 0, toBack: 0.75, under: true },
  wedge: { digit: 'thumb', side: -1, from: 0, toBack: 0, under: true },
  ring: { digit: 'reaching', side: -1, from: 0, toBack: 2, under: false },
};
const GAP_TRACK: Record<GapName, readonly (readonly number[])[]> = {
  slit: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 64, 58, 52, 44, 37, 18, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 60, 52, 45, 35, 26, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 66, 66, 57, 46, 38, 27, 14, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 80, 80, 68, 55, 43, 27, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 65, 54, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 56, 49, 43, 35, 25, 0, 0, 0, 0],
    [41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 34, 13, 12, 0, 0, 0, 0, 0, 0],
    [126, 126, 126, 126, 126, 126, 126, 126, 126, 126, 126, 126, 126, 126, 119, 112, 108, 102, 96, 89, 85, 76, 69, 0],
    [122, 122, 122, 122, 122, 122, 122, 122, 122, 122, 122, 122, 122, 122, 117, 113, 108, 101, 79, 43, 0, 0, 0, 0],
    [63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 59, 57, 51, 40, 28, 15, 0, 0, 0],
    [53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 48, 43, 37, 30, 24, 17, 0, 0, 0, 0],
    [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 35, 29, 23, 16, 0, 0, 0, 0, 0, 0],
    [56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 51, 46, 42, 36, 31, 27, 0, 0, 0, 0],
    [62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 57, 53, 50, 44, 39, 32, 0, 0, 0, 0],
    [64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 60, 58, 54, 49, 42, 35, 0, 0, 0, 0],
    [67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 64, 61, 57, 51, 44, 37, 17, 0, 0, 0],
    [69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 67, 63, 58, 53, 48, 39, 20, 0, 0, 0],
    [69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 67, 63, 58, 53, 48, 39, 20, 0, 0, 0],
    [69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 67, 63, 58, 53, 48, 39, 20, 0, 0, 0],
    [69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 69, 67, 63, 58, 53, 48, 39, 20, 0, 0, 0],
  ],
  wedge: [
    [53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 53, 0, 0, 0, 0, 0, 0, 48, 48, 0],
    [58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 58, 0, 0, 0, 0, 0, 37, 51, 51, 0],
    [55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 0, 0, 0, 0, 0, 59, 84, 105, 0],
    [62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 62, 0, 0, 0, 0, 0, 0, 42, 59, 0],
    [67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 0, 0, 0, 0, 0, 57, 65, 65, 0, 0],
    [49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 0, 0, 0, 0, 0, 35, 54, 54, 0, 0],
    [55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 0, 0, 0, 0, 0, 35, 57, 57, 0, 0],
    [56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 56, 0, 0, 0, 0, 0, 32, 55, 84, 84, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 98, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 57, 61, 65, 65, 41, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 39, 55, 68, 68, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 31, 44, 44, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 37, 46, 55, 55, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 40, 53, 53, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 33, 47, 47, 0, 0],
    [51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 51, 0, 0, 0, 0, 0, 39, 52, 52, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 36, 53, 53, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 29, 48, 48, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 29, 48, 48, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 29, 48, 48, 0],
    [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 29, 48, 48, 0],
  ],
  ring: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 11, 11, 11, 11, 10, 7, 5],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27, 27, 25, 23],
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
    const k = Math.max(1, lengths.findIndex((l) => l >= want));
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
  const outward = gapNormals(d, us, side);
  const near: Pt[] = [];
  const far: Pt[] = [];
  us.forEach((u, k) => {
    const p = sideAt(d, u, side);
    // under the thumb, along its middle at the same places in every pose, short of the tip, which curls back toward us
    near.push(under ? onDigit(d, ((d.centre.length - 1 - UNDER_SHORT) * k) / (GAP_SAMPLES - 1), 0) : p);
    far.push(step(p, outward[k]!, Math.max(0, measured[k] ?? 0)));
  });
  return [...near, ...far.reverse()];
}

/** The poses, one per frame of a turn, from rest to rest. */
interface Pose {
  digits: Record<DigitName, Posed>;
  web: number;
  /** The frame's shadows beside the digits (`GAP_TRACK`). */
  gaps: Record<GapName, readonly number[]>;
}
const POSES: readonly Pose[] = ORDER.map((i) => {
  const f = TRACK[i]!;
  const gaps = Object.fromEntries(GAP_NAMES.map((g) => [g, GAP_TRACK[g][i]!])) as Record<GapName, readonly number[]>;
  return { digits: { thumb: thumbIn(f), index: indexIn(f), reaching: middleIn(f), curled: ringIn(f) }, web: f.web, gaps };
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
  const open = p.web;
  const [ci, ct] = closed!;
  // (no higher on the index finger than where its tip begins, so its points along the side never crowd its tip)
  return { index: Math.min(7.3, ci) + (2.5 - Math.min(7.3, ci)) * open, thumb: ct + (2.3 - ct) * open, open };
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
  const top = (tip[0] - root[0]) * ax[0] + (tip[1] - root[1]) * ax[1] - UNDER_TIP;
  return across >= -(ds.thumb.a.at(-1)! + ds.thumb.b.at(-1)!) / 2 && along > top;
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
 * Every shape of the hand in a pose, on the grid, each with the same points in the same order in every pose, so the
 * turn can move each point along its own curve from pose to pose:
 * - `back`, the fingers behind the stamp as one outline: up the index finger's outer side, round its tip, a little way
 *   down its inner side, across the palm behind the thumb to the middle finger, out along it and back, out along the
 *   ring finger and back, and round under the frame's foot;
 * - `thumb`, the thumb in front, one outline from its root round its tip;
 * - the shapes on them: the gaps beside the digits (`gapIn`), the nail and its free edge, and the thumb's pad, where
 *   it holds the stamp (a single point, for placing the stamp).
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
  // thumb's tip, straight across under it.
  const crotch = ride(CROTCH, ds)[0]!;
  const into = R.a[2]!;
  const pass = spurs(crotch, ds) || spurs(wedgeTop[1]!, ds) ? [1 / 3, 2 / 3].map((f): Pt => [wb[0] + (into[0] - wb[0]) * f, wb[1] + (into[1] - wb[1]) * f]) : [crotch, wedgeTop[1]!];
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
  return {
    back,
    curled,
    slit: gapIn('slit', ds, p.gaps.slit),
    wedge: gapIn('wedge', ds, p.gaps.wedge),
    ring: gapIn('ring', ds, p.gaps.ring),
    thumb,
    nail: ride(NAIL, ds),
    freeEdge: ride(FREE_EDGE, ds),
    pad: [onDigit(ds.thumb, ds.thumb.centre.length - 0.3, 0)],
    // for checking the drawing, not drawn: each digit's joints, root to tip, and the index finger's whole outline
    'check:thumb': [0, 3, 6].map((i) => ds.thumb.centre[i]!),
    'check:index': [1, 3, 6, 8].map((i) => ds.index.centre[i]!),
    'check:reaching': [0, 2, 4].map((i) => ds.reaching.centre[i]!),
    'check:index-outline': [...I.a, ...I.cap, ...I.b.slice().reverse()],
    // and each digit's tip, its outermost point on its centre line, and the ring finger's centre line
    'check:tips': (['thumb', 'index', 'reaching'] as const).map((d) => {
      const m = ds[d].centre.length;
      return step(ds[d].centre[m - 1]!, alongAt(ds[d], m - 1), ((ds[d].a[m - 1]! + ds[d].b[m - 1]!) / 2) * ds[d].tip);
    }),
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

/** How each shape is painted: in which layer, in what, and whether it is a smooth outline or a brush's ring. */
const PAINT: readonly { name: string; layer: 'back' | 'front'; fill: string; brush?: { width: number; opacity: number }; straight?: boolean }[] = [
  { name: 'slit', layer: 'back', fill: INK.gap, straight: true },
  { name: 'wedge', layer: 'back', fill: INK.gap, straight: true },
  { name: 'ring', layer: 'back', fill: INK.gap, straight: true },
  { name: 'nail', layer: 'front', fill: INK.nail },
  { name: 'freeEdge', layer: 'front', fill: INK.nailEdge },
  ...LINES.map((l) => ({ name: l.name, layer: l.layer, fill: l.ink ?? INK.line, brush: { width: l.width, opacity: l.opacity } })),
];
const BRUSHED = new Map(PAINT.filter((q) => q.brush).map((q) => [q.name, q.brush!]));
const STRAIGHT = new Set(PAINT.filter((q) => q.straight).map((q) => q.name));

/** A shape's path from its points on the frame: a smooth closed outline, a gap's straight-cut edges as the reference cuts them, or a brush's ring for a line. */
function pathOf(name: string, pts: readonly Pt[]): string {
  const b = BRUSHED.get(name);
  if (b) return brushRing(pts, b.width);
  if (STRAIGHT.has(name)) return `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  return smooth(pts);
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
  const outline = opts.part === 'back' ? 'back' : 'thumb';
  // The outline in the one skin, as the reference paints it, with no shade step at any edge.
  const clip = dr.id('c');
  dr.def(`<clipPath id="${clip}"><path data-shape="${outline}" d="${ds[outline]}"/></clipPath>`);
  // Everything painted on the layer stays inside its outline, so a gap drawn between the fingers ends at the hand's edge.
  const paint = PAINT.filter((q) => q.layer === opts.part).map((q) => {
    const opacity = q.brush ? ` opacity="${n(q.brush.opacity)}"` : '';
    return `<path data-shape="${q.name}" d="${ds[q.name]}" fill="${q.fill}"${opacity}/>`;
  });
  dr.add(
    `<g clip-path="url(#${clip})"><path data-shape="${outline}" d="${ds[outline]}" fill="${SKIN.face}"/>${paint.join('')}</g>`,
  );
  const { defs, body } = dr.parts();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HAND_STAMP_VIEW.w} ${HAND_STAMP_VIEW.h}" aria-hidden="true">${defs}${body}</svg>`;
}

/** Every shape's path `ms` into a turn, by its `data-shape` name, for redrawing the hand each frame of a turn. */
export function handStampShapesAt(ms: number): Record<string, string> {
  const pts = pointsAt(ms);
  return Object.fromEntries(Object.entries(pts).filter(([name]) => PAINT.some((q) => q.name === name) || name === 'back' || name === 'thumb').map(([name, p]) => [name, pathOf(name, p)]));
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
