/**
 * What the Game Ranks module (contract 4 §R, the api-ranks track) tells the
 * badges, so the ranked family — the tier emblems, Hilkişer, Cihgirtî, Dilpak
 * and the secret Kewê çiyê — can be counted without the badges reading the
 * rating tables. The ranks module owns ratings; this is the whole of what the
 * badges need from it.
 *
 * NOTE for the ranks module: `BadgeService` implements this interface, and
 * app.ts hands it to you as `rankEvents` (look for "rank events"). Call
 *  - `onRatedGameFinished` once a rated game's rating changes are committed
 *    (not for a friendly game, nor for one that turned friendly at its start);
 *  - `onSeasonClosed` after the end-of-season rewards job has run.
 * Both are idempotent (one row per player and game; peaks only go up), so a
 * retry is safe; neither throws for a badge that could not be counted.
 *
 * Tiers are given as indices so the two modules cannot disagree about a
 * spelling: 0 Deşt, 1 Gir, 2 Zozan, 3 Çiya, 4 Lûtke, 5 Stêrk (the order of
 * the rank tiers, R4), or null while a player is still placing.
 */

export type RankedGame = 'wordle-battle' | 'rhyme-match' | 'stories';

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
