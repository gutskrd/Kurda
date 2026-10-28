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
  const ids = [...new Set(userIds)].sort();
  if (ids.length === 0) return out;
  // every player in two statements rather than two each: the missing rows
  // made, then all of them locked, both in user-id order (the insert takes
  // its rows in the order given, the lock in the order sorted)
  await client.query(
    `INSERT INTO game_ratings (user_id, game, mu, sigma, season_id)
     SELECT u.id, $2::text, $3::double precision, $4::double precision, $5::text FROM unnest($1::uuid[]) WITH ORDINALITY AS u(id, n) ORDER BY u.n
     ON CONFLICT (user_id, game) DO NOTHING`,
    [ids, game, freshState(seasonId).mu, freshState(seasonId).sigma, seasonId],
  );
  const rows = await client.query<RatingRow>(
    `SELECT * FROM game_ratings WHERE user_id = ANY($1::uuid[]) AND game = $2 ORDER BY user_id FOR UPDATE`,
    [ids, game],
  );
  const byId = new Map(rows.rows.map((r) => [r.user_id, r]));
  for (const userId of ids) {
    let state = stateOf(byId.get(userId)!);
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
  await writeStates(client, game, [{ userId, state: s }]);
}

/** `writeState` for every player of a game, in one statement. */
export async function writeStates(client: Executor, game: RankedGame, states: ReadonlyArray<{ userId: string; state: PlayerState }>): Promise<void> {
  if (states.length === 0) return;
  await client.query(
    `UPDATE game_ratings g SET mu = s.mu, sigma = s.sigma, points = s.points, rated_games = s.rated_games, wins = s.wins,
            placement_done = s.placement_done, shield_games = s.shield_games, last_rated_at = s.last_rated_at,
            season_id = s.season_id, season_games = s.season_games, season_wins = s.season_wins,
            peak_points = s.peak_points, best_points = s.best_points, updated_at = now()
       FROM jsonb_to_recordset($2::jsonb) AS s(user_id uuid, mu double precision, sigma double precision, points int, rated_games int,
              wins int, placement_done boolean, shield_games int, last_rated_at timestamptz, season_id text, season_games int,
              season_wins int, peak_points int, best_points int)
      WHERE g.user_id = s.user_id AND g.game = $1`,
    [
      game,
      JSON.stringify(
        states.map(({ userId, state: st }) => ({
          user_id: userId,
          mu: st.mu,
          sigma: st.sigma,
          points: pointsOf(st.mu, st.sigma),
          rated_games: st.ratedGames,
          wins: st.wins,
          placement_done: st.placementDone,
          shield_games: st.shieldGames,
          last_rated_at: st.lastRatedAt,
          season_id: st.seasonId,
          season_games: st.seasonGames,
          season_wins: st.seasonWins,
          peak_points: st.peakPoints,
          best_points: st.bestPoints,
        })),
      ),
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
  await insertEvents(client, [e]);
}

/** `insertEvent` for every player of a game, in one statement, in the order given (the ids keep it). */
export async function insertEvents(client: Executor, events: readonly EventInput[]): Promise<void> {
  if (events.length === 0) return;
  await client.query(
    `INSERT INTO rating_events (user_id, game, game_ref, kind, season_id, mu_before, sigma_before, mu_after, sigma_after,
                                points_before, points_after, reason, place, weight, state_before, state_after)
     SELECT e.user_id, e.game, e.game_ref, e.kind, e.season_id, e.mu_before, e.sigma_before, e.mu_after, e.sigma_after,
            e.points_before, e.points_after, e.reason, e.place, e.weight, e.state_before, e.state_after
       FROM jsonb_to_recordset($1::jsonb)
         AS e(user_id uuid, game text, game_ref uuid, kind text, season_id text, mu_before double precision, sigma_before double precision,
              mu_after double precision, sigma_after double precision, points_before int, points_after int, reason text, place int,
              weight real, state_before jsonb, state_after jsonb, n int)
      ORDER BY e.n`,
    [
      JSON.stringify(
        events.map((e, n) => ({
          n,
          user_id: e.userId,
          game: e.game,
          game_ref: e.gameRef,
          kind: e.kind,
          season_id: e.after.seasonId,
          mu_before: e.before.mu,
          sigma_before: e.before.sigma,
          mu_after: e.after.mu,
          sigma_after: e.after.sigma,
          points_before: pointsOf(e.before.mu, e.before.sigma),
          points_after: pointsOf(e.after.mu, e.after.sigma),
          reason: e.reason,
          place: e.place ?? null,
          weight: e.weight ?? null,
          state_before: toStored(e.before),
          state_after: toStored(e.after),
        })),
      ),
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
