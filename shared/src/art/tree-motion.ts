/**
 * How the learner's tree moves (`trees.ts`), the same on the website and the
 * phone: the breeze it sways in, the swing that hangs from a great tree's
 * bough, the start it gives when it is touched or watered, and how one stage
 * grows into the next.
 *
 * Everything that loops is set by one clock that both apps read off the
 * time of day (`treePhase`), so a tree drawn again — grown, revived, or
 * simply shown on another screen — carries on from where its breeze was
 * instead of starting its sway over with a jerk. Everything that moves is
 * scaled by the plant's heft (`treeHeft`): a sprout bends a long way in the
 * same breeze that only stirs a great oak, and a great tree that bowed and
 * stretched like a seedling would look like rubber, and would leave its own
 * picture at the top.
 */
import type { TreeStage } from '../tree.js';
import { TREE_TOP, TREE_FOOT } from './trees.js';

/** The breeze: how long one sway takes, there and back, and how far the lightest plant leans each way, in degrees. */
export const TREE_SWAY = { ms: 6400, deg: 1.5 } as const;

/**
 * The swing under a great tree: it is moved by the same breeze, a little
 * after the crown is (`lag`, a share of the breeze's period), and further,
 * since nothing holds it but its ropes. Its two ropes keep its seat level, so
 * it leans as a parallelogram does rather than turning: `deg` is how far its
 * ropes lean from hanging straight.
 */
export const TREE_SWING = { ms: TREE_SWAY.ms, deg: 4.5, lag: 0.16 } as const;

/** A touch: the plant leans away, back past where it stood, and settles; each turn in degrees, at evenly spaced moments. */
export const TREE_SHAKE = { ms: 680, turns: [0, -2.8, 2.3, -1.3, 0.6, 0] } as const;

/**
 * Watered: the plant starts as anything does that is given a drink — it
 * squats, stretches, and settles. It begins once the water has reached it
 * (`delayMs` into the pour) and is over before the pour is; `stops` are where
 * each stretch falls in it.
 */
export const TREE_DRINK = {
  delayMs: 520,
  ms: 940,
  stops: [0, 0.22, 0.48, 0.72, 1],
  sx: [1, 1.05, 0.96, 1.02, 1],
  sy: [1, 0.93, 1.06, 0.98, 1],
} as const;

/**
 * Grown: the tree that was swells toward the size of the new one as it goes,
 * and the new one comes up out of it from that same size, past its own a
 * little (`past`), and back, so the stage is seen to grow and nothing pops.
 * The new one fades in under the old one first (by `inBy`, a share of the
 * whole), and only then does the old one fade off it (from `outFrom` to
 * `outBy`): what the two have in common — the seed a sprout comes out of,
 * the ground — is never half there. The ground changes over only by that
 * fade, since it does not grow.
 */
export const TREE_GROW = { ms: 1100, inBy: 0.4, outFrom: 0.4, outBy: 0.7, past: 1.03 } as const;

/** Brought back from thirst: the drooping picture fades off the revived one over this long. */
export const TREE_REVIVE = { ms: 720 } as const;

/** A seed just planted: dropped into its hollow from above (a share of the picture's height), turning, and settling. */
export const TREE_PLANT_DROP = { ms: 950, stops: [0, 0.52, 0.68, 0.84, 1], y: [-0.62, 0, -0.045, 0, 0], turn: [-16, 5, -2, 1, 0] } as const;

/** How much of the full movement a plant at a stage makes: all of it as a sprout, less as it grows heavier, a little as a great tree. */
const HEFT: readonly [number, number, number, number, number, number, number] = [0.8, 1, 0.86, 0.66, 0.55, 0.46, 0.38];

/** How much a plant at `stage` starts when it is touched or watered, from 1 (a sprout) down. */
export function treeHeft(stage: TreeStage): number {
  return HEFT[stage];
}

/** How far a plant at `stage` leans each way in the breeze, in degrees: none for a seed, which lies in its earth with nothing for the air to take. */
export function treeSwayDeg(stage: TreeStage): number {
  return stage === 0 ? 0 : Math.round(TREE_SWAY.deg * treeHeft(stage) * 100) / 100;
}

/** Where a loop of `periodMs` is at the moment `nowMs` (milliseconds of the epoch), 0 to 1: the same for every tree on every screen. */
export function treePhase(nowMs: number, periodMs: number = TREE_SWAY.ms): number {
  const p = (nowMs % periodMs) / periodMs;
  return p < 0 ? p + 1 : p;
}

/**
 * One period of the breeze as evenly spaced samples from -1 to 1 and back:
 * leaning furthest one way at its start, furthest the other half way, and
 * easing at both ends, as a pendulum does; `lag` (a share of the period)
 * gives the same wave that much later, as the swing has it. The phone plays
 * it off one linear clock (an animation interpolated through these), the
 * website as keyframes eased the same way; both start it at `treePhase`.
 */
export function treeWave(lag = 0): number[] {
  return Array.from({ length: 17 }, (_, i) => Math.round(-Math.cos((i / 16 - lag) * Math.PI * 2) * 1000) / 1000);
}

/** The breeze's wave as it is, and where along its period each of its samples falls. */
export const TREE_WAVE: readonly number[] = treeWave();
export const TREE_WAVE_AT: readonly number[] = Array.from({ length: 17 }, (_, i) => i / 16);

/**
 * The scale a stage's plant is seen at when it first comes up out of the
 * last stage's: the one that makes its top meet where the last one's top
 * was (`TREE_TOP`, about the plant's foot). The plant that was swells by the
 * inverse as it goes. Out of a seed it is the same size: the seed lies where
 * it lay and the shoot comes up out of it.
 */
export function treeGrowFrom(from: TreeStage, to: TreeStage): number {
  // the sprout comes up out of the very seed that lay there, in the same place and at the same size: only the shoot is new
  if (from === 0) return 1;
  const high = (stage: TreeStage): number => TREE_FOOT.y - TREE_TOP[stage];
  return Math.round((high(from) / high(to)) * 1000) / 1000;
}
