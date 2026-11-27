/**
 * The living rounds of the animal gifts (gift-art-animals.ts): the sleeping kitten, the pen pal pigeon, the partridge,
 * Hevalo in his meadow, the wild goat and the horse. Each layer named here is painted by the gift's drawing under the
 * same name, back to front; parts that grow from another (an ear, a tail's tip) are hung on its joints.
 */
import type { Pt } from './svg.js';
import { giftLoop, type GiftLoop, type GiftLoopPose } from './gift-loop.js';
import { giftLoopBreath, giftLoopBreeze, giftLoopCarry, giftLoopChain, giftLoopPetal, giftLoopTrack, type GiftJoint } from './gift-loop-joints.js';
import { turn } from './gift-paint.js';
import {
  ASK_BUTTERFLY, ASK_DEER_AT, ASK_DEER_SCALE, ASK_POPPY_ROOT, ASK_TUFTS, HESP_KNEE, HESP_NECK, HESP_TAIL_ROOT, HESP_TASSEL, KEVOK_BEAK, KEVOK_NECK, KEVOK_PETALS,
  KEW_GRASS, KEW_NECK, KEW_TAIL_TURN, PEZKOVI_BEARD, PEZKOVI_EAR, PEZKOVI_NECK, PEZKOVI_TUFTS, PISIK_EARS, PISIK_HEAD_AT, PISIK_HEAD_TILT, PISIK_TAIL_JOINT,
} from './gift-art-animals.js';
import { characterArt } from '../characters/index.js';
import type { GiftArtId } from './gift-art.js';

// ─────────────────────────────────────────────────────────────────── pisîk

/** Where an ear of the kitten's tipped head meets it, `share` of the way from its front corner to its back one, on the frame. */
const earRoot = ([b0, , b1]: readonly [Pt, Pt, Pt], share = 0.5): Pt =>
  turn([[b0[0] + (b1[0] - b0[0]) * share, b0[1] + (b1[1] - b0[1]) * share]], PISIK_HEAD_AT[0], PISIK_HEAD_AT[1], PISIK_HEAD_TILT)[0]!;

/** Two slow breaths a round; the head on its paws rides up a little on each. */
const kittenBreath = (t: number): number => giftLoopBreath(2 * t);
const headRise = (t: number): number => -0.35 * kittenBreath(t);
const twitch = giftLoopTrack([[0, 0], [0.4, 0], [0.412, 8], [0.43, -1], [0.444, 4.5], [0.47, 0], [1, 0]]);
const curl = giftLoopTrack([[0, 0], [0.1, 0], [0.32, 7], [0.38, 6], [0.58, 0], [0.8, 0], [0.83, 3], [0.87, 0], [1, 0]]);

/** The kitten asleep: two slow breaths lifting its flank, one ear twitching at a dream, the tip of its tail curling and settling. */
const pisik = giftLoop(5600, {
  body: { box: [39, 52, 61, 40], origin: [70, 90], samples: 112, motion: (t) => ({ sx: 1 + 0.014 * kittenBreath(t), sy: 1 + 0.042 * kittenBreath(t) }) },
  earBack: { box: [25, 55, 15, 14], origin: earRoot(PISIK_EARS[0]!), samples: 112, motion: (t) => ({ y: headRise(t) }) },
  earFront: { box: [40, 48, 13, 16], origin: earRoot(PISIK_EARS[1]!, 0.15), samples: 140, motion: (t) => ({ y: headRise(t), rot: twitch(t) }) },
  head: { box: [24, 56, 35, 29], origin: [42, 80], samples: 112, motion: (t) => ({ y: headRise(t) }) },
  paws: { box: [30, 81, 25, 11] },
  tail: { box: [50, 77, 54, 22] },
  tailTip: { box: [38, 84, 18, 12], origin: PISIK_TAIL_JOINT, samples: 112, motion: (t) => giftLoopChain(PISIK_TAIL_JOINT, [[PISIK_TAIL_JOINT, curl(t)]]) },
});

// ─────────────────────────────────────────────────────────────────── kevok

