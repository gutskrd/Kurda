/**
 * Pure SM-2 spaced-repetition scheduling. `quality` is recall on a 0–5 scale: 3 or more passes, less is a lapse that
 * resets the interval.
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
 * Applies one review outcome. A pass advances the interval (1 day, then 6, then ×easiness); a lapse resets repetitions
 * and the interval to 1 day. Easiness is always updated.
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
  /** When it was last answered, if ever; when absent, taken as when it was scheduled (`dueAt` minus the interval). */
  lastReviewedAt?: Date | null;
}

/**
 * Whether answering now is a spaced review: the item is due, or half its interval has passed since it was scheduled,
 * and either way it is a later day on the learner's calendar than its last answer. Only spaced reviews strengthen
 * memory; a same-day replay or an early padded item is massed repetition and must not stretch the interval. Half the
 * interval lets slightly early reviews count. The day must change because new items have one-day intervals, and it is
 * the learner's day (`timeZone`), not UTC's. A never-answered item (a saved word, interval 0) is reviewable at once.
 */
export function isSpacedReview(item: Scheduled, now: Date, timeZone = 'UTC'): boolean {
  const scheduledAt = item.dueAt.getTime() - item.state.interval * DAY_MS;
  if (now.getTime() < scheduledAt + (item.state.interval * DAY_MS) / 2) return false;
  const lastReviewedAt = item.lastReviewedAt ?? (item.state.interval > 0 ? new Date(scheduledAt) : null);
  if (!lastReviewedAt) return true;
  return dayDiff(localDate(lastReviewedAt, timeZone), localDate(now, timeZone)) >= 1;
}

/**
 * Applies one answer to an item's schedule, returning the new schedule or null to leave it alone:
 *  - a new item: its first review, whatever the answer
 *  - a wrong answer: always a lapse
 *  - a right answer: advances only when it is a spaced review (`isSpacedReview`, on the learner's calendar)
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

/** Maps a lesson verdict to an SM-2 quality. An unaccepted answer is a lapse whatever its verdict: a strict spelling item's typo missed what it tests. */
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
