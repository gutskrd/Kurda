/**
 * The living rounds of the flower gifts (gift-art-flowers.ts): the rose, the chamomile, the tulips, the narcissus, the
 * iris and the bouquet. Each layer named here is painted by the gift's drawing under the same name, back to front; a
 * bloom or a leaf is hung on the joints of the stem it grows from, so it sways with it and nods on it.
 */
import type { Pt } from './svg.js';
import { giftLoop, type GiftLoop, type GiftLoopPose } from './gift-loop.js';
import { giftLoopBreeze, giftLoopChain, giftLoopPetal, giftLoopTrack, type GiftJoint } from './gift-loop-joints.js';
import {
  BEYBUN_LEAVES, BEYBUN_STEMS, DESTE_PETAL, DESTE_ROSE, DESTE_TAG, DESTE_TILT, DESTE_WAIST, GUL_FOOT, GUL_KNOT, GUL_NECK, GUL_PETAL, GUL_TWIGS,
  LALE_BUD_STEM, LALE_LEAVES, LALE_STEM, LALE_TULIP, NERGIZ_KNOT, NERGIZ_LEAVES, NERGIZ_STEMS, SOSIN_BUD_STEM, SOSIN_PETALS, SOSIN_STEM, SOSIN_SWORDS,
} from './gift-art-flowers.js';
import type { GiftArtId } from './gift-art.js';

/** A part's pose on its chain of joints, as a round's motion wants it. */
const hung = (origin: Pt, joints: (t: number) => GiftJoint[]) => (t: number): Partial<GiftLoopPose> => giftLoopChain(origin, joints(t));

// ───────────────────────────────────────────────────────────────────── gul

const gulStem = (t: number): GiftJoint => [GUL_FOOT, 1.1 * giftLoopBreeze(t)];

/** The rose held by its stem in a breeze: the bloom nods on it, its leaves stir, the twine's ends lift, and a petal lets go. */
const gul = giftLoop(6000, {
  stem: { box: [51, 54, 14, 62], origin: GUL_FOOT, samples: 120, motion: hung(GUL_FOOT, (t) => [gulStem(t)]) },
  twigLeft: {
    box: [22, 58, 39, 24],
    origin: GUL_TWIGS[0],
    samples: 120,
    motion: hung(GUL_TWIGS[0]!, (t) => [gulStem(t), [GUL_TWIGS[0]!, 2.6 * giftLoopBreeze(t, 0.06, [2, 5])]]),
  },
  twigRight: {
    box: [55, 79, 40, 22],
    origin: GUL_TWIGS[1],
    samples: 120,
    motion: hung(GUL_TWIGS[1]!, (t) => [gulStem(t), [GUL_TWIGS[1]!, -2.2 * giftLoopBreeze(t, 0.11, [2, 5])]]),
  },
  twineLeft: {
    box: [47, 100, 10, 14],
    origin: GUL_KNOT,
    samples: 120,
    motion: hung(GUL_KNOT, (t) => [gulStem(t), [GUL_KNOT, 7 * giftLoopBreeze(t, 0.03, [2, 5])]]),
  },
  twineRight: {
    box: [52, 100, 10, 15],
    origin: GUL_KNOT,
    samples: 120,
    motion: hung(GUL_KNOT, (t) => [gulStem(t), [GUL_KNOT, 6 * giftLoopBreeze(t, 0.09, [2, 5])]]),
  },
  bow: { box: [42, 95, 26, 11], origin: GUL_KNOT, samples: 120, motion: hung(GUL_KNOT, (t) => [gulStem(t)]) },
  bloom: { box: [28, 3, 70, 64], origin: GUL_NECK, samples: 120, motion: hung(GUL_NECK, (t) => [gulStem(t), [GUL_NECK, 2.4 * giftLoopBreeze(t, 0.05)]]) },
  petal: giftLoopPetal([41, 38, 7, 9], [GUL_PETAL[0], GUL_PETAL[1]], 0.18, { life: 0.62, fall: 44, drift: -9, spin: -120, sway: 3, turns: 0.8 }),
}, { base: 'none' });

// ─────────────────────────────────────────────────────────────────── beybûn

