/**
 * Game Ranks (contract-4 §R): one skill rating per online game, shown as the
 * points and the mountain tier it climbs through, seasonal, chosen per game
 * (Rated or Friendly).
 *
 * The rating is OpenSkill (Weng-Lin, Plackett-Luce): a mean μ and an
 * uncertainty σ per player and game. What a player sees is one number,
 * `pointsOf(μ, σ)` = 40 × (μ − 3σ), never below 0 — the cautious estimate, so a
 * new player starts at 0 and climbs as the system gets sure of them, and there
 * is no hidden second number to argue about: "your rank is your rating".
 *
 * Everything the API, both apps and the admin panel must agree on lives here:
 * the games that have a rank, the tier table (ONE copy, so it can be tuned in
 * one place), the season calendar and rewards, the reason codes a result is
 * explained with, and the shapes the API sends. Names are catalogue keys: the
 * Kurmancî tier names below are the canonical ones, shown with their English
 * meaning; every app translates them (ckb included) — [native-speaker review].
 */
import type { PlayGame } from './play.js';

// ---------------------------------------------------------------------------
// which games have a rank
// ---------------------------------------------------------------------------

/**
 * The games with opponents. Duo and group Stories share the Stories rating;
 * Typing Race and the solo games have nobody to rank against, so no rank.
 */
export const RANKED_GAMES = ['wordle-battle', 'rhyme-match', 'stories'] as const satisfies readonly PlayGame[];
export type RankedGame = (typeof RANKED_GAMES)[number];

export function isRankedGame(v: unknown): v is RankedGame {
  return (RANKED_GAMES as readonly unknown[]).includes(v);
}

// ---------------------------------------------------------------------------
// the model's constants
// ---------------------------------------------------------------------------

/** OpenSkill's defaults: everyone starts at μ = 25, σ = 25/3, which is 0 points. */
export const START_MU = 25;
export const START_SIGMA = 25 / 3;
/** Shown points per unit of (μ − 3σ). */
export const POINTS_SCALE = 40;

/** The first rated games of a game show "Placing 3/5" and no tier yet. */
export const PLACEMENT_GAMES = 5;
/** After placement, a "?" stays beside the points while σ is above this. */
export const PROVISIONAL_SIGMA = 3;
/** Reaching a new tier (not division): this many rated games cannot drop you below its floor. */
export const SHIELD_GAMES = 3;
/** No rated game for this long: others see "Resting" (the owner still sees the rank). */
export const RESTING_DAYS = 28;
/** σ grows this much per idle week (capped at START_SIGMA): only future gains move, never the points shown. */
export const IDLE_SIGMA_PER_WEEK = 0.1;
/** A new season raises σ to at least this, keeping μ: points dip a little, good players re-climb fast. */
export const SEASON_SIGMA_FLOOR = 4;

/**
 * The apex, Stêrk: Lûtke I, in the top 1% of the game's active rated players
 * (at least the top 20), with 30 rated games and one in the last 14 days.
 */
export const STERK_RULE = { minPoints: 1400, topShare: 0.01, minTop: 20, minGames: 30, activeDays: 14 } as const;
/**
 * Below this many active rated players in a game, percentiles, the Top board
 * and Stêrk stay hidden: a "top 1%" of a dozen people means nothing. Tier and
 * the friends board still show.
 */
export const FEW_PLAYERS = 50;

/**
 * Repeat-opponent damping: the k-th rated game in 24 h between the same two
 * players counts with this weight (1st, 2nd, 3rd, 4th, then 0 — friendly from
 * there). A group game takes the smallest weight among its pairs.
 */
export const REPEAT_WEIGHTS = [1, 1, 0.5, 0.25, 0] as const;
export const REPEAT_WINDOW_HOURS = 24;

/**
 * A new account (under 3 days old, or fewer than 3 finished lessons or games
 * of any kind) may play rated, but moves the others by at most half.
 */
export const NEW_ACCOUNT_RULE = { days: 3, activities: 3, influence: 0.5 } as const;

/**
 * Leaving a started rated game is last place. Leaves in a row, each within 24 h
 * of the one before, add a rated-game cooldown: none for the first, then
 * 10 minutes, 30 minutes, 2 hours (and 2 hours from then on). 24 h without a
 * leave starts the ladder again.
 */
