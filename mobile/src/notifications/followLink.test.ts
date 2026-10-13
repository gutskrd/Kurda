import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../api/client';
import type { RootNavigation } from '../navigation/rootStack';
import { followDeepLink, notificationText } from './followLink';

function fakes(routes: Record<string, unknown> = {}) {
  const went: Array<[string, unknown]> = [];
  const asked: string[] = [];
  const navigation = { navigate: (name: string, params?: unknown) => went.push([name, params]) } as unknown as RootNavigation;
  const answer = async (path: string) => {
    asked.push(path);
    return path in routes ? { ok: true, data: routes[path] } : { ok: false, error: { kind: 'client', status: 404, message: 'no' } };
  };
  const client = { get: answer, post: answer } as unknown as ApiClient;
  return { navigation, client, went, asked };
}

describe('followDeepLink', () => {
  it('opens another person’s profile as UserProfile, never the Profile tab', async () => {
    const f = fakes();
    await followDeepLink({ screen: 'Profile', params: { userId: 'u9' } }, f.navigation, f.client);
    expect(f.went).toEqual([['UserProfile', { userId: 'u9' }]]);
  });

  it('accepts an invite on the way and lands in the lobby the server names', async () => {
    const f = fakes({ '/play/invites/i1/accept': { game: 'wordle-battle', lobbyId: 'b1' } });
    await followDeepLink({ screen: 'PlayInvite', params: { inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1' } }, f.navigation, f.client);
    expect(f.went).toEqual([['WordleBattle', { id: 'b1' }]]);
  });

  it('still opens the game when the invite can no longer be accepted, which then says why', async () => {
    const f = fakes();
    await followDeepLink({ screen: 'PlayInvite', params: { inviteId: 'old', game: 'stories', lobbyId: 'g1' } }, f.navigation, f.client);
    expect(f.went).toEqual([['StoryGame', { id: 'g1' }]]);
  });

  it('opens a gift in the DM it came in, with the friend’s name for the header', async () => {
    const f = fakes({ '/chat/conversations': { conversations: [{ userId: 'u2', username: 'rojda' }] } });
    await followDeepLink({ screen: 'GiftChat', params: { chat: { kind: 'dm', userId: 'u2' } } }, f.navigation, f.client);
    expect(f.went).toEqual([['Chat', { userId: 'u2', username: 'rojda' }]]);
  });

  it('opens a gift sent in a group in that group’s thread', async () => {
    const f = fakes({ '/me/groups': { groups: [{ id: 'g1', name: 'Hevalên Kurmancî' }] } });
    await followDeepLink({ screen: 'GiftChat', params: { chat: { kind: 'group', groupId: 'g1' } } }, f.navigation, f.client);
    expect(f.went).toEqual([['GroupThread', { groupId: 'g1', name: 'Hevalên Kurmancî' }]]);
  });
});

describe('notificationText', () => {
  const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}(${Object.values(vars).join(',')})` : key);
  const invite = { title: 'Rojda invited you', body: 'Wordle Battle', data: { kind: 'play_invite', game: 'wordle-battle' } };

  it('keeps the server’s English line for English readers, and writes its own from the kind for everyone else', () => {
    expect(notificationText(invite, t as never, 'en')).toEqual({ title: 'Rojda invited you', body: 'Wordle Battle' });
    expect(notificationText(invite, t as never, 'ku')).toEqual({
      title: 'play.notification.inviteTitle',
      body: 'play.notification.inviteBody(games.battle.name)',
    });
    expect(notificationText({ title: 'x', body: 'y', data: { kind: 'gift' } }, t as never, 'de').title).toBe('play.notification.giftTitle');
    expect(notificationText({ title: 'Streak', body: 'Keep going', data: {} }, t as never, 'de')).toEqual({ title: 'Streak', body: 'Keep going' });
  });
});
