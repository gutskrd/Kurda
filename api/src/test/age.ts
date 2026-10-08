/**
 * A birth month for someone exactly `years` and a half old today.
 *
 * Half a year past the birthday on purpose: the age rules take the younger
 * answer during the birth month itself (@kurda/shared `ageInYears`), so a test
 * that picked "January, `years` ago" would pass eleven months a year and fail in
 * January. Six months away from the birth month, the age is `years` whatever
 * day the suite runs.
 */
export function bornYearsAgo(years: number, now: Date = new Date()): { birthYear: number; birthMonth: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - years * 12 - 6);
  return { birthYear: d.getUTCFullYear(), birthMonth: d.getUTCMonth() + 1 };
}