export const LEAVE_COOLDOWN_MINUTES = [0, 10, 30, 120] as const;
export const LEAVE_LADDER_HOURS = 24;

/** The repeat-damping weight of the k-th rated game (k from 1) between a pair. */
export function repeatWeight(k: number): number {
  const i = Math.max(0, Math.min(REPEAT_WEIGHTS.length - 1, Math.floor(k) - 1));
  return REPEAT_WEIGHTS[i]!;
}

/** The cooldown after the `step`-th leave of a ladder (step from 1), in minutes. */
export function leaveCooldownMinutes(step: number): number {
  const i = Math.max(0, Math.min(LEAVE_COOLDOWN_MINUTES.length - 1, Math.floor(step) - 1));
  return LEAVE_COOLDOWN_MINUTES[i]!;
}

// ---------------------------------------------------------------------------
// tiers — the ONE table (tune here)
// ---------------------------------------------------------------------------

/** The points-based tiers, lowest first; Stêrk sits above them and is not points-based. */
export const RANK_TIERS = [
  { key: 'dest', name: 'Deşt', meaning: 'Plain', floor: 0 },
  { key: 'gir', name: 'Gir', meaning: 'Hill', floor: 300 },
  { key: 'zozan', name: 'Zozan', meaning: 'High pasture', floor: 600 },
  { key: 'ciya', name: 'Çiya', meaning: 'Mountain', floor: 900 },
  { key: 'lutke', name: 'Lûtke', meaning: 'Summit', floor: 1200 },
] as const;
export const APEX_TIER = { key: 'sterk', name: 'Stêrk', meaning: 'Star' } as const;

export type PointsTier = (typeof RANK_TIERS)[number]['key'];
export type RankTier = PointsTier | 'sterk';
/** Every tier, lowest first, the apex last. */
export const RANK_TIER_KEYS: readonly RankTier[] = [...RANK_TIERS.map((t) => t.key), APEX_TIER.key];

export function isRankTier(v: unknown): v is RankTier {
  return (RANK_TIER_KEYS as readonly unknown[]).includes(v);
}

/** Each tier has three divisions of this many points: III, II, I (I the highest). */
export const DIVISION_POINTS = 100;
/** 3 = III (lowest), 1 = I (highest). Lûtke I is open-ended (1400+). */
export type Division = 1 | 2 | 3;

/** The points a rating is shown as: 40 × (μ − 3σ), rounded, never below 0. */
export function pointsOf(mu: number, sigma: number): number {
  return Math.max(0, Math.round(POINTS_SCALE * (mu - 3 * sigma)));
}

/** The points tier for a score (Stêrk is decided on top of this, by standing). */
export function tierOf(points: number): PointsTier {
  let tier: PointsTier = RANK_TIERS[0].key;
  for (const t of RANK_TIERS) if (points >= t.floor) tier = t.key;
  return tier;
}

/** The lowest score of a tier (Stêrk: Lûtke I's). */
export function tierFloor(tier: RankTier): number {
  if (tier === 'sterk') return STERK_RULE.minPoints;
  return RANK_TIERS.find((t) => t.key === tier)!.floor;
}

/** Position in the climb, 0 = Deşt … 5 = Stêrk; for comparing tiers. */
export function tierIndex(tier: RankTier): number {
  return RANK_TIER_KEYS.indexOf(tier);
}

/** The division within the tier: 3 (III) for its first hundred points, then 2, then 1. */
export function divisionOf(points: number): Division {
  const into = Math.max(0, points - tierFloor(tierOf(points)));
  const step = Math.floor(into / DIVISION_POINTS);
  return step >= 2 ? 1 : step === 1 ? 2 : 3;
}

export interface RankStep {
  tier: PointsTier;
  division: Division;
}

export interface Progress {
  /** the division after this one, or null at Lûtke I (the climb's last step; Stêrk is by standing) */
  next: RankStep | null;
  /** the current division's first point and the next one's */
  from: number;
  to: number | null;
  /** 0..1 along the current division (1 at Lûtke I) */
  fraction: number;
  pointsToGo: number | null;
}

