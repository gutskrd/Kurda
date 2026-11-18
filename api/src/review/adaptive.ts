/**
 * Adaptive review difficulty, not wired into the scheduler yet (see docs/review/adaptive-difficulty.md). A per-user
 * heuristic tuning SM-2 from past accuracy: learners who pass their due reviews get longer intervals, those who lapse
 * often shorter ones, and those with too little history stock SM-2. Pure, so it can be evaluated offline before
 * rollout.
 */
import { DEFAULT_EASINESS, MIN_EASINESS } from './sm2.js';

/** Below this many reviews we don't trust the personal signal → stock SM-2. */
export const MIN_REVIEWS_FOR_ADAPTATION = 20;

/** Recall we aim to have left at review time (the SM-2 design point). */
export const TARGET_RECALL = 0.85;

/** Easiness is never stretched beyond this (keeps intervals from exploding). */
export const MAX_EASINESS = 3.0;

const MODIFIER_MIN = 0.8;
const MODIFIER_MAX = 1.2;

export interface UserRecallStats {
  reviews: number;
  correct: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A multiplier on SM-2 easiness from a user's past accuracy: 1 without enough history, above 1 when accuracy beats
 * the target, below 1 when it falls short, bounded to ±20%.
 */
export function easeModifier(stats: UserRecallStats): number {
  if (stats.reviews < MIN_REVIEWS_FOR_ADAPTATION || stats.reviews <= 0) return 1;
  const accuracy = clamp(stats.correct / stats.reviews, 0, 1);
  // map the accuracy gap around the target into ±20%, scaled so a full gap saturates
  const modifier = 1 + ((accuracy - TARGET_RECALL) / (1 - TARGET_RECALL)) * (MODIFIER_MAX - 1);
  return clamp(modifier, MODIFIER_MIN, MODIFIER_MAX);
}

/** Apply the personal modifier to an SM-2 easiness, clamped to safe bounds. */
export function adaptEasiness(baseEasiness: number, modifier: number): number {
  return clamp(baseEasiness * modifier, MIN_EASINESS, MAX_EASINESS);
}

/** Convenience: the adapted easiness for a user (stock default if cold-start). */
export function personalEasiness(stats: UserRecallStats, baseEasiness = DEFAULT_EASINESS): number {
  return adaptEasiness(baseEasiness, easeModifier(stats));
}

/** Exponential forgetting curve: predicted recall after `elapsedDays`. */
export function predictedRecall(elapsedDays: number, stabilityDays: number): number {
  if (stabilityDays <= 0) return 0;
  return Math.exp(-Math.max(0, elapsedDays) / stabilityDays);
}

/** The interval that lands recall exactly on `target` for a given stability. */
export function optimalInterval(stabilityDays: number, target = TARGET_RECALL): number {
  return -stabilityDays * Math.log(target);
}

export interface ScheduleSample {
  stabilityDays: number;
  stockInterval: number;
  adaptedInterval: number;
}

export interface OfflineEvaluation {
  stockError: number;
  adaptedError: number;
  improved: boolean;
}

/**
 * Offline evaluation: mean absolute error between predicted recall at review time and the target, for stock and
 * adapted schedules over past samples. `improved` means the adapted schedule is closer, the gate for rollout.
 */
export function evaluateAdaptation(samples: readonly ScheduleSample[], target = TARGET_RECALL): OfflineEvaluation {
  if (samples.length === 0) return { stockError: 0, adaptedError: 0, improved: false };
  const err = (interval: number, stability: number) => Math.abs(predictedRecall(interval, stability) - target);
  const stockError = samples.reduce((s, x) => s + err(x.stockInterval, x.stabilityDays), 0) / samples.length;
  const adaptedError = samples.reduce((s, x) => s + err(x.adaptedInterval, x.stabilityDays), 0) / samples.length;
  return { stockError, adaptedError, improved: adaptedError < stockError };
}
