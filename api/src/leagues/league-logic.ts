/**
 * Weekly league math (KUR-062). Pure and deterministic: the tier ladder, the
 * UTC week boundary, and the end-of-week promotion/demotion outcome for a
 * cohort. All persistence + scheduling lives in the LeagueService. Weeks run
 * Monday 00:00 UTC → Sunday 23:59 UTC (communicated as UTC in the UI); the
 * settle job runs after a week closes.
 */

/** Bronze → Diamond, low to high. Promotion moves up, demotion moves down. */
export const TIERS = [
  'bronze',
  'silver',
  'gold',
  'sapphire',
  'ruby',
  'emerald',
  'amethyst',
  'pearl',
  'obsidian',
  'diamond',
] as const;
export type Tier = (typeof TIERS)[number];

export const COHORT_SIZE = 30;
export const PROMOTE_COUNT = 10;
export const DEMOTE_COUNT = 5;
/** Cohorts smaller than this don't demote anyone (too small to be fair). */
export const MIN_FOR_DEMOTION = 10;

export type Outcome = 'promoted' | 'demoted' | 'stayed';

/** One tier up, clamped at Diamond. */
export function promote(tier: Tier): Tier {
  const i = TIERS.indexOf(tier);
  return TIERS[Math.min(i + 1, TIERS.length - 1)]!;
}

/** One tier down, clamped at Bronze. */
export function demote(tier: Tier): Tier {
  const i = TIERS.indexOf(tier);
  return TIERS[Math.max(i - 1, 0)]!;
}

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

/** The Monday-00:00-UTC date ('YYYY-MM-DD') of the week containing `now`. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat → days since Monday
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** The week key immediately before `weekKey` (its Monday, seven days earlier). */
export function previousWeek(weekKey: string): string {
  return new Date(Date.parse(`${weekKey}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
}

export interface CohortMember {
  userId: string;
  weeklyXp: number;
}

export interface Standing {
  userId: string;
  rank: number;
  weeklyXp: number;
  outcome: Outcome;
}

/**
 * Rank a cohort by weekly XP (ties broken by userId for determinism) and decide
 * each member's outcome: the top `PROMOTE_COUNT` promote, the bottom
 * `DEMOTE_COUNT` demote — but only when the cohort is big enough to demote
 * fairly (the <10-active merge rule). The caller maps outcomes to tier moves.
 */
export function resolveStandings(members: CohortMember[]): Standing[] {
  const ranked = [...members].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.userId.localeCompare(b.userId),
  );
  const n = ranked.length;
  const demoteFrom = n >= MIN_FOR_DEMOTION ? n - DEMOTE_COUNT : n; // no demotions when too small
  return ranked.map((m, i) => {
    let outcome: Outcome = 'stayed';
    if (i < PROMOTE_COUNT) outcome = 'promoted';
    else if (i >= demoteFrom) outcome = 'demoted';
    return { userId: m.userId, rank: i + 1, weeklyXp: m.weeklyXp, outcome };
  });
}
