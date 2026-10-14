import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../api/client';
import type { RootNavigation } from '../navigation/rootStack';
import { followDeepLink, notificationText } from './followLink';
import { resolveDeepLink } from './inbox';

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

  it('opens a gift in the chat it came in, with the gift to unwrap (reports/deepLinks.ts)', async () => {
    const dm = resolveDeepLink({ kind: 'gift', chat: 'dm:2b7c4a10-0000-4000-8000-000000000002', giftId: 'gf1' });
    const group = resolveDeepLink({ kind: 'gift', chat: 'group:3c8d5b20-0000-4000-8000-000000000003', giftId: 'gf2' });
    expect(dm?.screen).toBe('Chat');
    expect(group?.screen).toBe('GroupThread');
    const f = fakes();
    await followDeepLink(dm!, f.navigation, f.client);
    await followDeepLink(group!, f.navigation, f.client);
    expect(f.went.map(([name]) => name)).toEqual(['Chat', 'GroupThread']);
    expect(f.went[0]![1]).toMatchObject({ userId: '2b7c4a10-0000-4000-8000-000000000002', openGift: 'gf1' });
    expect(f.went[1]![1]).toMatchObject({ groupId: '3c8d5b20-0000-4000-8000-000000000003', openGift: 'gf2' });
  });

  it('opens a screen it has no rule for by that screen’s own name', async () => {
    const f = fakes();
    await followDeepLink({ screen: 'MyReports' } as never, f.navigation, f.client);
    expect(f.went).toEqual([['MyReports', undefined]]);
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

describe('progress notifications (contract 4)', () => {
  const t = (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

  it('goes to the badges page and to the league', async () => {
    const f = fakes();
    await followDeepLink({ screen: 'Badges' }, f.navigation, f.client);
    await followDeepLink({ screen: 'League' }, f.navigation, f.client);
    expect(f.went).toEqual([
      ['Badges', undefined],
      ['League', undefined],
    ]);
  });

  it('writes its own words for a badge, in the reader’s language, naming the badge from the catalogue', () => {
    const item = { title: 'A new badge', body: 'You earned Agir.', data: { kind: 'badge', key: 'agir', tier: '2' } };
    expect(notificationText(item, t as never, 'en')).toEqual({ title: 'A new badge', body: 'You earned Agir.' });
    expect(notificationText(item, t as never, 'de')).toEqual({ title: 'notifications.badge.title', body: 'notifications.badge.body(name=badges.agir.name)' });
  });

  it('does not name a secret, and bundles a day without one', () => {
    expect(notificationText({ title: '', body: '', data: { kind: 'badge', key: 'tire-rast' } }, t as never, 'tr').body).toBe('notifications.badge.secretBody');
    expect(notificationText({ title: '', body: '', data: { kind: 'badge', day: '2026-10-14' } }, t as never, 'tr').body).toBe('notifications.badge.dayBody');
  });

  it('says the league news calmly, naming the new league when it knows it', () => {
    expect(notificationText({ title: '', body: '', data: { kind: 'league_promotion', tier: 'cem' } }, t as never, 'ar').body).toBe(
      'notifications.leagueUp.body(tier=leagues.tier.cem)',
    );
    expect(notificationText({ title: '', body: '', data: { kind: 'league_promotion', tier: 'bronze' } }, t as never, 'ar').body).toBe(
      'notifications.leagueUp.bodyPlain',
    );
    expect(notificationText({ title: '', body: '', data: { kind: 'league_safe' } }, t as never, 'ckb').title).toBe('notifications.leagueSafe.title');
    expect(notificationText({ title: '', body: '', data: { kind: 'league_trophy' } }, t as never, 'ckb').title).toBe('notifications.leagueTrophy.title');
  });
});