/** How far along the current division a score is, and what comes next: the progress bar. */
export function progressToNext(points: number): Progress {
  const p = Math.max(0, Math.round(points));
  const tier = tierOf(p);
  const division = divisionOf(p);
  const floor = tierFloor(tier);
  const from = floor + (3 - division) * DIVISION_POINTS;
  if (tier === 'lutke' && division === 1) return { next: null, from, to: null, fraction: 1, pointsToGo: null };
  const to = from + DIVISION_POINTS;
  return {
    next: { tier: tierOf(to), division: divisionOf(to) },
    from,
    to,
    fraction: (p - from) / DIVISION_POINTS,
    pointsToGo: to - p,
  };
}

/** The catalogue key a tier's name is translated under (every app keeps its own catalogue). */
export function tierNameKey(tier: RankTier): string {
  return `ranks.tier.${tier}`;
}

// ---------------------------------------------------------------------------
// seasons
// ---------------------------------------------------------------------------

/**
 * Seasons follow the calendar quarters (UTC) and are named for the season
 * they mostly fall in: Zivistan (Winter, Jan–Mar), Bihar (Spring, Apr–Jun),
 * Havîn (Summer, Jul–Sep), Payîz (Autumn, Oct–Dec) — and the year.
 */
export const SEASON_NAMES = ['zivistan', 'bihar', 'havin', 'payiz'] as const;
export type SeasonName = (typeof SEASON_NAMES)[number];
/** Display forms of the season names [native-speaker review]. */
export const SEASON_LABELS: Readonly<Record<SeasonName, { ku: string; en: string }>> = {
  zivistan: { ku: 'Zivistan', en: 'Winter' },
  bihar: { ku: 'Bihar', en: 'Spring' },
  havin: { ku: 'Havîn', en: 'Summer' },
  payiz: { ku: 'Payîz', en: 'Autumn' },
};

export interface Season {
  /** e.g. '2026-Q4' — the key the API stores everything under */
  id: string;
  name: SeasonName;
  year: number;
  /** ISO instants, start inclusive, end exclusive */
  startsAt: string;
  endsAt: string;
}

const SEASON_ID = /^(\d{4})-Q([1-4])$/;

export function isSeasonId(v: unknown): v is string {
  return typeof v === 'string' && SEASON_ID.test(v);
}

/** The season with this id ('2026-Q4'). */
export function seasonById(id: string): Season {
  const m = SEASON_ID.exec(id);
  if (!m) throw new Error(`not a season id: ${id}`);
  const year = Number(m[1]);
  const q = Number(m[2]) - 1;
  return {
    id,
    name: SEASON_NAMES[q]!,
    year,
    startsAt: new Date(Date.UTC(year, q * 3, 1)).toISOString(),
    endsAt: new Date(Date.UTC(year, q * 3 + 3, 1)).toISOString(),
  };
}

/** The season `at` falls in. */
export function seasonOf(at: Date): Season {
  const q = Math.floor(at.getUTCMonth() / 3) + 1;
  return seasonById(`${at.getUTCFullYear()}-Q${q}`);
}

/** The season before this one. */
export function previousSeasonId(id: string): string {
  const s = seasonById(id);
  return seasonOf(new Date(new Date(s.startsAt).getTime() - 1)).id;
}

