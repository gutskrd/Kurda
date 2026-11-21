import type { Pt } from '../art/svg.js';
import { linearAt, n, n2, prefixFor, radialAt } from '../art/svg.js';
import { curve, ellipse, fill, line, part, taper, type Knot } from './pen.js';
import type { CharacterBox } from './types.js';

/**
 * Hevalo galloping after a winged apple, the apps' picture for a page that is on its way. He is drawn side on from his
 * own colours, and his stride is a gait rather than a set of poses: each hoof lands, stays planted while the ground
 * carries it back, then lifts, folds and swings forward again, the legs reaching for it with two joints each, so no
 * hoof ever slides. His body rocks up off the hind legs' push and down onto the front legs, and his head steadies
 * against it to keep his eye on the apple. The players lay `CHASE.frames` drawings of one stride and show each in
 * turn, and move the apple and its wings themselves, so nothing is drawn while it runs.
 */

/** The picture's box, in its own units: room for the antlers above and the dust behind. */
export const CHASE_VIEW: CharacterBox = { x: 30, y: -66, w: 310, h: 226 };

/** How the picture moves: one stride's length in time and in drawings, and the apple's bob, drift and wingbeat. */
export const CHASE = {
  strideMs: 500,
  frames: 15,
  /** the apple rises and falls this far, in units, once a stride */
  bob: 6,
  /** and drifts ahead and back this far, more slowly, as if teasing him */
  drift: 5,
  driftMs: 2500,
  /** each wingbeat: down fast in the first share of it, then up slower, between these angles in degrees */
  beatMs: 240,
  beatDown: 0.4,
  beatFrom: -24,
  beatTo: 44,
} as const;

/** Where the apple flies at rest, and where each wing is held to it, in the picture's units. */
export const CHASE_APPLE = { x: 300, y: 18, nearWing: { x: 298, y: 10 }, farWing: { x: 296, y: 8 } } as const;

const C = {
  furLight: '#cf9257',
  fur: '#be7b41',
  furShade: '#ad6835',
  farLeg: '#7d4a29',
  cream: '#f2d5a8',
  bib: '#e7c899',
  muzzle: '#ecc791',
  earIn: '#f2d3a6',
  antler: '#4f3029',
  antlerLight: '#6e4a40',
  antlerFar: '#3a1c1d',
  white: '#ffffff',
  pupil: '#4f2a23',
  nose: '#4a2a24',
  noseLight: '#8a655b',
  mouth: '#4a2822',
  hoof: '#5b3a2a',
  hoofFar: '#3f281d',
  freckle: '#e2ae76',
  apple: '#d8423a',
  appleLight: '#f06a55',
  appleDeep: '#a92c2a',
  leaf: '#5fa043',
  stem: '#5a3a26',
  wing: '#ffffff',
  wingShade: '#e6e1f2',
  wingVein: '#d7d0e8',
  dust: '#d8c4a2',
} as const;

const DEG = Math.PI / 180;
/** Where the ground is, and how far it carries a planted hoof back in one stride. */
const GROUND = 150;
const STRIDE = 96;
/** The share of a stride each hoof stays down. */
const DUTY = 0.3;

type P = Pt;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const rot = ([x, y]: P, a: number): P => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const smooth = (t: number): number => t * t * (3 - 2 * t);
const wrap = (x: number): number => ((x % 1) + 1) % 1;

interface Leg {
  /** where it hangs from on the body */
  at: P;
  /** its two bones */
  upper: number;
  lower: number;
  /** when its hoof lands, as a share of the stride */
  land: number;
  /** which way its middle joint bends: forward for a front leg's knee, back for a hind leg's hock */
  bend: 1 | -1;
  /** how full it is at the top */
  width: number;
}

/** The far legs land a little after the near ones, as a bounding deer's do. */
const LEGS: Record<'hindFar' | 'frontFar' | 'hindNear' | 'frontNear', Leg> = {
  hindFar: { at: [-38, 8], upper: 33, lower: 33, land: 0.06, bend: -1, width: 22 },
  frontFar: { at: [34, 14], upper: 30, lower: 30, land: 0.46, bend: 1, width: 15 },
  hindNear: { at: [-40, 10], upper: 33, lower: 33, land: 0, bend: -1, width: 26 },
  frontNear: { at: [32, 16], upper: 30, lower: 30, land: 0.4, bend: 1, width: 17 },
};

/** The body's middle and pitch over the stride: up off the hind legs' push, down onto the front legs. */
function bodyAt(phase: number): { at: P; pitch: number } {
  const y = 82 - 6 * Math.sin(2 * Math.PI * (phase - 0.12)) + 2 * Math.cos(4 * Math.PI * (phase - 0.2));
  return { at: [136, y], pitch: -9 * Math.sin(2 * Math.PI * (phase - 0.05)) * DEG };
}

