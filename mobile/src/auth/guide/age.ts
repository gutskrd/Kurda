/**
 * The age ruler's arithmetic: which age a scroll position stands for, where a
 * given age sits, and the birth year an age and a month come to. Pure, so the
 * ruler's answers can be tested without a screen.
 *
 * The sign-up asks "how old are you?" rather than "which year?", because an
 * age is what somebody knows about themselves without working it out, and
 * the server still wants a birth year and month (shared `age`). The month is
 * asked right after, and the two together give the year: somebody who is 20
 * and was born in a month still to come this year was born 21 years ago.
 *
 * No age is chosen until somebody moves the ruler. It rests at its start, on
 * the youngest year, and that resting place answers nothing: the server
 * reads the birth year as the age, so an age the ruler already stood on would
 * be the answer of everyone who only tapped Continue, child or not.
 */
import { EARLIEST_BIRTH_YEAR } from '@kurda/shared';

/** The ruler's shape, in points: one tick per year, a tall one every ten, with the number under it. */
export const RULER = {
  /** how far apart the years are, and so how far one year of scrolling is */
  tick: 12,
  /** the heights of a tall tick and a short one */
  tall: 36,
  short: 18,
  /** a tall tick, with a number, every so many years */
  every: 10,
} as const;

/** The youngest and oldest the ruler goes: one, and whoever was born in the earliest year the server takes. */
export function ageRange(now: Date = new Date()): { min: number; max: number } {
  return { min: 1, max: Math.max(1, now.getUTCFullYear() - EARLIEST_BIRTH_YEAR) };
}

/** Where the ruler has to scroll to for `age` to be under the pointer. */
export function offsetForAge(age: number, min: number, tick: number = RULER.tick): number {
  return Math.max(0, age - min) * tick;
}

/** The age under the pointer when the ruler is scrolled `x` points, rounded to the nearest year and kept within the range. */
export function ageAtOffset(x: number, range: { min: number; max: number }, tick: number = RULER.tick): number {
  const age = range.min + Math.round(Math.max(0, x) / tick);
  return Math.max(range.min, Math.min(range.max, age));
}

/**
 * The age a scroll to `x` chooses, or null when it chooses nothing: a scroll
 * that stays on the year already chosen, or, while none is chosen yet, one
 * that stays on the year the ruler rests on. That year is where the ruler was
 * put, not where anybody put it; moving off it is the first answer.
 */
export function chosenAtOffset(x: number, current: number | null, range: { min: number; max: number }, tick: number = RULER.tick): number | null {
  const age = ageAtOffset(x, range, tick);
  if (age === current) return null;
  if (current === null && age === range.min) return null;
  return age;
}

/** One year older or younger, for a screen reader's swipe, kept within the range. */
export function stepAge(age: number, action: 'increment' | 'decrement', range: { min: number; max: number }): number {
  const next = action === 'increment' ? age + 1 : age - 1;
  return Math.max(range.min, Math.min(range.max, next));
}

/**
 * The year somebody `age` years old was born in, given the month they were
 * born in (1 to 12), or null while the month is still unchosen: counted back
 * from this year, and one more year back when their birthday this year has
 * not come yet — a birthday this very month counts as still to come, since
 * the day is not asked. The server counts the same way (shared
 * `ageInYears`), so the year sent back to it makes exactly the age that was
 * said.
 */
export function birthYearFrom(age: number, month: number | null, now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const birthdayToCome = month !== null && month >= thisMonth;
  return year - age - (birthdayToCome ? 1 : 0);
}
