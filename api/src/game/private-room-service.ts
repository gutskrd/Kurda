import type pg from 'pg';
import type { RealtimeKV } from '../realtime/kv.js';
import { AppError } from '../plugins/errors.js';
import type { MatchmakingService } from './matchmaking.js';
import type { GameMode } from './modes.js';
import type { QuestionFilter } from './question-bank.js';
import { generateJoinCode } from './private-room.js';

/** Room codes live 2h; a host who vanishes pre-start has 2 min of grace. */
export const ROOM_TTL_SECONDS = 2 * 60 * 60;
export const HOST_GRACE_MS = 2 * 60 * 1000;
export const MAX_PLAYERS = 30;

export interface RoomPlayer {
  id: string;
  username: string;
}

export interface PrivateRoom {
  code: string;
  hostId: string;
  mode: GameMode;
  questionFilter: QuestionFilter;
  players: RoomPlayer[];
  started: boolean;
  /** the game room id, once started */
  roomId: string | null;
  createdAt: number;
  /** last time the host was seen; a stale host dissolves the room */
  hostSeenAt: number;
}

/**
 * Kahoot-style private rooms (KUR-056): a host creates a room and gets a
 * 6-char code; up to 30 players join by code; the host starts the game and
 * picks the question category/level. Codes expire after 2h (KV TTL); a host
 * who disconnects before starting dissolves the room after a 2-min grace.
 */
export class PrivateRoomService {
  constructor(
    private readonly kv: RealtimeKV,
    private readonly pool: pg.Pool,
    private readonly matchmaking: MatchmakingService,
  ) {}

  private key(code: string): string {
    return `room:${code}`;
  }

  private async playerInfo(userId: string): Promise<RoomPlayer> {
    const row = await this.pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (row.rowCount === 0) throw new AppError('USER_NOT_FOUND', 404, 'unknown user');
    return { id: userId, username: row.rows[0]!.username };
  }

  private async save(room: PrivateRoom): Promise<void> {
    await this.kv.set(this.key(room.code), JSON.stringify(room), ROOM_TTL_SECONDS);
  }

  /** Load a room, dissolving it if the host has been gone past the grace. */
  private async load(code: string, now = Date.now()): Promise<PrivateRoom | null> {
    const raw = await this.kv.get(this.key(code));
    if (!raw) return null;
    const room = JSON.parse(raw) as PrivateRoom;
    if (!room.started && now - room.hostSeenAt > HOST_GRACE_MS) {
      await this.kv.del(this.key(code));
      return null;
    }
    return room;
  }

  async create(
    hostId: string,
    opts: { mode?: GameMode; category?: QuestionFilter['category']; level?: number } = {},
    now = Date.now(),
  ): Promise<PrivateRoom> {
    const host = await this.playerInfo(hostId);
    // find a free code (collisions are astronomically rare; retry a few times)
    let code = generateJoinCode();
    for (let i = 0; i < 5 && (await this.kv.get(this.key(code))) !== null; i++) {
      code = generateJoinCode();
    }
    const room: PrivateRoom = {
      code,
      hostId,
      mode: opts.mode ?? 'ffa',
      questionFilter: { category: opts.category, level: opts.level },
      players: [host],
      started: false,
      roomId: null,
      createdAt: now,
      hostSeenAt: now,
    };
    await this.save(room);
    return room;
  }

  /** The host pings to prove they're still present (resets the grace). */
  async touch(code: string, hostId: string, now = Date.now()): Promise<void> {
    const room = await this.load(code, now);
    if (!room || room.hostId !== hostId) return;
    room.hostSeenAt = now;
    await this.save(room);
  }

  async join(code: string, userId: string, now = Date.now()): Promise<PrivateRoom> {
    const room = await this.load(code, now);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404, 'room not found or expired');
    if (room.started) throw new AppError('ROOM_STARTED', 409, 'the game has already started');
    if (room.players.some((p) => p.id === userId)) return room; // idempotent
    if (room.players.length >= MAX_PLAYERS) throw new AppError('ROOM_FULL', 409, 'room is full');
    room.players.push(await this.playerInfo(userId));
    await this.save(room);
    return room;
  }

  async get(code: string, now = Date.now()): Promise<PrivateRoom | null> {
    return this.load(code, now);
  }

  /** Host starts the game with the room's roster + chosen questions. */
  async start(code: string, hostId: string, now = Date.now()): Promise<{ roomId: string }> {
    const room = await this.load(code, now);
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404, 'room not found or expired');
    if (room.hostId !== hostId) throw new AppError('NOT_HOST', 403, 'only the host can start');
    if (room.started) throw new AppError('ROOM_STARTED', 409, 'already started');
    if (room.players.length < 2) throw new AppError('ROOM_TOO_SMALL', 409, 'need at least 2 players');

    const record = await this.matchmaking.createDirectMatch(
      room.players.map((p) => p.id),
      room.mode,
      { questionFilter: room.questionFilter },
    );
    room.started = true;
    room.roomId = record.roomId;
    await this.save(room);
    return { roomId: record.roomId };
  }
}
