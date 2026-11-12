// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InviteLists, StoryListItem } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { resetPrefsCache } from '../stories/prefs';
import { resetRatedChoices } from '../ranks/ratedPrefs';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { forgetImpostorCategories } from '../impostor/categories';
import { forgetPartyOffers } from '../party/offer';
import { navigation } from './testing/navigation';
import { InviteSheet, orderFriends, recentPlayers, sentText } from './InviteSheet';
import { flightMs } from './SentTickets';
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
  language: 'ku',
  cefr: 'A1',
  audioCoverage: 'none',
  category: 'everyday',
  tradition: 'original',
  author: null,
  featured: false,
  cover: null,
  publishedAt: null,
};

const noInvites: InviteLists = { incoming: [], outgoing: [] };

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /friends?limit=500': ok({ total: 3, friends: [ROJDA, AZAD, SIPAN] }),
    'GET /play/invites': ok(noInvites),
    'GET /stories?dialect=kurmanci&limit=50': ok({ stories: [story] }),
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

describe('sentText', () => {
  const t = (key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
  const friendTicket = (name: string) => ({ id: name, name, photoUrl: null });
  const groupTicket = { id: 'group', name: 'Stories', photoUrl: null, group: true };

  it('names the one friend a ticket went to, and counts them otherwise', () => {
    expect(sentText([friendTicket('Azad')], 1, t as never)).toBe('play.sheet.sentTo{"name":"Azad"}');
    expect(sentText([friendTicket('Azad'), friendTicket('Sipan')], 2, t as never)).toBe('play.sheet.sent{"count":2}');
    // the server says how many it invited: a friend it skipped is not counted as sent
    expect(sentText([friendTicket('Azad'), friendTicket('Sipan')], 1, t as never)).toBe('play.sheet.sent{"count":1}');
  });

  it('says a game posted in a group with nobody else asked was posted there', () => {
    expect(sentText([groupTicket], 0, t as never)).toBe('play.sheet.posted');
    expect(sentText([groupTicket, friendTicket('Azad')], 1, t as never)).toBe('play.sheet.sentTo{"name":"Azad"}');
  });
});

describe('flightMs', () => {
  it('has nothing to wait for under Reduce Motion, and a long row flies no longer than the three tickets drawn', () => {
    expect(flightMs(3, true)).toBe(0);
    expect(flightMs(0, false)).toBe(0);
    expect(flightMs(1, false)).toBeGreaterThan(0);
    expect(flightMs(7, false)).toBe(flightMs(3, false));
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
    expect(await screen.findByText('This part of Hevalo isn’t available yet. Please try again later.')).toBeTruthy();
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
    fireEvent.click(await screen.findByRole('radio', { name: 'Peyvok Battle' }));
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

  it('lets the host of Kurdish Impostor draw the word from one category and give a full minute for a clue', async () => {
    // stand-in Kurdish for the fixtures, never shown to a learner
    const client = fakeClient(
      routes({
        'GET /games/availability?dialect=kmr': ok({ dialect: 'kmr', games: [{ id: 'impostor', available: true, difficulties: ['beginner'], levels: {}, levelled: true, minimum: 12 }] }),
        'GET /games/availability?dialect=ckb': ok({ dialect: 'ckb', games: [] }),
        'GET /games/impostor/couch?dialect=kmr': ok({
          dialect: 'kmr',
          difficulties: [
            {
              difficulty: 'beginner',
              cards: 16,
              categories: [
                { slug: 'animals', ku: 'heywan', meanings: { en: 'animal' }, cards: 8 },
                { slug: 'food', ku: 'xwarin', meanings: { en: 'food' }, cards: 5 },
              ],
            },
          ],
        }),
        'POST /play/lobbies': ok({ game: 'impostor', lobbyId: 'i1', invited: 0 }),
      }),
    );
    testAuth.client = client;
    const onClose = vi.fn();
    renderWithProviders(<InviteSheet target={{ kind: 'group', groupId: 'grp-1' }} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Kurdish Impostor' }));
    const any = await screen.findByRole('radio', { name: 'Any' });
    expect(screen.getByRole('radiogroup', { name: 'Category' }).contains(any)).toBe(true);
    // a category reads as its Kurdish name with the meaning in the reader's language
    fireEvent.click(screen.getByRole('radio', { name: 'heywan · animal' }));
    fireEvent.click(screen.getByRole('radio', { name: '60 s' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post the game in the group' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.calls.find((c) => c.path === '/play/lobbies')?.body).toMatchObject({
      game: 'impostor',
      settings: { dialect: 'kmr', difficulty: 'beginner', clueSeconds: 60, category: 'animals' },
    });
    forgetPartyOffers();
    forgetImpostorCategories();
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

describe('InviteSheet, its tickets', () => {
  let felt: HapticEvent[] = [];
  let stopFeeling: () => void = () => undefined;
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    resetRatedChoices();
    resetHaptics();
    navigation.navigate.mockClear();
    felt = [];
    stopFeeling = onHaptic((event) => felt.push(event));
  });
  afterEach(() => {
    stopFeeling();
    cleanup();
    patchReactNativeWeb({ reduceMotion: true });
  });
  const tick = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

  it('writes a ticket out for each friend picked, hands them over, and says whom it went to', async () => {
    patchReactNativeWeb({ reduceMotion: false });
    const client = fakeClient(routes({ 'POST /play/invites': ok({ ok: true, invited: 1 }) }));
    testAuth.client = client;
    renderWithProviders(<InviteSheet target={{ kind: 'lobby', game: 'wordle-battle', lobbyId: 'b1', mode: 'group' }} onClose={() => undefined} />);
    await screen.findByRole('checkbox', { name: 'Azad, online now' });
    // the sheet asks the system about Reduce Motion as it opens: the answer is in before anybody taps
    await tick();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Azad, online now' }));
    // the row says who is picked; the ticket written out for them is a picture of it
    expect(screen.getAllByText('Azad')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Send invites (1)' }));
    await tick();
    // the server has them, and the ticket is on its way: felt, but not yet said
    expect(felt).toEqual(['tap']);
    expect(screen.queryByText('Invite sent to Azad')).toBeNull();
    expect(await screen.findByText('Invite sent to Azad')).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/play/invites')?.body).toEqual({ game: 'wordle-battle', lobbyId: 'b1', userIds: ['u-azad'] });
    // the sheet stays for more, with nobody picked
    expect(screen.getByRole('checkbox', { name: 'Azad, online now' }).getAttribute('aria-checked')).toBe('false');
  });

  it('sets the tickets back down beside the reason when the invites are refused', async () => {
    testAuth.client = fakeClient(routes({ 'POST /play/invites': fail({ status: 404, code: 'NOT_FOUND', message: 'route not found' }) }));
    renderWithProviders(<InviteSheet target={{ kind: 'lobby', game: 'rhyme-match', lobbyId: 'm1', mode: 'group' }} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Sipan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invites (1)' }));
    expect(await screen.findByText('This part of Hevalo isn’t available yet. Please try again later.')).toBeTruthy();
    expect(felt).toEqual(['error']);
    // still written out, still picked, ready to try again
    expect(screen.getAllByText('Sipan')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Sipan' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/Invites? sent/)).toBeNull();
  });

  it('pins one ticket to the group, says it was posted, and then goes to the lobby', async () => {
    const onClose = vi.fn();
    testAuth.client = fakeClient(routes({ 'POST /play/lobbies': ok({ game: 'rhyme-match', lobbyId: 'm7', invited: 0 }) }));
    renderWithProviders(<InviteSheet target={{ kind: 'group', groupId: 'grp-1' }} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('radio', { name: 'Rhyme Match' }));
    // the group's ticket carries the game it is for
    expect(screen.getAllByText('Rhyme Match').length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: 'Post the game in the group' }));
    expect(await screen.findByText('Posted in the group')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('RhymeMatch', { id: 'm7' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('goes to the new game’s lobby even when the sheet is closed while it says the invites went', async () => {
    testAuth.client = fakeClient(routes({ 'POST /play/lobbies': ok({ game: 'stories', lobbyId: 'g9', invited: 1 }) }));
    const view = renderWithProviders(<InviteSheet target={{ kind: 'dm', friendId: 'u-rojda' }} onClose={() => undefined} />);
    await screen.findByRole('radio', { name: 'Rojda' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create the game' }).getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Create the game' }));
    expect(await screen.findByText('Invite sent to Rojda')).toBeTruthy();
    view.unmount();
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g9' });
  });

  it('under Reduce Motion, says the invites went as soon as the server has them, with nothing flying first', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    testAuth.client = fakeClient(routes({ 'POST /play/invites': ok({ ok: true, invited: 2 }) }));
    renderWithProviders(<InviteSheet target={{ kind: 'lobby', game: 'stories', lobbyId: 'g1', mode: 'group' }} onClose={() => undefined} />);
    await screen.findByRole('checkbox', { name: 'Azad, online now' });
    await tick();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Azad, online now' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rojda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send invites (2)' }));
    await tick();
    expect(screen.getByText('Invites sent: 2')).toBeTruthy();
  });
});
