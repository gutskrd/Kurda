/**
 * What the admin's Ranks, Seasons, Leagues and Badges pages read (contract 4,
 * §U Admin): the API's shapes that @kurda/shared does not carry, and the plain
 * words for its keys. Names are the Kurmancî ones with their English meaning
 * beside them ("Çiya (Mountain)"), as the apps show them; the admin is in
 * English, so nothing here is translated.
 *
 * Pure data and functions, tested without a browser.
 */
import {
  APEX_TIER,
  BADGE_TIERS,
  BADGE_TIER_META,
  LEAGUE_TIER_META,
  RANK_REASONS,
  RANK_TIERS,
  SEASON_LABELS,
  XP_BANDS,
  isSeasonId,
  seasonById,
  type BadgeDef,
  type BadgeFamily,
  type Division,
  type LeagueStanding,
  type LeagueTier,
  type RankReason,
  type RankTier,
  type RankedGame,
} from '@kurda/shared';
import { RANK_TOOL_ROLES } from './navigation';
import type { Tone } from './ui';

// ---- names -----------------------------------------------------------------------

export const GAME_NAME: Readonly<Record<RankedGame, string>> = {
  'wordle-battle': 'Peyvok Battle',
  'rhyme-match': 'Rhyme Match',
  stories: 'Stories',
};

/** "Çiya (Mountain)" */
export function rankTierName(tier: RankTier): string {
  const t = tier === 'sterk' ? APEX_TIER : RANK_TIERS.find((r) => r.key === tier)!;
  return `${t.name} (${t.meaning})`;
}

/** The Kurmancî name alone, for a tight cell: "Çiya" */
export function rankTierShort(tier: RankTier): string {
  return tier === 'sterk' ? APEX_TIER.name : RANK_TIERS.find((r) => r.key === tier)!.name;
}

const ROMAN: Readonly<Record<Division, string>> = { 1: 'I', 2: 'II', 3: 'III' };

/** "Çiya II", "Stêrk", or "Placing 2/5" while there is no tier yet */
export function rankLine(tier: RankTier | null, division: Division | null, placement?: { played: number; of: number } | null): string {
  if (tier === null) return placement ? `Placing ${placement.played}/${placement.of}` : 'Placing';
  return division && tier !== 'sterk' ? `${rankTierShort(tier)} ${ROMAN[division]}` : rankTierShort(tier);
}

/** "Çem (River)" */
export function leagueTierName(tier: LeagueTier): string {
  const m = LEAGUE_TIER_META[tier];
  return `${m.nameKu} (${m.meaningEn})`;
}

/** "Payîz 2026 (Autumn)", or the id itself when it is not one */
export function seasonName(id: string): string {
  if (!isSeasonId(id)) return id;
  const s = seasonById(id);
  return `${SEASON_LABELS[s.name].ku} ${s.year} (${SEASON_LABELS[s.name].en})`;
}

/** "Zêr (Gold)" for tier 3; tier 0 is "none" */
export function badgeTierName(tier: number): string {
  const key = BADGE_TIERS[tier - 1];
  if (!key) return 'None';
  return `${BADGE_TIER_META[key].nameKu} (${BADGE_TIER_META[key].meaningEn})`;
}

export const FAMILY_NAME: Readonly<Record<BadgeFamily, string>> = {
  learning: 'Learning',
  habit: 'Habit',
  games: 'Games',
  ranked: 'Ranked',
  friends: 'Friends',
  events: 'Events',
  secret: 'Secret',
};

/** "30 days", "all units" — what a tier asks for */
export function thresholdText(def: Pick<BadgeDef, 'unit'>, threshold: number | 'all'): string {
  if (threshold === 'all') return `all ${def.unit}`;
  return `${threshold.toLocaleString()} ${threshold === 1 ? singular(def.unit) : def.unit}`;
}

function singular(unit: string): string {
  if (unit === 'wpm') return 'wpm';
  if (unit === 'times') return 'time';
  return unit.endsWith('s') ? unit.slice(0, -1) : unit;
}

/** The plain reason a rated game moved a player, as the apps word it. */
export const REASON_TEXT: Readonly<Record<RankReason, string>> = {
  placement: 'placement game',
  'beat-stronger': 'beat a higher-ranked player',
  'expected-win': 'expected win',
  won: 'won',
  draw: 'draw',
  'lost-to-stronger': 'lost to a stronger player',
  'lost-to-weaker': 'lost to a lower-ranked player',
  lost: 'lost',
  left: 'left the game',
  shield: 'held by the shield',
};

export function reasonText(reason: string | null): string {
  if (!reason) return '';
  return (RANK_REASONS as readonly string[]).includes(reason) ? REASON_TEXT[reason as RankReason] : reason.replace(/-/g, ' ');
}

/** "+18", "−6", "±0" — the true minus sign, as the apps write a change */
export function signed(n: number): string {
  if (n === 0) return '±0';
  return n > 0 ? `+${n.toLocaleString()}` : `−${Math.abs(n).toLocaleString()}`;
}

export function percent(share: number): string {
  if (share === 0) return '0%';
  const p = share * 100;
  return `${p < 1 ? p.toFixed(1) : Math.round(p)}%`;
}

// ---- what the API sends -----------------------------------------------------------

/** `GET /admin/ranks/top/:game` */
export interface TopPlayer {
  userId: string;
  username: string;
  points: number;
  ratedGames: number;
  wins: number;
  lastRatedAt: string | null;
}

