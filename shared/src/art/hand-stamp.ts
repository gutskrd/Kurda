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
const CURLED: Build = { a: [29, 27, 26, 25], b: [30, 29, 28, 27], tip: 1.1 };

/**
 * The bones, on the grid: the thumb's from its joint to its tip and back to its root, and how far its root bone turns
 * from in line with its tip toward a point below the frame; the index finger's from its tip joint to its tip and from its middle joint back to its knuckle and root; the
 * middle finger's from its joint to its tip. How far each tip's round runs past the point it rounds about, to find
 * that point from a tip's outermost point.
 */
const BONES = { thumb: { tip: 163, root: 300, round: 63, bend: 0.2 }, index: { tip: 125, knuckle: 150, root: 260 }, reaching: { tip: 85, round: 43 } } as const;
const THUMB_ROOT: Pt = [736, 900];
const CURLED_REST: readonly Pt[] = [[702, 688], [630, 690], [580, 692], [552, 694]];

/* ---- the turn ----------------------------------------------------------------------------------------------------- */

/**
 * One turn of the reference, frame by frame, 80 ms apart, as measured from it on the grid (which lies over the
 * reference's own frame). Angles are in degrees, clockwise from pointing right as on the screen, each the way a
 * segment points toward its tip. For each frame:
 * - `thumb`: the middle its tip rounds about, and the middle of the thumb across its joint;
 * - `index`: the middle of the crease at its middle joint and at its tip joint (both on its inner side), and the way
 *   its tip segment and its root segment point;
 * - `reaching`: the middle finger's outermost point, the way its tip points and the way its root points, and how far
 *   its root runs under the thumb: as the reference shows it, and where the reference hides it (behind the stamp or
 *   the thumb), placed between the frames either side, under what hides it;
 * - `ring`: how far the ring finger has slid from where it rests (down out of the frame, as the reference's goes, while the
 *   middle finger takes its place at the stamp's turn);
 * - `card`: the stamp's lean from rest and its turn about its upright, and its middle;
 * - `web`: how far the hand has opened between the index finger and the thumb, 0 to 1, as far down as the background
 *   shows between them.
 * The index finger stays on the stamp's back except while the stamp is held a third turned, when the stamp turns off
 * it and it waits, curled, a finger's width from the stamp's edge; the middle finger then holds the stamp's far edge.
 */
