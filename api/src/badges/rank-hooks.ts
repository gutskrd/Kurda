import type pg from 'pg';
import { RANK_TIER_KEYS, isRankTier, tierIndex, type RankedGame } from '@kurda/shared';
import type { RankEvents, RatedGameFinished as RanksGameFinished, SeasonClosed as RanksSeasonClosed } from '../ranks/events.js';

/**
 * How the ranked family of badges — the tier emblems, Hilkişer, Cîhgirtî,
 * Dilpak and the secret Kewê çiyê — hears from Game Ranks (contract 4 §R →
 * §B2). There is one mechanism: the badges subscribe to `ranks.events`
 * (ranks/events.ts), which tells a rated game once its rating changes are
 * committed and a season once it is closed and rewarded (`listenToRanks`,
 * called by `createProgression` in every process that rates games).
 *
 * The badges count tiers as indices — 0 Deşt, 1 Gir, 2 Zozan, 3 Çiya,
 * 4 Lûtke, 5 Stêrk, null while placing — so their measures can compare them
 * in SQL. The ranks module speaks in tier keys. This file is the one place
 * one becomes the other (`rankTierIndex`, and `rankTierIndexSql` for the
 * measures that read the ranks module's season results directly; both from
 * the shared tier order), so the two modules cannot disagree about a spelling
 * or an order.
 *
 * Both listeners are idempotent (one row per player and game; peaks only go
 * up), so a retry is safe; neither throws for a badge that could not be counted.
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
   * how many tiers above them the strongest player they finished ahead of was
   * (the ranks engine's `beatTierGap`: 0 while placing, and nobody who walked
   * out counts) — Kewê çiyê at 2
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

/**
 * A closed season with each player's final peak per game, read from the ranks
 * module's own results (`rank_season_results`, where the close also marked the
 * season's Stêrk players).
 */
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
 * Subscribe the badges to Game Ranks' events. Returns a function that stops
 * listening. A listener's failure is logged by `RankEvents` and never reaches
 * the game or the season close.
 */
export function listenToRanks(events: RankEvents, badges: RankEventsListener, db: Executor): () => void {
  const stopGames = events.onRatedGameFinished((e) => badges.onRatedGameFinished(ratedGameForBadges(e)));
  const stopSeasons = events.onSeasonClosed(async (e) => badges.onSeasonClosed(await seasonForBadges(db, e)));
  return () => {
    stopGames();
    stopSeasons();
  };
}