/** Two quick nods, the second smaller: how far forward her head is, 0 to 1. */
const nod = giftLoopTrack([[0, 0], [0.104, 0], [0.133, 1], [0.18, 0], [0.2, 0], [0.225, 0.7], [0.27, 0], [1, 0]]);
/** The letter swinging on from each nod, and dying away. */
const swing = giftLoopTrack([
  [0, 0], [0.104, 0], [0.135, 3.5], [0.175, -3], [0.2, 1.4], [0.228, 3.6], [0.265, -2.8], [0.3, 1.8], [0.335, -1], [0.37, 0.5], [0.41, 0], [1, 0],
]);
const pigeonBlink = giftLoopTrack([[0, 0], [0.56, 0], [0.572, 1], [0.592, 1], [0.607, 0], [1, 0]]);
/** Her head thrust forward and bowed about her neck, as a pigeon nods. */
const nodding = (t: number): Pick<GiftLoopPose, 'x' | 'y' | 'rot'> => giftLoopChain(KEVOK_NECK, [[KEVOK_NECK, 3 * nod(t)]], [1.7 * nod(t), 0.5 * nod(t)]);

/** The pen pal pigeon: two quick nods that set her letter swinging, a blink, and almond petals drifting down. */
const kevok = giftLoop(4800, {
  head: { box: [34, 14, 49, 42], origin: KEVOK_NECK, samples: 160, motion: nodding },
  wing: { box: [10, 43, 51, 35] },
  lid: { box: [49, 27, 15, 15], origin: KEVOK_NECK, samples: 240, motion: (t) => ({ ...nodding(t), o: pigeonBlink(t) }) },
  letter: {
    box: [70, 39, 33, 26],
    origin: KEVOK_BEAK,
    samples: 160,
    motion: (t) => giftLoopChain(KEVOK_BEAK, [[KEVOK_NECK, 3 * nod(t)], [KEVOK_BEAK, swing(t)]], [1.7 * nod(t), 0.5 * nod(t)]),
  },
  bill: { box: [68, 33, 15, 11], origin: KEVOK_NECK, samples: 160, motion: nodding },
  blossoms: { box: [33, 90, 45, 14] },
  petal1: giftLoopPetal([104, 71, 7, 7], [KEVOK_PETALS[0]![0], KEVOK_PETALS[0]![1]], 0.06, { life: 0.55, fall: 30, drift: -14 }),
  petal2: giftLoopPetal([18, 77, 8, 6], [KEVOK_PETALS[1]![0], KEVOK_PETALS[1]![1]], 0.42, { life: 0.55, fall: 26, drift: -9, spin: -150 }),
});

// ───────────────────────────────────────────────────────────────────── kew

/** The head in a bird's quick turns and holds: up to the sky, down at the rock, a cock of the head, and home. */
const look = giftLoopTrack([[0, 0], [0.12, 0], [0.15, 4], [0.33, 4], [0.355, -2.2], [0.48, -2.2], [0.5, 1.2], [0.56, 1.2], [0.585, 0], [1, 0]]);
const flick = giftLoopTrack([[0, 0], [0.64, 0], [0.66, -6], [0.69, -4], [0.72, -5], [0.8, 0], [1, 0]]);
const kewBlink = giftLoopTrack([[0, 0], [0.86, 0], [0.872, 1], [0.892, 1], [0.906, 0], [1, 0]]);

/** The partridge on its rock: looking up and about in a bird's quick turns, a flick of its tail, a blink, the grass stirring. */
const kew = giftLoop(4400, {
  body: { box: [30, 46, 64, 47] },
  tail: { box: [88, 57, 14, 22], origin: KEW_TAIL_TURN, samples: 176, motion: (t) => ({ rot: flick(t) }) },
  head: { box: [21, 35, 29, 23], origin: KEW_NECK, samples: 176, motion: (t) => ({ rot: look(t) }) },
  lid: { box: [29, 41, 7, 6], origin: KEW_NECK, samples: 220, motion: (t) => ({ rot: look(t), o: kewBlink(t) }) },
  grass: { box: [91, 90, 10, 16], origin: KEW_GRASS, samples: 88, motion: (t) => ({ rot: 3 * giftLoopBreeze(t, 0, [1, 2]) }) },
});

// ───────────────────────────────────────────────────────────────────── ask

const DEER = characterArt('hevalo');
const RIG = DEER.rig!;
/** A point of Hevalo's own drawing, on the frame. */
const onDeer = ({ x, y }: { x: number; y: number }): Pt => [ASK_DEER_AT[0] + x * ASK_DEER_SCALE, ASK_DEER_AT[1] + y * ASK_DEER_SCALE];

