/**
 * Learning Leagues: the weekly table that rewards effort. Six tiers named after water, from a drop to the ocean, as
 * knowledge gathers. Groups of about twenty form only from people who earned learning XP that week; promotion needs the
 * weekly goal as well as a place near the top, only someone who missed the goal is ever demoted, and the two lowest tiers
 * never demote. Shared so the API, both apps and the admin agree on tier keys, the week, the goal and the zones.
 *
 * Kurdish names marked [review] await a native speaker's check.
 */

/** Low to high. Stable keys: the API stores and sends these and clients translate them. */
export const LEAGUE_TIERS = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

export interface LeagueTierMeta {
  key: LeagueTier;
  /** the Kurmancî name as written [review] */
  nameKu: string;
  /** what the name means, in English */
  meaningEn: string;
  /** catalogue key for the translated name ("Kanî League", "Kanî — Spring") */
  nameKey: `leagues.tier.${LeagueTier}`;
}

export const LEAGUE_TIER_META: Readonly<Record<LeagueTier, LeagueTierMeta>> = {
  dilop: { key: 'dilop', nameKu: 'Dilop', meaningEn: 'Drop', nameKey: 'leagues.tier.dilop' }, // [review]
  kani: { key: 'kani', nameKu: 'Kanî', meaningEn: 'Spring', nameKey: 'leagues.tier.kani' }, // [review]
  cem: { key: 'cem', nameKu: 'Çem', meaningEn: 'River', nameKey: 'leagues.tier.cem' }, // [review]
  gol: { key: 'gol', nameKu: 'Gol', meaningEn: 'Lake', nameKey: 'leagues.tier.gol' }, // [review]
  derya: { key: 'derya', nameKu: 'Derya', meaningEn: 'Sea', nameKey: 'leagues.tier.derya' }, // [review]
  okyanus: { key: 'okyanus', nameKu: 'Okyanûs', meaningEn: 'Ocean', nameKey: 'leagues.tier.okyanus' }, // [review]
};

/** The ten old tiers and where each lands: two to one, the top one alone, so nobody moves down and Okyanûs stays where only the old top tier reached. */
export const LEGACY_LEAGUE_TIERS: Readonly<Record<string, LeagueTier>> = {
  bronze: 'dilop',
  silver: 'dilop',
  gold: 'kani',
  sapphire: 'kani',
  ruby: 'cem',
  emerald: 'cem',
  amethyst: 'gol',
  pearl: 'gol',
  obsidian: 'derya',
  diamond: 'okyanus',
};

/** Where a league starts: everyone's first week is in Dilop. */
export const FIRST_LEAGUE_TIER: LeagueTier = 'dilop';

/** A group fills to this many and then locks. */
export const LEAGUE_GROUP_TARGET = 20;
/** Below this a group is too small for a fair race: it never demotes, and on `MERGE_WEEKDAY` it merges into the nearest open group. */
export const LEAGUE_GROUP_MIN = 8;
/** The top quarter of a group moves up… */
export const PROMOTE_SHARE = 0.25;
/** …and the bottom 15% of those who missed their goal move down. */
export const DEMOTE_SHARE = 0.15;
/** Tiers nobody is ever demoted from, so a beginner is never pushed back for trying. */
export const NO_DEMOTION_TIERS: readonly LeagueTier[] = ['dilop', 'kani'];
/** In the top tier nobody moves up; the top three of a group get the Pêla (wave) trophy instead [review]. */
export const TROPHY_PLACES = 3;
/** The default weekly XP goal: meet it and a promotion counts and demotion cannot happen. The API's setting can change it. */
export const DEFAULT_WEEKLY_GOAL_XP = 150;
/** At each new season everyone drops this many tiers (never below Dilop), so the top stays reachable. */
export const SEASON_TIER_DROP = 2;
/** Groups still under `LEAGUE_GROUP_MIN` at 00:00 on this UTC weekday (3: Wednesday) are merged. */
export const MERGE_WEEKDAY = 3;
/** Groups form from people whose clocks are within this many minutes. */
export const TIMEZONE_WINDOW_MIN = 6 * 60;

export function isLeagueTier(value: unknown): value is LeagueTier {
  return typeof value === 'string' && (LEAGUE_TIERS as readonly string[]).includes(value);
}

/** 0 for Dilop to 5 for Okyanûs. */
export function leagueTierIndex(tier: LeagueTier): number {
  return LEAGUE_TIERS.indexOf(tier);
}

/** One tier up, clamped at Okyanûs. */
export function tierAbove(tier: LeagueTier): LeagueTier {
  return LEAGUE_TIERS[Math.min(leagueTierIndex(tier) + 1, LEAGUE_TIERS.length - 1)]!;
}

/** One tier down, clamped at Dilop. */
export function tierBelow(tier: LeagueTier): LeagueTier {
  return LEAGUE_TIERS[Math.max(leagueTierIndex(tier) - 1, 0)]!;
}

