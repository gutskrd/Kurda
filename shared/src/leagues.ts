/**
 * Learning Leagues: the weekly table that rewards effort (contract 4 §L).
 *
 * Six tiers named after water — a drop becomes a spring, a river, a lake, the
 * sea, the ocean — because knowledge gathers the same way, and because ten
 * gem-named tiers copied Duolingo's identity and were too many for the number
 * of people learning here. Groups of about twenty, formed only from people who
 * earned learning XP that week; promotion needs the weekly goal as well as a
 * place near the top, demotion only ever happens to someone who missed the goal,
 * and the two lowest tiers never demote at all.
 *
 * Shared so the API, the browser, the phone and the admin panel agree on the
 * tier keys, the week, the goal and the zones — and so the three copies of the
 * tier table the old leagues had are one.
 *
 * All Kurdish names are for a native speaker to check: [review].
 */

/** Low to high. Stable keys: the API stores and sends these, clients translate them. */
export const LEAGUE_TIERS = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

export interface LeagueTierMeta {
  key: LeagueTier;
  /** the Kurmancî name, as it is written [review] */
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

/**
 * The ten tiers the leagues had before, and where each lands. Two old tiers to
 * one new one, the top tier on its own, so nobody moves down and Okyanûs is
 * still somewhere only the old Diamond had reached.
 */
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
/**
 * Below this a group is too small to be a fair race: it never demotes, and on
 * Wednesday it is merged into the nearest open group (see `MERGE_WEEKDAY`).
 */
export const LEAGUE_GROUP_MIN = 8;
/** The top quarter of a group moves up… */
export const PROMOTE_SHARE = 0.25;
/** …and the bottom 15% of those who missed their goal move down. */
export const DEMOTE_SHARE = 0.15;
/** Tiers nobody is ever demoted from: a beginner is never pushed back for trying. */
export const NO_DEMOTION_TIERS: readonly LeagueTier[] = ['dilop', 'kani'];
/** In the top tier nobody moves up; the top three of a group get the Pêla (wave) trophy instead [review]. */
export const TROPHY_PLACES = 3;
/**
 * XP that week, by default, for a promotion to count and for nobody to be
 * demoted: met it, and you are safe. The API's own setting can change it.
 */
export const DEFAULT_WEEKLY_GOAL_XP = 150;
/** Gems for moving up, once per tier per season (no farming by going down and up again). */
export const PROMOTION_GEMS = 10;
/** At each new season everyone moves down this many tiers (never below Dilop), so the top stays reachable. */
export const SEASON_TIER_DROP = 2;
/** Groups still under `LEAGUE_GROUP_MIN` at this UTC weekday (3 = Wednesday), 00:00, are merged. */
export const MERGE_WEEKDAY = 3;
/** Groups are formed from people within this many minutes of each other's clock. */
export const TIMEZONE_WINDOW_MIN = 6 * 60;

export function isLeagueTier(value: unknown): value is LeagueTier {
  return typeof value === 'string' && (LEAGUE_TIERS as readonly string[]).includes(value);
}

/** 0 for Dilop … 5 for Okyanûs. */
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

/** A stored tier that may still be an old one (or junk), read as a current key. */
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
  // getUTCDay: 0=Sun..6=Sat → days since Monday
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

/**
 * The season a moment belongs to: calendar quarters in UTC, '2026-Q4'. The
 * leagues reset by `SEASON_TIER_DROP` when the week's Monday falls in a new one.
 */
export function seasonKeyFor(at: Date): string {
  return `${at.getUTCFullYear()}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
}

/** The season a league week belongs to: the one its Monday is in. */
export function weekSeason(weekKey: string): string {
  return seasonKeyFor(new Date(`${weekKey}T00:00:00Z`));
}

/** How many seasons lie between two season keys (0 when `to` is not later). */
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
/** Where a row sits right now: moving up, moving down, or staying (and safe when the goal is met). */
export type LeagueZone = 'promotion' | 'demotion' | 'stay';

/**
 * Promotion places for one tier's share of a group. A merged group can hold two
 * tiers, each scored on its own (`resolveGroup`), so the share is of the tier's
 * own members; a group of at least `LEAGUE_GROUP_MIN` gives each tier in it at
 * least one place, so somebody merged in from a near-empty tier can still move up.
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
  /** the tier they are racing in this week (a merged group can hold two) */
  tier: LeagueTier;
  weeklyXp: number;
}

export interface GroupStanding extends GroupMember {
  /** place in the whole group's table, 1-based (ties broken by id, so stable) */
  rank: number;
  /** place among the members of their own tier */
  tierRank: number;
  goalMet: boolean;
  zone: LeagueZone;
  /** what the week means for them if it ended now */
  outcome: LeagueOutcome;
  tierAfter: LeagueTier;
  /** top of an Okyanûs group, with the goal met: the Pêla trophy [review] */
  trophy: boolean;
}

/**
 * The week's table and what it means for each member (contract 4 §L3).
 *
 * The whole group is one table, ordered by weekly XP. Each tier in it is scored
 * on its own: the top quarter of that tier's members move up — but only with
 * the weekly goal met — and the bottom 15% move down — but only those who
 * missed it, never from Dilop or Kanî, and never in a group under eight. Since
 * the goal is measured in the same XP the table is ordered by, nobody below a
 * member who missed the goal can have met it, so a promotion place is never
 * passed down to someone further back.
 */
export function resolveGroup(members: readonly GroupMember[], goalXp: number): GroupStanding[] {
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
 * The band of the last four weeks' XP a learner is grouped by, so a newcomer
 * races other newcomers rather than someone who does an hour a day. 0 is the
 * lightest. Bands next to each other may share a group.
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
   * null for somebody the viewer may not be shown by name: a minor who chose to
   * take part, or an account whose age is not on record yet, unless they are
   * the viewer's friend. Their place and XP stay — the table decides who moves
   * up, so it cannot have holes — but nothing that identifies them.
   */
  userId: string | null;
  username: string | null;
  weeklyXp: number;
  rank: number;
  isSelf: boolean;
  /** the tier this row races in (a merged group can hold two, each scored on its own) */
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
  /** Gems paid for the promotion (0 when it was this tier's second promotion this season) */
  gems: number;
}

/** "You vs last week": the goal ring's history, newest last. */
export interface LeagueWeekXp {
  weekKey: string;
  xp: number;
  goalMet: boolean;
}

/**
 * `GET /me/league`. One shape for every state:
 *  - `mode: 'personal'` — not taking part (their choice, or a teen who has not
 *    chosen): no group, the same weekly goal ring, and their own recent weeks.
 *  - `mode: 'league'`, `joined: false` — taking part, but no learning XP yet
 *    this week; a lesson, practice or story joins (opening the page never does).
 *  - `mode: 'league'`, `joined: true` — in a group: the table, the zones, safe.
 */
export interface LeagueView {
  mode: 'league' | 'personal';
  /** `mode === 'personal'`, kept for the apps that read it before modes existed */
  optedOut: boolean;
  joined: boolean;
  /** the learner's tier; null for someone who has never been in a league */
  tier: LeagueTier | null;
  weekKey: string;
  /** ISO time the week closes (Monday 00:00 UTC); shown in local time, without urgency */
  endsAt: string;
  /** XP that counts for the league this week (see the XP rules) */
  weeklyXp: number;
  goalXp: number;
  goalMet: boolean;
  /** met the goal in a league: demotion is no longer possible this week */
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

/** What a profile shows of someone's league: only while they take part, and only once they have a tier. */
export interface ProfileLeague {
  tier: LeagueTier;
}
