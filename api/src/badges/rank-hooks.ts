import type pg from 'pg';
import { RANK_TIER_KEYS, isRankTier, tierIndex, type RankedGame } from '@kurda/shared';
import type { RankEvents, RatedGameFinished as RanksGameFinished, SeasonClosed as RanksSeasonClosed } from '../ranks/events.js';

/**
 * How the ranked badges hear from Game Ranks: they subscribe to `ranks.events`, which reports a rated game once
 * its rating changes commit and a season once it closes. The badges count tiers as indices (0 Deşt … 5 Stêrk,
 * null while placing) so measures can compare them in SQL; this file is the one place tier keys become indices,
 * so the two modules cannot disagree. Both listeners are idempotent and never throw for a badge they could not
 * count.
 */

export interface RatedGamePlayer {
  userId: string;
  /** finishing place, 1 = first; equal places are a tie; a player who left ranks last */
  place: number;
  /** left the started game (counted as last; not a fair-play game) */
  left: boolean;
  /** rank tier before the game (index, see above), null while placing */
  tierBefore: number | null;
  /** rank tier after the game, null while still placing */
  tierAfter: number | null;
  /** this game finished their placement games, or they had finished them before */
  placementDone: boolean;
  /**
   * How many tiers above the player the strongest one they finished ahead of was (the engine's `beatTierGap`; 0
   * while placing, and leavers do not count). Kewê çiyê takes 2.
   */
  beatTierGap: number;
}

export interface RatedGameFinished {
  game: RankedGame;
  /** the game's own id (its lobby id): with `game` and the player, the row's key */
  gameRef: string;
  /** the season the game counted in, e.g. '2026-Q4' */
  seasonId: string;
  finishedAt?: Date;
  players: RatedGamePlayer[];
}

export interface SeasonClosed {
  seasonId: string;
  /** one row per player and game they played rated that season */
  results: Array<{
    userId: string;
    game: RankedGame;
    /** highest tier reached in the season (index), null if they never finished placement */
    peakTier: number | null;
    ratedGames: number;
  }>;
}

export interface RankEventsListener {
  onRatedGameFinished(event: RatedGameFinished): Promise<void>;
  onSeasonClosed(event: SeasonClosed): Promise<void>;
}

type Executor = Pick<pg.Pool, 'query'>;

/** A rank tier key as the badges count it: its place in the climb (0 Deşt … 5 Stêrk), null for none. */
export function rankTierIndex(tier: string | null | undefined): number | null {
  return tier != null && isRankTier(tier) ? tierIndex(tier) : null;
}

/** SQL: the index of the tier key in `expr` (a column of the ranks module's tables), NULL for none. */
export function rankTierIndexSql(expr: string): string {
  return `CASE ${expr} ${RANK_TIER_KEYS.map((k) => `WHEN '${k}' THEN ${tierIndex(k)}`).join(' ')} END`;
}

/** A rated game as the ranks module tells it, as the badges record it. */
export function ratedGameForBadges(e: RanksGameFinished): RatedGameFinished {
  return {
    game: e.game,
    gameRef: e.gameRef,
    seasonId: e.seasonId,
    finishedAt: e.at,
    players: e.players.map((p) => ({
      userId: p.userId,
      place: p.place,
      left: p.left,
      tierBefore: rankTierIndex(p.tierBefore),
      tierAfter: rankTierIndex(p.tierAfter),
      // a tier after the game is shown only once placement is done
      placementDone: p.tierAfter !== null,
      beatTierGap: p.beatTierGap,
    })),
  };
}

/** A closed season with each player's final peak per game, from `rank_season_results`. */
export async function seasonForBadges(db: Executor, e: Pick<RanksSeasonClosed, 'seasonId'>): Promise<SeasonClosed> {
  const rows = await db.query<{ user_id: string; game: RankedGame; peak_tier: string | null; rated_games: number }>(
    `SELECT user_id, game, peak_tier, rated_games FROM rank_season_results WHERE season_id = $1 ORDER BY user_id, game`,
    [e.seasonId],
  );
  return {
    seasonId: e.seasonId,
    results: rows.rows.map((r) => ({
      userId: r.user_id,
      game: r.game,
      peakTier: rankTierIndex(r.peak_tier),
      ratedGames: r.rated_games,
    })),
  };
}

/**
 * Subscribes the badges to Game Ranks' events and returns the unsubscribe. `RankEvents` logs a listener's failure,
 * which never reaches the game or the season close.
 */
export function listenToRanks(events: RankEvents, badges: RankEventsListener, db: Executor): () => void {
  const stopGames = events.onRatedGameFinished((e) => badges.onRatedGameFinished(ratedGameForBadges(e)));
  const stopSeasons = events.onSeasonClosed(async (e) => badges.onSeasonClosed(await seasonForBadges(db, e)));
  return () => {
    stopGames();
    stopSeasons();
  };
}
