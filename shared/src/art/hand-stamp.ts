/**
 * A hand holding up a game's stamp to show it, for the front page's games moment, and how it turns the stamp over to
 * the next. Seen from the front and a little below: the thumb upright in front pinching the stamp's foot, the index
 * finger behind it on the right, long and bent at its joints, running down to its knuckle, the middle finger reaching
 * out to the left under the stamp, and the ring finger curled below it. Flat colour in the skin of the hand holding the
 * phone (hand-paint.ts) with its one shade step, the gaps between the digits in the antlers' brown, and a few thin warm
 * lines. Only the roots of the thumb and the index finger, where they become the palm, leave the frame, at its foot.
 *
 * Two layers on one frame: `back` (the fingers behind the stamp) and `front` (the thumb), so an app can lay
 * the stamp (`HAND_STAMP_CARD`) between them. Each digit is a group marked `data-part`, turning about its own knuckle
 * (its `transform-origin`, in the frame's units); `handStampFlip` gives every part's transforms through one turn.
 */
import { Drawing, n, prefixFor, type Pt } from './svg.js';
import { SKIN, flat, line, smooth } from './hand-paint.js';

/** The frame in drawing units, room for the whole hand and the stamp all through a turn. */
export const HAND_STAMP_VIEW = { w: 312, h: 236 } as const;

/**
 * Where the stamp is held at rest: a box `w` by `h` centred on (`cx`, `cy`), turned `turn` degrees. The thumb covers
 * only its foot: the top `clear` units of it, where its picture goes, are never covered.
 */
export const HAND_STAMP_CARD = { cx: 130.4, cy: 90.1, w: 100, h: 128, turn: 9, clear: 100 } as const;

/** The gaps between the digits, in the dark brown of Hevalo's antlers, and the nail, a step paler than the skin. */
const GAP = '#4f3029';
const NAIL = '#efcdb4';

/** The hand is laid out on a grid three times the frame's size; this places a point of that grid on the frame. */
const K = 0.33;
const at = ([x, y]: Pt): Pt => [(x - 250) * K, (y - 30) * K];
const shape = (points: readonly Pt[]): string => smooth(points.map(at));
const stroke = (points: readonly Pt[], width = 0.8, opacity = 0.75): string =>
  `<path d="${line(points.map(at))}" fill="none" stroke="${SKIN.crease}" stroke-width="${n(width)}" stroke-linecap="round" opacity="${n(opacity)}"/>`;

/**
 * A digit's outline from its centre line (base to tip) and its half-width at each point: two even sides and a round
 * tip, the base left open where it runs into the palm. Built this way every finger keeps one width along its length,
 * with no lumps.
 */
