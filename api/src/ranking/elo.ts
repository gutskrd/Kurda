/**
 * ELO with K-decay (KUR-061). A pure, deterministic rating model: given each
 * player's current rating, games played, finishing rank, and whether they
 * forfeited, it returns the integer rating change to apply. All persistence
 * and atomicity lives in the RatingService — this module is just the math, so
 * the rating curve is fully unit-testable.
 *
 * Multiplayer is handled by scoring each player against the *average* rating
 * of the rest of the lobby with a rank-normalized actual score; for a 1v1 this
 * reduces exactly to the textbook ELO update.
 */

/** Everyone starts here (matches the matchmaking seed). */
export const DEFAULT_RATING = 1000;

/** Games before a player exits placement; volatility is highest until then. */
export const PLACEMENT_GAMES = 10;

/** K while placing — big swings so ratings converge fast. */
export const K_PLACEMENT = 60;
/** K just out of placement, decaying toward the floor over the next stretch. */
export const K_BASE = 32;
/** K a seasoned player settles at — small, stable adjustments. */
export const K_FLOOR = 16;
/** Games over which K decays from base → floor after placement. */
const K_DECAY_SPAN = 30;

/** A forfeiter loses only this fraction of a normal loss (anti rage-quit). */
export const FORFEIT_DAMPING = 0.5;

export interface RatingPlayer {
  userId: string;
  rating: number;
  gamesPlayed: number;
  /** 1 = winner; ties may share a rank. */
  rank: number;
  /** true if this player abandoned the game (dampens their loss). */
  forfeit: boolean;
}

export interface RatingResult {
  userId: string;
  delta: number;
  newRating: number;
}

/** Logistic expected score of `rating` against a single `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/**
 * K-factor for a player's experience level: high during placement, then a
 * linear decay from K_BASE to K_FLOOR so veterans move slowly.
 */
export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < PLACEMENT_GAMES) return K_PLACEMENT;
  const t = Math.min(1, (gamesPlayed - PLACEMENT_GAMES) / K_DECAY_SPAN);
  return Math.round(K_BASE - t * (K_BASE - K_FLOOR));
}

/**
 * Actual score in [0,1] from finishing rank: 1st = 1, last = 0, spread evenly.
 * Solo games (n = 1) have no opponents, so the actual is a neutral 0.5.
 */
function actualFromRank(rank: number, n: number): number {
  if (n <= 1) return 0.5;
  return (n - rank) / (n - 1);
}

/**
 * Compute rating changes for one finished game. Deltas are integers; a
 * forfeiter's negative delta is dampened. Order of the returned results
 * matches the input order.
 */
export function applyResults(players: RatingPlayer[]): RatingResult[] {
  const n = players.length;
  const totalRating = players.reduce((sum, p) => sum + p.rating, 0);

  return players.map((p) => {
    // average rating of everyone else in the lobby
    const avgOpponent = n > 1 ? (totalRating - p.rating) / (n - 1) : p.rating;
    const expected = expectedScore(p.rating, avgOpponent);
    const actual = actualFromRank(p.rank, n);
    let delta = Math.round(kFactor(p.gamesPlayed) * (actual - expected));
    if (p.forfeit && delta < 0) delta = Math.round(delta * FORFEIT_DAMPING);
    return { userId: p.userId, delta, newRating: p.rating + delta };
  });
}
