import { describe, expect, it } from 'vitest';
import { LOBBY_IDLE_MINUTES } from '@kurda/shared';
import { WORDLE_BATTLES, factsOf, inGame, lobbyIdle, present, seatId, tallySeries, type LobbyRow, type SeatRow } from './lobby.js';

const at = new Date('2026-10-12T12:00:00Z');
const minutesAgo = (m: number) => new Date(at.getTime() - m * 60_000);

const row = (over: Partial<LobbyRow> = {}): LobbyRow => ({
  id: 'game-1',
  created_by: 'host',
  status: 'lobby',
  access: 'friends',
  chat_group_id: null,
  max_players: 8,
  next_lobby_id: null,
  rematch_of: null,
  updated_at: minutesAgo(1),
  ...over,
});
const seat = (user_id: string, n: number, over: Partial<SeatRow> = {}): SeatRow => ({ user_id, seat: n, left_at: null, removed: false, ...over });

describe('lobbyIdle', () => {
  it(`closes a lobby nobody touched for ${LOBBY_IDLE_MINUTES} minutes, and only a lobby`, () => {
    expect(lobbyIdle(row({ updated_at: minutesAgo(LOBBY_IDLE_MINUTES - 1) }), at)).toBe(false);
    expect(lobbyIdle(row({ updated_at: minutesAgo(LOBBY_IDLE_MINUTES) }), at)).toBe(true);
    expect(lobbyIdle(row({ status: 'active', updated_at: minutesAgo(600) }), at)).toBe(false);
  });
});

describe('seats', () => {
  it('a removed player is out of the game; a player who left is in it but not present', () => {
    const seats = [seat('host', 1), seat('gone', 2, { left_at: at }), seat('removed', 3, { removed: true })];
    expect(inGame(seats).map((s) => s.user_id)).toEqual(['host', 'gone']);
    expect(present(seats).map((s) => s.user_id)).toEqual(['host']);
    expect(seatId(3)).toBe('seat:3');
  });
});

describe('factsOf', () => {
  it('reads a lobby as joinable and its rematch as a pair while two are in it', () => {
    const facts = factsOf(WORDLE_BATTLES, row(), [seat('host', 1), seat('b', 2), seat('x', 3, { removed: true })], at);
    expect(facts).toMatchObject({
      game: 'wordle-battle',
      phase: 'lobby',
      joinable: true,
      memberIds: ['host', 'b'],
      activeIds: ['host', 'b'],
      removedIds: ['x'],
      rematchKind: 'pair',
    });
  });

  it('three players make a round; an idle lobby reads as called off; a running battle cannot be joined', () => {
    const three = [seat('host', 1), seat('b', 2), seat('c', 3)];
    expect(factsOf(WORDLE_BATTLES, row({ status: 'finished' }), three, at)).toMatchObject({ phase: 'finished', rematchKind: 'round' });
    expect(factsOf(WORDLE_BATTLES, row({ updated_at: minutesAgo(LOBBY_IDLE_MINUTES + 1) }), three, at)).toMatchObject({
      phase: 'cancelled',
      joinable: false,
    });
    expect(factsOf(WORDLE_BATTLES, row({ status: 'active' }), three, at)).toMatchObject({ phase: 'started', joinable: false });
  });
});

describe('tallySeries', () => {
  it('counts wins, losses and shared wins over the games the two played together', () => {
    const tally = tallySeries(
      [
        { players: ['me', 'you'], winners: ['me'] },
        { players: ['me', 'you'], winners: ['you'] },
        { players: ['me', 'you'], winners: ['me'] },
        { players: ['me', 'you'], winners: ['me', 'you'] },
        // not one of theirs together: does not count
        { players: ['me', 'someone'], winners: ['me'] },
      ],
      'me',
      'you',
    );
    expect(tally).toEqual({ me: 2, other: 1, draws: 1 });
  });
});
