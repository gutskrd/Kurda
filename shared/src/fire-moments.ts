/**
 * The growing fire (fire-stages.ts) where it is a moment of its own, the same
 * on both apps: the streak kept on the day its fire grew, a run's milestone in
 * a lesson, and the ladder of stages a streak climbs.
 */

import { CELEBRATE_MS } from './celebration.js';
import { FIRE_GROW, FIRE_STAGES, FIRE_STAGE_DAYS, fireGrewToday, fireLevel, fireStageIndex, runFireLevel, type FireLevel, type FireStage } from './fire-stages.js';

/** When the fire's growth lands, from when it appears: the growth's delay and its length. */
const LANDS_AT_MS = FIRE_GROW.delayMs + FIRE_GROW.ms;

/** How long the line saying what the fire grew into is left to be read once it is there. */
export const FIRE_GREW_READ_MS = 2600;

export interface FlameMoment {
  /** today's fire */
  level: FireLevel;
  /** on the day it grew, yesterday's fire, which it grows from as it appears; null on any other day */
  from: FireLevel | null;
  /** the stage it grew into today, or null */
  grew: FireStage | null;
  /** when the growth lands and the line saying what it grew into appears, from when the fire appears */
  landsAtMs: number;
  /** when the moment moves on by itself */
  overMs: number;
}

/**
 * The flame's moment after a lesson that kept a streak of `days`. On the day
 * the fire grew (`fireGrewToday`: the 1st, the 3rd, the 7th...) it appears as
 * it was yesterday and grows into today's stage, and the moment stays until
 * the line saying so has been read; on any other day it is today's fire, for
 * the app's one celebration.
 */
export function flameMoment(days: number): FlameMoment {
  const grew = fireGrewToday(days);
  return {
    level: fireLevel(days),
    from: grew ? fireLevel(days - 1) : null,
    grew,
    landsAtMs: LANDS_AT_MS,
    overMs: grew ? LANDS_AT_MS + FIRE_GREW_READ_MS : CELEBRATE_MS,
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
  stage: FireStage;
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
  return FIRE_STAGES.filter((stage) => stage !== 'cold').map((stage) => {
    const i = fireStageIndex(stage);
    const place: FireLadderPlace = i === at ? 'now' : i < at ? 'reached' : 'ahead';
    return { stage, day: FIRE_STAGE_DAYS[stage], place, level: place === 'now' ? today : fireLevel(FIRE_STAGE_DAYS[stage]) };
  });
}
