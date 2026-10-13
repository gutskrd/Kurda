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

interface FakeInvite {
  id: string;
  host_id: string;
  invitee_id: string;
  held: boolean;
  status: string;
}

/** A pool holding a few invites to the one lobby, as the fan-out reads, accepts and expires them. */
function fakePool(invites: Array<Omit<FakeInvite, 'status'>> = []) {
  const rows: FakeInvite[] = invites.map((i) => ({ ...i, status: 'pending' }));
  const queries: string[] = [];
  const pool = {
    queries,
    rows,
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql);
      const pending = rows.filter((r) => r.status === 'pending');
      if (sql.includes("SET status = 'accepted'")) {
        const hit = pending.filter((r) => (params[0] as string[]).includes(r.id));
        for (const r of hit) r.status = 'accepted';
        return { rows: hit };
      }
      if (sql.includes("SET status = 'expired'")) {
        for (const r of pending) r.status = 'expired';
        return { rows: pending };
      }
      if (sql.includes('FROM play_invites')) return { rows: pending };
      return { rows: [] };
    },
  };
  return pool as unknown as pg.Pool & { queries: string[]; rows: FakeInvite[] };
}

const invite = (id: string, inviteeId: string, held = false) => ({ id, host_id: 'host', invitee_id: inviteeId, held });

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
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

describe('PlayEvents', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tells the players, the friends with a pending invite, and the group room where the card is', async () => {
    const notifier = new FakeNotifier();
    const pool = fakePool([invite('inv-1', 'invitee'), invite('inv-2', 'held-friend', true)]);
    const events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ chatGroupId: 'g1' }));
    events.changed('wordle-battle', 'lobby-1', { also: ['just-removed'] });
    await settle();
    // not the friend an invite is held from: they were never told of the lobby
    expect(notifier.told.map((t) => t.userId).sort()).toEqual(['b', 'host', 'invitee', 'just-removed']);
    expect(notifier.told[0]!.event).toEqual({ type: 'play_changed', game: 'wordle-battle', lobbyId: 'lobby-1' });
    expect(notifier.published).toEqual([{ room: 'group:g1', event: { type: 'play_changed', game: 'wordle-battle', lobbyId: 'lobby-1' } }]);
  });

  it('a lobby that cannot be joined any more expires its invites, and both sides hear it (only the host, of a held one)', async () => {
    const notifier = new FakeNotifier();
    const pool = fakePool([invite('inv-1', 'friend'), invite('inv-2', 'held-friend', true)]);
    const events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ phase: 'started', joinable: false }));
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    const updates = notifier.told.filter((t) => t.event.type === 'play_invite_update');
    expect(updates.map((u) => `${u.userId}:${u.event.inviteId as string}`).sort()).toEqual(['friend:inv-1', 'host:inv-1', 'host:inv-2']);
    expect(updates[0]!.event).toMatchObject({ inviteId: 'inv-1', status: 'expired' });

    // a full lobby too
    const full = new FakeNotifier();
    const fullEvents = new PlayEvents(fakePool([invite('inv-3', 'friend')]), full, { coalesceMs: 0 });
    fullEvents.attach('wordle-battle', async () => facts({ maxPlayers: 2 }));
    fullEvents.changed('wordle-battle', 'lobby-1');
    await settle();
    expect(full.told.some((t) => t.event.type === 'play_invite_update')).toBe(true);
  });

  it('a friend who came in another way (the DM card, a link) has said yes: the host and they hear it once', async () => {
    const notifier = new FakeNotifier();
    const pool = fakePool([invite('inv-1', 'b'), invite('inv-2', 'c', true), invite('inv-3', 'still-asked')]);
    const events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ memberIds: ['host', 'b', 'c'], activeIds: ['host', 'b', 'c'] }));
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    const updates = notifier.told.filter((t) => t.event.type === 'play_invite_update');
    // c's invite was held: c never had a banner, so only the host hears it
    expect(updates.map((u) => `${u.userId}:${u.event.inviteId as string}:${u.event.status as string}`).sort()).toEqual([
      'b:inv-1:accepted',
      'host:inv-1:accepted',
      'host:inv-2:accepted',
    ]);
    expect(pool.rows.map((r) => r.status)).toEqual(['accepted', 'accepted', 'pending']);

    notifier.told = [];
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    expect(notifier.told.some((t) => t.event.type === 'play_invite_update')).toBe(false);
    expect(notifier.told.map((t) => t.userId).sort()).toEqual(['b', 'c', 'host', 'still-asked']);
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

  it('a move that ended nothing reaches the players but not the group room, nor the invites', async () => {
    const notifier = new FakeNotifier();
    const pool = fakePool([invite('inv-1', 'invitee')]);
    const events = new PlayEvents(pool, notifier, { coalesceMs: 0 });
    events.attach('wordle-battle', async () => facts({ chatGroupId: 'g1', phase: 'started', joinable: false }));
    events.changed('wordle-battle', 'lobby-1', { card: false });
    await settle();
    expect(notifier.told.map((t) => t.userId).sort()).toEqual(['b', 'host', 'invitee']);
    expect(notifier.published).toEqual([]);
    expect(pool.rows[0]!.status).toBe('pending');

    // and a change a card does show reaches the room, and the invites, as before
    events.changed('wordle-battle', 'lobby-1');
    await settle();
    expect(notifier.published).toHaveLength(1);
    expect(pool.rows[0]!.status).toBe('expired');
  });

  it('a burst of moves reaches the group room only if something in it could show on the card', async () => {
    const notifier = new FakeNotifier();
    const events = new PlayEvents(fakePool([]), notifier);
    events.attach('rhyme-match', async () => facts({ game: 'rhyme-match', chatGroupId: 'g1' }));
    // a match's worth of scored words: the players hear them, the room does not
    for (let i = 0; i < 10; i++) events.changed('rhyme-match', 'lobby-1', { card: false });
    await settle();
    await vi.advanceTimersByTimeAsync(PLAY_CHANGED_COALESCE_MS);
    await settle();
    expect(notifier.told.length).toBeGreaterThan(0);
    expect(notifier.published).toEqual([]);

    // a word, then the match ending, within one window: the trailing send reaches the room
    events.changed('rhyme-match', 'lobby-1', { card: false });
    events.changed('rhyme-match', 'lobby-1', { card: true });
    await settle();
    expect(notifier.published).toEqual([]);
    await vi.advanceTimersByTimeAsync(PLAY_CHANGED_COALESCE_MS);
    await settle();
    expect(notifier.published).toHaveLength(1);
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
