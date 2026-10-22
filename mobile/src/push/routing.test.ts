import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../api/client';
import type { RootNavigation } from '../navigation/rootStack';
import { isConversationOnScreen, openPushTarget, pushTarget, type PushTarget } from './routing';

const FRIEND = '2b7c4a10-0000-4000-8000-000000000002';
const CLUB = '3c8d5b20-0000-4000-8000-000000000003';

function fakes(routes: Record<string, unknown> = {}) {
  const went: Array<[string, unknown]> = [];
  const navigation = { navigate: (name: string, params?: unknown) => went.push([name, params]) } as unknown as RootNavigation;
  const answer = async (path: string) =>
    path in routes ? { ok: true, data: routes[path] } : { ok: false, error: { kind: 'client', status: 404, message: 'no' } };
  const client = { get: answer, post: answer } as unknown as ApiClient;
  return { navigation, client, went };
}

/** Where a push with this data lands, once the navigation has settled. */
async function landing(data: Record<string, unknown> | null, routes: Record<string, unknown> = {}) {
  const f = fakes(routes);
  openPushTarget(pushTarget(data), f.navigation, f.client);
  // an invite is accepted on the way, which takes a round trip
  await new Promise((resolve) => setTimeout(resolve, 0));
  return f.went;
}

describe('pushTarget: each push the API sends opens somewhere sensible', () => {
  it('a streak reminder (no kind, category streak) opens the lessons', async () => {
    expect(pushTarget({ category: 'streak' })).toEqual({ kind: 'learn' });
    expect(await landing({ category: 'streak' })).toEqual([['Tabs', { screen: 'Learn' }]]);
  });

  it('the day’s badges open Badges', async () => {
    expect(await landing({ kind: 'badge', day: '2026-10-21', category: 'progress' })).toEqual([['Badges', undefined]]);
  });

  it('moving up a league, and a Pêla week, open the league', async () => {
    expect(await landing({ kind: 'league_promotion', weekKey: '2026-10-19', tier: 'cem', category: 'progress' })).toEqual([['League', undefined]]);
    expect(await landing({ kind: 'league_trophy', weekKey: '2026-10-19', tier: 'okyanus', category: 'progress' })).toEqual([['League', undefined]]);
    expect(await landing({ kind: 'league_safe', weekKey: '2026-10-19', tier: 'cem', category: 'progress' })).toEqual([['League', undefined]]);
  });

  it('an invite to play is accepted on the way into its lobby', async () => {
    const data = { kind: 'play_invite', inviteId: 'i1', game: 'wordle-battle', lobbyId: 'b1', category: 'games' };
    expect(await landing(data, { '/play/invites/i1/accept': { game: 'wordle-battle', lobbyId: 'b1' } })).toEqual([['WordleBattle', { id: 'b1' }]]);
  });

  it('a gift opens the chat it came in, with the gift to unwrap', async () => {
    const data = { kind: 'gift', chat: `dm:${FRIEND}`, giftId: 'gf1', category: 'friends' };
    expect(await landing(data)).toEqual([['Chat', { userId: FRIEND, username: '', openGift: 'gf1' }]]);
  });

  it('a report outcome, or a decision on the account, opens where those are', async () => {
    expect(await landing({ kind: 'report_outcome', category: 'moderation' })).toEqual([['MyReports', undefined]]);
    expect(await landing({ kind: 'sanction', category: 'moderation' })).toEqual([['AccountStanding', undefined]]);
  });

  it('a caring message is read in full in the notification list, which has its helpline', async () => {
    expect(pushTarget({ kind: 'caring_message', helplineUrl: 'https://example.org/help' })).toEqual({ kind: 'inbox' });
    expect(await landing({ kind: 'caring_message' })).toEqual([['NotificationCenter', undefined]]);
  });

  it('a test send, a kind this version does not know, or no data at all opens the notification list', async () => {
    const inbox: PushTarget = { kind: 'inbox' };
    expect(pushTarget({ category: 'events' })).toEqual(inbox);
    expect(pushTarget({ kind: 'something_new', category: 'progress' })).toEqual(inbox);
    expect(pushTarget({})).toEqual(inbox);
    expect(pushTarget(null)).toEqual(inbox);
    expect(await landing(undefined as unknown as null)).toEqual([['NotificationCenter', undefined]]);
  });

  it('a kind with its ids missing is not followed into a dead screen', () => {
    // an invite without its lobby: nothing to open but the list
    expect(pushTarget({ kind: 'play_invite', inviteId: 'i1', category: 'games' })).toEqual({ kind: 'inbox' });
  });

  it('a streak category does not override a kind that names a screen', () => {
    expect(pushTarget({ kind: 'badge', category: 'streak' })).toEqual({ kind: 'link', link: { screen: 'Badges' } });
  });
});

describe('isConversationOnScreen', () => {
  const message = { screen: 'Chat', userId: FRIEND, username: 'azad' };

  it('is true for a message from the person whose chat is open', () => {
    expect(isConversationOnScreen(message, { name: 'Chat', params: { userId: FRIEND, username: 'azad' } })).toBe(true);
    expect(isConversationOnScreen({ kind: 'gift', chat: `dm:${FRIEND}` }, { name: 'Chat', params: { userId: FRIEND } })).toBe(true);
    expect(isConversationOnScreen({ kind: 'gift', chat: `group:${CLUB}` }, { name: 'GroupThread', params: { groupId: CLUB } })).toBe(true);
  });

  it('is false for another chat, another screen, or a push that is not a conversation', () => {
    expect(isConversationOnScreen(message, { name: 'Chat', params: { userId: 'someone-else' } })).toBe(false);
    expect(isConversationOnScreen(message, { name: 'Tabs' })).toBe(false);
    expect(isConversationOnScreen(message, undefined)).toBe(false);
    expect(isConversationOnScreen({ kind: 'gift', chat: `group:${CLUB}` }, { name: 'Chat', params: { userId: CLUB } })).toBe(false);
    expect(isConversationOnScreen({ category: 'streak' }, { name: 'Chat', params: { userId: FRIEND } })).toBe(false);
    expect(isConversationOnScreen(null, { name: 'Chat', params: { userId: FRIEND } })).toBe(false);
  });
});
