/**
 * How old somebody is, from the birth month and year they gave when they signed
 * up — and what that age changes.
 *
 * Here rather than in the API because all three apps ask the question: the API
 * decides, and the sign-up forms have to offer the same years and refuse the
 * same answers before anything is sent.
 *
 * Only a month and a year are ever asked for. A full birth date is more than
 * any of these rules need, and it is the one thing on an account that identifies
 * a person outside it. The price is that during someone's birth month we cannot
 * tell whether the birthday has come yet, and the answer is always the younger
 * one: nobody is let in at 13, or treated as an adult at 18, a few days before
 * they are. At worst the protections run a month long.
 *
 * Nothing here is stored as a verdict. Minor status is worked out from the
 * birth month every time it is needed, so it ends on its own when somebody
 * grows up — a flag written at sign-up is right on that day and wrong for ever
 * after.
 */

/** Younger than this, no account is made at all (COPPA's line in the US). */
export const MIN_SIGNUP_AGE = 13;

/** From here on, the protections for minors stop applying. */
export const ADULT_AGE = 18;

/**
 * Below this, consent-based processing needs a parent (GDPR art. 8 default;
 * some countries set it lower, none higher).
 */
export const DIGITAL_CONSENT_AGE = 16;

/** The oldest birth year a form offers or the API accepts. */
export const EARLIEST_BIRTH_YEAR = 1900;

/** A birth month: `month` is 1 (January) to 12. */
export interface BirthMonth {
  year: number;
  month: number;
}

/**
 * Whole years certainly lived by `now`.
 *
 * In the birth month itself the birthday may still be ahead, so that month
 * counts as not yet — see the note at the top. UTC, so the answer does not
 * depend on which server or which phone asks.
 */
export function ageInYears(birth: BirthMonth, now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return year - birth.year - (month <= birth.month ? 1 : 0);
}

/** Too young to have an account. */
export function isBelowMinimumAge(birth: BirthMonth, now: Date = new Date()): boolean {
  return ageInYears(birth, now) < MIN_SIGNUP_AGE;
}

/** 13 to 17: has an account, and every protection for minors applies. */
export function isMinor(birth: BirthMonth, now: Date = new Date()): boolean {
  return ageInYears(birth, now) < ADULT_AGE;
}

/** Too young to give consent on their own behalf (analytics and the like). */
export function isBelowConsentAge(birth: BirthMonth, now: Date = new Date()): boolean {
  return ageInYears(birth, now) < DIGITAL_CONSENT_AGE;
}

/**
 * A birth month someone could actually have: a real month, not before 1900 and
 * not after the month we are in.
 */
export function isPlausibleBirthMonth(birth: BirthMonth, now: Date = new Date()): boolean {
  const { year, month } = birth;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (year < EARLIEST_BIRTH_YEAR) return false;
  const nowYear = now.getUTCFullYear();
  return year < nowYear || (year === nowYear && month <= now.getUTCMonth() + 1);
}

/**
 * The years a sign-up form lists, newest first.
 *
 * Every year back to 1900, including the ones that are too young — leaving them
 * out would tell a child which year to pick. The form has no default either,
 * for the same reason.
 */
export function birthYearChoices(now: Date = new Date()): number[] {
  const years: number[] = [];
  for (let y = now.getUTCFullYear(); y >= EARLIEST_BIRTH_YEAR; y--) years.push(y);
  return years;
}