function digitOutline(centre: readonly Pt[], half: readonly number[]): Pt[] {
  const m = centre.length;
  const along = (i: number): Pt => {
    const [a, b] = [centre[Math.max(0, i - 1)]!, centre[Math.min(m - 1, i + 1)]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const side = (i: number, s: number): Pt => {
    const [tx, ty] = along(i);
    return [centre[i]![0] - ty * half[i]! * s, centre[i]![1] + tx * half[i]! * s];
  };
  const right = centre.map((_, i) => side(i, 1));
  const left = centre.map((_, i) => side(i, -1)).reverse();
  const [tx, ty] = along(m - 1);
  const [ex, ey] = centre[m - 1]!;
  const r = half[m - 1]!;
  // Round the tip from the one side to the other.
  const cap: Pt[] = [];
  for (let k = -3; k <= 3; k++) {
    const a = (k * 26 * Math.PI) / 180;
    cap.push([ex + r * (tx * Math.cos(a) + ty * Math.sin(a)), ey + r * (ty * Math.cos(a) - tx * Math.sin(a))]);
  }
  return [...right, ...cap, ...left];
}

/** A digit's group, turning about its knuckle. */
const group = (part: string, knuckle: Pt, inner: string): string => {
  const [x, y] = at(knuckle);
  return `<g data-part="${part}" style="transform-origin:${n(x)}px ${n(y)}px">${inner}</g>`;
};

/** Each digit's centre line, base to tip, its half-widths, its knuckle, and the joint its tip bends at. */
const THUMB = {
  centre: [[734, 900], [728, 800], [722, 725], [712, 660], [704, 590], [698, 525], [696, 482]] as Pt[],
  half: [76, 75, 72, 69, 65, 60, 57],
  knuckle: [716, 760] as Pt,
  joint: 4,
};
const INDEX = {
  centre: [[972, 900], [966, 800], [958, 730], [940, 664], [902, 610], [866, 568], [822, 530], [784, 500], [762, 482]] as Pt[],
  half: [66, 64, 60, 57, 55, 52, 47, 43, 41],
  knuckle: [960, 760] as Pt,
  joint: 5,
};
const REACHING = {
  centre: [[700, 598], [630, 605], [570, 613], [528, 619], [506, 622]] as Pt[],
  half: [44, 43, 41, 38, 36],
  knuckle: [690, 600] as Pt,
};
const CURLED = {
  centre: [[700, 688], [622, 690], [568, 692], [538, 694]] as Pt[],
  half: [30, 29, 27, 26],
  knuckle: [690, 692] as Pt,
};

/**
 * The gaps in shadow: between the thumb and the index finger, running down out of the frame, above the reaching
 * finger, and above the curled one. Each lies partly under the digits beside it, so only the gap between them shows.
 */
const GAP_INDEX: readonly Pt[] = [
  [766, 520],
  [792, 560],
  [834, 606],
  [866, 650],
  [890, 700],
  [904, 760],
  [912, 900],
  [780, 900],
  [775, 800],
  [770, 700],
  [764, 600],
];
const GAP_REACHING: readonly Pt[] = [
  [586, 534],
  [650, 524],
  [655, 590],
  [618, 572],
];
const GAP_CURLED: readonly Pt[] = [
  [616, 668],
  [662, 662],
  [668, 720],
  [632, 714],
];

/** A digit in two pieces, the tip a group of its own bending at the joint; below the joint it is rounded off under the tip. */
const jointed = (digit: { centre: Pt[]; half: number[]; joint: number }, part: string, fill: string, onTip = ''): { base: string; tip: string } => ({
  base: flat(shape(digitOutline(digit.centre.slice(0, digit.joint + 1), digit.half.slice(0, digit.joint + 1))), fill),
  tip: group(part, digit.centre[digit.joint]!, flat(shape(digitOutline(digit.centre.slice(digit.joint), digit.half.slice(digit.joint))), fill) + onTip),
});

export interface HandStampOptions {
  /** `back`: the fingers behind the stamp; `front`: the thumb over its foot. */
  part: 'back' | 'front';
  idPrefix?: string;
}

/** One layer of the hand holding a stamp on its frame (`HAND_STAMP_VIEW`), clear all round. It is decoration. */
export function handStampSvg(opts: HandStampOptions): string {
  const dr = new Drawing(prefixFor(opts.idPrefix, 'hand-stamp', opts.part));
  if (opts.part === 'back') {
    // Each gap goes down before the finger beside it, so the finger's edge stays clean against it; the ring finger,
    // furthest back, is a shade step down.
    dr.add(group('curled', CURLED.knuckle, flat(shape(GAP_CURLED), GAP) + flat(shape(digitOutline(CURLED.centre, CURLED.half)), SKIN.shade)));
    dr.add(group('reaching', REACHING.knuckle, flat(shape(GAP_REACHING), GAP) + flat(shape(digitOutline(REACHING.centre, REACHING.half)), SKIN.face)));
    const index = jointed(INDEX, 'index-tip', SKIN.face, stroke([[846, 584], [866, 568], [884, 552]]));
    dr.add(group('index', INDEX.knuckle, flat(shape(GAP_INDEX), GAP) + index.base + index.tip));
  } else if (opts.part === 'front') {
    const [nx, ny] = at([698, 508]);
    const thumb = jointed(
      THUMB,
      'thumb-tip',
      SKIN.face,
      // The nail, round and pale, and the one crease at the knuckle below it.
      `<ellipse cx="${n(nx)}" cy="${n(ny)}" rx="${n(40 * K)}" ry="${n(43 * K)}" fill="${NAIL}" stroke="${SKIN.crease}" stroke-width="0.7" stroke-opacity="0.7"/>` +
        stroke([[678, 604], [702, 598], [728, 602]]),
    );
    // Where the thumb meets the curled finger, a line, below the gap there.
    dr.add(group('thumb', THUMB.knuckle, thumb.base + stroke([[640, 680], [643, 704], [647, 728]], 0.8, 0.6) + thumb.tip));
  } else {
    throw new RangeError(`art: no hand-stamp part called ${String(opts.part)}`);
  }
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
const HAND_POSES: Record<Exclude<HandStampPart, 'card'>, readonly (readonly [number, number, number])[]> = {
  hand: [[0, 0, 0], [0, 0, 0.5], [0, -1, 1], [0, -1.5, 1.5], [0, -2, 0], [0, -2, -1], [0, -2, -1], [5.7, -5.1, -5], [15.7, -12, -14], [22, -17, -20], [13.5, -9.3, -12], [5.7, -3.1, -5], [2.3, -1, -2], [0, 0, 0.8], [0, 0, 0.6], [0, 0, 0.2], [0, 0, 0], [0, 0, 0]],
  thumb: [[0, 0, 0], [0, 0, 0.5], [0, 0, 1], [0, -1, 2], [-2, -4, -6], [-3, -5, -8], [-3, -5, -9], [-2, -4, -6], [-1, -2, -4], [0, -1, -3], [0, 0, -1], [0, 0, 1], [0, 0, 1], [0, 0, 0.5], [0, 0, 0.3], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  'thumb-tip': [[0, 0, 0], [0, 0, 0], [0, 0, -1], [0, 0, -2], [0, 0, 4], [0, 0, 6], [0, 0, 6], [0, 0, 8], [0, 0, 12], [0, 0, 14], [0, 0, 8], [0, 0, 2], [0, 0, 0], [0, 0, -1], [0, 0, -0.5], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
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
  thumb: at(THUMB.knuckle),
  'thumb-tip': at(THUMB.centre[THUMB.joint]!),
  index: at(INDEX.knuckle),
  'index-tip': at(INDEX.centre[INDEX.joint]!),
  reaching: at(REACHING.knuckle),
  curled: at(CURLED.knuckle),
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
      const [dx, dy, turn] = pose(HAND_POSES[part], t);
      return `translate(${n(dx!)}px, ${n(dy!)}px) rotate(${n(turn!)}deg)`;
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
