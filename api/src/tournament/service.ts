import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { WalletService } from '../wallet/service.js';
import { isEconomyBlocked } from '../economy/standing.js';
import { shownToSql } from '../users/age.js';
import {
  firstRoundMatches,
  nextPowerOfTwo,
  parentSlot,
  roundsForSize,
  seedByRating,
} from './bracket.js';

/** Registration capacity bounds (mirrors the DB check). */
export const MIN_CAPACITY = 8;
export const MAX_CAPACITY = 64;

export interface CreateTournamentInput {
  name: string;
  capacity: number;
  startsAt: Date;
  /** a prize of the staff's choosing, on top of the tournament win's earned Zêr */
  rewardZer?: number;
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
 * Single-elimination tournaments: admins schedule, players register, and on start the field is seeded by all-time XP
 * and the bracket generated (top seeds get byes); winners move up by slot and the champion is paid once. There
 * is no game to play matches in yet, so results are entered by an admin and tournaments stay out of the apps.
 */
/** Grants earned Zêr for a rule and reference id. */
export interface EarnGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

/** Awards an achievement; injected so tournaments stay decoupled. */
export interface AchievementAwarder {
  award(userId: string, achievementId: string): Promise<unknown>;
}

export class TournamentService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly earn?: EarnGranter,
    private readonly achievements?: AchievementAwarder,
  ) {}

  async create(adminId: string, input: CreateTournamentInput): Promise<{ id: string }> {
    if (input.capacity < MIN_CAPACITY || input.capacity > MAX_CAPACITY) {
      throw new AppError('BAD_CAPACITY', 400, `capacity must be ${MIN_CAPACITY}–${MAX_CAPACITY}`);
    }
    const row = await this.pool.query<{ id: string }>(
      `INSERT INTO tournaments (name, capacity, starts_at, reward_zer, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.name, input.capacity, input.startsAt, Math.max(0, input.rewardZer ?? 0), adminId],
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
      // seeding snapshot: the player's all-time XP
      const rating = await client.query<{ points: number }>(`SELECT xp AS points FROM users WHERE id = $1`, [userId]);
      await client.query(
        `INSERT INTO tournament_participants (tournament_id, user_id, rating)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [tournamentId, userId, rating.rows[0]?.points ?? 0],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Seeds the field and generates the bracket; with fewer than two registrants the tournament is cancelled instead. */
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
      // every seed in one statement
      await client.query(
        `UPDATE tournament_participants p SET seed = s.seed
           FROM unnest($2::uuid[], $3::int[]) AS s(user_id, seed)
          WHERE p.tournament_id = $1 AND p.user_id = s.user_id`,
        [tournamentId, seeds.map((s) => s.userId), seeds.map((s) => s.seed)],
      );

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

      // every slot of every round in one statement, in round and slot order
      const readyAt = new Date();
      const slots: Array<{ round: number; slot: number; a: string | null; b: string | null; winner: string | null; status: string }> = [];
      for (let r = 1; r <= rounds; r++) {
        for (let slot = 0; slot < grid[r]!.length; slot++) {
          const m = grid[r]![slot]!;
          slots.push({ round: r, slot, a: m.a, b: m.b, winner: m.winner, status: m.status });
        }
      }
      await client.query(
        `INSERT INTO tournament_matches
           (tournament_id, round, slot, player_a, player_b, winner, status, ready_at)
         SELECT $1::uuid, m.round, m.slot, m.a, m.b, m.winner, m.status, CASE WHEN m.status = 'ready' THEN $2::timestamptz END
           FROM unnest($3::int[], $4::int[], $5::uuid[], $6::uuid[], $7::uuid[], $8::text[]) WITH ORDINALITY
             AS m(round, slot, a, b, winner, status, n)
          ORDER BY m.n`,
        [
          tournamentId,
          readyAt,
          slots.map((m) => m.round),
          slots.map((m) => m.slot),
          slots.map((m) => m.a),
          slots.map((m) => m.b),
          slots.map((m) => m.winner),
          slots.map((m) => m.status),
        ],
      );

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
   * Records a match winner and advances the bracket; the final's winner completes the tournament and is paid once.
   * Returns whether a champion was just crowned.
   */
  async reportResult(tournamentId: string, matchId: string, winnerId: string): Promise<{ champion: boolean }> {
    const client = await this.pool.connect();
    let championId: string | null = null;
    let reward = { zer: 0 };
    try {
      await client.query('BEGIN');
      const t = await client.query<{ rounds: number; status: string; reward_zer: number }>(
        `SELECT rounds, status, reward_zer FROM tournaments WHERE id = $1 FOR UPDATE`,
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
        reward = { zer: tourn.reward_zer };
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
    // Drop the winner into the parent slot; with both players there it is ready.
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
    reward: { zer: number },
  ): Promise<void> {
    // Nobody the economy does not pay gets a prize (economy/standing.ts); the bracket still names the winner, and an admin
    // can pay by hand once a review clears them.
    if (await isEconomyBlocked(this.pool, userId)) return;
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
    // The tournament win's earned Zêr, idempotent per tournament and champion; ledger keys are global, so the key names both.
    if (this.earn) await this.earn.grant(userId, 'tournament_win', `${tournamentId}:${userId}`).catch(() => undefined);
    // the champion's achievement; idempotent, best-effort like the grant above
    if (this.achievements) await this.achievements.award(userId, 'tournament-win').catch(() => undefined);
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
   * The full bracket view. Any signed-in player can read any bracket, so a minor or an account with no age on record is
   * named only to themselves and their friends (users/age.ts `shownToSql`); to others they are an unnamed place, with
   * `userId`, `username` and match references null. `viewerId` undefined is the staff view, with every name.
   */
  async bracket(tournamentId: string, viewerId?: string): Promise<{
    id: string;
    name: string;
    status: string;
    startsAt: Date;
    rounds: number | null;
    winnerId: string | null;
    participants: Array<{ userId: string | null; username: string | null; seed: number | null; eliminated: boolean }>;
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
      shown: boolean;
    }>(
      `SELECT p.user_id, u.username, p.seed, p.eliminated,
              ($2::boolean OR ${shownToSql('u', '$3::uuid')}) AS shown
         FROM tournament_participants p JOIN users u ON u.id = p.user_id
        WHERE p.tournament_id = $1 ORDER BY p.seed NULLS LAST`,
      [tournamentId, viewerId === undefined, viewerId ?? null],
    );
    const hidden = new Set(parts.rows.filter((p) => !p.shown).map((p) => p.user_id));
    const named = (id: string | null): string | null => (id !== null && hidden.has(id) ? null : id);
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
      winnerId: named(tourn.winner_id),
      participants: parts.rows.map((p) => ({
        userId: p.shown ? p.user_id : null,
        username: p.shown ? p.username : null,
        seed: p.seed,
        eliminated: p.eliminated,
      })),
      matches: matches.rows.map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        playerA: named(m.player_a),
        playerB: named(m.player_b),
        winner: named(m.winner),
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