const [TALL, LEFT, RIGHT, BUD] = BEYBUN_STEMS;
/** A dip of a head on its stem and back, as a breath of air catches it: 0 to 1. */
const dipAt = (at: number): ((t: number) => number) => giftLoopTrack([[0, 0], [at, 0], [at + 0.08, 1], [at + 0.13, 0.75], [at + 0.24, 0], [1, 0]]);
const [dipLeft, dipTall, dipRight, dipBud] = [dipAt(0.12), dipAt(0.42), dipAt(0.66), dipAt(0.5)];
const tall = (t: number): GiftJoint => [TALL![0], 1.2 * giftLoopBreeze(t, 0.04)];
/** A head's pose: carried by its stem, dipped on its tip by `deg` at the dip's full, and tipped toward us a little. */
const nodding = (stems: (t: number) => GiftJoint[], tip: Pt, deg: number, dip: (t: number) => number) => (t: number): Partial<GiftLoopPose> => ({
  ...giftLoopChain(tip, [...stems(t), [tip, deg * dip(t)]]),
  sy: 1 - 0.08 * dip(t),
});

/** The chamomile in its jug: the stems sway on the jug's lip, each head dipping in turn as the air catches it, the leaves stirring. */
const beybun = giftLoop(5600, {
  stemTall: { box: [49, 48, 13, 54], origin: TALL![0], samples: 112, motion: hung(TALL![0], (t) => [tall(t)]) },
  stemLeft: { box: [34, 58, 18, 44], origin: LEFT![0], samples: 112, motion: hung(LEFT![0], (t) => [[LEFT![0], 1.6 * giftLoopBreeze(t, 0)]]) },
  stemRight: { box: [51, 64, 34, 38], origin: RIGHT![0], samples: 112, motion: hung(RIGHT![0], (t) => [[RIGHT![0], 1.8 * giftLoopBreeze(t, 0.09)]]) },
  stemBud: { box: [53, 30, 22, 48], origin: BUD![0], samples: 112, motion: hung(BUD![0], (t) => [tall(t), [BUD![0], 2 * giftLoopBreeze(t, 0.07, [2, 3])]]) },
  leafLeft: {
    box: [28, 74, 26, 20],
    origin: BEYBUN_LEAVES[0],
    samples: 112,
    motion: hung(BEYBUN_LEAVES[0]!, (t) => [[BEYBUN_LEAVES[0]!, 2.4 * giftLoopBreeze(t, 0.02, [2, 5])]]),
  },
  leafRight: {
    box: [55, 86, 31, 15],
    origin: BEYBUN_LEAVES[1],
    samples: 112,
    motion: hung(BEYBUN_LEAVES[1]!, (t) => [[BEYBUN_LEAVES[1]!, -2.4 * giftLoopBreeze(t, 0.1, [2, 5])]]),
  },
  leafHigh: {
    box: [40, 50, 16, 22],
    origin: BEYBUN_LEAVES[2],
    samples: 112,
    motion: hung(BEYBUN_LEAVES[2]!, (t) => [tall(t), [BEYBUN_LEAVES[2]!, 3 * giftLoopBreeze(t, 0.05, [2, 5])]]),
  },
  jug: { box: [36, 78, 35, 35] },
  bud: {
    box: [66, 25, 13, 12],
    origin: BUD![1],
    samples: 168,
    motion: nodding((t) => [tall(t), [BUD![0], 2 * giftLoopBreeze(t, 0.07, [2, 3])]], BUD![1], 12, dipBud),
  },
  headLeft: { box: [22, 46, 28, 20], origin: LEFT![1], samples: 168, motion: nodding((t) => [[LEFT![0], 1.6 * giftLoopBreeze(t, 0)]], LEFT![1], -11, dipLeft) },
  headRight: {
    box: [72, 54, 24, 18],
    origin: RIGHT![1],
    samples: 168,
    motion: nodding((t) => [[RIGHT![0], 1.8 * giftLoopBreeze(t, 0.09)]], RIGHT![1], 11, dipRight),
  },
  headTall: { box: [44, 28, 33, 29], origin: TALL![1], samples: 168, motion: nodding((t) => [tall(t)], TALL![1], 8, dipTall) },
});

// ───────────────────────────────────────────────────────────────────── lale

/** A point of the big tulip's own drawing, on the frame. */
function onTulip([x, y]: Pt): Pt {
  const a = (LALE_TULIP.deg * Math.PI) / 180;
  const [sx, sy] = [x * LALE_TULIP.scale, y * LALE_TULIP.scale];
  return [LALE_TULIP.at[0] + sx * Math.cos(a) - sy * Math.sin(a), LALE_TULIP.at[1] + sx * Math.sin(a) + sy * Math.cos(a)];
}
const [TEPAL_LEFT, TEPAL_RIGHT] = [onTulip([-0.6, 11]), onTulip([0.6, 11])];
/** The tulip opening a little as the sun warms it, and closing again. */
const opening = giftLoopTrack([[0, 0], [0.12, 0], [0.42, 1], [0.6, 1], [0.9, 0], [1, 0]]);
const tulipJoints = (t: number): GiftJoint[] => [[LALE_STEM[0], 1.2 * giftLoopBreeze(t)], [LALE_STEM[1], 1.6 * giftLoopBreeze(t, 0.05)]];

