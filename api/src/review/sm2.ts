/**
 * SM-2 spaced-repetition scheduling (KUR-033). Pure — no clock, no DB — so
 * the interval progression is exhaustively unit-testable.
 *
 * Reference: SuperMemo SM-2. `quality` is the learner's recall on a 0–5
 * scale; ≥3 is a pass, <3 is a lapse that resets the interval.
 */
import { dayDiff, localDate } from '../streaks/streak-logic.js';

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface Sm2State {
  /** consecutive successful reviews */
  repetitions: number;
  /** current inter-repetition interval, in days */
  interval: number;
  /** easiness factor; higher = slower to come due again */
  easiness: number;
}

export const MIN_EASINESS = 1.3;
export const DEFAULT_EASINESS = 2.5;

export const INITIAL_SM2: Sm2State = { repetitions: 0, interval: 0, easiness: DEFAULT_EASINESS };

/** Recompute the easiness factor from a review's quality (clamped). */
export function nextEasiness(easiness: number, quality: Quality): number {
  const updated = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EASINESS, updated);
}

/**
 * Apply one review outcome. A pass (quality ≥ 3) advances the interval
 * (1 day → 6 days → ×easiness); a lapse (quality < 3) resets repetitions
 * and drops the interval back to 1 day. Easiness is always updated.
 */
export function review(state: Sm2State, quality: Quality): Sm2State {
  const easiness = nextEasiness(state.easiness, quality);

  if (quality < 3) {
    return { repetitions: 0, interval: 1, easiness };
  }

  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = 1;
  else if (repetitions === 2) interval = 6;
  else interval = Math.round(state.interval * easiness);

  return { repetitions, interval, easiness };
}

const DAY_MS = 86_400_000;

/** When an item with the given interval next falls due. */
export function dueAfter(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * DAY_MS);
}

/** An item's schedule as stored: its SM-2 state and when it next falls due. */
export interface Scheduled {
  state: Sm2State;
  dueAt: Date;
  /**
   * When it was last answered, if it ever was. Absent on a row written before
   * this was read (or by hand); it is then taken to be when the item was
   * scheduled, `dueAt` less the interval, which is when `record` wrote it.
   */
  lastReviewedAt?: Date | null;
}

/**
 * Whether answering an item now is a spaced review: it is due, or at least
 * half of its current interval has passed since it was scheduled — and either
 * way it is a later day, on the learner's own calendar, than the last time it
 * was answered.
 *
 * Spacing is what makes a review strengthen memory more than a repeat does.
 * A replay of the same lesson an hour later, or a not-yet-due item padded into
 * practice, is massed repetition; counting it as a review stretched the
 * interval as if the learner had remembered across the gap. Half the interval
 * lets an item reviewed a little early still count, so a learner who practises
 * the evening before a due date is not penalised.
 *
 * Half the interval alone still let the same day through: every newly learned
 * item has a one-day interval, so a lesson at nine in the morning replayed at
 * nine at night moved its words from one day to six. A review has to cross a
 * night, so the day is the learner's (`timeZone`), not UTC's, whose midnight
 * falls in the middle of an evening in much of the world.
 *
 * An item that has never been answered (a saved word, interval 0) has no
 * earlier day to be later than: it is reviewable at once.
 */
export function isSpacedReview(item: Scheduled, now: Date, timeZone = 'UTC'): boolean {
  const scheduledAt = item.dueAt.getTime() - item.state.interval * DAY_MS;
  if (now.getTime() < scheduledAt + (item.state.interval * DAY_MS) / 2) return false;
  const lastReviewedAt = item.lastReviewedAt ?? (item.state.interval > 0 ? new Date(scheduledAt) : null);
  if (!lastReviewedAt) return true;
  return dayDiff(localDate(lastReviewedAt, timeZone), localDate(now, timeZone)) >= 1;
}

/**
 * Apply one answer to an item's schedule, honestly. Returns the new schedule,
 * or null when the answer must leave it alone.
 *
 *  - a new item: its first review, whatever the answer
 *  - a wrong answer: always a lapse — forgetting is evidence whenever it shows
 *  - a right answer: advances SM-2 only when it is a spaced review
 *    (`isSpacedReview`, on the learner's calendar in `timeZone`); a same-day
 *    replay or an early practice item leaves the schedule where it was
 */
export function scheduleAnswer(
  prev: Scheduled | null,
  quality: Quality,
  now: Date,
  timeZone = 'UTC',
): Scheduled | null {
  if (prev && quality >= 3 && !isSpacedReview(prev, now, timeZone)) return null;
  const state = review(prev?.state ?? INITIAL_SM2, quality);
  return { state, dueAt: dueAfter(now, state.interval), lastReviewedAt: now };
}

/**
 * Map a lesson-answer verdict to an SM-2 quality grade. An answer that was not
 * accepted is a lapse whatever its verdict: a strict spelling item's typo
 * (right word, wrong letter) missed the very thing it tests.
 */
export function qualityFromVerdict(verdict: 'correct' | 'typo' | 'wrong', accepted = verdict !== 'wrong'): Quality {
  if (!accepted) return 2; // lapse
  switch (verdict) {
    case 'correct':
      return 5;
    case 'typo':
      return 4; // recalled, with a slip
    case 'wrong':
      return 2; // lapse
  }
}
