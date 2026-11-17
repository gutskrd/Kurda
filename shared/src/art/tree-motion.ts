/**
 * How the learner's tree moves (`trees.ts`), alike on both apps: its breeze sway, the swing under a great tree, the
 * start it gives when touched or watered, and growing from one stage to the next. Loops run off one clock read from the
 * time of day (`treePhase`), so a redrawn tree carries on its sway instead of jerking back to the start. All movement is
 * scaled by the plant's heft (`treeHeft`): a sprout bends far in a breeze that barely stirs a great tree, and a large
 * tree moving like a seedling would look like rubber and leave its own picture.
 */
import type { TreeStage } from '../tree.js';
import { TREE_TOP, TREE_FOOT } from './trees.js';

/** The breeze: one sway's period there and back, and how far the lightest plant leans each way, in degrees. */
export const TREE_SWAY = { ms: 6400, deg: 1.5 } as const;

/**
 * The swing under a great tree: moved by the same breeze slightly after the crown (`lag`, a share of the period) and
 * further. Its two ropes keep the seat level, so it shears like a parallelogram; `deg` is the ropes' lean from vertical.
 */
export const TREE_SWING = { ms: TREE_SWAY.ms, deg: 4.5, lag: 0.16 } as const;

/** A touch: the plant leans away, back past rest, and settles; each turn in degrees, at evenly spaced moments. */
export const TREE_SHAKE = { ms: 680, turns: [0, -2.8, 2.3, -1.3, 0.6, 0] } as const;

/**
 * Watered: the plant squats, stretches and settles. It starts `delayMs` into the pour, once the water reaches it, and
 * ends before the pour does; `stops` place each stretch.
 */
export const TREE_DRINK = {
  delayMs: 520,
  ms: 940,
  stops: [0, 0.22, 0.48, 0.72, 1],
  sx: [1, 1.05, 0.96, 1.02, 1],
  sy: [1, 0.93, 1.06, 0.98, 1],
} as const;

/**
 * Growing: the old tree swells toward the new one's size, and the new one rises out of it from that size, overshoots a
 * little (`past`) and settles, so nothing pops. The new one fades in under the old first (by `inBy`, a share of the
 * whole) and only then does the old fade out (`outFrom` to `outBy`), so shared parts like the seed and the ground are
 * never half there. The ground only cross-fades, since it does not grow.
 */
export const TREE_GROW = { ms: 1100, inBy: 0.4, outFrom: 0.4, outBy: 0.7, past: 1.03 } as const;

/** Revived from thirst: the drooping picture fades off the revived one over this long. */
export const TREE_REVIVE = { ms: 720 } as const;

/** A seed just planted: dropped into its hollow from above (a share of the picture's height), turning, then settling. */
export const TREE_PLANT_DROP = { ms: 950, stops: [0, 0.52, 0.68, 0.84, 1], y: [-0.62, 0, -0.045, 0, 0], turn: [-16, 5, -2, 1, 0] } as const;

/** The share of the full movement a plant makes at each stage: lighter as it grows. */
const HEFT: readonly [number, number, number, number, number, number, number] = [0.8, 1, 0.86, 0.66, 0.55, 0.46, 0.38];

/** How much a plant at `stage` starts when touched or watered, from 1 (a sprout) down. */
export function treeHeft(stage: TreeStage): number {
  return HEFT[stage];
}

/** How far a plant at `stage` leans each way in the breeze, in degrees; a seed in its earth does not move. */
export function treeSwayDeg(stage: TreeStage): number {
  return stage === 0 ? 0 : Math.round(TREE_SWAY.deg * treeHeft(stage) * 100) / 100;
}

/** Where a loop of `periodMs` is at epoch time `nowMs`, 0 to 1, the same for every tree on every screen. */
export function treePhase(nowMs: number, periodMs: number = TREE_SWAY.ms): number {
  const p = (nowMs % periodMs) / periodMs;
  return p < 0 ? p + 1 : p;
}

/**
 * One breeze period as evenly spaced samples from -1 to 1 and back, eased at both ends like a pendulum; `lag` (a share
 * of the period) delays the wave, as the swing has it. The phone plays it off one linear clock, the web as keyframes
 * eased the same way; both start at `treePhase`.
 */
export function treeWave(lag = 0): number[] {
  return Array.from({ length: 17 }, (_, i) => Math.round(-Math.cos((i / 16 - lag) * Math.PI * 2) * 1000) / 1000);
}

/** The breeze's wave as samples over one period. */
export const TREE_WAVE: readonly number[] = treeWave();
export const TREE_WAVE_AT: readonly number[] = Array.from({ length: 17 }, (_, i) => i / 16);

/**
 * The scale a stage's plant starts at when it grows out of the previous stage: the one that puts its top where the old
 * top was (`TREE_TOP`, about the foot). The old plant swells by the inverse. Out of a seed it starts at full size.
 */
export function treeGrowFrom(from: TreeStage, to: TreeStage): number {
  // The sprout rises out of the seed already lying there, same place and size; only the shoot is new.
  if (from === 0) return 1;
  const high = (stage: TreeStage): number => TREE_FOOT.y - TREE_TOP[stage];
  return Math.round((high(from) / high(to)) * 1000) / 1000;
}
