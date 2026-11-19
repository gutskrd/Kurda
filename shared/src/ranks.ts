/**
 * Game Ranks, which have ended: every game now plays as friendly and nothing is rated. What stays is what the stored
 * history, the season frames people still wear and installed phone builds rely on: the ranked games, the tier table and
 * its art, the season calendar, the reason codes and the API shapes, which the API now answers empty. The Kurmancî tier
 * names are canonical; every app translates them. [native-speaker review]
 */
import type { PlayGame } from './play.js';
import { MULTI_GAMES } from './games/multi/games.js';

// ---------------------------------------------------------------------------
// which games have a rank
// ---------------------------------------------------------------------------

/**
 * The games with opponents. Duo and group Stories share the Stories rating; Typing Race and the solo games have nobody to
 * rank against. A game against Hevalo plays as friendly.
 */
export const RANKED_GAMES = ['wordle-battle', 'rhyme-match', 'stories', ...MULTI_GAMES] as const satisfies readonly PlayGame[];
export type RankedGame = (typeof RANKED_GAMES)[number];

export function isRankedGame(v: unknown): v is RankedGame {
  return (RANKED_GAMES as readonly unknown[]).includes(v);
}

// ---------------------------------------------------------------------------
// placing and the shield, as older results show them
// ---------------------------------------------------------------------------

/** The first rated games of a game show "Placing 3/5" and no tier yet. */
export const PLACEMENT_GAMES = 5;
/** After reaching a new tier (not a division), this many rated games cannot drop you below its floor. */
export const SHIELD_GAMES = 3;

// ---------------------------------------------------------------------------
// tiers: the one table, tuned here
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

/** Each tier has three divisions of this many points: III, II, I (I highest). */
const DIVISION_POINTS = 100;
/** 3 is III (lowest), 1 is I (highest). Lûtke I is open-ended (1400+). */
export type Division = 1 | 2 | 3;

/** The points tier for a score; Stêrk is decided on top of this, by standing. */
export function tierOf(points: number): PointsTier {
  let tier: PointsTier = RANK_TIERS[0].key;
  for (const t of RANK_TIERS) if (points >= t.floor) tier = t.key;
  return tier;
}

/** The lowest score of a points tier. */
function tierFloor(tier: PointsTier): number {
  return RANK_TIERS.find((t) => t.key === tier)!.floor;
}

/** Position in the climb, 0 Deşt to 5 Stêrk, for comparing tiers. */
export function tierIndex(tier: RankTier): number {
  return RANK_TIER_KEYS.indexOf(tier);
}

/** The division within the tier: 3 (III) for its first hundred points, then 2, then 1. */
function divisionOf(points: number): Division {
  const into = Math.max(0, points - tierFloor(tierOf(points)));
  const step = Math.floor(into / DIVISION_POINTS);
  return step >= 2 ? 1 : step === 1 ? 2 : 3;
}

export interface RankStep {
  tier: PointsTier;
  division: Division;
}

export interface Progress {
  /** the division after this one, or null at Lûtke I, the last step (Stêrk is by standing) */
  next: RankStep | null;
  /** the current division's first point and the next one's */
  from: number;
  to: number | null;
  /** 0..1 along the current division (1 at Lûtke I) */
  fraction: number;
  pointsToGo: number | null;
}

/** How far along the current division a score is and what comes next, for the progress bar. */
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

// ---------------------------------------------------------------------------
// seasons
// ---------------------------------------------------------------------------

/**
 * Seasons follow the calendar quarters (UTC) and are named for the season they mostly fall in, with the year: Zivistan
 * (Jan–Mar), Bihar (Apr–Jun), Havîn (Jul–Sep), Payîz (Oct–Dec).
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
  /** such as '2026-Q4': the key the API stores everything under */
  id: string;
  name: SeasonName;
  year: number;
  /** ISO instants, start inclusive, end exclusive */
  startsAt: string;
  endsAt: string;
}

const SEASON_ID = /^(\d{4})-Q([1-4])$/;

