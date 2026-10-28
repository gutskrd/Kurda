import type pg from 'pg';
import {
  FEW_PLAYERS,
  RANKED_GAMES,
  RANK_TIER_KEYS,
  RESTING_DAYS,
  STERK_RULE,
  pointsOf,
  seasonOf,
  tierOf,
  type AdminPairGame,
  type AdminPlayerGame,
  type AdminRatedGame,
  type RankTier,
  type RankedGame,
  type SuspiciousPair,
  type TierSpread,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { freshState, rateGame, seasonReset, type GameEntry, type PlayerState } from './engine.js';
import {
  fromStored,
  insertEvent,
  lockGameRatings,
  lockStates,
  toStored,
  writeState,
  writeStates,
  type StoredState,
} from './store.js';

interface EventRow {
  id: string;
  user_id: string;
  game_ref: string | null;
  kind: 'game' | 'season-reset' | 'admin-reset' | 'migration';
  season_id: string;
  state_before: StoredState;
  state_after: StoredState;
}

interface GameRow {
  game: RankedGame;
  game_ref: string;
  applied_at: Date;
  weight: number;
  voided_at: Date | null;
  void_reason: string | null;
  players: number;
}

/** How many were ranked in the game `g` (a subquery for the admin's game lists). */
const PLAYERS_SQL = `(SELECT count(*)::int FROM rated_game_players q WHERE q.game = g.game AND q.game_ref = g.game_ref AND q.place IS NOT NULL)`;

function ratedGameOf(r: GameRow): AdminRatedGame {
  return {
    game: r.game,
    gameRef: r.game_ref,
    at: r.applied_at.toISOString(),
    players: r.players,
    weight: Number(r.weight),
    voided: r.voided_at !== null,
    voidReason: r.void_reason,
  };
}

/**
 * The admin side of Game Ranks (contract-4 §R3, §U Admin): how the players
 * spread over the tiers (to tune the ONE tier table), the top of each game,
 * the pairs whose rated games together look unusual, voiding one game's
 * rating effect, and resetting one player's rating.
 */
export class RankAdmin {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Active players (a rated game in the last 28 days) per tier, per game; and how many are still placing. */
  async spread(): Promise<TierSpread[]> {
    const at = this.now();
    const out: TierSpread[] = [];
    for (const game of RANKED_GAMES) {
      const rows = await this.pool.query<{ points: number; placement_done: boolean; rated_games: number; last_rated_at: Date }>(
        `SELECT r.points, r.placement_done, r.rated_games, r.last_rated_at FROM game_ratings r JOIN users u ON u.id = r.user_id
          WHERE r.game = $1 AND r.last_rated_at > $2::timestamptz - make_interval(days => $3) AND u.deleted_at IS NULL
          ORDER BY r.points DESC`,
        [game, at, RESTING_DAYS],
      );
      const placed = rows.rows.filter((r) => r.placement_done);
      const counts = new Map<RankTier, number>(RANK_TIER_KEYS.map((t) => [t, 0]));
      const top = Math.max(STERK_RULE.minTop, Math.ceil(placed.length * STERK_RULE.topShare));
      placed.forEach((r, i) => {
        const sterk =
          placed.length >= FEW_PLAYERS &&
          i < top &&
          r.points >= STERK_RULE.minPoints &&
          r.rated_games >= STERK_RULE.minGames &&
          at.getTime() - r.last_rated_at.getTime() <= STERK_RULE.activeDays * 86_400_000;
        const tier: RankTier = sterk ? 'sterk' : tierOf(r.points);
        counts.set(tier, (counts.get(tier) ?? 0) + 1);
      });
      out.push({
        game,
        activePlayers: placed.length,
        placing: rows.rows.length - placed.length,
        tiers: RANK_TIER_KEYS.map((tier) => ({
          tier,
          players: counts.get(tier) ?? 0,
          share: placed.length ? (counts.get(tier) ?? 0) / placed.length : 0,
        })),
      });
    }
    return out;
  }

  /** The top of a game, by name (staff see everyone, minors included). */
  async top(game: RankedGame, limit = 50): Promise<
    Array<{ userId: string; username: string; points: number; ratedGames: number; wins: number; lastRatedAt: string | null }>
  > {
    const rows = await this.pool.query<{ user_id: string; username: string; points: number; rated_games: number; wins: number; last_rated_at: Date | null }>(
      `SELECT r.user_id, u.username, r.points, r.rated_games, r.wins, r.last_rated_at
         FROM game_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.game = $1 AND r.placement_done AND u.deleted_at IS NULL
        ORDER BY r.points DESC, r.user_id LIMIT $2`,
      [game, Math.min(Math.max(limit, 1), 200)],
    );
    return rows.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      points: r.points,
      ratedGames: r.rated_games,
      wins: r.wins,
      lastRatedAt: r.last_rated_at ? r.last_rated_at.toISOString() : null,
    }));
  }

  /**
   * Pairs worth a look, most suspicious first. The score adds up the signals —
   * a shared device (3), a shared network (1), many rated games together in
   * one day (2), lopsided results over six or more games (2) — and pairs with
   * none are left out. Signals only: nothing here acts on anyone.
   */
  async suspiciousPairs(limit = 100): Promise<SuspiciousPair[]> {
    const rows = await this.pool.query<{
      game: RankedGame;
      user_lo: string;
      lo_name: string;
      user_hi: string;
      hi_name: string;
      games: number;
      lo_wins: number;
      hi_wins: number;
      draws: number;
      peak_24h: number;
      shared_device: boolean;
      shared_ip: boolean;
      last_game_at: Date;
      score: number;
    }>(
      `SELECT * FROM (
         SELECT s.*, lo.username AS lo_name, hi.username AS hi_name,
                (CASE WHEN s.shared_device THEN 3 ELSE 0 END
                 + CASE WHEN s.shared_ip THEN 1 ELSE 0 END
                 + CASE WHEN s.peak_24h >= 4 THEN 2 ELSE 0 END
                 + CASE WHEN s.games >= 6 AND GREATEST(s.lo_wins, s.hi_wins) >= 0.85 * s.games THEN 2 ELSE 0 END) AS score
           FROM rating_pair_signals s
           JOIN users lo ON lo.id = s.user_lo
           JOIN users hi ON hi.id = s.user_hi
       ) x WHERE x.score > 0
       ORDER BY x.score DESC, x.last_game_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    return rows.rows.map((r) => ({
      game: r.game,
      a: { userId: r.user_lo, username: r.lo_name },
      b: { userId: r.user_hi, username: r.hi_name },
      games: r.games,
      aWins: r.lo_wins,
      bWins: r.hi_wins,
      draws: r.draws,
      peak24h: r.peak_24h,
      sharedDevice: r.shared_device,
      sharedIp: r.shared_ip,
      lastGameAt: r.last_game_at.toISOString(),
      score: r.score,
    }));
  }

  /**
   * A player's latest rated games, newest first, with what each did to them —
   * how an admin finds the game to void from the player's page. Null when
   * there is no such account.
   */
  async playerGames(userId: string, limit = 30): Promise<AdminPlayerGame[] | null> {
    const exists = await this.pool.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    if (!exists.rowCount) return null;
    const rows = await this.pool.query<GameRow & {
      place: number | null;
      left_game: boolean;
      points_before: number | null;
      points_after: number | null;
      reason: string | null;
    }>(
      `SELECT g.game, g.game_ref, g.applied_at, g.weight, g.voided_at, g.void_reason, p.place, p.left_game,
              ${PLAYERS_SQL} AS players, e.points_before, e.points_after, e.reason
         FROM rated_game_players p
         JOIN rated_games g ON g.game = p.game AND g.game_ref = p.game_ref
         LEFT JOIN rating_events e ON e.user_id = p.user_id AND e.game = p.game AND e.game_ref = p.game_ref AND e.kind = 'game'
        WHERE p.user_id = $1 AND g.applied_at IS NOT NULL AND g.outcome = 'rated'
        ORDER BY g.applied_at DESC, g.game_ref LIMIT $2`,
      [userId, Math.min(Math.max(limit, 1), 200)],
    );
    return rows.rows.map((r) => ({
      ...ratedGameOf(r),
      place: r.place,
      left: r.left_game,
      pointsBefore: r.points_before,
      pointsAfter: r.points_after,
      reason: r.reason,
    }));
  }

  /**
   * The rated games a pair played together in one game, newest first: what a
   * suspicious pair's row opens, so the games to void are a click away.
   */
  async pairGames(game: RankedGame, a: string, b: string, limit = 100): Promise<AdminPairGame[]> {
    const rows = await this.pool.query<GameRow & { a_place: number | null; b_place: number | null }>(
      `SELECT g.game, g.game_ref, g.applied_at, g.weight, g.voided_at, g.void_reason, pa.place AS a_place, pb.place AS b_place,
              ${PLAYERS_SQL} AS players
         FROM rated_games g
         JOIN rated_game_players pa ON pa.game = g.game AND pa.game_ref = g.game_ref AND pa.user_id = $2
         JOIN rated_game_players pb ON pb.game = g.game AND pb.game_ref = g.game_ref AND pb.user_id = $3
        WHERE g.game = $1 AND g.applied_at IS NOT NULL AND g.outcome = 'rated'
        ORDER BY g.applied_at DESC, g.game_ref LIMIT $4`,
      [game, a, b, Math.min(Math.max(limit, 1), 500)],
    );
    return rows.rows.map((r) => ({ ...ratedGameOf(r), aPlace: r.a_place, bPlace: r.b_place }));
  }

  /**
   * Reset one player's rating in one game to the start (μ 25, σ 25/3,
   * placement again), as an 'admin-reset' event — which a later replay keeps.
   */
  async reset(userId: string, game: RankedGame): Promise<void> {
    const at = this.now();
    await this.tx(async (client) => {
      await lockGameRatings(client, game);
      const exists = await client.query(`SELECT 1 FROM game_ratings WHERE user_id = $1 AND game = $2`, [userId, game]);
      if (!exists.rowCount) throw new AppError('NOT_FOUND', 404, 'this player has no rating in this game');
      const before = (await lockStates(client, game, [userId], at)).get(userId)!;
      const after = freshState(seasonOf(at).id);
      await writeState(client, userId, game, after);
      await insertEvent(client, { userId, game, gameRef: null, kind: 'admin-reset', reason: 'admin-reset', before, after });
    });
  }

  /**
   * Void one game's rating effect (R3): the game no longer counts, and every
   * rating it touched is worked out again from history — the players' standing
   * before it, then each later game they played, in order, with the same
   * places, weights and new-account limits as at the time. A game a replayed
   * player played moves its other players too, so they are replayed from there
   * as well; players no replay reaches keep their numbers exactly. Seasons
   * crossed on the way are rolled again (their recorded results follow; the
   * rewards already handed out stay). Every rated write of this game waits
   * while it runs.
   */
  async voidGame(game: RankedGame, gameRef: string, adminId: string, reason: string): Promise<{ replayedGames: number; players: number }> {
    const at = this.now();
    return this.tx(async (client) => {
      await lockGameRatings(client, game, true);
      const header = (
        await client.query<{ applied_at: Date | null; outcome: string | null; voided_at: Date | null }>(
          `SELECT applied_at, outcome, voided_at FROM rated_games WHERE game = $1 AND game_ref = $2 FOR UPDATE`,
          [game, gameRef],
        )
      ).rows[0];
      if (!header) throw new AppError('NOT_FOUND', 404, 'no rated game with that id');
      if (header.voided_at) return { replayedGames: 0, players: 0 };
      await client.query(
        `UPDATE rated_games SET voided_at = $3, voided_by = $4, void_reason = $5 WHERE game = $1 AND game_ref = $2`,
        [game, gameRef, at, adminId, reason.slice(0, 500)],
      );
      // not applied yet (or ended with nobody to rate): voiding it is enough
      if (!header.applied_at || header.outcome !== 'rated') return { replayedGames: 0, players: 0 };

      const own = await client.query<EventRow>(
        `SELECT * FROM rating_events WHERE game = $1 AND game_ref = $2 AND kind = 'game' ORDER BY id`,
        [game, gameRef],
      );
      await client.query(`UPDATE rating_events SET voided_at = $3 WHERE game = $1 AND game_ref = $2`, [game, gameRef, at]);
      if (own.rows.length === 0) return { replayedGames: 0, players: 0 };
      const firstId = own.rows[0]!.id;
      const states = new Map<string, PlayerState>(own.rows.map((r) => [r.user_id, fromStored(r.state_before)]));

      const later = await client.query<EventRow>(
        `SELECT * FROM rating_events WHERE game = $1 AND id > $2 AND voided_at IS NULL ORDER BY id`,
        [game, firstId],
      );
      const done = new Set<string>([gameRef]);
      let replayed = 0;
      for (const ev of later.rows) {
        if (ev.kind === 'game') {
          if (!ev.game_ref || done.has(ev.game_ref)) continue;
          done.add(ev.game_ref);
          if (await this.replayGame(client, game, ev.game_ref, states)) replayed++;
          continue;
        }
        const state = states.get(ev.user_id);
        if (!state) continue;
        if (ev.kind === 'season-reset') {
          const next = seasonReset(state, ev.season_id);
          await this.rewriteEvent(client, ev.id, state, next);
          await this.rewriteResult(client, ev.user_id, game, state);
          states.set(ev.user_id, next);
        } else {
          // a reset, or the move from the old Elo: absolute, whatever came before
          states.set(ev.user_id, fromStored(ev.state_after));
        }
      }
      // every replayed standing written back in one statement
      await writeStates(client, game, [...states].map(([userId, state]) => ({ userId, state })));
      return { replayedGames: replayed, players: states.size };
    });
  }

  /**
   * Work one later game out again if a replayed player was in it. Its other
   * players start from where they stood then (the history's `state_before`;
   * an erased account from the numbers its seat kept). Returns whether it did.
   */
  private async replayGame(client: pg.PoolClient, game: RankedGame, ref: string, states: Map<string, PlayerState>): Promise<boolean> {
    const header = (
      await client.query<{ weight: number; applied_at: Date; voided_at: Date | null }>(
        `SELECT weight, applied_at, voided_at FROM rated_games WHERE game = $1 AND game_ref = $2`,
        [game, ref],
      )
    ).rows[0];
    if (!header || header.voided_at) return false;
    const seats = await client.query<{
      seat: number;
      user_id: string | null;
      new_account: boolean;
      place: number | null;
      left_game: boolean;
      mu_before: number | null;
      sigma_before: number | null;
    }>(
      `SELECT seat, user_id, new_account, place, left_game, mu_before, sigma_before FROM rated_game_players
        WHERE game = $1 AND game_ref = $2 AND place IS NOT NULL ORDER BY seat`,
      [game, ref],
    );
    if (!seats.rows.some((s) => s.user_id && states.has(s.user_id))) return false;
    const events = new Map(
      (
        await client.query<EventRow>(`SELECT * FROM rating_events WHERE game = $1 AND game_ref = $2 AND kind = 'game'`, [game, ref])
      ).rows.map((e) => [e.user_id, e]),
    );
    const entries: GameEntry[] = seats.rows.map((s) => {
      const ev = s.user_id ? events.get(s.user_id) : undefined;
      let state: PlayerState;
      if (s.user_id && states.has(s.user_id)) state = states.get(s.user_id)!;
      else if (ev) state = fromStored(ev.state_before);
      else state = { ...freshState(seasonOf(header.applied_at).id), mu: Number(s.mu_before), sigma: Number(s.sigma_before), placementDone: true };
      return {
        userId: s.user_id ?? `erased:${s.seat}`,
        state,
        place: s.place!,
        left: s.left_game,
        newAccount: s.new_account,
      };
    });
    const outcomes = rateGame({ entries, weight: Number(header.weight), at: header.applied_at });
    for (const o of outcomes) {
      const ev = events.get(o.userId);
      if (!ev) continue;
      await client.query(
        `UPDATE rating_events SET mu_before = $2, sigma_before = $3, mu_after = $4, sigma_after = $5, points_before = $6,
                points_after = $7, reason = $8, place = $9, weight = $10, state_before = $11, state_after = $12
          WHERE id = $1`,
        [
          ev.id,
          o.before.mu,
          o.before.sigma,
          o.after.mu,
          o.after.sigma,
          o.pointsBefore,
          o.pointsAfter,
          o.reason,
          o.place,
          o.weight,
          JSON.stringify(toStored(o.before)),
          JSON.stringify(toStored(o.after)),
        ],
      );
      await client.query(
        `UPDATE rated_game_players SET mu_before = $4, sigma_before = $5 WHERE game = $1 AND game_ref = $2 AND user_id = $3`,
        [game, ref, o.userId, o.before.mu, o.before.sigma],
      );
      states.set(o.userId, o.after);
    }
    return true;
  }

  private async rewriteEvent(client: pg.PoolClient, id: string, before: PlayerState, after: PlayerState): Promise<void> {
    await client.query(
      `UPDATE rating_events SET mu_before = $2, sigma_before = $3, mu_after = $4, sigma_after = $5, points_before = $6,
              points_after = $7, state_before = $8, state_after = $9 WHERE id = $1`,
      [
        id,
        before.mu,
        before.sigma,
        after.mu,
        after.sigma,
        pointsOf(before.mu, before.sigma),
        pointsOf(after.mu, after.sigma),
        JSON.stringify(toStored(before)),
        JSON.stringify(toStored(after)),
      ],
    );
  }

  /** A replayed season's recorded result follows the replay (Stêrk marks and rewards stay as given). */
  private async rewriteResult(client: pg.PoolClient, userId: string, game: RankedGame, s: PlayerState): Promise<void> {
    await client.query(
      `UPDATE rank_season_results SET rated_games = $4, wins = $5, peak_points = $6, final_points = $7,
              peak_tier = CASE WHEN sterk THEN 'sterk' ELSE $8 END, total_games = $9, last_rated_at = $10
        WHERE user_id = $1 AND season_id = $2 AND game = $3`,
      [
        userId,
        s.seasonId,
        game,
        s.seasonGames,
        s.seasonWins,
        s.peakPoints,
        pointsOf(s.mu, s.sigma),
        s.placementDone ? tierOf(s.peakPoints) : null,
        s.ratedGames,
        s.lastRatedAt,
      ],
    );
  }

  private async tx<R>(fn: (client: pg.PoolClient) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
