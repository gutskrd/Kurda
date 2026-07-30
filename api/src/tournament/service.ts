import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { WalletService } from '../wallet/service.js';
import {
  firstRoundMatches,
  nextPowerOfTwo,
  parentSlot,
  roundsForSize,
  seedByRating,
} from './bracket.js';

/** A player who doesn't show within this window forfeits (KUR-060). */
export const NO_SHOW_MS = 2 * 60 * 1000;
/** Registration capacity bounds (mirrors the DB check). */
export const MIN_CAPACITY = 8;
export const MAX_CAPACITY = 64;

export interface CreateTournamentInput {
  name: string;
  capacity: number;
  startsAt: Date;
  rewardZer?: number;
  rewardGems?: number;
}

export interface BracketMatchView {
  id: string;
  round: number;
  slot: number;
  playerA: string | null;
  playerB: string | null;
  winner: string | null;
  status: string;
}

interface MatchRow {
  id: string;
  round: number;
  slot: number;
  player_a: string | null;
  player_b: string | null;
  winner: string | null;
  status: string;
  ready_at: Date | null;
  checked_in: string[];
}

type Executor = Pick<pg.PoolClient, 'query'>;

/**
 * Single-elimination tournaments (KUR-060). Admins schedule; players register;
 * on start the field is rating-seeded, the bracket auto-generates (top seeds
 * get byes for non-power-of-two fields), and winners propagate up the tree by
 * slot. No-shows forfeit after two minutes; the champion is paid the configured
 * reward once, idempotently.
 */
/** Grants Gems for a rule/refId; injected so tournaments stay decoupled (KUR-068). */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

