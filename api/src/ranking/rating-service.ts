import type pg from 'pg';
import { applyResults, DEFAULT_RATING, type RatingPlayer, type RatingResult } from './elo.js';
import type { GameMode } from '../game/modes.js';

/** One player's outcome in a finished game (the engine supplies these). */
export interface GameOutcome {
  userId: string;
  rank: number;
  forfeit: boolean;
}

export interface RatingApplication {
  roomId: string;
  mode: GameMode;
  outcomes: GameOutcome[];
}

/** What the caller (engine → results event) learns for each player. */
export interface AppliedRating {
  userId: string;
  delta: number;
  newRating: number;
}

export interface RatingSummary {
  rating: number;
  gamesPlayed: number;
}

/**
 * Skill-rating writes (KUR-061). Applies an ELO update for a finished ranked
 * game atomically: current ratings are read `FOR UPDATE`, new ratings computed
 * by the pure model, and both `player_ratings` and the append-only-in-practice
 * `rating_history` are written in one transaction. Re-applying the same game
 * is a no-op — the `(user_id, game_room_id)` unique constraint means a result
 * only ever moves a rating once.
 */
export class RatingService {
  constructor(private readonly pool: pg.Pool) {}

  async apply(input: RatingApplication): Promise<AppliedRating[]> {
    if (input.outcomes.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // already scored? a re-delivered result must not double-count.
      const seen = await client.query(
        `SELECT 1 FROM rating_history WHERE game_room_id = $1 LIMIT 1`,
        [input.roomId],
      );
      if ((seen.rowCount ?? 0) > 0) {
        await client.query('COMMIT');
        return [];
      }

      // lock each player's row (creating a default if they're unrated), so
      // concurrent games for the same user serialize on the rating. Locks are
      // taken in a stable user-id order so two games sharing players can't
      // deadlock against each other.
      const current = new Map<string, RatingSummary>();
      const lockOrder = [...input.outcomes].sort((a, b) => a.userId.localeCompare(b.userId));
      for (const o of lockOrder) {
        const row = await client.query<{ rating: number; games_played: number }>(
          `INSERT INTO player_ratings (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
           RETURNING rating, games_played`,
          [o.userId],
        );
        const r = row.rows[0]!;
        current.set(o.userId, { rating: r.rating, gamesPlayed: r.games_played });
      }

      const players: RatingPlayer[] = input.outcomes.map((o) => ({
        userId: o.userId,
        rating: current.get(o.userId)?.rating ?? DEFAULT_RATING,
        gamesPlayed: current.get(o.userId)?.gamesPlayed ?? 0,
        rank: o.rank,
        forfeit: o.forfeit,
      }));
      const results: RatingResult[] = applyResults(players);

      for (const res of results) {
        const before = current.get(res.userId)?.rating ?? DEFAULT_RATING;
        const outcome = input.outcomes.find((o) => o.userId === res.userId)!;
        await client.query(
          `UPDATE player_ratings
             SET rating = $2, games_played = games_played + 1, updated_at = now()
           WHERE user_id = $1`,
          [res.userId, res.newRating],
        );
        await client.query(
          `INSERT INTO rating_history
             (user_id, game_room_id, rating_before, rating_after, delta, rank, forfeit)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [res.userId, input.roomId, before, res.newRating, res.delta, outcome.rank, outcome.forfeit],
        );
      }

      await client.query('COMMIT');
      return results.map((r) => ({ userId: r.userId, delta: r.delta, newRating: r.newRating }));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Current rating + games played (unrated players read as the default). */
  async summary(userId: string): Promise<RatingSummary> {
    const row = await this.pool.query<{ rating: number; games_played: number }>(
      `SELECT rating, games_played FROM player_ratings WHERE user_id = $1`,
      [userId],
    );
    const r = row.rows[0];
    return { rating: r?.rating ?? DEFAULT_RATING, gamesPlayed: r?.games_played ?? 0 };
  }

  /** Most-recent rating changes, newest first — feeds a rating graph. */
  async history(userId: string, limit = 20): Promise<
    Array<{ roomId: string; ratingAfter: number; delta: number; rank: number; createdAt: Date }>
  > {
    const rows = await this.pool.query<{
      game_room_id: string;
      rating_after: number;
      delta: number;
      rank: number;
      created_at: Date;
    }>(
      `SELECT game_room_id, rating_after, delta, rank, created_at
         FROM rating_history WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.rows.map((r) => ({
      roomId: r.game_room_id,
      ratingAfter: r.rating_after,
      delta: r.delta,
      rank: r.rank,
      createdAt: r.created_at,
    }));
  }
}