interface Frame {
  thumb: readonly [number, number, number, number];
  index: readonly [number, number, number, number, number, number];
  reaching: readonly [number, number, number, number, number];
  ring: readonly [number, number];
  card: readonly [number, number, number, number];
  web: number;
}
const TRACK: readonly Frame[] = [
  { thumb: [690, 493, 720, 670], index: [908, 653, 825, 571, -150.1, -100.7], reaching: [462, 590, 165, 165, 100], ring: [0, 0], card: [0, 0, 645.1, 302.9], web: 0 },
  { thumb: [694, 492, 712, 670], index: [920, 652, 835, 563, -151.4, -94.8], reaching: [459, 587, 163.8, 163.8, 100], ring: [-4, 0], card: [-1.2, 0, 641, 297.4], web: 0 },
  { thumb: [687, 487, 705, 670], index: [928, 650, 850, 550, -153.7, -93.1], reaching: [443, 505, 191.7, 191.7, 100], ring: [-20, 4], card: [-5.2, 0, 624.4, 288.4], web: 0 },
  { thumb: [680, 484, 689, 672], index: [945, 645, 866, 541, -155.4, -92.2], reaching: [445, 454, 220.8, 195, 150], ring: [-40, 0], card: [-12.3, 0, 596.7, 280.6], web: 0.3 },
  { thumb: [666, 470, 668, 665], index: [994, 637, 911, 543, -152.1, -79.3], reaching: [448, 403, 249.8, 200, 200], ring: [-45, 0], card: [-15.8, 30, 571.8, 287.9], web: 1 },
  { thumb: [666, 473, 675, 668], index: [1027, 636, 942, 531, -160.1, -72.2], reaching: [448, 398, 256.3, 200, 200], ring: [-40, 5], card: [-16.2, 33, 570.3, 296.7], web: 1 },
  { thumb: [673, 479, 678, 670], index: [1040, 635, 956, 526, -165.5, -70.3], reaching: [448, 398, 256.3, 200, 200], ring: [-32, 8], card: [-16, 34, 568, 303.1], web: 1 },
  { thumb: [687, 506, 714, 650], index: [919, 612, 826, 499, -150.8, -98.6], reaching: [455, 409, 255, 200, 200], ring: [-10, 12], card: [-14.2, 32, 578.4, 298.6], web: 0.5 },
  { thumb: [705, 505, 792, 658], index: [896, 614, 803, 492, -137.2, -104.5], reaching: [505, 366, 236.3, 226, 250], ring: [-30, 60], card: [-59.4, 84, 547, 312], web: 0 },
  { thumb: [620, 400, 680, 660], index: [890, 620, 805, 493, -132.6, -104.3], reaching: [502, 503, 205.6, 200, 100], ring: [-30, 60], card: [-53.4, 92, 589, 287], web: 0 },
  { thumb: [623, 464, 645, 655], index: [875, 627, 787, 526, -146.5, -109.8], reaching: [500, 640, 175, 175, 70], ring: [-20, 90], card: [-64.1, 130, 555, 406], web: 0.4 },
  { thumb: [648, 481, 675, 670], index: [852, 643, 755, 533, -141.4, -104.7], reaching: [490, 680, 151.4, 151.4, 70], ring: [-10, 90], card: [-61.9, 148, 536, 435], web: 0.3 },
  { thumb: [659, 489, 685, 669], index: [879, 654, 759, 556, -143.4, -95.5], reaching: [492, 680, 142.5, 142.5, 70], ring: [0, 80], card: [-45.2, 154, 574, 419], web: 0 },
  { thumb: [680, 493, 703, 663], index: [890, 644, 799, 557, -145.1, -95.4], reaching: [494, 680, 133.5, 133.5, 90], ring: [10, 50], card: [-16.3, 157, 642.8, 344.7], web: 0 },
  { thumb: [687, 492, 710, 662], index: [900, 658, 812, 574, -149.7, -95.6], reaching: [476, 623, 153.4, 153.4, 100], ring: [12, 12], card: [-5, 166, 640.3, 328.2], web: 0 },
  { thumb: [698, 489, 714, 662], index: [906, 657, 818, 576, -149.8, -96.8], reaching: [466, 609, 159.4, 159.4, 100], ring: [8, 7], card: [-3.1, 174, 641.4, 319.8], web: 0 },
  { thumb: [701, 493, 712, 660], index: [908, 656, 822, 573, -149.5, -95], reaching: [466, 601, 160.5, 160.5, 100], ring: [4, 4], card: [1.2, 178, 641.7, 316.9], web: 0 },
];
const FLIP_FRAME_MS = 80;

/** How long one turn takes, and how far through it the stamp is edge-on and shows its other face. */
export const HAND_STAMP_FLIP = { ms: TRACK.length * FLIP_FRAME_MS, edgeOn: 9 / TRACK.length } as const;

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

const toward = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const heading = ([x, y]: Pt): number => (Math.atan2(y, x) * 180) / Math.PI;
const step = ([x, y]: Pt, [dx, dy]: Pt, k: number): Pt => [x + dx * k, y + dy * k];
const unit = ([x, y]: Pt): Pt => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
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

/**
 * The thumb in a frame of the track: its tip's middle as measured, its tip bone pointing the way the reference's does,
 * and its root bone between in line with it and toward a point below the frame, so it swings with its tip from the
 * wrist rather than bending sideways at its joint, which seen from the nail a thumb barely does.
 */
function thumbIn(f: Frame): Posed {
  const [ex, ey, jx, jy] = f.thumb;
  const way = heading([ex - jx, ey - jy]);
  const joint = step([ex, ey], toward(way), -BONES.thumb.tip);
  const below = heading([joint[0] - THUMB_ROOT[0], joint[1] - THUMB_ROOT[1]]);
  const root = step(joint, toward(way + BONES.thumb.bend * (below - way)), -BONES.thumb.root);
  return placed(THUMB, [root, joint, [ex, ey]], [3, 3]);
}