/** The season with this id ('2026-Q4'). */
function seasonById(id: string): Season {
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

/** Whole days left in a season at `now`, 0 on its last day. */
export function seasonDaysLeft(season: Season, now: Date): number {
  const ms = new Date(season.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** The profile frame, a cosmetic kept forever, for a season's best peak tier; Lûtke and Stêrk are animated. */
export function seasonFrameSku(tier: RankTier): string {
  return tier === 'lutke' || tier === 'sterk' ? `frame_rank_${tier}_animated` : `frame_rank_${tier}`;
}

// ---------------------------------------------------------------------------
// rated or friendly
// ---------------------------------------------------------------------------

/**
 * Why a game the host set to Rated plays as friendly, decided at the start and previewed in the lobby: `chosen`, the host
 * chose Friendly; `solo` and `need-two`, nobody to rank against; `unverified` and `no-birth-month`, someone lacks a
 * confirmed email or a birth month; `restricted`, someone may not play rated (suspended, banned or under review);
 * `cooldown`, someone left several rated games in a row; `repeat-opponent`, the same players have played many rated games
 * together today.
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

/** A game's Rated or Friendly badge, shown in the invite banner, the card, the lobby and the game header before anyone joins. */
export interface RatedState {
  /** what the host chose, the badge before the start */
  rated: boolean;
  /** decided at the start: true counts, false plays as friendly; null before then */
  counts: boolean | null;
  /** why it plays as friendly, once decided (`chosen` when the host chose Friendly) */
  friendlyReason: FriendlyReason | null;
  /** counted, but less: the same players have played rated together several times today */
  damped: boolean;
}

/**
 * The one plain reason a rated result is explained with, never a sad one: `placement` (one of the first five games),
 * `beat-stronger`, `expected-win`, `won` (between equals), `draw`, `lost-to-stronger` ("close game against a stronger
 * player"), `lost-to-weaker` and `lost`, `left` (counts as last place), and `shield` (the tier's shield held you at its
 * floor).
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
  /** rated games the shield still covers (0: none) */
  shieldGames: number;
  progress: Progress | null;
  ratedGames: number;
  wins: number;
  season: { id: string; ratedGames: number; wins: number; peakPoints: number; peakTier: PointsTier | null };
  /** the best points ever reached in this game */
  bestPoints: number;
  /** no rated game for four weeks: others see "Resting" */
  resting: boolean;
  lastRatedAt: string | null;
}

export interface MyRanks {
  ranks: RankCard[];
  /** set while a rated-game cooldown runs after leaving several rated games in a row */
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
      /** The share of a full change applied (1 is full): `damping` × `newAccountLimit`, each with its own reason for the client to say. */
      weight: number;
      /** repeat-opponent damping for the whole game, decided at its start (1: none) */
      damping: number;
      /** how far new accounts among your opponents may move you (1: none were new; down to 0.5) */
      newAccountLimit: number;
      progress: Progress | null;
    }
  | {
      game: RankedGame;
      gameRef: string;
      counted: false;
      friendlyReason: FriendlyReason | null;
      /** the game counted but its result is not in yet, or an admin voided it */
      pending?: boolean;
      voided?: boolean;
    };

/**
 * Why a counted result moved you less than a full game, the line both apps put under it: the same players have played
 * many rated games together today, someone in it is new, or both. Null for a full-weight result.
 */
export type PartWeightReason = 'repeat-opponent' | 'new-account' | 'both';

export function partWeightReason(r: { damping: number; newAccountLimit: number }): PartWeightReason | null {
  const repeat = r.damping < 1;
  const fresh = r.newAccountLimit < 1;
  if (repeat && fresh) return 'both';
  if (repeat) return 'repeat-opponent';
  return fresh ? 'new-account' : null;
}

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

/** `GET /ranks/expected/:game/:lobbyId`: "Win ≈ +24 · Lose ≈ −8", per opponent. */
export interface ExpectedGains {
  game: RankedGame;
  lobbyId: string;
  rated: boolean;
  /** whether it would count if it started now, and if not why (`self` when the reason is the viewer's own) */
  wouldCount: boolean;
  friendlyReason: FriendlyReason | null;
  self: boolean;
  me: { points: number; tier: PointsTier | null; division: Division | null; placing: boolean };
  opponents: ExpectedOpponent[];
  /** three or more players: finishing first and finishing last */
  first: number | null;
  last: number | null;
}

/** A season's result in one game, kept forever as the emblem. */
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
  /** "Placing 2/5" while placing, else null (as on `RankCard`) */
  placement: { played: number; of: number } | null;
  /** the best tier this season and ever */
  seasonPeakTier: PointsTier | null;
  bestTier: PointsTier | null;
}
