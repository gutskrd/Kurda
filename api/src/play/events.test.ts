import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { PlayEvents, PLAY_CHANGED_COALESCE_MS } from './events.js';
import type { LobbyFacts } from './types.js';

class FakeNotifier {
  told: Array<{ userId: string; event: Record<string, unknown> }> = [];
  published: Array<{ room: string; event: Record<string, unknown> }> = [];
  async notifyUser(userId: string, event: Record<string, unknown>): Promise<void> {
    this.told.push({ userId, event });
  }
  async publish(room: string, event: Record<string, unknown>): Promise<void> {
    this.published.push({ room, event });
  }
}

/** A pool that knows two things: who has a pending invite, and which invites an expiry took. */
function fakePool(pendingInvitees: string[], expiring: Array<{ id: string; host_id: string; invitee_id: string }> = []) {
  const queries: string[] = [];
  const pool = {
    queries,
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes('SELECT invitee_id')) return { rows: pendingInvitees.map((invitee_id) => ({ invitee_id })) };
      if (sql.includes('UPDATE play_invites')) return { rows: expiring };
      return { rows: [] };
    },
  };
  return pool as unknown as pg.Pool & { queries: string[] };
}

const facts = (over: Partial<LobbyFacts> = {}): LobbyFacts => ({
  game: 'wordle-battle',
  lobbyId: 'lobby-1',
  hostId: 'host',
  phase: 'lobby',
  joinable: true,
  access: 'friends',
  chatGroupId: null,
  maxPlayers: 8,
  memberIds: ['host', 'b'],
  activeIds: ['host', 'b'],
  removedIds: [],
  nextLobbyId: null,
  rematchOf: null,
  rematchKind: 'pair',
  ...over,
});

/** Lets the fan-out's awaits run. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('PlayEvents', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tells the players, the friends with a pending invite, and the group room where the card is', async () => {
    const notifier = new FakeNotifier();
    const events = new PlayEvents(fakePool(['invitee']), notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ chatGroupId: 'g1' }));
    events.changed('wordle-battle', 'lobby-1', { also: ['just-removed'] });
    await settle();
    expect(notifier.told.map((t) => t.userId).sort()).toEqual(['b', 'host', 'invitee', 'just-removed']);
    expect(notifier.told[0]!.event).toEqual({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'lobby-1' });
    expect(notifier.published).toEqual([{ room: 'group:g1', event: { type: 'play_changed', game: 'wordle-battle', lobbyId: 'lobby-1' } }]);
  });

  it('a lobby that cannot be joined any more expires its invites, and both sides hear it', async () => {
    const notifier = new FakeNotifier();
    const pool = fakePool([], [{ id: 'inv-1', host_id: 'host', invitee_id: 'friend' }]);
    const events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ phase: 'started', joinable: false }));
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    const updates = notifier.told.filter((t) => t.event.type === 'play_invite_update');
    expect(updates.map((u) => u.userId).sort()).toEqual(['friend', 'host']);
    expect(updates[0]!.event).toMatchObject({ inviteId: 'inv-1', status: 'expired' });

    // a full lobby too
    notifier.told = [];
    events.attach('wordle-battle', async () => facts({ maxPlayers: 2 }));
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    expect(notifier.told.some((t) => t.event.type === 'play_invite_update')).toBe(true);
  });

  it('coalesces a burst of changes to one lobby into one send now and one at the end', async () => {
    const notifier = new FakeNotifier();
    const events = new PlayEvents(fakePool([]), notifier);
    events.attach('rhyme-match', async () => facts({ game: 'rhyme-match', memberIds: ['host'] }));
    for (let i = 0; i < 10; i++) events.changed('rhyme-match', 'lobby-1');
    await settle();
    expect(notifier.told).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PLAY_CHANGED_COALESCE_MS);
    await settle();
    expect(notifier.told).toHaveLength(2);
    // and nothing more once it is quiet
    await vi.advanceTimersByTimeAsync(PLAY_CHANGED_COALESCE_MS * 3);
    await settle();
    expect(notifier.told).toHaveLength(2);
    // another lobby is not held up by this one
    events.changed('rhyme-match', 'lobby-2');
    await settle();
    expect(notifier.told).toHaveLength(3);
  });

  it('never throws, even when reading the lobby fails, and stops after close', async () => {
    const notifier = new FakeNotifier();
    const warn = vi.fn();
    const events = new PlayEvents(fakePool([]), notifier, { coalesceMs: 0, log: { warn } });
    events.attach('wordle-battle', async () => {
      throw new Error('db down');
    });
    expect(() => events.changed('wordle-battle', 'lobby-1')).not.toThrow();
    await settle();
    expect(warn).toHaveBeenCalled();
    events.close();
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    expect(notifier.told).toHaveLength(0);
  });
});