/** The poppy swaying in the breeze, dipping as the butterfly lights on it and springing up as it leaves. */
const dip = giftLoopTrack([[0, 0], [0.49, 0], [0.52, 5], [0.58, 2.4], [0.65, 3.4], [0.72, 3], [0.78, -1.6], [0.85, 0], [1, 0]]);
const poppyJoints = (t: number): GiftJoint[] => [[ASK_POPPY_ROOT, 3 * giftLoopBreeze(t, 0.08) + dip(t)]];

/** The butterfly's way across the meadow, through [share of the round, x, y]; it rests on the poppy in between. */
const FLIGHT: ReadonlyArray<readonly [number, number, number]> = [
  [0.03, 1, 66], [0.06, 8, 62], [0.15, 22, 49], [0.25, 37, 60], [0.33, 56, 74], [0.41, 76, 66], [0.47, 90, 71], [0.5, ...ASK_BUTTERFLY],
  [0.72, ...ASK_BUTTERFLY], [0.78, 103, 62], [0.85, 111, 46], [0.89, 115, 38],
];
function flightAt(t: number): Pt {
  const i = Math.max(1, FLIGHT.findIndex(([at]) => at >= t));
  if (t <= FLIGHT[0]![0]) return [FLIGHT[0]![1], FLIGHT[0]![2]];
  if (t >= FLIGHT[FLIGHT.length - 1]![0]) return [FLIGHT[FLIGHT.length - 1]![1], FLIGHT[FLIGHT.length - 1]![2]];
  const p = (k: number): readonly [number, number, number] => FLIGHT[Math.max(0, Math.min(FLIGHT.length - 1, k))]!;
  const [p0, p1, p2, p3] = [p(i - 2), p(i - 1), p(i), p(i + 1)];
  const u = (t - p1[0]) / (p2[0] - p1[0]);
  const spline = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  return [spline(p0[1], p1[1], p2[1], p3[1]), spline(p0[2], p1[2], p2[2], p3[2])];
}
/** How much of the time it sits on the flower, carried as the flower moves. */
const perched = giftLoopTrack([[0, 0], [0.47, 0], [0.5, 1], [0.72, 1], [0.75, 0], [1, 0]]);
const flutterSeen = giftLoopTrack([[0, 0], [0.04, 0], [0.075, 1], [0.84, 1], [0.885, 0], [1, 0]]);
/** Where the butterfly is: on its way, or on the poppy's head wherever the breeze has it; gone, it waits where it comes in. */
const FLOWN = 0.95;
function butterflyAt(t: number): Pt {
  const [x, y] = flightAt(t >= FLOWN ? t - 1 : t);
  const [cx, cy] = giftLoopCarry(ASK_BUTTERFLY, poppyJoints(t));
  const w = perched(t);
  return [x + w * (cx - ASK_BUTTERFLY[0]), y + w * (cy - ASK_BUTTERFLY[1])];
}
const FLAPS = 30;
function butterfly(t: number): Partial<GiftLoopPose> {
  const [x, y] = butterflyAt(t);
  const w = perched(t);
  const beat = Math.abs(Math.cos(Math.PI * FLAPS * t));
  const rest = 0.5 + 0.5 * Math.cos((Math.PI * 2 * (t - 0.5)) / 0.11);
  const [ax] = butterflyAt(t - 0.004);
  const [bx] = butterflyAt(t + 0.004);
  const heading = 14 * Math.tanh((bx - ax) / 0.008 / 160);
  return {
    x: x - ASK_BUTTERFLY[0],
    y: y - ASK_BUTTERFLY[1] - (1 - w) * 0.8 * (1 - beat),
    rot: (1 - w) * heading + w * poppyJoints(t)[0]![1],
    sx: (1 - w) * (0.16 + 0.84 * beat) + w * (0.34 + 0.66 * rest),
    o: flutterSeen(t),
  };
}

