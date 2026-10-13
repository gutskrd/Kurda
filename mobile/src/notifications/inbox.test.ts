import { describe, expect, it } from 'vitest';
import { relativeTime, resolveDeepLink, unreadBadge } from './inbox.js';

describe('resolveDeepLink', () => {
  it('resolves known targets with required params', () => {
    expect(resolveDeepLink({ screen: 'EventQuests' })).toEqual({ screen: 'EventQuests' });
    expect(resolveDeepLink({ screen: 'Chat', userId: 'u1', username: 'ada' })).toEqual({
      screen: 'Chat',
      params: { userId: 'u1', username: 'ada' },
    });
  });

  it('opens an invite to play, and a gift in the chat it came in, from what the server writes', () => {
    expect(resolveDeepLink({ kind: 'play_invite', inviteId: 'i1', game: 'stories', lobbyId: 'g1' })).toEqual({
      screen: 'PlayInvite',
      params: { inviteId: 'i1', game: 'stories', lobbyId: 'g1' },
    });
    expect(resolveDeepLink({ kind: 'gift', giftId: 'x', batchId: 'b', chat: 'dm:u1' })).toEqual({
      screen: 'GiftChat',
      params: { chat: { kind: 'dm', userId: 'u1' } },
    });
    expect(resolveDeepLink({ kind: 'gift', chat: 'group:g7' })).toEqual({ screen: 'GiftChat', params: { chat: { kind: 'group', groupId: 'g7' } } });
  });

  it('opens nothing for an invite or a gift it cannot place', () => {
    expect(resolveDeepLink({ kind: 'play_invite', inviteId: 'i1', game: 'chess', lobbyId: 'g1' })).toBeNull();
    expect(resolveDeepLink({ kind: 'play_invite', game: 'stories' })).toBeNull();
    expect(resolveDeepLink({ kind: 'gift', chat: 'somewhere' })).toBeNull();
    expect(resolveDeepLink({ kind: 'gift' })).toBeNull();
  });

  it('returns null for missing params or unknown screens (friendly fallback)', () => {
    // the quiz's game rooms are gone, and with them the screen they opened
    expect(resolveDeepLink({ screen: 'Game', roomId: 'r1' })).toBeNull();
    expect(resolveDeepLink({ screen: 'Profile' })).toBeNull();
    expect(resolveDeepLink({ screen: 'Nope' })).toBeNull();
    expect(resolveDeepLink({})).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-03-21T12:00:00.000Z');
  it('formats recency compactly', () => {
    expect(relativeTime('2026-03-21T11:59:40.000Z', now)).toBe('now');
    expect(relativeTime('2026-03-21T11:45:00.000Z', now)).toBe('15m');
    expect(relativeTime('2026-03-21T09:00:00.000Z', now)).toBe('3h');
    expect(relativeTime('2026-03-19T12:00:00.000Z', now)).toBe('2d');
  });
});

describe('unreadBadge', () => {
  it('caps and hides at zero', () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(3)).toBe('3');
    expect(unreadBadge(12)).toBe('9+');
  });
});
