/**
 * Weekly league math (KUR-062), now one copy in @kurda/shared (contract 4 §L):
 * the six water tiers, the UTC week, and the end-of-week result. This module
 * keeps the names the rest of the API has always imported, plus the one thing
 * only the server needs — the UTC offset a learner's clock had at a moment, to
 * group them with people awake at the same hours.
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
 * Minutes a time zone is ahead of UTC at `at` (Erbil +180, New York -240 or
 * -300). An unknown zone reads as UTC: grouping is a nicety, never a reason to
 * fail a join.
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