/** Hevalo's eyes on the butterfly while it is about, as far as each can look, and home again once it has gone. */
const watching = giftLoopTrack([[0, 0], [0.06, 0], [0.11, 1], [0.86, 1], [0.92, 0], [1, 0]]);
function pupil(side: 'left' | 'right'): (t: number) => Partial<GiftLoopPose> {
  const { rest, centre } = RIG.look[side];
  const eye = onDeer(centre);
  return (t) => {
    const [bx, by] = butterflyAt(t);
    const [dx, dy] = [bx - eye[0], by - eye[1]];
    const far = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, far / 16);
    const w = watching(t);
    return {
      x: w * ASK_DEER_SCALE * (centre.x - rest.x + RIG.look.reach.x * reach * (dx / far)),
      y: w * ASK_DEER_SCALE * (centre.y - rest.y + RIG.look.reach.y * reach * (dy / far)),
    };
  };
}
const leftFlick = giftLoopTrack([[0, 0], [0.17, 0], [0.182, -12], [0.2, 3], [0.215, 0], [1, 0]]);
const rightPrick = giftLoopTrack([[0, 0], [0.49, 0], [0.52, -10], [0.6, -9], [0.612, -15], [0.63, -8], [0.7, -9], [0.76, 0], [1, 0]]);
const lidsHalf = giftLoopTrack([[0, 0], [0.895, 0], [0.904, 1], [0.913, 0], [0.94, 0], [0.949, 1], [0.958, 0], [1, 0]]);
const lidsShut = giftLoopTrack([[0, 0], [0.904, 0], [0.913, 1], [0.94, 1], [0.949, 0], [1, 0]]);

/**
 * Hevalo in his meadow: a butterfly flutters in past him and lights on a poppy, which dips under it; his eyes follow it,
 * an ear flicks as it passes and pricks as it lands, and he blinks once it has flown; the grass and the poppy sway.
 */
const ask = giftLoop(6000, {
  earLeft: { box: [42, 16, 12, 12], origin: onDeer(RIG.ears.left.pivot), samples: 200, motion: (t) => ({ rot: leftFlick(t) }) },
  earRight: { box: [66, 16, 12, 12], origin: onDeer(RIG.ears.right.pivot), samples: 200, motion: (t) => ({ rot: rightPrick(t) }) },
  face: { box: [48, 18, 24, 25] },
  pupilLeft: { box: [53, 26, 6, 7], samples: 150, motion: pupil('left') },
  pupilRight: { box: [61, 26, 6, 7], samples: 150, motion: pupil('right') },
  lidsHalf: { box: [50, 24, 20, 7], samples: 300, motion: (t) => ({ o: lidsHalf(t) }) },
  lidsShut: { box: [50, 24, 20, 11], samples: 300, motion: (t) => ({ o: lidsShut(t) }) },
  tuftLeft: { box: [20, 79, 12, 20], origin: ASK_TUFTS[0], samples: 120, motion: (t) => ({ rot: 4 * giftLoopBreeze(t, 0) }) },
  tuftRight: { box: [98, 79, 13, 19], origin: ASK_TUFTS[1], samples: 120, motion: (t) => ({ rot: 4 * giftLoopBreeze(t, 0.12) }) },
  poppy: { box: [88, 76, 13, 26], origin: ASK_POPPY_ROOT, samples: 200, motion: (t) => ({ rot: poppyJoints(t)[0]![1] }) },
  butterfly: { box: [89, 70, 13, 12], origin: ASK_BUTTERFLY, samples: 360, wrap: FLOWN, motion: butterfly },
});

// ───────────────────────────────────────────────────────────────── pezkovî

/** The goat lifting its head to look out over the valley, holding it there, and lowering it again. */
const lift = giftLoopTrack([[0, 0], [0.1, 0], [0.2, 5], [0.5, 5.4], [0.56, 3.6], [0.64, 4], [0.8, 0], [1, 0]]);
const goatEar = giftLoopTrack([[0, 0], [0.3, 0], [0.31, -14], [0.33, 2], [0.345, -9], [0.37, 0], [0.86, 0], [0.87, -10], [0.895, 0], [1, 0]]);
const neckJoint = (t: number): GiftJoint => [PEZKOVI_NECK, lift(t)];
/** The wind off the mountain, coming in gusts. */
const mountainWind = (t: number, lag: number): number => giftLoopBreeze(t, lag, [2, 5]);

