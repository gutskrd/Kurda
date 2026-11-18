/**
 * Weekly league math, re-exported from @kurda/shared under the names the API uses, plus what only the server needs:
 * a learner's UTC offset at a moment, to group people awake at the same hours.
 */
import {
  LEAGUE_TIERS,
  isLeagueTier,
  previousWeek,
  tierAbove,
  tierBelow,
  weekStart,
  type LeagueOutcome,
  type LeagueTier,
} from '@kurda/shared';

export { weekStart, previousWeek };
export const TIERS = LEAGUE_TIERS;
export type Tier = LeagueTier;
export type Outcome = LeagueOutcome;
export const isTier = isLeagueTier;
export const promote = tierAbove;
export const demote = tierBelow;

/**
 * Minutes a time zone is ahead of UTC at `at` (Erbil +180, New York -240 or -300). An unknown zone reads as UTC,
 * since grouping is never a reason to fail a join.
 */
export function utcOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    const utc = Math.floor(at.getTime() / 60_000) * 60_000;
    return Math.round((local - utc) / 60_000);
  } catch {
    return 0;
  }
}