/** `GET /admin/seasons` */
export interface SeasonList {
  current: string;
  seasons: Array<{ id: string; closedAt: string | null; rewardedAt: string | null; rewards: number; gems: number }>;
}

/** A league run (`league_runs`): the Monday settle or the Wednesday merge of one week. */
export interface LeagueRunStatus {
  kind: 'settle' | 'merge';
  weekKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  lastError: string | null;
  result: Record<string, unknown>;
}

export interface LeagueGroupRow {
  id: string;
  tier: LeagueTier;
  members: number;
  active: number;
  xpBand: number;
  tzOffsetMin: number;
  settled: boolean;
  mergedInto: string | null;
}

/** `GET /admin/leagues?week=` */
export interface LeagueOverview {
  weekKey: string;
  goalXp: number;
  /** the settle that ran as this week began (it closed the week before) */
  settle: LeagueRunStatus | null;
  /** the settle that closed this week; null until it has run */
  closedBy: LeagueRunStatus | null;
  merge: LeagueRunStatus | null;
  groups: LeagueGroupRow[];
  tiers: Record<LeagueTier, number>;
}

/** `GET /admin/leagues/groups/:id` */
export interface LeagueGroupDetail {
  id: string;
  weekKey: string;
  tier: LeagueTier;
  settled: boolean;
  standings: Array<LeagueStanding & { username: string }>;
}

/** `GET /admin/badges` */
export interface BadgeCatalogue {
  families: readonly BadgeFamily[];
  badges: Array<BadgeDef & { holders: number[]; rarity: number[] | null }>;
  rarityComputedAt: string | null;
  activeUsers: number | null;
}

/** `GET /admin/users/:id/badges` */
export interface UserBadges {
  badges: Array<{ key: string; tier: number; progress: number; floorTier: number; capTier: number | null; earnedAt: string | null }>;
  actions: Array<{ key: string; action: 'award' | 'revoke'; tier: number; reason: string; adminId: string | null; at: string }>;
}

// ---- reading a run ----------------------------------------------------------------

export interface RunState {
  /** a word for the badge */
  label: string;
  tone: Tone;
  /** what it did, or what went wrong */
  detail: string | null;
}

/**
 * Where a settle or a merge stands. A run that started and has neither
 * finished nor failed is running — or stopped half way (a crash, a deploy),
 * which looks the same from here; after an hour it says so, because then a
 * re-run with "force" is what finishes it.
 */
export function runState(run: LeagueRunStatus | null, now: Date = new Date()): RunState {
  if (!run) return { label: 'Not run yet', tone: 'neutral', detail: null };
  if (run.lastError) return { label: 'Failed', tone: 'bad', detail: run.lastError };
  if (run.finishedAt) return { label: 'Done', tone: 'ok', detail: runResult(run) };
  const started = run.startedAt ? new Date(run.startedAt).getTime() : now.getTime();
  if (now.getTime() - started > 3_600_000) return { label: 'Stopped half way', tone: 'warn', detail: 'Started over an hour ago and never finished. Run it again with “force” to finish it.' };
  return { label: 'Running', tone: 'info', detail: null };
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const plural = (count: number, one: string, many: string): string => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** "Settled 12 groups · 40 personal weeks · 3 told of a promotion" */
export function runResult(run: LeagueRunStatus): string {
  const r = run.result ?? {};
  if (run.kind === 'merge') return `Merged ${plural(n(r.merged), 'small group', 'small groups')}`;
  const parts = [`Settled ${plural(n(r.cohorts), 'group', 'groups')}`, plural(n(r.personal), 'personal week', 'personal weeks')];
  if (n(r.reset) > 0) parts.push(`${plural(n(r.reset), 'learner', 'learners')} moved down for the new season`);
  parts.push(`${n(r.notified).toLocaleString()} told of a promotion or a trophy`);
  return parts.join(' · ');
}

// ---- weeks ------------------------------------------------------------------------

/** "13 Oct – 19 Oct 2026" for the week that starts on Monday `weekKey` (UTC dates) */
export function weekLabel(weekKey: string): string {
  const start = new Date(`${weekKey}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const day = (d: Date, year: boolean): string =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });
  return `${day(start, false)} – ${day(end, true)}`;
}

/**
 * A group's XP band (`xpBand` in @kurda/shared: an index into XP_BANDS) as
 * the last four weeks' XP it stands for: "under 150", "150–599", "3,000+".
 */
export function xpBandText(band: number): string {
  const lo = band === 0 ? 0 : XP_BANDS[band - 1];
  const hi = XP_BANDS[band];
  if (lo === undefined) return `band ${band}`;
  if (band === 0) return `under ${hi!.toLocaleString()}`;
  return hi === undefined ? `${lo.toLocaleString()}+` : `${lo.toLocaleString()}–${(hi - 1).toLocaleString()}`;
}

/** "UTC+3", "UTC−5:30" for a group's clock */
export function utcOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The longest reason the rank and badge routes take; they ask for at least three characters. */
export const REASON_MAX = 500;
export function reasonProblem(value: string): string | null {
  const t = value.trim();
  if (t.length < 3) return 'Say why in a few words (at least 3 characters).';
  if (t.length > REASON_MAX) return `Keep it under ${REASON_MAX} characters.`;
  return null;
}

/**
 * Whether these staff roles may use the rank, league, season and badge tools:
 * the legacy `admin` role or `superadmin`, as every one of their routes is
 * guarded (RANK_TOOL_ROLES).
 */
export function holdsRankTools(staffRoles: readonly string[]): boolean {
  return RANK_TOOL_ROLES.some((r) => staffRoles.includes(r));
}
