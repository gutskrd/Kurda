import type { RealtimeKV } from '../realtime/kv.js';
import { AppError } from '../plugins/errors.js';
import type { MatchmakingService } from './matchmaking.js';

/** Both players must accept a rematch within this window (KUR-059). */
export const REMATCH_TTL_SECONDS = 30;

interface RematchState {
  players: string[];
  accepted: string[];
  /** the new game room once everyone accepted */
  newRoomId: string | null;
}

export interface RematchStatus {
  ready: boolean;
  roomId: string | null;
  accepted: number;
  needed: number;
}

/**
 * Rematch coordination (KUR-059). After a game, any player can accept a
 * rematch; once every original player accepts within 30s a fresh game is
 * created with the same roster and everyone is invited. If someone leaves
 * and never accepts, the offer simply times out (TTL).
 */
export class RematchService {
  constructor(
    private readonly kv: RealtimeKV,
    private readonly matchmaking: MatchmakingService,
  ) {}

  private key(roomId: string): string {
    return `rematch:${roomId}`;
  }

  private toStatus(state: RematchState): RematchStatus {
    return {
      ready: state.newRoomId !== null,
      roomId: state.newRoomId,
      accepted: state.accepted.length,
      needed: state.players.length,
    };
  }

  private async load(roomId: string): Promise<RematchState | null> {
    const raw = await this.kv.get(this.key(roomId));
    return raw ? (JSON.parse(raw) as RematchState) : null;
  }

  async accept(roomId: string, userId: string): Promise<RematchStatus> {
    const record = await this.matchmaking.matchRecord(roomId);
    if (!record) throw new AppError('GAME_NOT_FOUND', 404, 'no finished game with that id');
    const players = record.players.map((p) => p.id);
    if (!players.includes(userId)) throw new AppError('NOT_IN_GAME', 403, 'you were not in that game');

    const state: RematchState = (await this.load(roomId)) ?? { players, accepted: [], newRoomId: null };
    if (state.newRoomId) return this.toStatus(state); // already rematched
    if (!state.accepted.includes(userId)) state.accepted.push(userId);

    if (players.every((p) => state.accepted.includes(p))) {
      const next = await this.matchmaking.createDirectMatch(players, record.mode, {
        teams: record.teams,
        questionFilter: record.questionFilter,
      });
      state.newRoomId = next.roomId;
    }
    await this.kv.set(this.key(roomId), JSON.stringify(state), REMATCH_TTL_SECONDS);
    return this.toStatus(state);
  }

  async status(roomId: string, userId: string): Promise<RematchStatus> {
    const record = await this.matchmaking.matchRecord(roomId);
    if (!record) throw new AppError('GAME_NOT_FOUND', 404, 'no finished game with that id');
    if (!record.players.some((p) => p.id === userId)) {
      throw new AppError('NOT_IN_GAME', 403, 'you were not in that game');
    }
    const state = await this.load(roomId);
    if (!state) return { ready: false, roomId: null, accepted: 0, needed: record.players.length };
    return this.toStatus(state);
  }
}
