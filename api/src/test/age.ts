/**
 * A birth month for someone exactly `years` and a half old today. Half a year past the birthday, because the age rules
 * take the younger answer during the birth month itself (@kurda/shared `ageInYears`), so a plain "January, `years`
 * ago" would fail every January.
 */
export function bornYearsAgo(years: number, now: Date = new Date()): { birthYear: number; birthMonth: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - years * 12 - 6);
  return { birthYear: d.getUTCFullYear(), birthMonth: d.getUTCMonth() + 1 };
}
