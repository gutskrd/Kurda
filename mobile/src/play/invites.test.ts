import { describe, expect, it } from 'vitest';
import type { IncomingInvite } from '@kurda/shared';
import { addInvite, applyInviteEvent, liveInvites, nextExpiry } from './invites';

const T = Date.parse('2026-10-13T10:00:00Z');
const invite = (id: string, over: Partial<IncomingInvite> = {}): IncomingInvite => ({
  id,
  game: 'wordle-battle',
  lobbyId: `l-${id}`,
  status: 'pending',
  from: { name: 'Rojda', avatarUrl: null },
  summary: { difficulty: 'hard' },
  rematch: false,
  createdAt: new Date(T).toISOString(),
  expiresAt: new Date(T + 15 * 60_000).toISOString(),
  ...over,
});

describe('the invite banner’s list', () => {
  it('puts a new invite first and replaces the same invite rather than doubling it', () => {
    let list = addInvite([], invite('a'));
    list = addInvite(list, invite('b'));
    list = addInvite(list, invite('a', { summary: { difficulty: 'easy' } }));
    expect(list.map((i) => i.id)).toEqual(['a', 'b']);
    expect(list[0]!.summary.difficulty).toBe('easy');
  });

  it('drops an invite once it is answered anywhere, taken back, or its lobby moved on', () => {
    const list = [invite('a'), invite('b')];
    for (const status of ['accepted', 'declined', 'cancelled', 'expired'] as const) {
      expect(applyInviteEvent(list, { type: 'play_invite_update', inviteId: 'a', status }).map((i) => i.id)).toEqual(['b']);
    }
    expect(applyInviteEvent(list, { type: 'play_changed', game: 'stories', lobbyId: 'x' })).toEqual(list);
  });

  it('shows only pending invites that have not run out, newest first', () => {
    const list = [
      invite('old', { createdAt: new Date(T - 60_000).toISOString() }),
      invite('new'),
      invite('gone', { expiresAt: new Date(T - 1).toISOString() }),
      invite('answered', { status: 'declined' }),
    ];
    expect(liveInvites(list, T).map((i) => i.id)).toEqual(['new', 'old']);
  });

  it('knows when the next one runs out', () => {
    expect(nextExpiry([invite('a'), invite('b', { expiresAt: new Date(T + 60_000).toISOString() })], T)).toBe(60_000);
    expect(nextExpiry([], T)).toBeNull();
  });
});