/** Where a planted hoof first touches down and last pushes off, for a leg hanging from `hip`. */
const reach = (hip: P): { front: number; back: number } => {
  const front = hip[0] + STRIDE * DUTY * 0.55;
  return { front, back: front - STRIDE * DUTY };
};

/** A hoof over the stride: planted and carried back with the ground while down, then lifted and swung forward. */
function hoofAt(leg: Leg, phase: number, hip: P): P {
  const u = wrap(phase - leg.land);
  const { front, back } = reach(hip);
  if (u < DUTY) return [front - STRIDE * u, GROUND];
  const s = (u - DUTY) / (1 - DUTY);
  const lift = 26 * Math.sin(Math.PI * s) ** 1.2 + 6 * Math.sin(2 * Math.PI * s);
  return [back + (front - back) * smooth(s), GROUND - Math.max(0, lift)];
}

/** Two bones from `a` reaching for `b`, the joint bent to `bend`: where the joint and the end are. */
function reachFor(a: P, b: P, l1: number, l2: number, bend: number): { joint: P; end: P } {
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  const most = l1 + l2 - 0.01;
  if (d > most) {
    dx *= most / d;
    dy *= most / d;
  }
  const length = Math.min(d, most);
  const turn = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + length * length - l2 * l2) / (2 * l1 * length))));
  const k = Math.atan2(dy, dx) - bend * turn;
  return { joint: [a[0] + l1 * Math.cos(k), a[1] + l1 * Math.sin(k)], end: [a[0] + dx, a[1] + dy] };
}

/** A leg: full at the top, slim below its joint, a small dark hoof at the end. */
function legShape(leg: Leg, hip: P, phase: number, colour: string, hoof: string): string {
  const { joint, end } = reachFor(hip, hoofAt(leg, phase, hip), leg.upper, leg.lower, leg.bend);
  const along: P = [end[0] - joint[0], end[1] - joint[1]];
  const l = Math.hypot(along[0], along[1]) || 1;
  const toe: P = [end[0] + (along[0] / l) * 6, end[1] + (along[1] / l) * 6];
  const mid: P = [(hip[0] + joint[0]) / 2, (hip[1] + joint[1]) / 2];
  const front = leg.bend > 0;
  return fill(taper([hip, mid, joint, end], [leg.width, leg.width * (front ? 0.62 : 0.72), front ? 7 : 7.5, 5.6]), colour) + fill(taper([end, toe], [6.4, 5]), hoof);
}

/** His head side on, facing the apple: a round skull, the snout forward, a big eye, the ear back and the antlers up. */
function head(p: string, at: P, tilt: number): string {
  const T = (x: number, y: number): P => add(rot([x, y], tilt), at);
  const K = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([x, y, r]) => [...T(x, y), r ?? 1] as const);
  const skull = K([[-26, -6], [-22, -24], [-6, -33], [12, -30], [26, -18], [36, -8], [46, 2], [50, 10, 0.8], [46, 18], [32, 22], [14, 24], [-6, 22], [-22, 14]]);
  const muzzle = K([[30, 2], [42, -2], [50, 6], [50, 15], [42, 21], [30, 20], [24, 12]]);
  const nose = K([[45, 0], [52, 3], [53, 9, 0.7], [47, 10], [43, 6]]);
  const ear = K([[-16, -24], [-34, -46], [-54, -52, 0.5], [-46, -34], [-26, -14]]);
  const earIn = K([[-21, -26], [-36, -44], [-49, -48, 0.5], [-43, -36], [-28, -20]]);
  // A main beam curving up and back, a tine forward low on it and a fork at its top, every end rounded, as his own.
  const antler = (dx: number, colour: string, light: string): string => {
    const cap = (pt: P, r: number): string => ellipse(pt[0], pt[1], r, r, colour);
    const beam = [T(-2 + dx, -28), T(-7 + dx, -44), T(-6 + dx, -58), T(-1 + dx, -70)];
    const brow = [T(-6 + dx, -41), T(5 + dx, -46), T(11 + dx, -54)];
    const fork = [T(-6 + dx, -57), T(-14 + dx, -64), T(-18 + dx, -72)];
    return (
      fill(taper(beam, [11, 9.5, 8.5, 7]), colour) +
      cap(beam[3]!, 3.5) +
      fill(taper(brow, [8, 7, 6]), colour) +
      cap(brow[2]!, 3) +
      fill(taper(fork, [7.5, 6.5, 5.5]), colour) +
      cap(fork[2]!, 2.75) +
      fill(taper([T(-4 + dx, -42), T(-3.5 + dx, -55), T(dx, -66)], [2.6, 2.4, 1.8]), light)
    );
  };
  const eye = T(14, -10);
  // His eye on the apple, ahead and a little up.
  const pupil = add(eye, rot([3, -1], tilt));
  return part(
    [radialAt(`${p}skull`, [[0, C.furLight], [0.6, C.fur], [1, C.furShade]], ...T(10, -12), 46)],
    [
      antler(-9, C.antlerFar, C.antlerFar),
      fill(curve(ear), C.furShade),
      fill(curve(earIn), C.earIn),
      fill(curve(skull), `url(#${p}skull)`),
      fill(curve(muzzle), C.muzzle),
      ellipse(...T(0, 6), 3.2, 2.4, C.freckle),
      ellipse(...T(8, 10), 2.6, 2, C.freckle),
      ellipse(...eye, 11.5, 13, C.white),
      ellipse(...pupil, 6.2, 8.6, C.pupil),
      ellipse(...add(pupil, [-2.2, -3.4]), 2.4, 2.4, C.white),
      fill(curve(nose), C.nose),
      ellipse(...T(47, 3.5), 2.6, 1.3, C.noseLight),
      line(`M${n(T(40, 15)[0])},${n(T(40, 15)[1])}Q${n(T(44, 18)[0])},${n(T(44, 18)[1])} ${n(T(48, 15)[0])},${n(T(48, 15)[1])}`, C.mouth, 1.6),
      antler(0, C.antler, C.antlerLight),
    ],
  );
}

