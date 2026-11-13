/**
 * The growing fire (fire-stages.ts) where it is a moment of its own, the same
 * on both apps: the streak kept, lighting up and on the day its fire grew, a
 * run's milestone in a lesson, and the ladder of stages a streak climbs.
 */

import { CELEBRATE_MS } from './celebration.js';
import { FIRE_GROW, FIRE_STAGES, FIRE_STAGE_DAYS, fireGrewToday, fireLevel, fireStageIndex, runFireLevel, type FireLevel, type FireStage } from './fire-stages.js';

/** A stage the fire burns at: every one but the cold logs. */
export type LitFireStage = Exclude<FireStage, 'cold'>;

/** When the fire's growth lands, from when it appears: the growth's delay and its length. */
const LANDS_AT_MS = FIRE_GROW.delayMs + FIRE_GROW.ms;

/** How long the line saying what the fire grew into is left to be read once it is there. */
export const FIRE_GREW_READ_MS = 2600;

const POP_MS = 540;
/** When the pop is at its height, as a share of it. */
const POP_PEAK = 0.55;

/**
 * The kept streak's moment lighting up as it opens. It opens dim and cool on
 * yesterday: the fire faint and the number at yesterday's, both at `dim` of
 * their strength. At `atMs` the fire ignites: it squashes down, pops up past
 * its size and settles (`pop`, over `popMs`: at each share of it, how wide
 * and how tall, about its foot), brightening as it squashes; the warm light
 * floods out from it over the screen (`floodMs`); and the app's one
 * celebration plays from then — the ring of gold bursting out from its
 * middle, the sparks, the number rolling on to today. The pop is at its
 * height as the growth starts (`FIRE_GROW.delayMs` after the fire appears),
 * so on the day the fire grew it leaps straight on up into its new stage: one
 * motion, not two. Under Reduce Motion nothing squashes, rings or travels:
 * the dim screen cross-fades to the warm one.
 */
export const FLAME_IGNITE = {
  atMs: FIRE_GROW.delayMs - Math.round(POP_MS * POP_PEAK),
  popMs: POP_MS,
  pop: [
    { at: 0, sx: 1, sy: 1 },
    { at: 0.2, sx: 1.1, sy: 0.84 },
    { at: POP_PEAK, sx: 0.95, sy: 1.1 },
    { at: 0.8, sx: 1.015, sy: 0.985 },
    { at: 1, sx: 1, sy: 1 },
  ],
  floodMs: 640,
  dim: 0.35,
} as const;

export interface FlameMoment {
  /** today's fire */
  level: FireLevel;
  /** on the day it grew, yesterday's fire, which it grows from as it appears; null on any other day */
  from: FireLevel | null;
  /** the stage it grew into today, or null */
  grew: LitFireStage | null;
  /** when the growth lands and the line saying what it grew into appears, from when the fire appears */
  landsAtMs: number;
  /** when the moment moves on by itself */
  overMs: number;
  /** how much closer than the rest its screen draws this fire: a young one, so the first days are a moment too */
  zoom: number;
}

/**
 * How much closer the flame's screen draws the young fires than the rest
 * (which it draws all alike, the longer streak's the bigger fire): a spark
 * would be a speck under the day's big number. Back to the same by the
 * campfire, and never so close that a day's fire stands shorter than the
 * day before's.
 */
const ZOOM: Readonly<Partial<Record<FireStage, number>>> = { spark: 1.4, kindling: 1.15 };

/**
 * The flame's moment after a lesson that kept a streak of `days`. On the day
 * the fire grew (`fireGrewToday`: the 1st, the 3rd, the 7th...) it appears as
 * it was yesterday and grows into today's stage, and the moment stays until
 * the line saying so has been read; on any other day it is today's fire, for
 * the app's one celebration once it has lit (`FLAME_IGNITE`).
 */
export function flameMoment(days: number): FlameMoment {
  // a fire only grows into a stage that burns
  const grew = fireGrewToday(days) as LitFireStage | null;
  return {
    level: fireLevel(days),
    from: grew ? fireLevel(days - 1) : null,
    grew,
    landsAtMs: LANDS_AT_MS,
    overMs: grew ? LANDS_AT_MS + FIRE_GREW_READ_MS : FLAME_IGNITE.atMs + CELEBRATE_MS,
    zoom: ZOOM[fireLevel(days).stage] ?? 1,
  };
}

/** How long a run's milestone has the screen, unless a tap or a key goes on sooner. */
export const RUN_MOMENT_MS = 1000;
/** Once a milestone's fire has grown, how long the new fire is left to be seen. */
const RUN_GREW_HOLD_MS = 500;

/**
 * A run's milestone (`runMilestone`) as a moment: the run's fire, grown from
 * the one before when the milestone is where it reached a new stage (5, 10, 15
 * and 20 in a row), and how long it holds the screen — about a second, or
 * until that growth has landed and been seen.
 */
export function runMoment(count: number): { level: FireLevel; from: FireLevel | null; ms: number } {
  const level = runFireLevel(count);
  const before = runFireLevel(count - 1);
  const grew = before.stage !== level.stage;
  return { level, from: grew ? before : null, ms: grew ? Math.max(RUN_MOMENT_MS, LANDS_AT_MS + RUN_GREW_HOLD_MS) : RUN_MOMENT_MS };
}

/** Where a stage stands for a streak: behind it, where its fire is now, or still to come. */
export type FireLadderPlace = 'reached' | 'now' | 'ahead';

export interface FireLadderStep {
  stage: LitFireStage;
  /** the day of the streak it is reached on */
  day: number;
  place: FireLadderPlace;
  /** the fire drawn for it: as the stage begins, or for the one it is now, today's */
  level: FireLevel;
}

/**
 * The seven lit stages from the spark to the Newroz fire, for a streak of
 * `days`: the ones reached, the one its fire is now (none while the logs are
 * cold), and the ones ahead, something to look forward to.
 */
export function fireLadder(days: number): FireLadderStep[] {
  const today = fireLevel(days);
  const at = fireStageIndex(today.stage);
  return FIRE_STAGES.filter((stage): stage is LitFireStage => stage !== 'cold').map((stage) => {
    const i = fireStageIndex(stage);
    const place: FireLadderPlace = i === at ? 'now' : i < at ? 'reached' : 'ahead';
    return { stage, day: FIRE_STAGE_DAYS[stage], place, level: place === 'now' ? today : fireLevel(FIRE_STAGE_DAYS[stage]) };
  });
}