export class TournamentService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly gems?: GemGranter,
  ) {}

  async create(adminId: string, input: CreateTournamentInput): Promise<{ id: string }> {
    if (input.capacity < MIN_CAPACITY || input.capacity > MAX_CAPACITY) {
      throw new AppError('BAD_CAPACITY', 400, `capacity must be ${MIN_CAPACITY}–${MAX_CAPACITY}`);
    }
    const row = await this.pool.query<{ id: string }>(
      `INSERT INTO tournaments (name, capacity, starts_at, reward_zer, reward_gems, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        input.name,
        input.capacity,
        input.startsAt,
        Math.max(0, input.rewardZer ?? 0),
        Math.max(0, input.rewardGems ?? 0),
        adminId,
      ],
    );
    return { id: row.rows[0]!.id };
  }

  async register(tournamentId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query<{ status: string; capacity: number }>(
        `SELECT status, capacity FROM tournaments WHERE id = $1 FOR UPDATE`,
        [tournamentId],
      );
      const tourn = t.rows[0];
      if (!tourn) throw new AppError('TOURNAMENT_NOT_FOUND', 404, 'no such tournament');
      if (tourn.status !== 'registering') {
        throw new AppError('REGISTRATION_CLOSED', 409, 'registration is closed');
      }
      const count = await client.query<{ n: string }>(
        `SELECT count(*)::text n FROM tournament_participants WHERE tournament_id = $1`,
        [tournamentId],
      );
      if (Number(count.rows[0]!.n) >= tourn.capacity) {
        throw new AppError('TOURNAMENT_FULL', 409, 'tournament is full');
      }
      // rating snapshot for seeding (unrated players read the default)
      const rating = await client.query<{ rating: number }>(
        `SELECT rating FROM player_ratings WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, rating)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [tournamentId, userId, rating.rows[0]?.rating ?? 1000],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Seed the field and generate the bracket. Fewer than two registrants →
   * the tournament is cancelled rather than started.
   */
  async start(tournamentId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query<{ status: string }>(
        `SELECT status FROM tournaments WHERE id = $1 FOR UPDATE`,
        [tournamentId],
      );
      if (!t.rows[0]) throw new AppError('TOURNAMENT_NOT_FOUND', 404, 'no such tournament');
      if (t.rows[0].status !== 'registering') {
        throw new AppError('ALREADY_STARTED', 409, 'tournament is not in registration');
      }

      const parts = await client.query<{ user_id: string; rating: number }>(
        `SELECT user_id, rating FROM tournament_participants WHERE tournament_id = $1`,
        [tournamentId],
      );
      if (parts.rows.length < 2) {
        await client.query(`UPDATE tournaments SET status = 'cancelled' WHERE id = $1`, [
          tournamentId,
        ]);
        await client.query('COMMIT');
        return;
      }

      const seeds = seedByRating(parts.rows.map((p) => ({ userId: p.user_id, rating: p.rating })));
      for (const s of seeds) {
        await client.query(
          `UPDATE tournament_participants SET seed = $3 WHERE tournament_id = $1 AND user_id = $2`,
          [tournamentId, s.userId, s.seed],
        );
      }

      const size = nextPowerOfTwo(seeds.length);
      const rounds = roundsForSize(size);

      // materialize every slot of every round, then resolve first-round byes
      const grid: Array<Array<{ a: string | null; b: string | null; winner: string | null; status: string }>> = [];
      const first = firstRoundMatches(seeds);
      grid[1] = first.map((m) => ({ a: m.a, b: m.b, winner: null as string | null, status: 'pending' }));
      for (let r = 2; r <= rounds; r++) {
        const slots = size / 2 ** r;
        grid[r] = Array.from({ length: slots }, () => ({ a: null, b: null, winner: null, status: 'pending' }));
      }

      // byes auto-advance; both-known matches are ready to play
      for (let slot = 0; slot < grid[1]!.length; slot++) {
        const m = grid[1]![slot]!;
        if (m.a && m.b) {
          m.status = 'ready';
        } else if (m.a || m.b) {
          m.winner = m.a ?? m.b;
          m.status = 'completed';
          this.placeWinner(grid, 1, slot, m.winner!, rounds);
        }
      }

      const readyAt = new Date();
      for (let r = 1; r <= rounds; r++) {
        for (let slot = 0; slot < grid[r]!.length; slot++) {
          const m = grid[r]![slot]!;
          await client.query(
            `INSERT INTO tournament_matches
               (tournament_id, round, slot, player_a, player_b, winner, status, ready_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [tournamentId, r, slot, m.a, m.b, m.winner, m.status, m.status === 'ready' ? readyAt : null],
          );
        }
      }

      await client.query(`UPDATE tournaments SET status = 'running', rounds = $2 WHERE id = $1`, [
        tournamentId,
        rounds,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** In-memory bracket propagation (start only): drop a winner into its parent. */
  private placeWinner(
    grid: Array<Array<{ a: string | null; b: string | null; winner: string | null; status: string }>>,
    round: number,
    slot: number,
    winner: string,
    rounds: number,
  ): void {
    if (round >= rounds) return;
    const { slot: pSlot, side } = parentSlot(slot);
    const parent = grid[round + 1]![pSlot]!;
    if (side === 'a') parent.a = winner;
    else parent.b = winner;
    // two byes can make a parent playable immediately
    if (parent.a && parent.b) parent.status = 'ready';
  }

  /**
   * Record a match winner and advance the bracket. The final's winner completes
   * the tournament and is paid the reward (once). Returns whether the champion
   * was just crowned.
   */
  async reportResult(tournamentId: string, matchId: string, winnerId: string): Promise<{ champion: boolean }> {
    const client = await this.pool.connect();
    let championId: string | null = null;
    let reward = { zer: 0, gems: 0 };
    try {
      await client.query('BEGIN');
      const t = await client.query<{ rounds: number; status: string; reward_zer: number; reward_gems: number }>(
        `SELECT rounds, status, reward_zer, reward_gems FROM tournaments WHERE id = $1 FOR UPDATE`,
        [tournamentId],
      );
      const tourn = t.rows[0];
      if (!tourn || tourn.status !== 'running') {
        throw new AppError('TOURNAMENT_NOT_RUNNING', 409, 'tournament is not running');
      }
      const match = await this.lockMatch(client, matchId);
      if (match.status === 'completed') {
        throw new AppError('MATCH_DONE', 409, 'match already decided');
      }
      if (winnerId !== match.player_a && winnerId !== match.player_b) {
        throw new AppError('NOT_A_PLAYER', 400, 'winner is not in this match');
      }
      const loser = winnerId === match.player_a ? match.player_b : match.player_a;
      await this.settleMatch(client, tournamentId, match, winnerId, loser, tourn.rounds);

      if (match.round >= tourn.rounds) {
        championId = winnerId;
        reward = { zer: tourn.reward_zer, gems: tourn.reward_gems };
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    if (championId) await this.payChampion(tournamentId, championId, reward);
    return { champion: championId !== null };
  }

  private async lockMatch(client: Executor, matchId: string): Promise<MatchRow> {
    const res = await client.query<MatchRow>(
      `SELECT id, round, slot, player_a, player_b, winner, status, ready_at, checked_in
         FROM tournament_matches WHERE id = $1 FOR UPDATE`,
      [matchId],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('MATCH_NOT_FOUND', 404, 'no such match');
    return row;
  }

  /** Mark a winner, eliminate the loser, and feed the parent slot. */
  private async settleMatch(
    client: Executor,
    tournamentId: string,
    match: MatchRow,
    winnerId: string,
    loserId: string | null,
    rounds: number,
  ): Promise<void> {
    await client.query(
      `UPDATE tournament_matches SET winner = $2, status = 'completed' WHERE id = $1`,
      [match.id, winnerId],
    );
    if (loserId) {
      await client.query(
        `UPDATE tournament_participants SET eliminated = true WHERE tournament_id = $1 AND user_id = $2`,
        [tournamentId, loserId],
      );
    }
    if (match.round >= rounds) {
      await client.query(`UPDATE tournaments SET winner_id = $2, status = 'completed' WHERE id = $1`, [
        tournamentId,
        winnerId,
      ]);
      return;
    }
    // drop the winner into the parent slot; if it now has both players it's ready
    const { slot: pSlot, side } = parentSlot(match.slot);
    const col = side === 'a' ? 'player_a' : 'player_b';
    const parent = await client.query<MatchRow>(
      `UPDATE tournament_matches SET ${col} = $4
         WHERE tournament_id = $1 AND round = $2 AND slot = $3
         RETURNING id, round, slot, player_a, player_b, winner, status, ready_at, checked_in`,
      [tournamentId, match.round + 1, pSlot, winnerId],
    );
    const p = parent.rows[0];
    if (p && p.player_a && p.player_b && p.status === 'pending') {
      await client.query(
        `UPDATE tournament_matches SET status = 'ready', ready_at = now() WHERE id = $1`,
        [p.id],
      );
    }
  }

  private async payChampion(
    tournamentId: string,
    userId: string,
    reward: { zer: number; gems: number },
  ): Promise<void> {
    // idempotent: the (idempotencyKey) guard makes a retry a no-op
    if (reward.zer > 0) {
      await this.wallet.credit({
        userId,
        currency: 'zer',
        amount: reward.zer,
        reason: 'tournament_reward',
        idempotencyKey: `tourn:${tournamentId}:zer`,
      });
    }
    if (reward.gems > 0) {
      await this.wallet.credit({
        userId,
        currency: 'gems',
        amount: reward.gems,
        reason: 'tournament_reward',
        idempotencyKey: `tourn:${tournamentId}:gems`,
      });
    }
    // config-driven tournament-win Gem grant (KUR-068), idempotent per tournament
    if (this.gems) await this.gems.grant(userId, 'tournament_win', tournamentId).catch(() => undefined);
  }

  /** A player confirms presence for their ready match (guards no-show sweep). */
  async checkIn(tournamentId: string, matchId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const match = await this.lockMatch(client, matchId);
      if (match.status !== 'ready') throw new AppError('NOT_READY', 409, 'match is not ready');
      if (userId !== match.player_a && userId !== match.player_b) {
        throw new AppError('NOT_A_PLAYER', 400, 'you are not in this match');
      }
      if (!match.checked_in.includes(userId)) {
        await client.query(
          `UPDATE tournament_matches SET checked_in = checked_in || $2::jsonb WHERE id = $1`,
          [matchId, JSON.stringify([userId])],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Forfeit no-shows: any ready match past the window where a player hasn't
   * checked in loses by default. If neither showed, the higher seed advances so
   * the bracket never stalls. Returns the number of matches auto-decided.
   */
  async sweepNoShows(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - NO_SHOW_MS);
    const due = await this.pool.query<{ id: string; tournament_id: string }>(
      `SELECT id, tournament_id FROM tournament_matches
         WHERE status = 'ready' AND ready_at IS NOT NULL AND ready_at < $1`,
      [cutoff],
    );

    let decided = 0;
    for (const row of due.rows) {
      const winner = await this.resolveNoShow(row.tournament_id, row.id);
      if (winner) {
        await this.reportResult(row.tournament_id, row.id, winner);
        decided += 1;
      }
    }
    return decided;
  }

  /** Decide who advances from a timed-out ready match, or null if both present. */
  private async resolveNoShow(tournamentId: string, matchId: string): Promise<string | null> {
    const res = await this.pool.query<MatchRow>(
      `SELECT id, round, slot, player_a, player_b, winner, status, ready_at, checked_in
         FROM tournament_matches WHERE id = $1`,
      [matchId],
    );
    const m = res.rows[0];
    if (!m || m.status !== 'ready' || !m.player_a || !m.player_b) return null;
    const aIn = m.checked_in.includes(m.player_a);
    const bIn = m.checked_in.includes(m.player_b);
    if (aIn && bIn) return null; // both present → a real game is (or should be) underway
    if (aIn) return m.player_a;
    if (bIn) return m.player_b;
    // neither showed → the higher seed (lower seed number) gets the bye
    const seeds = await this.pool.query<{ user_id: string; seed: number }>(
      `SELECT user_id, seed FROM tournament_participants
         WHERE tournament_id = $1 AND user_id = ANY($2)`,
      [tournamentId, [m.player_a, m.player_b]],
    );
    const ranked = seeds.rows.sort((x, y) => (x.seed ?? 999) - (y.seed ?? 999));
    return ranked[0]?.user_id ?? m.player_a;
  }

  /** Full bracket view for the live UI (KUR-060). */
  async bracket(tournamentId: string): Promise<{
    id: string;
    name: string;
    status: string;
    startsAt: Date;
    rounds: number | null;
    winnerId: string | null;
    participants: Array<{ userId: string; username: string; seed: number | null; eliminated: boolean }>;
    matches: BracketMatchView[];
  }> {
    const t = await this.pool.query<{
      id: string;
      name: string;
      status: string;
      starts_at: Date;
      rounds: number | null;
      winner_id: string | null;
    }>(
      `SELECT id, name, status, starts_at, rounds, winner_id FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    const tourn = t.rows[0];
    if (!tourn) throw new AppError('TOURNAMENT_NOT_FOUND', 404, 'no such tournament');

    const parts = await this.pool.query<{
      user_id: string;
      username: string;
      seed: number | null;
      eliminated: boolean;
    }>(
      `SELECT p.user_id, u.username, p.seed, p.eliminated
         FROM tournament_participants p JOIN users u ON u.id = p.user_id
        WHERE p.tournament_id = $1 ORDER BY p.seed NULLS LAST`,
      [tournamentId],
    );
    const matches = await this.pool.query<MatchRow>(
      `SELECT id, round, slot, player_a, player_b, winner, status
         FROM tournament_matches WHERE tournament_id = $1 ORDER BY round, slot`,
      [tournamentId],
    );

    return {
      id: tourn.id,
      name: tourn.name,
      status: tourn.status,
      startsAt: tourn.starts_at,
      rounds: tourn.rounds,
      winnerId: tourn.winner_id,
      participants: parts.rows.map((p) => ({
        userId: p.user_id,
        username: p.username,
        seed: p.seed,
        eliminated: p.eliminated,
      })),
      matches: matches.rows.map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        playerA: m.player_a,
        playerB: m.player_b,
        winner: m.winner,
        status: m.status,
      })),
    };
  }

  /** List tournaments, optionally filtered by status, soonest first. */
  async list(status?: string): Promise<
    Array<{ id: string; name: string; status: string; startsAt: Date; capacity: number }>
  > {
    const rows = await this.pool.query<{
      id: string;
      name: string;
      status: string;
      starts_at: Date;
      capacity: number;
    }>(
      status
        ? `SELECT id, name, status, starts_at, capacity FROM tournaments WHERE status = $1 ORDER BY starts_at`
        : `SELECT id, name, status, starts_at, capacity FROM tournaments ORDER BY starts_at`,
      status ? [status] : [],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      startsAt: r.starts_at,
      capacity: r.capacity,
    }));
  }
}
