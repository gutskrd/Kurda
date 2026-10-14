import type pg from 'pg';
import { pointsOf, seasonOf, tierOf, type RankedGame } from '@kurda/shared';
import { freshState, seasonReset, type PlayerState } from './engine.js';

/**
 * Reading and writing a player's standing (`game_ratings`) and its history
 * (`rating_events`). Shared by the live path (a game finishing), the season
 * job and an admin's void or reset, so all three write the same rows the same
 * way — which is what makes a replay come out like the original.
 */

export type Executor = Pick<pg.Pool, 'query'>;

export interface RatingRow {
  user_id: string;
  game: RankedGame;
  mu: number;
  sigma: number;
  points: number;
  rated_games: number;
  wins: number;
  placement_done: boolean;
  shield_games: number;
  last_rated_at: Date | null;
  season_id: string;
  season_games: number;
  season_wins: number;
  peak_points: number;
  best_points: number;
}

export function stateOf(row: RatingRow): PlayerState {
  return {
    mu: Number(row.mu),
    sigma: Number(row.sigma),
    ratedGames: row.rated_games,
    wins: row.wins,
    placementDone: row.placement_done,
    shieldGames: row.shield_games,
    lastRatedAt: row.last_rated_at,
    seasonId: row.season_id,
    seasonGames: row.season_games,
    seasonWins: row.season_wins,
    peakPoints: row.peak_points,
    bestPoints: row.best_points,
  };
}

/** A state as stored in an event's `state_before`/`state_after` (dates as ISO strings). */
export interface StoredState extends Omit<PlayerState, 'lastRatedAt'> {
  lastRatedAt: string | null;
}

export function toStored(s: PlayerState): StoredState {
  return { ...s, lastRatedAt: s.lastRatedAt ? s.lastRatedAt.toISOString() : null };
}

export function fromStored(s: StoredState): PlayerState {
  return { ...s, lastRatedAt: s.lastRatedAt ? new Date(s.lastRatedAt) : null };
}

/**
 * Lock the standings of `userIds` in `game` (user-id order, so two games
 * sharing players never deadlock), creating a fresh one for a first game. A
 * standing still in an earlier season is rolled into the current one first
 * (its result recorded, σ raised) — the same roll the season job makes, for
 * whoever plays before the job reached them.
 */
export async function lockStates(
  client: pg.PoolClient,
  game: RankedGame,
  userIds: readonly string[],
  at: Date,
): Promise<Map<string, PlayerState>> {
  const seasonId = seasonOf(at).id;
  const out = new Map<string, PlayerState>();
  for (const userId of [...new Set(userIds)].sort()) {
    await client.query(
      `INSERT INTO game_ratings (user_id, game, mu, sigma, season_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, game) DO NOTHING`,
      [userId, game, freshState(seasonId).mu, freshState(seasonId).sigma, seasonId],
    );
    const row = (
      await client.query<RatingRow>(`SELECT * FROM game_ratings WHERE user_id = $1 AND game = $2 FOR UPDATE`, [userId, game])
    ).rows[0]!;
    let state = stateOf(row);
    if (state.seasonId < seasonId) state = await rollSeason(client, userId, game, state, seasonId);
    out.set(userId, state);
  }
  return out;
}

/**
 * Close a standing's season: record its result (the emblem) and start the
 * new one with σ raised to at least 4 (R5). Recorded as a 'season-reset' event
 * so a replay crosses the season the same way. Call with the row locked.
 */
export async function rollSeason(
  client: pg.PoolClient,
  userId: string,
  game: RankedGame,
  state: PlayerState,
  nextSeasonId: string,
): Promise<PlayerState> {
  if (state.seasonGames > 0) {
    await client.query(
      `INSERT INTO rank_season_results
         (user_id, season_id, game, rated_games, wins, peak_points, final_points, peak_tier, total_games, last_rated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, season_id, game) DO NOTHING`,
      [
        userId,
        state.seasonId,
        game,
        state.seasonGames,
        state.seasonWins,
        state.peakPoints,
        pointsOf(state.mu, state.sigma),
        state.placementDone ? tierOf(state.peakPoints) : null,
        state.ratedGames,
        state.lastRatedAt,
      ],
    );
  }
  const next = seasonReset(state, nextSeasonId);
  await writeState(client, userId, game, next);
  await insertEvent(client, { userId, game, gameRef: null, kind: 'season-reset', reason: 'season-reset', before: state, after: next });
  return next;
}

export async function writeState(client: Executor, userId: string, game: RankedGame, s: PlayerState): Promise<void> {
  await client.query(
    `UPDATE game_ratings SET mu = $3, sigma = $4, points = $5, rated_games = $6, wins = $7, placement_done = $8,
            shield_games = $9, last_rated_at = $10, season_id = $11, season_games = $12, season_wins = $13,
            peak_points = $14, best_points = $15, updated_at = now()
      WHERE user_id = $1 AND game = $2`,
    [
      userId,
      game,
      s.mu,
      s.sigma,
      pointsOf(s.mu, s.sigma),
      s.ratedGames,
      s.wins,
      s.placementDone,
      s.shieldGames,
      s.lastRatedAt,
      s.seasonId,
      s.seasonGames,
      s.seasonWins,
      s.peakPoints,
      s.bestPoints,
    ],
  );
}

export interface EventInput {
  userId: string;
  game: RankedGame;
  gameRef: string | null;
  kind: 'game' | 'season-reset' | 'admin-reset' | 'migration';
  reason: string;
  before: PlayerState;
  after: PlayerState;
  place?: number | null;
  weight?: number | null;
}

export async function insertEvent(client: Executor, e: EventInput): Promise<void> {
  await client.query(
    `INSERT INTO rating_events (user_id, game, game_ref, kind, season_id, mu_before, sigma_before, mu_after, sigma_after,
                                points_before, points_after, reason, place, weight, state_before, state_after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      e.userId,
      e.game,
      e.gameRef,
      e.kind,
      e.after.seasonId,
      e.before.mu,
      e.before.sigma,
      e.after.mu,
      e.after.sigma,
      pointsOf(e.before.mu, e.before.sigma),
      pointsOf(e.after.mu, e.after.sigma),
      e.reason,
      e.place ?? null,
      e.weight ?? null,
      JSON.stringify(toStored(e.before)),
      JSON.stringify(toStored(e.after)),
    ],
  );
}

/**
 * Every rated write of one game type takes this lock shared; an admin's void
 * (which replays history) takes it alone, so no game is applied halfway
 * through a replay of the same game's ratings.
 */
export async function lockGameRatings(client: Executor, game: RankedGame, exclusive = false): Promise<void> {
  await client.query(
    `SELECT ${exclusive ? 'pg_advisory_xact_lock' : 'pg_advisory_xact_lock_shared'}(hashtextextended('game-ranks:' || $1, 0))`,
    [game],
  );
}