/** The dust each hind hoof kicks up as it leaves the ground: a puff that drifts back slower than the ground, growing and fading. */
function dust(phase: number, hipAt: (leg: Leg) => P): string {
  return [LEGS.hindNear, LEGS.hindFar]
    .map((leg) => {
      const age = wrap(phase - (leg.land + DUTY));
      if (age >= 0.8) return '';
      const x = reach(hipAt(leg)).back - 4 - STRIDE * 0.55 * age;
      const r = 6 + 14 * age;
      const a = (1 - age / 0.8) * 0.85;
      return (
        ellipse(x, GROUND - r * 0.5, r, r * 0.68, C.dust, ` fill-opacity="${n2(a)}"`) +
        ellipse(x - r * 0.95, GROUND - r * 0.28, r * 0.62, r * 0.46, C.dust, ` fill-opacity="${n2(a * 0.8)}"`)
      );
    })
    .join('');
}

/** Hevalo at `phase` of his stride (0 to 1), with his dust, in `CHASE_VIEW`'s units; ids start with `p`. */
function gallop(p: string, phase: number): string {
  const body = bodyAt(phase);
  const B = (x: number, y: number): P => add(rot([x, y], body.pitch), body.at);
  const hip = (leg: Leg): P => B(...leg.at);
  const K = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([x, y, r]) => [...B(x, y), r ?? 1] as const);
  // The tail, a tuft up off the rump, flicking with the stride.
  const flick = (-40 + 14 * Math.sin(2 * Math.PI * (phase + 0.2))) * DEG;
  const tail = (from: P, a: P, b: P, widths: readonly number[], colour: string): string => fill(taper([from, add(from, rot(a, flick)), add(from, rot(b, flick))], widths), colour);
  // His head, steadied against the body's rocking.
  const headAt = B(56, -54);
  const tilt = -body.pitch * 0.7 + 2 * Math.sin(2 * Math.PI * (phase - 0.1)) * DEG;
  const thigh = B(-36, 6);
  return [
    dust(phase, hip),
    legShape(LEGS.hindFar, hip(LEGS.hindFar), phase, C.farLeg, C.hoofFar),
    legShape(LEGS.frontFar, hip(LEGS.frontFar), phase, C.farLeg, C.hoofFar),
    tail(B(-50, -14), [-10, -6], [-16, -12], [9, 8, 2], C.furShade),
    tail(B(-52, -12), [-9, -4], [-13, -8], [5, 5, 1.5], C.cream),
    part(
      [linearAt(`${p}body`, [[0, C.furLight], [0.55, C.fur], [1, C.furShade]], ...B(0, -24), ...B(0, 24))],
      [
        fill(curve(K([[-54, -6], [-44, -20], [-20, -24], [10, -22], [34, -24], [50, -16], [56, 0], [50, 18], [30, 24], [0, 22], [-30, 22], [-50, 14]])), `url(#${p}body)`),
        fill(curve(K([[-36, 16], [-10, 20], [20, 21], [42, 18], [36, 23], [10, 25], [-20, 24]])), C.bib),
      ],
    ),
    fill(taper([B(34, -6), B(46, -28), add(headAt, rot([-10, 12], tilt))], [34, 28, 24]), C.fur),
    fill(taper([B(48, 4), B(56, -18), add(headAt, rot([2, 16], tilt))], [10, 12, 8]), C.bib),
    legShape(LEGS.hindNear, hip(LEGS.hindNear), phase, C.furShade, C.hoof),
    legShape(LEGS.frontNear, hip(LEGS.frontNear), phase, C.fur, C.hoof),
    ellipse(...thigh, 17, 19, C.fur, ` transform="rotate(${n(body.pitch / DEG - 10)} ${n(thigh[0])} ${n(thigh[1])})"`),
    head(p, headAt, tilt),
  ].join('');
}