/** The index finger in a frame of the track: its joints lie halfway into it from their creases, toward its back. */
function indexIn(f: Frame): Posed {
  const [mx, my, dx, dy, tipWay, rootWay] = f.index;
  const middleWay = heading([dx - mx, dy - my]);
  const middle = step([mx, my], toward((middleWay + rootWay) / 2 + 90), 35);
  const last = step([dx, dy], toward((middleWay + tipWay) / 2 + 90), 30);
  const joints = [step(middle, toward(rootWay), -BONES.index.root), step(middle, toward(rootWay), -BONES.index.knuckle), middle, last, step(last, toward(tipWay), BONES.index.tip)];
  return placed(INDEX, joints, [1, 2, 3, 2]);
}

/** The middle finger in a frame of the track, its root under the thumb. */
function reachingIn(f: Frame): Posed {
  const [rx, ry, way, rootWay, rootLength] = f.reaching;
  const tip = step([rx, ry], toward(way), -BONES.reaching.round);
  const joint = step(tip, toward(way), -BONES.reaching.tip);
  return placed(REACHING, [step(joint, toward(rootWay), -rootLength), joint, tip], [2, 2]);
}

/** The poses, one per frame of the track and the rest it starts and ends at. */
interface Pose {
  digits: Record<DigitName, Posed>;
  web: number;
}
const POSES: readonly Pose[] = (() => {
  return [...TRACK, TRACK[0]!].map((f) => {
    const thumb = thumbIn(f);
    const curled = f.ring;
    return {
      digits: {
        thumb,
        index: indexIn(f),
        reaching: reachingIn(f),
        curled: { centre: CURLED_REST.map(([x, y]) => [x + curled[0], y + curled[1]] as Pt), a: CURLED.a, b: CURLED.b, tip: CURLED.tip },
      },
      web: f.web,
    };
  });
})();
/** The stamp's track, ending where it began but turned over, its other face showing. */
const CARD_TRACK = [...TRACK.map((f) => f.card), [TRACK[0]!.card[0], 180, TRACK[0]!.card[2], TRACK[0]!.card[3]] as const];


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
const WEDGE_DEEP = held('reaching', [[660, 478], [632, 486], [612, 494]]);
/** Where the wedge and its deepest part close, under the thumb: held on the middle finger like the rest of them, so neither can fold. */
const WEDGE_SHUT = held('reaching', [[676, 478]]);
const WEDGE_DEEP_SHUT = held('reaching', [[668, 490]]);

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
  { name: 'curled-joint', on: held('curled', [[578, 676], [574, 692], [578, 708]]), width: 0.8, opacity: 0.6, layer: 'back' },
];

