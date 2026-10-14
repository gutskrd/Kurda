import { describe, expect, it } from 'vitest';
import { isChatEvent, isUserEvent, userEventOf } from './events';

describe('which events reach which hook', () => {
  it('passes invites, rematch offers and gifts to useUserEvents, and nothing else', () => {
    for (const type of ['play_invite', 'play_invite_update', 'play_changed', 'rematch_update', 'gift_received', 'gift_opened']) {
      expect(isUserEvent(type), type).toBe(true);
    }
    for (const type of ['dm', 'dm_typing', 'group_msg', 'challenge_invite', 'match_found', 42, undefined]) {
      expect(isUserEvent(type), String(type)).toBe(false);
    }
  });

  it('takes a user event only from your own channel, not a group room’s copy', () => {
    const ev = { type: 'play_changed', game: 'stories', lobbyId: 'l' };
    expect(userEventOf(ev, 'user:me')).toEqual(ev);
    expect(userEventOf(ev, 'group:g')).toBeNull();
  });

  it('gives direct messages, receipts and typing to the chat hook, from your own channel only', () => {
    expect(isChatEvent({ type: 'dm' }, 'user:me')).toBe(true);
    expect(isChatEvent({ type: 'dm_read' }, 'user:me')).toBe(true);
    expect(isChatEvent({ type: 'group_msg' }, 'user:me')).toBe(false);
    expect(isChatEvent({ type: 'dm' }, 'group:g')).toBe(false);
  });
});