/** Where a tier lands after `seasons` season resets of `SEASON_TIER_DROP` each. */
export function seasonDrop(tier: LeagueTier, seasons = 1): LeagueTier {
  const steps = Math.max(0, seasons) * SEASON_TIER_DROP;
  return LEAGUE_TIERS[Math.max(leagueTierIndex(tier) - steps, 0)]!;
}

/** A stored tier that may be an old key or junk, read as a current key. */
export function toLeagueTier(value: string | null | undefined): LeagueTier | null {
  if (value == null) return null;
  if (isLeagueTier(value)) return value;
  return LEGACY_LEAGUE_TIERS[value] ?? null;
}

// ---- the week -----------------------------------------------------------------

const DAY_MS = 86_400_000;

/** The Monday-00:00-UTC date ('YYYY-MM-DD') of the week containing `now`. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay counts from Sunday; this counts days since Monday.
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

/** The week key seven days before `weekKey`. */
export function previousWeek(weekKey: string): string {
  return new Date(Date.parse(`${weekKey}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
}

/** The week key seven days after `weekKey`. */
export function nextWeek(weekKey: string): string {
  return new Date(Date.parse(`${weekKey}T00:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
}

/** When the week closes: the next Monday, 00:00 UTC. Clients show it in local time. */
export function weekEndsAt(weekKey: string): Date {
  return new Date(Date.parse(`${weekKey}T00:00:00Z`) + 7 * DAY_MS);
}

/** When small groups of the week are merged (Wednesday 00:00 UTC). */
export function weekMergeAt(weekKey: string): Date {
  return new Date(Date.parse(`${weekKey}T00:00:00Z`) + (MERGE_WEEKDAY - 1) * DAY_MS);
}

/** The season a moment belongs to, calendar quarters in UTC ('2026-Q4'); leagues drop tiers when a week's Monday is in a new one. */
export function seasonKeyFor(at: Date): string {
  return `${at.getUTCFullYear()}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
}

/** The season a league week belongs to: the one its Monday is in. */
export function weekSeason(weekKey: string): string {
  return seasonKeyFor(new Date(`${weekKey}T00:00:00Z`));
}

/** How many seasons lie between two season keys; 0 when `to` is not later. */
export function seasonsBetween(from: string, to: string): number {
  const parse = (k: string): number | null => {
    const m = /^(\d{4})-Q([1-4])$/.exec(k);
    return m ? Number(m[1]) * 4 + Number(m[2]) - 1 : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return 0;
  return Math.max(0, b - a);
}

// ---- the weekly result -----------------------------------------------------------

export type LeagueOutcome = 'promoted' | 'demoted' | 'stayed';
/** Where a row sits now: moving up, moving down or staying (and safe once the goal is met). */
export type LeagueZone = 'promotion' | 'demotion' | 'stay';

/**
 * Promotion places for one tier's share of a group. A merged group can hold two tiers, each scored on its own
 * (`resolveGroup`); a group of at least `LEAGUE_GROUP_MIN` gives each tier at least one place, so someone merged in from
 * a near-empty tier can still move up.
 */
export function promotionPlaces(tierMembers: number, groupSize: number, tier: LeagueTier): number {
  if (tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1]) return 0;
  const share = Math.floor(tierMembers * PROMOTE_SHARE);
  if (groupSize >= LEAGUE_GROUP_MIN && tierMembers > 0) return Math.max(1, share);
  return share;
}

/** Demotion places for one tier's share of a group: none in a small group, nor in Dilop or Kanî. */
export function demotionPlaces(tierMembers: number, groupSize: number, tier: LeagueTier): number {
  if (groupSize < LEAGUE_GROUP_MIN || NO_DEMOTION_TIERS.includes(tier)) return 0;
  return Math.floor(tierMembers * DEMOTE_SHARE);
}

export interface GroupMember {
  userId: string;
  /** the tier they race in this week; a merged group can hold two */
  tier: LeagueTier;
  weeklyXp: number;
}

export interface LeagueStanding extends GroupMember {
  /** place in the whole group's table, 1-based, ties broken by id so it is stable */
  rank: number;
  /** place among the members of their own tier */
  tierRank: number;
  goalMet: boolean;
  zone: LeagueZone;
  /** what the week means for them if it ended now */
  outcome: LeagueOutcome;
  tierAfter: LeagueTier;
  /** top of an Okyanûs group with the goal met: the Pêla trophy [review] */
  trophy: boolean;
}

/**
 * The week's table and what it means for each member. The group is one table ordered by weekly XP, and each tier in it is
 * scored on its own: the top quarter of that tier move up if they met the goal, and the bottom 15% move down if they
 * missed it, never from Dilop or Kanî and never in a group under eight. Since the goal is in the same XP the table is
 * ordered by, a promotion place is never passed down to someone further back.
 */
export function resolveGroup(members: readonly GroupMember[], goalXp: number): LeagueStanding[] {
  const ordered = [...members].sort((a, b) => b.weeklyXp - a.weeklyXp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const groupSize = ordered.length;
  const byTier = new Map<LeagueTier, GroupMember[]>();
  for (const m of ordered) byTier.set(m.tier, [...(byTier.get(m.tier) ?? []), m]);

  const tierRank = new Map<string, number>();
  for (const list of byTier.values()) list.forEach((m, i) => tierRank.set(m.userId, i + 1));

  return ordered.map((m, i) => {
    const n = byTier.get(m.tier)!.length;
    const place = tierRank.get(m.userId)!;
    const up = promotionPlaces(n, groupSize, m.tier);
    const down = demotionPlaces(n, groupSize, m.tier);
    const goalMet = m.weeklyXp >= goalXp;
    let zone: LeagueZone = 'stay';
    if (place <= up) zone = 'promotion';
    else if (place > n - down && !goalMet) zone = 'demotion';
    const outcome: LeagueOutcome =
      zone === 'promotion' && goalMet ? 'promoted' : zone === 'demotion' ? 'demoted' : 'stayed';
    const top = m.tier === LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
    return {
      ...m,
      rank: i + 1,
      tierRank: place,
      goalMet,
      zone,
      outcome,
      tierAfter: outcome === 'promoted' ? tierAbove(m.tier) : outcome === 'demoted' ? tierBelow(m.tier) : m.tier,
      trophy: top && goalMet && place <= TROPHY_PLACES,
    };
  });
}

/**
 * The bands of the last four weeks' XP learners are grouped by, so a newcomer races other newcomers; 0 is the lightest,
 * and neighbouring bands may share a group.
 */
export const XP_BANDS = [150, 600, 1500, 3000] as const;
export function xpBand(lastFourWeeksXp: number): number {
  let band = 0;
  for (const edge of XP_BANDS) if (lastFourWeeksXp >= edge) band += 1;
  return band;
}

/** Distance between two UTC offsets in minutes, the short way round the clock. */
export function timezoneDistance(aMin: number, bMin: number): number {
  const d = Math.abs(aMin - bMin) % 1440;
  return Math.min(d, 1440 - d);
}

// ---- the shapes the API sends ---------------------------------------------------

export interface LeagueStandingRow {
  /**
   * null for someone the viewer may not see by name (a minor taking part, or an account without a recorded age) unless they
   * are friends. Their place and XP stay, since the table decides who moves up, but nothing identifies them.
   */
  userId: string | null;
  username: string | null;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
  /** the tier this row races in; a merged group can hold two, each scored on its own */
  tier: LeagueTier;
  zone: LeagueZone;
}

/** A finished week, as the learner's own result card shows it. */
export interface LeagueWeekResult {
  weekKey: string;
  mode: 'league' | 'personal';
  /** the tier raced in; null in personal mode */
  tier: LeagueTier | null;
  tierAfter: LeagueTier | null;
  outcome: LeagueOutcome | null;
  rank: number | null;
  groupSize: number | null;
  weeklyXp: number;
  goalXp: number;
  goalMet: boolean;
  trophy: boolean;
  /** Gems paid for the promotion; 0 for the tier's second promotion this season */
  gems: number;
}

/** "You vs last week": the goal ring's history, newest last. */
export interface LeagueWeekXp {
  weekKey: string;
  xp: number;
  goalMet: boolean;
}

/**
 * `GET /me/league`, one shape for every state: `mode: 'personal'`, not taking part (by choice, or a teen who has not
 * chosen), with the goal ring and recent weeks; `mode: 'league'` with `joined: false`, taking part but without learning XP
 * yet this week (a lesson, practice or story joins; opening the page never does); `joined: true`, in a group.
 */
export interface LeagueView {
  mode: 'league' | 'personal';
  /** `mode === 'personal'`, for apps from before modes */
  optedOut: boolean;
  joined: boolean;
  /** the learner's tier; null for someone never in a league */
  tier: LeagueTier | null;
  weekKey: string;
  /** ISO time the week closes (Monday 00:00 UTC), shown in local time without urgency */
  endsAt: string;
  /** XP that counts for the league this week (see the XP rules) */
  weeklyXp: number;
  goalXp: number;
  goalMet: boolean;
  /** met the goal in a league, so demotion is off this week */
  safe: boolean;
  rank: number;
  groupSize: number;
  /** promotion and demotion places for the learner's own tier in their group */
  promoteCount: number;
  demoteCount: number;
  standings: LeagueStandingRow[];
  lastWeek: LeagueWeekResult | null;
  recentWeeks: LeagueWeekXp[];
}

/** What a profile shows of someone's league: only while they take part and once they have a tier. */
export interface ProfileLeague {
  tier: LeagueTier;
}