/** The mountain tulips: swaying from the earth, the big one opening a little to the sun and closing, the bud nodding behind. */
const lale = giftLoop(6000, {
  budStem: {
    box: [38, 68, 17, 38],
    origin: LALE_BUD_STEM[0],
    samples: 120,
    motion: hung(LALE_BUD_STEM[0], (t) => [[LALE_BUD_STEM[0], 1.6 * giftLoopBreeze(t, 0.1)]]),
  },
  bud: {
    box: [25, 48, 29, 26],
    origin: LALE_BUD_STEM[1],
    samples: 120,
    motion: hung(LALE_BUD_STEM[1], (t) => [[LALE_BUD_STEM[0], 1.6 * giftLoopBreeze(t, 0.1)], [LALE_BUD_STEM[1], 2.6 * giftLoopBreeze(t, 0.15, [2, 3])]]),
  },
  ground: { box: [24, 95, 70, 18] },
  leafLeft: {
    box: [22, 57, 40, 49],
    origin: LALE_LEAVES[0],
    samples: 120,
    motion: hung(LALE_LEAVES[0]!, (t) => [[LALE_LEAVES[0]!, 1.3 * giftLoopBreeze(t, 0.03, [1, 2])]]),
  },
  leafRight: {
    box: [58, 62, 35, 44],
    origin: LALE_LEAVES[1],
    samples: 120,
    motion: hung(LALE_LEAVES[1]!, (t) => [[LALE_LEAVES[1]!, 1.5 * giftLoopBreeze(t, 0.12, [1, 2])]]),
  },
  stem: { box: [55, 50, 9, 56], origin: LALE_STEM[0], samples: 120, motion: hung(LALE_STEM[0], (t) => tulipJoints(t).slice(0, 1)) },
  leafSmall: {
    box: [56, 81, 18, 25],
    origin: LALE_LEAVES[2],
    samples: 120,
    motion: hung(LALE_LEAVES[2]!, (t) => [[LALE_LEAVES[2]!, 2.2 * giftLoopBreeze(t, 0.07, [2, 3])]]),
  },
  tulipBack: { box: [45, 13, 34, 38], origin: LALE_STEM[1], samples: 120, motion: hung(LALE_STEM[1], tulipJoints) },
  tulipLeft: { box: [38, 19, 23, 35], origin: TEPAL_LEFT, samples: 120, motion: hung(TEPAL_LEFT, (t) => [...tulipJoints(t), [TEPAL_LEFT, -3.6 * opening(t)]]) },
  tulipRight: { box: [59, 20, 25, 35], origin: TEPAL_RIGHT, samples: 120, motion: hung(TEPAL_RIGHT, (t) => [...tulipJoints(t), [TEPAL_RIGHT, 3.6 * opening(t)]]) },
  tulipFront: { box: [49, 16, 26, 40], origin: LALE_STEM[1], samples: 120, motion: hung(LALE_STEM[1], tulipJoints) },
  grass: { box: [27, 96, 66, 14] },
});

// ─────────────────────────────────────────────────────────────────── nêrgiz

/** Each stem of the bunch swaying from its cut end, the wind reaching them one after another; each bunch of flowers nods on it. */
const narcissusStem = (i: number) => (t: number): GiftJoint => [NERGIZ_STEMS[i]![0], [1.2, 1, 1.3][i]! * giftLoopBreeze(t, [0, 0.05, 0.1][i]!)];
const narcissusHeads = (i: number) => (t: number): GiftJoint[] => [
  narcissusStem(i)(t),
  [NERGIZ_STEMS[i]![1], [3, 2.6, 3.4][i]! * giftLoopBreeze(t, [0.04, 0.09, 0.14][i]!, [2, 3])],
];
const narcissusLeaf = (i: number, deg: number, lag: number) => (t: number): GiftJoint[] => [[NERGIZ_LEAVES[i]!, deg * giftLoopBreeze(t, lag)]];

