// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InviteLists, StoryListItem } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { resetPrefsCache } from '../stories/prefs';
import { resetRatedChoices } from '../ranks/ratedPrefs';
import { navigation } from './testing/navigation';
import { InviteSheet, orderFriends, recentPlayers } from './InviteSheet';
import type { FriendSummary } from './api';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

const friend = (userId: string, displayName: string, online = false): FriendSummary => ({
  userId,
  username: displayName.toLowerCase(),
  displayName,
  avatarUrl: null,
  online,
  lastSeenAt: null,
});

const ROJDA = friend('u-rojda', 'Rojda');
const AZAD = friend('u-azad', 'Azad', true);
const SIPAN = friend('u-sipan', 'Sipan');

const story: StoryListItem = {
  id: 's1',
  slug: 'nane-germ',
  title: 'Nanê Germ',
  summary: null,
  dialect: 'kurmanci',
  level: 1,
  length: 'short',
  wordCount: 180,
  readingMinutes: 2,
  fullyNarrated: false,
};

const noInvites: InviteLists = { incoming: [], outgoing: [] };

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /friends?limit=500': ok({ total: 3, friends: [ROJDA, AZAD, SIPAN] }),
    'GET /play/invites': ok(noInvites),
    'GET /stories?dialect=kurmanci': ok({ stories: [story] }),
    'GET /story-games/options': ok({ canHostOpen: false }),
    ...extra,
  } as Parameters<typeof fakeClient>[0];
}

describe('recentPlayers and orderFriends', () => {
  it('puts first only the friends who came into one of your games, not the ones who said no', () => {
    const lists: InviteLists = {
      incoming: [],
      outgoing: [
        {
          game: 'stories',
          lobbyId: 'g1',
          invitees: [
            { inviteId: 'i1', userId: 'u-sipan', name: 'Sipan', avatarUrl: null, status: 'accepted', declineReason: null },
            { inviteId: 'i2', userId: 'u-azad', name: 'Azad', avatarUrl: null, status: 'declined', declineReason: 'later' },
          ],
        },
      ],
    };
    expect(recentPlayers(lists)).toEqual(['u-sipan']);
    const { recent, rest } = orderFriends([ROJDA, AZAD, SIPAN], recentPlayers(lists), '');
    expect(recent.map((f) => f.userId)).toEqual(['u-sipan']);
    // the rest: online first, then by name
    expect(rest.map((f) => f.userId)).toEqual(['u-azad', 'u-rojda']);
  });

  it('searches by name and by username', () => {
    expect(orderFriends([ROJDA, AZAD], [], 'roj').rest.map((f) => f.userId)).toEqual(['u-rojda']);
    expect(orderFriends([ROJDA, AZAD], [], 'AZ').rest.map((f) => f.userId)).toEqual(['u-azad']);
  });
});