/** Whole days left in a season at `now` (0 on its last day), for a calm "12 days left". */
export function seasonDaysLeft(season: Season, now: Date): number {
  const ms = new Date(season.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** "Stêrkê Payîz 2026": the title a season's Stêrk players keep. */
export function sterkTitle(seasonId: string): string {
  const s = seasonById(seasonId);
  return `Stêrkê ${SEASON_LABELS[s.name].ku} ${s.year}`;
}

/** At the end of a season, players with at least this many rated games in a game are rewarded for it. */
export const SEASON_REWARD_MIN_GAMES = 10;

/**
 * The season's Gems by the best peak tier across games (one payout per player
 * per season), to accounts active that season and in good standing. Small on
 * purpose: the frame and the emblem are the reward; Gems never buy a win.
 */
export const SEASON_REWARD_GEMS: Readonly<Record<RankTier, number>> = {
  dest: 10,
  gir: 20,
  zozan: 35,
  ciya: 50,
  lutke: 75,
  sterk: 100,
};

/** The profile frame (a cosmetic, kept forever) for a season's best peak tier; Lûtke and Stêrk are animated. */
export function seasonFrameSku(tier: RankTier): string {
  return tier === 'lutke' || tier === 'sterk' ? `frame_rank_${tier}_animated` : `frame_rank_${tier}`;
}
export const SEASON_FRAME_SKUS: readonly string[] = RANK_TIER_KEYS.map(seasonFrameSku);

// ---------------------------------------------------------------------------
// rated or friendly
// ---------------------------------------------------------------------------

/**
 * Why a game the host set to Rated plays as friendly, decided when it starts
 * (and in the lobby, as "it would be friendly because…"):
 * - `chosen`: the host chose Friendly;
 * - `solo`, `need-two`: nobody to rank against;
 * - `unverified`, `no-birth-month`: someone's account has no confirmed email
 *   or no birth month yet;
 * - `restricted`: someone may not play rated games (suspended, banned, or
 *   their account is under review);
 * - `cooldown`: someone is on a short break from rated games after leaving
 *   several in a row;
 * - `repeat-opponent`: friendly from here — the same players have played a lot
 *   of rated games together today.
 */
export const FRIENDLY_REASONS = [
  'chosen',
  'solo',
  'need-two',
  'unverified',
  'no-birth-month',
  'restricted',
  'cooldown',
  'repeat-opponent',
] as const;
export type FriendlyReason = (typeof FRIENDLY_REASONS)[number];

/**
 * A game's Rated/Friendly badge, shown in the invite banner, the card, the
 * lobby and the game header — before anyone joins.
 */
export interface RatedState {
  /** what the host chose (the badge before the start) */
  rated: boolean;
  /** decided when the game started: true counts, false plays as friendly; null before the start */
  counts: boolean | null;
  /** why it plays as friendly, once decided (`chosen` when the host chose Friendly) */
  friendlyReason: FriendlyReason | null;
  /** counted, but less: the same players have played rated together several times today */
  damped: boolean;
}

/**
 * The one plain reason a rated result is explained with — never a sad one:
 * - `placement`: one of the first five games ("+31 · placement game");
 * - `beat-stronger`: you beat a higher-ranked player ("+24 · you beat a higher-ranked player");
 * - `expected-win`: a win against a lower-ranked player ("+7 · expected win");
 * - `won`: a win between equals;
 * - `draw`: a tie;
 * - `lost-to-stronger`: a loss to a higher-ranked player ("−6 · close game against a stronger player");
 * - `lost-to-weaker`, `lost`: a loss to a lower-ranked player, or between equals;
 * - `left`: you left the game (it counts as last place);
 * - `shield`: your tier's shield held you at its floor.
 */
export const RANK_REASONS = [
  'placement',
  'beat-stronger',
  'expected-win',
  'won',
  'draw',
  'lost-to-stronger',
  'lost-to-weaker',
  'lost',
  'left',
  'shield',
] as const;
export type RankReason = (typeof RANK_REASONS)[number];

// ---------------------------------------------------------------------------
// what the API sends
// ---------------------------------------------------------------------------

/** Your rank in one game: `GET /ranks/me` (all games) and `GET /ranks/me/:game`. */
export interface RankCard {
  game: RankedGame;
  points: number;
  /** null while placing */
  tier: RankTier | null;
  division: Division | null;
  /** "Placing 2/5" while placing, else null */
  placement: { played: number; of: number } | null;
  /** the "?" beside the points: still uncertain after placement */
  provisional: boolean;
  /** rated games the shield still covers (0 = none) */
  shieldGames: number;
  progress: Progress | null;
  ratedGames: number;
  wins: number;
  season: { id: string; ratedGames: number; wins: number; peakPoints: number; peakTier: PointsTier | null };
  /** the best points ever reached in this game */
  bestPoints: number;
  /** no rated game for RESTING_DAYS: others see "Resting" */
  resting: boolean;
  lastRatedAt: string | null;
}

export interface MyRanks {
  ranks: RankCard[];
  /** set while a rated-game cooldown runs (after leaving several rated games in a row) */
  cooldownUntil: string | null;
  season: Season & { daysLeft: number };
}

/** A rated result for one player, as `GET /ranks/results/:game/:ref` gives it to that player. */
export type RankResult =
  | {
      game: RankedGame;
      gameRef: string;
      counted: true;
      pointsBefore: number;
      pointsAfter: number;
      delta: number;
      reason: RankReason;
      tierBefore: PointsTier | null;
      tierAfter: PointsTier | null;
      divisionBefore: Division | null;
      divisionAfter: Division | null;
      tierUp: boolean;
      divisionUp: boolean;
      /** the placement count after this game, while placing */
      placement: { played: number; of: number } | null;
      /** the new shield after a tier-up, or what is left of one */
      shieldGames: number;
      /** repeat-opponent damping applied (1 = none) */
      weight: number;
      progress: Progress | null;
    }
  | {
      game: RankedGame;
      gameRef: string;
      counted: false;
      friendlyReason: FriendlyReason | null;
      /** the game counted, but its result is not in yet, or an admin voided it */
      pending?: boolean;
      voided?: boolean;
    };

/** One opponent in a lobby, by seat (never an account id), with what a win or a loss would do. */
export interface ExpectedOpponent {
  seat: number;
  tier: PointsTier | null;
  division: Division | null;
  placing: boolean;
  /** approximate change in your points: a win against them, a loss to them */
  win: number;
  lose: number;
}

/** `GET /ranks/expected/:game/:lobbyId`: the chess.com "Win ≈ +24 · Lose ≈ −8", per opponent. */
export interface ExpectedGains {
  game: RankedGame;
  lobbyId: string;
  rated: boolean;
  /** whether it would count if it started now, and if not why (`self` true when the reason is the viewer's own) */
  wouldCount: boolean;
  friendlyReason: FriendlyReason | null;
  self: boolean;
  me: { points: number; tier: PointsTier | null; division: Division | null; placing: boolean };
  opponents: ExpectedOpponent[];
  /** three or more players: finishing first and finishing last */
  first: number | null;
  last: number | null;
}

export type RankBoardScope = 'friends' | 'top';

export interface RankBoardEntry {
  position: number;
  /** null: shown as "Player" (Top board: profile not public) */
  name: string | null;
  /** the viewer's own row */
  isMe: boolean;
  points: number;
  tier: RankTier | null;
  division: Division | null;
  placing: boolean;
  resting: boolean;
}

/** `GET /ranks/boards/:game?scope=friends|top` */
export interface RankBoard {
  game: RankedGame;
  scope: RankBoardScope;
  entries: RankBoardEntry[];
  /** your own place on this board, shown only to you (null when you are not on it) */
  me: { position: number; points: number } | null;
  /** Top board only: hidden while the game has fewer than FEW_PLAYERS active rated players */
  hidden: boolean;
  activePlayers: number | null;
}

/** A season's result in one game, kept forever (the emblem). */
export interface SeasonEmblem {
  seasonId: string;
  game: RankedGame;
  peakTier: RankTier;
  peakPoints: number;
  ratedGames: number;
}

/** `GET /ranks/seasons/current` */
export interface SeasonOverview {
  season: Season & { daysLeft: number };
  rewards: Array<{ tier: RankTier; gems: number; frameSku: string }>;
  minGames: number;
  /** the viewer's last season, once it was closed */
  lastSeason: {
    id: string;
    emblems: SeasonEmblem[];
    reward: { tier: RankTier; gems: number; frameSku: string | null; title: string | null } | null;
  } | null;
}

/** A game's rank as someone else's profile shows it. */
export interface ProfileRank {
  game: RankedGame;
  /** null while placing, or while resting (others see "Resting") */
  tier: RankTier | null;
  division: Division | null;
  points: number | null;
  resting: boolean;
  placing: boolean;
  /** the best tier this season and ever */
  seasonPeakTier: PointsTier | null;
  bestTier: PointsTier | null;
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export interface TierSpread {
  game: RankedGame;
  activePlayers: number;
  placing: number;
  tiers: Array<{ tier: RankTier; players: number; share: number }>;
}

/** A pair of players whose rated games together look unusual (signals only, never punished automatically). */
export interface SuspiciousPair {
  game: RankedGame;
  a: { userId: string; username: string };
  b: { userId: string; username: string };
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  /** rated games together in the busiest 24 h */
  peak24h: number;
  sharedDevice: boolean;
  sharedIp: boolean;
  lastGameAt: string;
  score: number;
}