/** The narcissus bunch: its stems and flat leaves swaying one after another, each bunch of flowers nodding, the ribbon's ends lifting. */
const nergiz = giftLoop(5200, {
  leafLeft: { box: [29, 51, 29, 63], origin: NERGIZ_LEAVES[0], samples: 104, motion: hung(NERGIZ_LEAVES[0]!, narcissusLeaf(0, 1.5, 0.02)) },
  leafRight: { box: [56, 57, 41, 57], origin: NERGIZ_LEAVES[1], samples: 104, motion: hung(NERGIZ_LEAVES[1]!, narcissusLeaf(1, 1.4, 0.12)) },
  stemLeft: { box: [39, 38, 20, 76], origin: NERGIZ_STEMS[0]![0], samples: 104, motion: hung(NERGIZ_STEMS[0]![0], (t) => [narcissusStem(0)(t)]) },
  stemMid: { box: [54, 28, 15, 86], origin: NERGIZ_STEMS[1]![0], samples: 104, motion: hung(NERGIZ_STEMS[1]![0], (t) => [narcissusStem(1)(t)]) },
  stemRight: { box: [56, 48, 28, 66], origin: NERGIZ_STEMS[2]![0], samples: 104, motion: hung(NERGIZ_STEMS[2]![0], (t) => [narcissusStem(2)(t)]) },
  leafMid: { box: [49, 43, 12, 70], origin: NERGIZ_LEAVES[2], samples: 104, motion: hung(NERGIZ_LEAVES[2]!, narcissusLeaf(2, 1.7, 0.07)) },
  flowersLeft: { box: [24, 20, 29, 34], origin: NERGIZ_STEMS[0]![1], samples: 156, motion: hung(NERGIZ_STEMS[0]![1], narcissusHeads(0)) },
  flowersMid: { box: [55, 10, 28, 27], origin: NERGIZ_STEMS[1]![1], samples: 156, motion: hung(NERGIZ_STEMS[1]![1], narcissusHeads(1)) },
  flowersRight: { box: [72, 30, 28, 32], origin: NERGIZ_STEMS[2]![1], samples: 156, motion: hung(NERGIZ_STEMS[2]![1], narcissusHeads(2)) },
  ribbon: { box: [50, 91, 16, 11] },
  ribbonLeft: { box: [45, 94, 15, 13], origin: NERGIZ_KNOT, samples: 156, motion: (t) => ({ rot: 6 * giftLoopBreeze(t, 0.02, [2, 5]) }) },
  ribbonRight: { box: [56, 94, 12, 16], origin: NERGIZ_KNOT, samples: 156, motion: (t) => ({ rot: 5 * giftLoopBreeze(t, 0.08, [2, 5]) }) },
  bow: { box: [46, 87, 24, 12] },
}, { base: 'none' });

// ──────────────────────────────────────────────────────────────────── sosin

/** The iris unfurling a touch and settling: its standards parting, its falls lifting. */
const unfurl = giftLoopTrack([[0, 0], [0.1, 0], [0.4, 1], [0.55, 0.85], [0.68, 1], [0.92, 0], [1, 0]]);
const irisStem = (t: number): GiftJoint => [SOSIN_STEM[0], giftLoopBreeze(t)];
const irisFlower = (t: number): GiftJoint[] => [irisStem(t), [SOSIN_STEM[1], 1.4 * giftLoopBreeze(t, 0.05)]];
/** A petal of the flower: carried by it, and opened `deg` from its heart at the unfurling's full. */
const irisPetal = (at: Pt, deg: number, sway = 0) => hung(at, (t) => [...irisFlower(t), [at, deg * unfurl(t) + sway * giftLoopBreeze(t, 0.1, [2, 3])]]);
const sword = (i: number, deg: number, lag: number) => hung(SOSIN_SWORDS[i]!, (t) => [[SOSIN_SWORDS[i]!, deg * giftLoopBreeze(t, lag)]]);