/** How far from `p` along `n` the line first meets the polyline `line`, or a long way if it never does. */
function reachOf(p: Pt, n: Pt, line: readonly Pt[]): number {
  let best = 400;
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = [line[i]!, line[i + 1]!];
    const [sx, sy] = [b[0] - a[0], b[1] - a[1]];
    const den = n[0] * sy - n[1] * sx;
    if (!den) continue;
    const [qx, qy] = [a[0] - p[0], a[1] - p[1]];
    const t = (qx * sy - qy * sx) / den;
    const g = (qx * n[1] - qy * n[0]) / den;
    if (g >= 0 && g <= 1 && t > -200 && t < best) best = t;
  }
  return best;
}

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
  const back = [
    ...I.a,
    ...I.cap,
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => sideAt(ds.index, 8 + ((web.index - 8) * k) / 6, -1)),
    ...webEdge,
    ...ride(CROTCH, ds),
    wedgeTop[1]!,
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
  // The gap between the index finger and the thumb: down the finger's inner side from a little above the web (the web's
  // own edge clips it) to the frame's foot, then back up across the gap, each point straight out from its point on the
  // finger as far as the thumb's edge and a little under it, or barely off the finger where the thumb lies over it, so
  // the gap closes up rather than folding over itself.
  const inner = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => web.index + 0.4 - (web.index + 0.4 - 1.2) * (k / 7));
  // (the thumb's edge drawn on past its root and its tip, so the line across meets it wherever the thumb lies)
  const edge = [step(T.a[0]!, unit([T.a[0]![0] - T.a[1]![0], T.a[0]![1] - T.a[1]![1]]), 400), ...T.a, ...T.cap.slice(0, 2)];
  const [e1, e2] = [edge[edge.length - 2]!, edge[edge.length - 1]!];
  edge.push(step(e2, unit([e2[0] - e1[0], e2[1] - e1[1]]), 400));
  // (all straight out the same way, from the middle of that stretch of the finger, so none can cross another)
  const [side, middle] = [sideAt(ds.index, inner[4]!, -1), onDigit(ds.index, inner[4]!, 0)];
  const way = unit([side[0] - middle[0], side[1] - middle[1]]);
  const across = inner.map((u) => {
    const p = sideAt(ds.index, u, -1);
    return { p, d: Math.min(160, reachOf(p, way, edge)) };
  });
  const out = (k: number, by: number): Pt => step(across[k]!.p, way, Math.max(2, across[k]!.d + by));
  const slit = [...across.map((q) => q.p), ...[7, 6, 5, 4, 3, 2, 1, 0].map((k) => out(k, 40))];
  // and its deepest part, a strip along the thumb's edge low in the gap, from under the thumb to a little way out from
  // it, never past the index finger
  const finger = [step(I.b[0]!, unit([I.b[0]![0] - I.b[1]![0], I.b[0]![1] - I.b[1]![1]]), 400), ...I.b];
  const low = [1.8, 2.2, 2.6, 3, 3.4].map((u) => {
    const p = sideAt(ds.thumb, u, 1);
    const n = unit([p[0] - onDigit(ds.thumb, u, 0)[0], p[1] - onDigit(ds.thumb, u, 0)[1]]);
    return { p, n, d: reachOf(p, n, finger) };
  });
  const slitDeep = [...low.map((q, k) => step(q.p, q.n, Math.max(1, Math.min(18 - 3 * k, q.d - 2)))), ...low.slice().reverse().map((q) => step(q.p, q.n, -24))];
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
    pad: [onDigit(ds.thumb, ds.thumb.centre.length - 0.3, 0)],
    // for checking the drawing, not drawn: each digit's joints, root to tip, and the index finger's whole outline
    'check:thumb': [0, 3, 6].map((i) => ds.thumb.centre[i]!),
    'check:index': [1, 3, 6, 8].map((i) => ds.index.centre[i]!),
    'check:reaching': [0, 2, 4].map((i) => ds.reaching.centre[i]!),
    'check:index-outline': [...I.a, ...I.cap, ...I.b.slice().reverse()],
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
const CARD_BENDS = [0, 1, 2, 3].map((c) => splineBends(CARD_TRACK.map((q) => q[c]!)));

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
  return Object.fromEntries(Object.entries(pts).filter(([name]) => PAINT.some((q) => q.name === name) || name === 'back' || name === 'thumb').map(([name, p]) => [name, pathOf(name, p)]));
}

/**
 * For checking the drawing, `ms` into a turn, on the frame: each digit's joints from root to tip (the thumb's, the
 * index finger's from its knuckle, the middle finger's), the index finger's whole outline, and the thumb's pad.
 */
export function handStampBonesAt(ms: number): { joints: Record<'thumb' | 'index' | 'reaching', Pt[]>; index: Pt[]; pad: Pt } {
  const pts = pointsAt(ms);
  return { joints: { thumb: pts['check:thumb']!, index: pts['check:index']!, reaching: pts['check:reaching']! }, index: pts['check:index-outline']!, pad: pts.pad![0]! };
}

/** Every shape's points `ms` into a turn, on the frame, for checking the drawing. */
export function handStampPointsAt(ms: number): Record<string, Pt[]> {
  return pointsAt(ms);
}

/** The stamp `ms` into a turn: its middle on the frame, its lean and its turn about its upright, as the reference moves it. */
export function handStampCardAt(ms: number): { cx: number; cy: number; lean: number; turn: number } {
  const t = (Math.max(0, Math.min(HAND_STAMP_FLIP.ms, ms)) / HAND_STAMP_FLIP.ms) * (POSES.length - 1);
  const [lean, flip, x, y] = [0, 1, 2, 3].map((k) => onSpline(CARD_TRACK.map((q) => q[k]!), CARD_BENDS[k]!, t));
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
