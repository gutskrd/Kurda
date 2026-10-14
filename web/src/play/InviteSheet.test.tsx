import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, listItem, type Call } from '../stories/testing';
import { clearStoryLists, resetStoriesAvailable } from '../stories/catalogue';
import { InviteSheet, type InviteTarget } from './InviteSheet';
import { rememberFriends } from './playApi';
import { renderPlay, where } from './testing';

beforeEach(() => {
  clearStoryLists();
  resetStoriesAvailable();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const friend = (userId: string, username: string, extra: Record<string, unknown> = {}) => ({
  userId,
  username,
  displayName: null,
  avatarUrl: null,
  online: false,
  lastSeenAt: null,
  ...extra,
});

const friends = [
  friend('u1', 'berfin', { displayName: 'Berfin' }),
  friend('u2', 'rojda', { displayName: 'Rojda', online: true }),
  friend('u3', 'zana', { displayName: 'Zana' }),
];

function api(over: Record<string, unknown> = {}): { calls: Call[] } {
  return fakeApi({
    'GET /play/invites': { incoming: [], outgoing: [] },
    'GET /friends': { friends },
    'GET /stories': { stories: [listItem()] },
    'POST /play/lobbies': (c: Call) => ({ game: (c.body as { game: string }).game, lobbyId: 'new-1', invited: 1 }),
    ...over,
  });
}

const open = (target: InviteTarget, lockGame = false) =>
  renderPlay(<InviteSheet open onClose={() => undefined} target={target} lockGame={lockGame} />);

const posted = (calls: Call[], path: string) => calls.find((c) => c.method === 'POST' && c.path === path)?.body;

describe('InviteSheet', () => {
  it('makes a game with a friend already chosen, asks them, and goes to its lobby', async () => {
    const { calls } = api();
    open({ kind: 'new', friend: { userId: 'u2', name: 'Rojda' } });

    const sheet = await screen.findByRole('dialog', { name: 'Play with Rojda' });
    expect(await within(sheet).findByRole('checkbox', { name: /Rojda/ })).toBeChecked();
    // the friend it was opened for comes first, whatever else is ticked later
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Berfin/ }));
    expect(within(sheet).getAllByRole('checkbox')[0]).toHaveAccessibleName(/Rojda/);
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Berfin/ }));
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Hard' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create and invite (1)' }));

    await waitFor(() =>
      expect(posted(calls, '/play/lobbies')).toEqual({ game: 'wordle-battle', settings: { difficulty: 'hard', rated: false }, invite: ['u2'] }),
    );
    await waitFor(() => expect(where()).toBe('/app/games/wordle-battle?id=new-1'));
  });

  it('offers each game’s own presets, and Stories once a story is published', async () => {
    const { calls } = api();
    open({ kind: 'new' });

    const games = await screen.findByRole('radiogroup', { name: 'Game' });
    await userEvent.click(await within(games).findByRole('radio', { name: 'Stories' }));
    expect(screen.getByRole('radiogroup', { name: 'Who’s playing' })).toBeInTheDocument();
    // only the lengths that have a story, and the counts that length offers
    const lengths = await screen.findByRole('radiogroup', { name: 'Length' });
    expect(within(lengths).getAllByRole('radio')).toHaveLength(1);
    expect(within(screen.getByRole('radiogroup', { name: 'Questions' })).getByRole('radio', { name: '3 questions' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: /Zana/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create and invite (1)' }));
    await waitFor(() =>
      expect(posted(calls, '/play/lobbies')).toMatchObject({
        game: 'stories',
        settings: { mode: 'duo', length: 'short', questionCount: 3, textDuring: 'visible', access: 'friends' },
        invite: ['u3'],
      }),
    );
  });

  it('offers a story game’s timer and text presets, as its own setup does', async () => {
    const { calls } = api();
    open({ kind: 'new', game: 'stories' }, true);

    const timer = await screen.findByRole('radiogroup', { name: 'Time per question' });
    // a game with friends is timed unless the host says otherwise
    expect(within(timer).getByRole('radio', { name: '60 seconds' })).toBeChecked();
    await userEvent.click(within(timer).getByRole('radio', { name: '30 seconds' }));
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'The story during questions' })).getByRole('radio', { name: 'From memory' }));
    expect(screen.getByText(/The story is hidden while the questions are asked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() =>
      expect(posted(calls, '/play/lobbies')).toMatchObject({
        game: 'stories',
        settings: { mode: 'duo', timerSeconds: 30, textDuring: 'hidden' },
      }),
    );
  });

  it('keeps Stories out while no story is published', async () => {
    api({ 'GET /stories': { stories: [] } });
    open({ kind: 'new' });
    const games = await screen.findByRole('radiogroup', { name: 'Game' });
    await waitFor(() => expect(within(games).getAllByRole('radio')).toHaveLength(2));
  });

  it('asks only one friend for a game for two: choosing another swaps them', async () => {
    api();
    open({ kind: 'new', game: 'stories' }, true);

    const rojda = await screen.findByRole('checkbox', { name: /Rojda/ });
    const zana = screen.getByRole('checkbox', { name: /Zana/ });
    await userEvent.click(rojda);
    await userEvent.click(zana);
    expect(zana).toBeChecked();
    expect(rojda).not.toBeChecked();
  });

  it('finds a friend by name, puts the ones asked recently first, and says who is online', async () => {
    rememberFriends(['u3']);
    api();
    open({ kind: 'new', game: 'wordle-battle' }, true);

    const list = await screen.findByRole('group', { name: 'Who to invite' });
    const boxes = await within(list).findAllByRole('checkbox');
    // asked recently first, then who is online, then the rest by name
    expect(boxes.map((b) => b.closest('label')?.querySelector('.invite-friend-name')?.textContent)).toEqual(['Zana', 'Rojda', 'Berfin']);
    expect(within(list).getByText('Recent')).toBeInTheDocument();
    expect(within(list).getByText(/online/)).toBeInTheDocument();

    await userEvent.type(within(list).getByRole('searchbox', { name: 'Search your friends' }), 'ber');
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1);
    await userEvent.type(within(list).getByRole('searchbox'), 'xyz');
    expect(within(list).getByText('No friend by that name.')).toBeInTheDocument();
  });

  it('points somewhere useful when there is nobody to ask yet', async () => {
    api({ 'GET /friends': { friends: [] } });
    open({ kind: 'new', game: 'rhyme-match' }, true);
    expect(await screen.findByText('No friends to invite yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find friends' })).toHaveAttribute('href', '/app/friends');
    // a game can still be made, and shared by its link
    expect(screen.getByRole('button', { name: 'Create game' })).toBeEnabled();
  });

  it('posts a game to a group instead of asking anyone', async () => {
    const { calls } = api();
    open({ kind: 'group', groupId: 'g1', groupName: 'Hevalên Kurmancî' });

    expect(await screen.findByRole('dialog', { name: 'Play in Hevalên Kurmancî' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Who to invite' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Post to the group' }));
    await waitFor(() => expect(posted(calls, '/play/lobbies')).toEqual({ game: 'wordle-battle', settings: { difficulty: 'medium', rated: false }, chat: { groupId: 'g1' } }));
  });

  it('asks friends into an open lobby, leaving out the ones already in or asked', async () => {
    const { calls } = api({ 'POST /play/invites': { ok: true, invited: 1 } });
    const done = vi.fn();
    renderPlay(
      <InviteSheet open onClose={done} target={{ kind: 'lobby', game: 'rhyme-match', lobbyId: 'r1', room: 3, exclude: ['u2'] }} />,
    );

    const sheet = await screen.findByRole('dialog', { name: 'Invite friends' });
    expect(within(sheet).queryByRole('radiogroup', { name: 'Game' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('checkbox', { name: /Rojda/ })).not.toBeInTheDocument();
    const send = within(sheet).getByRole('button', { name: 'Send invites' });
    expect(send).toBeDisabled();
    await userEvent.click(await within(sheet).findByRole('checkbox', { name: /Berfin/ }));
    await userEvent.click(send);
    await waitFor(() => expect(posted(calls, '/play/invites')).toEqual({ game: 'rhyme-match', lobbyId: 'r1', userIds: ['u1'] }));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('says why a game could not be made', async () => {
    api({ 'POST /play/lobbies': new Response(JSON.stringify({ code: 'EMPTY_POOL', message: 'x' }), { status: 503 }) });
    open({ kind: 'new', game: 'wordle-battle' }, true);
    await userEvent.click(await screen.findByRole('button', { name: 'Create game' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no words/i);
  });

  it('keeps its submit to itself when it sits inside another form (the chat composer)', async () => {
    api();
    const outer = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderPlay(
      <form onSubmit={outer}>
        <InviteSheet open onClose={() => undefined} target={{ kind: 'new', game: 'wordle-battle' }} lockGame />
      </form>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(where()).toBe('/app/games/wordle-battle?id=new-1'));
    expect(outer).not.toHaveBeenCalled();
  });
});