describe('InviteSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    resetRatedChoices();
    navigation.navigate.mockClear();
  });
  afterEach(cleanup);

  it('from a DM keeps that friend in the game, and a game for two offers nobody else', async () => {
    const client = fakeClient(
      routes({ 'POST /play/lobbies': ok({ game: 'stories', lobbyId: 'g9', invited: 1 }) }),
    );
    testAuth.client = client;
    renderWithProviders(<InviteSheet target={{ kind: 'dm', friendId: 'u-rojda' }} onClose={() => undefined} />);
    const rojda = await screen.findByRole('radio', { name: 'Rojda' });
    expect(rojda.getAttribute('aria-checked')).toBe('true');
    expect(rojda.getAttribute('aria-disabled')).toBe('true');
    // tapping the DM's friend does not take them out
    fireEvent.click(rojda);
    expect(screen.getByRole('radio', { name: 'Rojda' }).getAttribute('aria-checked')).toBe('true');
    // a duo from a DM is with that friend: no search, no other friends
    expect(screen.queryByLabelText('Search friends')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Azad, online now' })).toBeNull();

    // the button waits for the stories to arrive (a Stories game needs one); under a loaded run they can come last
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create the game' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Create the game' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g9' }));
    const sent = client.calls.find((c) => c.path === '/play/lobbies')?.body as { chat: unknown; invite?: string[]; game: string };
    expect(sent.game).toBe('stories');
    // the DM's friend is invited by `chat`, which also puts the card in the DM
    expect(sent.chat).toEqual({ userId: 'u-rojda' });
    expect(sent.invite).toBeUndefined();
  });

  it('says a chat mute as a limit, with Account standing, when the card cannot go into the DM', async () => {
    const onClose = vi.fn();
    testAuth.client = fakeClient(
      routes({ 'POST /play/lobbies': fail({ status: 403, code: 'MUTED', details: { scope: 'chat', until: null } }) }),
    );
    renderWithProviders(<InviteSheet target={{ kind: 'dm', friendId: 'u-rojda' }} onClose={onClose} />);
    await screen.findByRole('radio', { name: 'Rojda' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create the game' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Create the game' }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(onClose).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('says the server is not ready yet, rather than "route not found", when the API has no play routes', async () => {
    // an API older than playing with friends answers with its not-found handler
    testAuth.client = fakeClient(
      routes({ 'POST /play/lobbies': fail({ status: 404, code: 'NOT_FOUND', message: 'route not found' }) }),
    );
    renderWithProviders(<InviteSheet target={{ kind: 'dm', friendId: 'u-rojda' }} onClose={() => undefined} />);
    await screen.findByRole('radio', { name: 'Rojda' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create the game' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Create the game' }));
    expect(await screen.findByText('This isn’t on the server yet. It will work once the server is updated.')).toBeTruthy();
    expect(screen.queryByText('route not found')).toBeNull();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('from a DM, a group game may ask more friends, with the DM’s friend still in it', async () => {
    const client = fakeClient(routes({ 'POST /play/lobbies': ok({ game: 'stories', lobbyId: 'g9', invited: 2 }) }));
    testAuth.client = client;
    renderWithProviders(<InviteSheet target={{ kind: 'dm', friendId: 'u-rojda' }} onClose={() => undefined} />);
    await screen.findByRole('radio', { name: 'Rojda' });
    fireEvent.click(screen.getByRole('radio', { name: 'With a group' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Azad, online now' }));
    expect(screen.getByRole('checkbox', { name: 'Rojda' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Create the game' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/play/lobbies')).toBe(true));
    const sent = client.calls.find((c) => c.path === '/play/lobbies')?.body as { chat: unknown; invite?: string[]; settings: { mode: string } };
    expect(sent.settings.mode).toBe('group');
    expect(sent.chat).toEqual({ userId: 'u-rojda' });
    expect(sent.invite).toEqual(['u-azad']);
  });

  it('from a group posts the game there, and asking friends as well is optional', async () => {
    const client = fakeClient(routes({ 'POST /play/lobbies': ok({ game: 'wordle-battle', lobbyId: 'b1', invited: 0 }) }));
    testAuth.client = client;
    const onClose = vi.fn();
    renderWithProviders(<InviteSheet target={{ kind: 'group', groupId: 'grp-1' }} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Wordle Battle' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post the game in the group' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // the host's Rated/Friendly choice goes with the presets (Friendly when nothing was ever chosen)
    expect(client.calls.find((c) => c.path === '/play/lobbies')?.body).toEqual({
      game: 'wordle-battle',
      settings: { difficulty: 'hard', rated: false },
      invite: undefined,
      chat: { groupId: 'grp-1' },
    });
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle', { id: 'b1' });
  });

  it('asks Rated or Friendly for a new game, says what each means, and sends the host’s choice', async () => {
    const client = fakeClient(routes({ 'POST /play/lobbies': ok({ game: 'rhyme-match', lobbyId: 'm1', invited: 0 }) }));
    testAuth.client = client;
    renderWithProviders(<InviteSheet target={{ kind: 'group', groupId: 'grp-1' }} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Rhyme Match' }));
    expect(screen.getByRole('radiogroup', { name: 'Game type' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Friendly\. Just for fun/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /^Rated\. Counts for your rank/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Post the game in the group' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/play/lobbies')).toBe(true));
    const sent = client.calls.find((c) => c.path === '/play/lobbies')?.body as { settings: Record<string, unknown> };
    expect(sent.settings.rated).toBe(true);
  });

  it('asks more friends into a lobby that exists and says how many were asked', async () => {
    const client = fakeClient(routes({ 'POST /play/invites': ok({ ok: true, invited: 2 }) }));
    testAuth.client = client;
    renderWithProviders(<InviteSheet target={{ kind: 'lobby', game: 'rhyme-match', lobbyId: 'm1', mode: 'group' }} onClose={() => undefined} />);
    // no game and no presets: the lobby has them already
    expect(screen.queryByRole('radiogroup', { name: 'Game' })).toBeNull();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Azad, online now' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sipan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invites (2)' }));
    expect(await screen.findByText('Invites sent: 2')).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/play/invites')?.body).toEqual({ game: 'rhyme-match', lobbyId: 'm1', userIds: ['u-azad', 'u-sipan'] });
  });

  it('needs a friend picked before a new game can be made from a profile', async () => {
    testAuth.client = fakeClient(routes());
    renderWithProviders(<InviteSheet target={{ kind: 'new' }} onClose={() => undefined} />);
    await act(async () => undefined);
    const create = screen.getByRole('button', { name: 'Create the game' });
    expect(create.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(await screen.findByRole('radio', { name: 'Sipan' }));
    expect(screen.getByRole('button', { name: 'Create the game' }).getAttribute('aria-disabled')).not.toBe('true');
  });
});
