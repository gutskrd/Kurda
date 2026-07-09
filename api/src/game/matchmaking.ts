import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { RealtimeGateway } from '../realtime/gateway.js';
import type { RealtimeKV } from '../realtime/kv.js';
import type { MatchQueue } from './match-queue.js';
import { formTeams, type GameMode } from './modes.js';

export interface MatchmakingOptions {
  /** Initial rating band. */
  baseBand?: number;
  /** Band growth per widen interval. */
  widenPerInterval?: number;
  /** How often the band widens for a waiting player. */
  widenIntervalMs?: number;
  /** Waiting longer than this notifies match_timeout and dequeues. */
  timeoutMs?: number;
  /** Sweep cadence. */
  sweepIntervalMs?: number;
}

export interface MatchRecord {
  roomId: string;
  mode: GameMode;
  players: Array<{ id: string; username: string; rating: number }>;
  /** teams as lists of player ids; solo modes = one player per team (KUR-055) */
  teams: string[][];
  createdAt: number;
}

export type EnqueueResult =
  | { status: 'queued' }
  | { status: 'matched'; roomId: string; opponent: { id: string; username: string; rating: number } };

const MATCH_RECORD_TTL_SECONDS = 600;

/**
 * 1v1 matchmaking (KUR-050). Players within ±baseBand match instantly;
 * the sweeper widens a waiting player's band every widenIntervalMs and
 * expires them at timeoutMs (bot backfill is a flagged follow-up).
 * Match: a room id is minted, both players are invited on the gateway,
 * a match record is stored for the session engine (KUR-051, #51), and
 * both get a match_found push on their user channel.
 */
export class MatchmakingService {
  private readonly baseBand: number;
  private readonly widenPerInterval: number;
  private readonly widenIntervalMs: number;
  private readonly timeoutMs: number;
  readonly sweepIntervalMs: number;
  private readonly matchListeners: Array<(record: MatchRecord) => void> = [];

  constructor(
    private readonly pool: pg.Pool,
    private readonly queue: MatchQueue,
    private readonly kv: RealtimeKV,
    private readonly gateway: RealtimeGateway,
    opts: MatchmakingOptions = {},
  ) {
    this.baseBand = opts.baseBand ?? 150;
    this.widenPerInterval = opts.widenPerInterval ?? 50;
    this.widenIntervalMs = opts.widenIntervalMs ?? 5_000;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 1_000;
  }

  /** The node that creates a match owns its game session (KUR-051). */
  onMatch(listener: (record: MatchRecord) => void): void {
    this.matchListeners.push(listener);
  }

  private async playerInfo(userId: string): Promise<{ id: string; username: string; rating: number }> {
    const row = await this.pool.query<{ username: string; rating: number }>(
      `SELECT username, rating FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const user = row.rows[0];
    if (!user) throw new Error(`unknown user ${userId}`);
    return { id: userId, username: user.username, rating: user.rating };
  }

  async enqueue(userId: string): Promise<EnqueueResult> {
    const me = await this.playerInfo(userId);
    const opponentId = await this.queue.tryMatch(userId, me.rating, this.baseBand, Date.now());
    if (!opponentId) return { status: 'queued' };
    const record = await this.createMatch(me, opponentId);
    const opponent = record.players.find((p) => p.id !== userId)!;
    return { status: 'matched', roomId: record.roomId, opponent };
  }

  /** Cancel is idempotent and can never leave ghost entries. */
  async cancel(userId: string): Promise<boolean> {
    return this.queue.remove(userId);
  }

  async status(userId: string): Promise<{ queued: boolean; waitingMs?: number }> {
    const entries = await this.queue.entries();
    const mine = entries.find((e) => e.userId === userId);
    if (!mine) return { queued: false };
    return { queued: true, waitingMs: Date.now() - mine.enqueuedAt };
  }

  /** Session engine (#51) resolves the players of a room through this. */
  async matchRecord(roomId: string): Promise<MatchRecord | null> {
    const raw = await this.kv.get(`mm:match:${roomId}`);
    return raw ? (JSON.parse(raw) as MatchRecord) : null;
  }

  /**
   * Widens bands for waiting players and expires the timed-out. Runs on
   * every node; the queue's atomic tryMatch makes concurrent sweeps safe
   * (a player can only be popped once).
   */
  async sweep(now = Date.now()): Promise<void> {
    for (const entry of await this.queue.entries()) {
      const waited = now - entry.enqueuedAt;
      if (waited >= this.timeoutMs) {
        if (await this.queue.remove(entry.userId)) {
          await this.gateway.notifyUser(entry.userId, {
            type: 'match_timeout',
            waitedMs: waited,
          });
        }
        continue;
      }
      const band =
        this.baseBand + this.widenPerInterval * Math.floor(waited / this.widenIntervalMs);
      if (band === this.baseBand) continue;
      // temporarily pop-and-retry: tryMatch re-adds when nothing is found
      if (!(await this.queue.remove(entry.userId))) continue; // another node claimed them
      const opponentId = await this.queue.tryMatch(entry.userId, entry.rating, band, entry.enqueuedAt);
      if (opponentId) {
        await this.createMatch(await this.playerInfo(entry.userId), opponentId);
      }
    }
  }

  private async createMatch(
    me: { id: string; username: string; rating: number },
    opponentId: string,
  ): Promise<MatchRecord> {
    const opponent = await this.playerInfo(opponentId);
    const record: MatchRecord = {
      roomId: `match:${randomUUID()}`,
      mode: '1v1',
      players: [me, opponent],
      teams: [[me.id], [opponent.id]],
      createdAt: Date.now(),
    };
    return this.announceMatch(record);
  }

  /**
   * Create a match directly from a known set of players (KUR-055): a party
   * queuing as a duo, or a full team/FFA lobby. Teams are formed per mode.
   */
  async createDirectMatch(userIds: string[], mode: GameMode, teams?: string[][]): Promise<MatchRecord> {
    const players = await Promise.all(userIds.map((id) => this.playerInfo(id)));
    const record: MatchRecord = {
      roomId: `match:${randomUUID()}`,
      mode,
      players,
      teams: teams ?? formTeams(userIds, mode),
      createdAt: Date.now(),
    };
    return this.announceMatch(record);
  }

  /** Persist the record, invite everyone, push match_found, notify listeners. */
  private async announceMatch(record: MatchRecord): Promise<MatchRecord> {
    await this.kv.set(`mm:match:${record.roomId}`, JSON.stringify(record), MATCH_RECORD_TTL_SECONDS);
    for (const player of record.players) {
      await this.gateway.invite(record.roomId, player.id);
    }
    for (const player of record.players) {
      const others = record.players.filter((p) => p.id !== player.id);
      await this.gateway.notifyUser(player.id, {
        type: 'match_found',
        roomId: record.roomId,
        mode: record.mode,
        // 1v1 back-compat: `opponent` is the single other player
        opponent: others[0],
        players: others,
      });
    }
    for (const listener of this.matchListeners) listener(record);
    return record;
  }
}