/** The wild goat on its ledge: it lifts its head and looks out, flicks an ear, and the wind stirs its beard and the grass. */
const pezkovi = giftLoop(5400, {
  hornFar: { box: [31, 4, 47, 30], origin: PEZKOVI_NECK, samples: 108, motion: (t) => giftLoopChain(PEZKOVI_NECK, [neckJoint(t)]) },
  head: { box: [16, 27, 30, 27], origin: PEZKOVI_NECK, samples: 108, motion: (t) => giftLoopChain(PEZKOVI_NECK, [neckJoint(t)]) },
  beard: {
    box: [19, 44, 7, 11],
    origin: PEZKOVI_BEARD,
    samples: 108,
    motion: (t) => giftLoopChain(PEZKOVI_BEARD, [neckJoint(t), [PEZKOVI_BEARD, 5 * mountainWind(t, 0.05)]]),
  },
  ear: { box: [36, 31, 11, 6], origin: PEZKOVI_EAR, samples: 216, motion: (t) => giftLoopChain(PEZKOVI_EAR, [neckJoint(t), [PEZKOVI_EAR, goatEar(t)]]) },
  hornNear: { box: [28, 3, 47, 30], origin: PEZKOVI_NECK, samples: 108, motion: (t) => giftLoopChain(PEZKOVI_NECK, [neckJoint(t)]) },
  tuftLeft: { box: [16, 92, 8, 9], origin: PEZKOVI_TUFTS[0], samples: 108, motion: (t) => ({ rot: 9 * mountainWind(t, 0) }) },
  tuftRight: { box: [98, 94, 8, 9], origin: PEZKOVI_TUFTS[1], samples: 108, motion: (t) => ({ rot: 9 * mountainWind(t, 0.1) }) },
});

// ───────────────────────────────────────────────────────────────────── hesp

/** A toss of the head, up and down and settling; then a swish of the tail at a fly; then a front hoof lifted and set down. */
const toss = giftLoopTrack([[0, 0], [0.08, 0], [0.13, 5.6], [0.19, -2.6], [0.245, 1.3], [0.3, 0], [1, 0]]);
const tassel = giftLoopTrack([[0, 0], [0.1, 0], [0.14, -12], [0.2, 10], [0.26, -7], [0.32, 4], [0.38, -2], [0.44, 0], [1, 0]]);
/** The tail's swish, each strand of it following a beat behind the one before, a little further or less far. */
const swish = giftLoopTrack([[0, 0], [0.32, 0], [0.37, -9], [0.45, 3.5], [0.52, -2], [0.6, 0], [1, 0]]);
const hoofShift = giftLoopTrack([[0, 0], [0.64, 0], [0.69, -17], [0.73, -15], [0.78, -2], [0.795, 0], [1, 0]]);
const strand = (lag: number, reach: number) => (t: number): Partial<GiftLoopPose> => ({ rot: reach * swish(t - lag) - 1.6 * reach * giftLoopBreeze(t, lag) });
const neck = (t: number): GiftJoint => [HESP_NECK, toss(t)];

/** The horse in its wedding dress: it tosses its head and the tassel at its cheek swings, it swishes its tail, it shifts a hoof. */
const hesp = giftLoop(5200, {
  tail1: { box: [90, 44, 13, 42], origin: HESP_TAIL_ROOT, samples: 156, motion: strand(0, 1) },
  tail2: { box: [92, 44, 14, 42], origin: HESP_TAIL_ROOT, samples: 156, motion: strand(0.03, 1.25) },
  tail3: { box: [91, 44, 9, 42], origin: HESP_TAIL_ROOT, samples: 156, motion: strand(0.055, 0.85) },
  body: { box: [35, 38, 64, 36] },
  neck: { box: [14, 12, 46, 44], origin: HESP_NECK, samples: 156, motion: (t) => giftLoopChain(HESP_NECK, [neck(t)]) },
  tassel: { box: [24, 43, 7, 10], origin: HESP_TASSEL, samples: 156, motion: (t) => giftLoopChain(HESP_TASSEL, [neck(t), [HESP_TASSEL, tassel(t)]]) },
  cloth: { box: [53, 38, 34, 33] },
  legs: { box: [39, 55, 60, 47] },
  shin: { box: [40, 81, 11, 21], origin: HESP_KNEE, samples: 156, motion: (t) => ({ rot: hoofShift(t) }) },
  grass: { box: [35, 95, 64, 8] },
});

export const ANIMALS_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { pisik, kevok, kew, ask, pezkovi, hesp };
