import { describe, expect, it } from 'vitest';
import { relativeTime, resolveDeepLink, unreadBadge } from './inbox.js';

describe('resolveDeepLink', () => {
  it('resolves known targets with required params', () => {
    expect(resolveDeepLink({ screen: 'EventQuests' })).toEqual({ screen: 'EventQuests' });
    expect(resolveDeepLink({ screen: 'Game', roomId: 'r1' })).toEqual({ screen: 'Game', params: { roomId: 'r1' } });
    expect(resolveDeepLink({ screen: 'Chat', userId: 'u1', username: 'ada' })).toEqual({
      screen: 'Chat',
      params: { userId: 'u1', username: 'ada' },
    });
  });

  it('returns null for missing params or unknown screens (friendly fallback)', () => {
    expect(resolveDeepLink({ screen: 'Game' })).toBeNull();
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
