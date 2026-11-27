/**
 * The living rounds of the gifts from the old stories (gift-art-lore.ts): Kawa's hammer by its embers, and Şahmaran.
 * Each layer named here is painted by the gift's drawing under the same name, back to front.
 */
import { giftLoop, giftLoopSmooth, giftLoopSweep, type GiftLoop, type GiftLoopBeat, type GiftLoopBox, type GiftLoopPlan, type GiftLoopPose } from './gift-loop.js';
import { CROWN_GLEAM, SAHMARAN_CHAINS } from './gift-art-lore.js';
import type { GiftArtId } from './gift-art.js';

const TAU = Math.PI * 2;
const wave = (t: number, k: number, phase = 0): number => Math.sin(TAU * k * t + phase);

/** The embers' unsteady breath, about -1 to 1, its quicker tremors at whole turns of the round so it loops. */
const ember = (t: number): number => 0.55 * wave(t, 2, 0.6) + 0.28 * wave(t, 5, 2.3) + 0.17 * wave(t, 9, 4.1);

// ──────────────────────────────────────────────────────────────────── kawa

/**
 * A spark leaving the embers at `born` of its own round: it flares as it lifts off, rises `lift` units drifting with the
 * heat, twinkling, and is spent before it is born again.
 */
function spark(ms: number, born: number, lift: number, drift: number): GiftLoopPlan {
  return {
    box: [0, 0, 120, 120],
    ms,
    wrap: born,
    samples: 40,
    motion: (t) => {
      const u = (((t - born) % 1) + 1) % 1;
      const seen = u < 0.08 ? giftLoopSmooth(u / 0.08) : 1 - giftLoopSmooth((u - 0.08) / 0.92);
      const x = drift * u + 0.8 * Math.sin(TAU * u * 1.5 + born * 9);
      return { x, y: -lift * (1 - (1 - u) * (1 - u) * 0.35) * u, o: seen * (0.8 + 0.2 * Math.sin(TAU * u * 5)) };
    },
  };
}

/** Light running along the hammer's burnished edge, from its near end to its far, once a round. */
const GLINT_RUN: readonly [number, number] = [44 * 0.98 * Math.cos((44 * Math.PI) / 180), 44 * 0.98 * Math.sin((44 * Math.PI) / 180)];
const glint = (t: number): Partial<GiftLoopPose> => {
  const u = Math.max(0, (t - 0.52) / 0.3);
  // spent at the far end, it goes back to the near one unseen
  const run = u < 1 ? giftLoopSmooth(u) : 0;
  return { x: GLINT_RUN[0] * run, y: GLINT_RUN[1] * run, o: u < 1 ? Math.sin(Math.PI * u) ** 1.5 : 0 };
};

/** The hammer: the fire's light breathing on it and on the stone, the embers glowing, sparks rising, a glint along its edge. */
const kawa = giftLoop(4800, {
  heat: { box: [40, 33, 39, 38], samples: 96, motion: (t) => ({ o: 0.4 + 0.35 * ember(t) }) },
  flank: { box: [91, 75, 11, 27], samples: 96, motion: (t) => ({ o: 0.5 + 0.45 * ember(t - 0.02) }) },
  glow: { box: [96, 97, 15, 8], origin: [103.6, 101], samples: 96, motion: (t) => ({ o: 0.8 + 0.2 * ember(t), sx: 1 + 0.08 * ember(t), sy: 1 + 0.08 * ember(t) }) },
  coals: { box: [97, 98, 13, 6] },
  hot: { box: [97, 99, 12, 4], samples: 96, motion: (t) => ({ o: 0.82 + 0.18 * ember(t + 0.03) }) },
  spark1: spark(1600, 0.1, 26, 3),
  spark2: spark(2400, 0.55, 30, -2),
  spark3: spark(1200, 0.8, 22, 4),
  spark4: spark(1600, 0.6, 28, 1.5),
  spark5: spark(2400, 0.05, 24, 5),
  spark6: spark(1200, 0.35, 20, -1),
  glint: { box: [58, 11, 10, 10], samples: 96, wrap: 0.83, motion: glint },
});

// ───────────────────────────────────────────────────────────────── şahmaran

/** Where a point the painting measures in the photograph's pixels lies on the frame (gift-art-lore.ts). */
const onFrame = ([x, y]: readonly [number, number]): [number, number] => [12 + x * 2 * (96 / 820), 26.5 + y * 2 * (96 / 820)];

const CROWN_BOXES: readonly GiftLoopBox[] = [[76, 38, 5, 7], [76, 26, 10, 21], [79, 28, 9, 19], [82, 36, 8, 13], [84, 37, 6, 12]];
const CHAIN_BOXES: readonly GiftLoopBox[] = [[67, 46, 3, 10], [70, 48, 3, 12], [96, 48, 3, 8], [92, 49, 3, 11]];

/** A light crossing the gold of her crown, step by step, once a round. */
const gleam = Object.fromEntries(
  giftLoopSweep(CROWN_GLEAM, 900, 1500, 0.85).map((beats, i): [string, GiftLoopPlan] => [`crown${i + 1}`, { box: CROWN_BOXES[i]!, from: { o: 0 }, beats }]),
);

/** The bead chains, each swaying from where it hangs on the horn, none quite in step with another. */
const beads = Object.fromEntries(
  SAHMARAN_CHAINS.map(([x, y], i): [string, GiftLoopPlan] => [`chain${i + 1}`, { box: CHAIN_BOXES[i]!, origin: onFrame([x, y]), motion: (t) => ({ rot: 2.6 * wave(t, 2, i * 1.7) }) }]),
);

/** The serpent's tongue flicking out at her twice, quick as a serpent's is, and then held still. */
const flick: GiftLoopBeat[] = [
  [3600, { sx: 1, sy: 1 }],
  [3700, { sx: 0.4, sy: 0.4 }, 'in'],
  [3800, { sx: 1, sy: 1 }, 'out'],
  [3900, { sx: 0.4, sy: 0.4 }, 'in'],
  [4020, { sx: 1, sy: 1 }, 'out'],
];

/** A blink: the lid half down, then shut, held a moment, and up again the same way. */
const blink = (lid: 'half' | 'shut'): GiftLoopBeat[] => {
  const at = 2200;
  return lid === 'half'
    ? [[at, { o: 0 }], [at + 40, { o: 1 }, 'linear'], [at + 210, { o: 1 }, 'linear'], [at + 260, { o: 0 }, 'linear']]
    : [[at + 40, { o: 0 }], [at + 80, { o: 1 }, 'linear'], [at + 160, { o: 1 }, 'linear'], [at + 210, { o: 0 }, 'linear']];
};

/** Şahmaran: a gleam crossing her crown, the serpent's tongue flicking, the beads swaying from the horns, and a blink. */
const sahmaran = giftLoop(6000, {
  ...gleam,
  tongue: { box: [49, 36, 13, 6], origin: onFrame([164, 62]), beats: flick },
  ...beads,
  lidHalf: { box: [77, 51, 12, 3], from: { o: 0 }, beats: blink('half') },
  lidShut: { box: [77, 51, 12, 4], from: { o: 0 }, beats: blink('shut') },
});

export const LORE_LOOPS: Readonly<Partial<Record<GiftArtId, GiftLoop>>> = { kawa, sahmaran };