/** The iris: its standards parting and its falls lifting as the flower unfurls a touch, swaying on its stem among its leaves. */
const sosin = giftLoop(6000, {
  swordLeft: { box: [29, 54, 29, 62], origin: SOSIN_SWORDS[0], samples: 120, motion: sword(0, 1.2, 0.02) },
  swordRight: { box: [63, 61, 32, 55], origin: SOSIN_SWORDS[1], samples: 120, motion: sword(1, 1.3, 0.1) },
  stem: { box: [56, 60, 7, 56], origin: SOSIN_STEM[0], samples: 120, motion: hung(SOSIN_STEM[0], (t) => [irisStem(t)]) },
  swordMid: { box: [43, 69, 18, 47], origin: SOSIN_SWORDS[2], samples: 120, motion: sword(2, 1.6, 0.06) },
  bud: {
    box: [57, 48, 25, 42],
    origin: SOSIN_BUD_STEM,
    samples: 120,
    motion: hung(SOSIN_BUD_STEM, (t) => [irisStem(t), [SOSIN_BUD_STEM, 2.4 * giftLoopBreeze(t, 0.08, [2, 3])]]),
  },
  fallLeft: { box: [25, 45, 32, 28], origin: SOSIN_PETALS.fallLeft, samples: 120, motion: irisPetal(SOSIN_PETALS.fallLeft, 3.5) },
  fallRight: { box: [63, 45, 32, 28], origin: SOSIN_PETALS.fallRight, samples: 120, motion: irisPetal(SOSIN_PETALS.fallRight, -3.5) },
  standardLeft: { box: [42, 16, 20, 30], origin: SOSIN_PETALS.standardLeft, samples: 120, motion: irisPetal(SOSIN_PETALS.standardLeft, -3) },
  standardRight: { box: [58, 16, 20, 29], origin: SOSIN_PETALS.standardRight, samples: 120, motion: irisPetal(SOSIN_PETALS.standardRight, 3) },
  standardTop: { box: [50, 10, 21, 37], origin: SOSIN_PETALS.top, samples: 120, motion: irisPetal(SOSIN_PETALS.top, 0) },
  fallFront: { box: [48, 49, 25, 32], origin: SOSIN_PETALS.front, samples: 120, motion: irisPetal(SOSIN_PETALS.front, 0, 1.6) },
}, { base: 'none' });

// ─────────────────────────────────────────────────────────────── desteya gulan

/** A point of the bouquet as drawn upright, on the frame, where it is tipped. */
function tipped([x, y]: Pt): Pt {
  const a = (DESTE_TILT.deg * Math.PI) / 180;
  const [dx, dy] = [x - DESTE_TILT.at[0], y - DESTE_TILT.at[1]];
  return [DESTE_TILT.at[0] + dx * Math.cos(a) - dy * Math.sin(a), DESTE_TILT.at[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}
const [WAIST, ROSE_FOOT, TAG_KNOT] = [tipped(DESTE_WAIST), tipped(DESTE_ROSE), tipped(DESTE_TAG)];
const bouquet = (t: number): GiftJoint => [WAIST, 0.6 * giftLoopBreeze(t)];

/** The bouquet held at its waist: its flowers swaying in the paper, the front rose nodding and letting a petal go, the ribbon's tails and the tag lifting. */
const desteGul = giftLoop(5600, {
  greensLeft: { box: [1, 6, 52, 62], origin: WAIST, samples: 112, motion: hung(WAIST, (t) => [[WAIST, 1.3 * giftLoopBreeze(t, 0.03, [1, 2])]]) },
  greensRight: { box: [78, 35, 37, 27], origin: WAIST, samples: 112, motion: hung(WAIST, (t) => [[WAIST, -1.2 * giftLoopBreeze(t, 0.09, [1, 2])]]) },
  blooms: { box: [10, 4, 104, 68], origin: WAIST, samples: 112, motion: hung(WAIST, (t) => [bouquet(t)]) },
  rose: { box: [39, 26, 40, 31], origin: ROSE_FOOT, samples: 112, motion: hung(ROSE_FOOT, (t) => [bouquet(t), [ROSE_FOOT, 1.6 * giftLoopBreeze(t, 0.06)]]) },
  wrap: { box: [6, 48, 106, 69] },
  tailLeft: { box: [49, 88, 16, 26], origin: WAIST, samples: 168, motion: (t) => ({ rot: 5 * giftLoopBreeze(t, 0.02, [2, 5]) }) },
  tailRight: { box: [60, 88, 20, 23], origin: WAIST, samples: 168, motion: (t) => ({ rot: 4.4 * giftLoopBreeze(t, 0.07, [2, 5]) }) },
  bow: { box: [43, 76, 38, 19] },
  tag: { box: [62, 90, 28, 19], origin: TAG_KNOT, samples: 168, motion: (t) => ({ rot: 4 * giftLoopBreeze(t, 0.05, [2, 3]) }) },
  petal: giftLoopPetal([47, 47, 7, 7], [DESTE_PETAL[0], DESTE_PETAL[1]], 0.2, { life: 0.55, fall: 26, drift: -6, spin: 140, sway: 2.4, turns: 0.9 }),
});

export const FLOWERS_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { gul, beybun, lale, nergiz, sosin, 'deste-gul': desteGul };
