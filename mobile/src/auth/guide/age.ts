/**
 * The age ruler's arithmetic, pure so it can be tested without a screen: which age a scroll position stands for, where
 * an age sits, and the birth year an age and month come to. The sign-up asks for an age rather than a year, since an
 * age is what people know without working it out; the server still wants a birth year and month (shared `age`).
 *
 * No age is chosen until the ruler moves. Its resting place, the youngest year, answers nothing: otherwise everyone who
 * only tapped Continue, child or not, would give that age.
 */
import { EARLIEST_BIRTH_YEAR } from '@kurda/shared';

/** The ruler's shape, in points: one tick per year, a tall one every ten, with the number under it. */
export const RULER = {
  /** How far apart the years are, and so how far one year of scrolling is. */
  tick: 12,
  /** The heights of a tall tick and a short one. */
  tall: 36,
  short: 18,
  /** A tall tick, with a number, every so many years. */
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
 * The age a scroll to `x` chooses, or null when it chooses nothing: staying on the chosen year, or, with none chosen,
 * on the resting year, which is where the ruler was put, not where anybody put it.
 */
export function chosenAtOffset(x: number, current: number | null, range: { min: number; max: number }, tick: number = RULER.tick): number | null {
  const age = ageAtOffset(x, range, tick);
  if (age === current) return null;
  if (current === null && age === range.min) return null;
  return age;
}

/** One year older or younger, for a screen reader's swipe, kept within the range. */
export function stepAge(age: number, action: 'increment' | 'decrement', range: { min: number; max: number }, by = 1): number {
  const next = action === 'increment' ? age + by : age - by;
  return Math.max(range.min, Math.min(range.max, next));
}

/**
 * The birth year for `age` and a birth month (1 to 12), or null while the month is unchosen: counted back from this
 * year, one more if this year's birthday is still to come (this month counts as still to come, since the day is not
 * asked). The server counts the same way (shared `ageInYears`), so the year sent makes exactly the age said.
 */
export function birthYearFrom(age: number, month: number | null, now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const birthdayToCome = month !== null && month >= thisMonth;
  return year - age - (birthdayToCome ? 1 : 0);
}
