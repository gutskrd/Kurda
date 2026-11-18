/**
 * Age from the birth month and year given at sign-up, and what it changes. Shared because every sign-up form must offer
 * the same years and refuse the same answers the API does.
 *
 * Only month and year are asked: a full birth date is more than the rules need and identifies a person. Within the birth
 * month the birthday may not have come yet, so the younger age always applies. Minor status is computed every time,
 * never stored, so it ends by itself when somebody grows up.
 */

/** Younger than this, no account is made at all (COPPA's line in the US). */
export const MIN_SIGNUP_AGE = 13;

/** From this age the protections for minors stop applying. */
export const ADULT_AGE = 18;

/** Below this, consent-based processing needs a parent (the GDPR art. 8 default; some countries set it lower, none higher). */
export const DIGITAL_CONSENT_AGE = 16;

/** The oldest birth year a form offers or the API accepts. */
export const EARLIEST_BIRTH_YEAR = 1900;

/** A birth month: `month` is 1 (January) to 12. */
export interface BirthMonth {
  year: number;
  month: number;
}

/** Whole years certainly lived by `now`, counting the birth month as not yet; UTC, so every server and phone agrees. */
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

/** Too young to consent on their own behalf, to analytics for example. */
export function isBelowConsentAge(birth: BirthMonth, now: Date = new Date()): boolean {
  return ageInYears(birth, now) < DIGITAL_CONSENT_AGE;
}

/** A real month, not before 1900 and not after the current month. */
export function isPlausibleBirthMonth(birth: BirthMonth, now: Date = new Date()): boolean {
  const { year, month } = birth;
  if (!Number.isInteger(year) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (year < EARLIEST_BIRTH_YEAR) return false;
  const nowYear = now.getUTCFullYear();
  return year < nowYear || (year === nowYear && month <= now.getUTCMonth() + 1);
}

/**
 * The years a sign-up form lists, newest first, back to 1900. The years too young are listed too and there is no default,
 * so the form never tells a child which year to pick.
 */
export function birthYearChoices(now: Date = new Date()): number[] {
  const years: number[] = [];
  for (let y = now.getUTCFullYear(); y >= EARLIEST_BIRTH_YEAR; y--) years.push(y);
  return years;
}