/** One of the stride's drawings, `index` of `CHASE.frames`; ids start with `p`. */
export const chaseFrame = (index: number, p: string): string => gallop(`${p}${index}-`, wrap(index / CHASE.frames));

/** The ground he runs on, in `colour`, the dust's line across the picture. */
export const chaseGround = (colour: string): string => `<rect x="40" y="${GROUND}" width="290" height="3" rx="1.5" fill="${colour}"/>`;

/** The apple at rest, without its wings: red with a light on it, its stem and a leaf; ids start with `p`. */
export function chaseApple(p: string): string {
  const { x, y } = CHASE_APPLE;
  const k = 1.18;
  const at = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([dx, dy, r]) => [x + dx * k, y + dy * k, r ?? 1] as const);
  return part(
    [radialAt(`${p}apple`, [[0, C.appleLight], [0.55, C.apple], [1, C.appleDeep]], x - 6, y - 6, 24)],
    [
      fill(curve(at([[0, -13, 0.6], [8, -16], [15, -9], [16, 3], [9, 14], [0, 12, 0.8], [-9, 14], [-16, 3], [-15, -9], [-8, -16]])), `url(#${p}apple)`),
      ellipse(x - 7, y - 5, 3.4, 5, C.white, ' fill-opacity="0.5"'),
      line(`M${x},${y - 13}Q${x + 1},${y - 19} ${x + 3},${y - 22}`, C.stem, 2.4),
      fill(curve([[x + 2, y - 18, 1], [x + 10, y - 25, 1], [x + 16, y - 21, 0.5], [x + 9, y - 17, 1]]), C.leaf),
    ],
  );
}

/** One of the apple's wings at rest, held at its root (`CHASE_APPLE`): a rounded wing with three feather tips. */
export function chaseWing(side: 'near' | 'far'): string {
  const near = side === 'near';
  const root = near ? CHASE_APPLE.nearWing : CHASE_APPLE.farWing;
  const size = near ? 1.4 : 1.25;
  const lean = (near ? 10 : 18) * DEG;
  const T = (x: number, y: number): P => add(rot([x * size, y * size], lean), [root.x, root.y]);
  const K = (pts: readonly (readonly [number, number, number?])[]): Knot[] => pts.map(([x, y, r]) => [...T(x, y), r ?? 1] as const);
  const wing = K([[0, 0, 0.6], [-6, -8], [-14, -15], [-24, -19, 0.5], [-20, -12], [-27, -12, 0.5], [-21, -6], [-25, -3, 0.5], [-16, 0], [-8, 3]]);
  const vein = K([[-2, -2], [-10, -8], [-18, -11], [-12, -4], [-6, 0]]);
  return fill(curve(wing), near ? C.wing : C.wingShade) + fill(curve(vein), near ? C.wingShade : C.wingVein);
}

/** The picture's parts as standalone drawings in `CHASE_VIEW`, for a player that lays them; ids start with `idPrefix`. */
export function chaseArt(options: { ground: string; idPrefix?: string }): { frames: string[]; ground: string; apple: string; nearWing: string; farWing: string } {
  const p = `${prefixFor(options.idPrefix ?? 'hvchase')}-`;
  const svg = (inner: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CHASE_VIEW.x} ${CHASE_VIEW.y} ${CHASE_VIEW.w} ${CHASE_VIEW.h}" aria-hidden="true" focusable="false">${inner}</svg>`;
  return {
    frames: Array.from({ length: CHASE.frames }, (_, i) => svg(chaseFrame(i, p))),
    ground: svg(chaseGround(options.ground)),
    apple: svg(chaseApple(p)),
    nearWing: svg(chaseWing('near')),
    farWing: svg(chaseWing('far')),
  };
}
