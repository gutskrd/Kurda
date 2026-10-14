import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi, type Call } from '../stories/testing';
import { InviteFriendsButton, InvitedList } from './LobbyInvites';
import { asked, renderPlay } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const outgoing = (invitees = [asked()]) => ({
  incoming: [],
  outgoing: [{ game: 'wordle-battle', lobbyId: 'b1', invitees }],
});

describe('InvitedList', () => {
  it('says where each friend asked stands, softly', async () => {
    fakeApi({
      'GET /play/invites': outgoing([
        asked({ inviteId: 'a', name: 'Rojda', status: 'pending' }),
        asked({ inviteId: 'b', name: 'Zana', status: 'accepted' }),
        asked({ inviteId: 'c', name: 'Berfin', status: 'declined', declineReason: 'later' }),
        asked({ inviteId: 'd', name: 'Hevi', status: 'declined', declineReason: 'not_this_game' }),
        asked({ inviteId: 'e', name: 'Baran', status: 'expired' }),
      ]),
    });
    renderPlay(<InvitedList game="wordle-battle" lobbyId="b1" room={3} />);

    const list = await screen.findByRole('list');
    const row = (name: string) => within(list).getByText(name).closest('li')!;
    expect(row('Rojda')).toHaveTextContent('Waiting for an answer');
    expect(row('Zana')).toHaveTextContent('Joined');
    expect(row('Berfin')).toHaveTextContent('Can’t play right now');
    expect(row('Hevi')).toHaveTextContent('Would rather play something else');
    expect(row('Baran')).toHaveTextContent('The invite ran out');
    // the list follows the answers as they come, and says each one politely
    expect(list).toHaveAttribute('aria-live', 'polite');
  });

  it('takes back an invite still waiting, and asks again one that ran out', async () => {
    const { calls } = fakeApi({
      'GET /play/invites': outgoing([asked({ inviteId: 'a', name: 'Rojda' }), asked({ inviteId: 'e', userId: 'u5', name: 'Baran', status: 'expired' })]),
      'DELETE /play/invites/a': { ok: true },
      'POST /play/invites': { ok: true, invited: 1 },
    });
    renderPlay(<InvitedList game="wordle-battle" lobbyId="b1" room={3} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel the invite to Rojda' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/play/invites/a')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Invite Baran again' }));
    await waitFor(() =>
      expect(calls.find((c: Call) => c.method === 'POST' && c.path === '/play/invites')?.body).toEqual({
        game: 'wordle-battle',
        lobbyId: 'b1',
        userIds: ['u5'],
      }),
    );
  });

  it('offers no Invite again once the lobby is full', async () => {
    fakeApi({ 'GET /play/invites': outgoing([asked({ name: 'Baran', status: 'expired' })]) });
    renderPlay(<InvitedList game="wordle-battle" lobbyId="b1" room={0} />);
    await screen.findByText('Baran');
    expect(screen.queryByRole('button', { name: /again/ })).not.toBeInTheDocument();
  });

  it('is not there before anyone was asked', async () => {
    const { calls } = fakeApi({ 'GET /play/invites': { incoming: [], outgoing: [] } });
    renderPlay(<InvitedList game="wordle-battle" lobbyId="b1" room={3} />);
    await waitFor(() => expect(calls.some((c) => c.path === '/play/invites')).toBe(true));
    expect(screen.queryByRole('heading', { name: 'Invited' })).not.toBeInTheDocument();
  });
});

describe('InviteFriendsButton', () => {
  it('opens the sheet without the friends already asked or in', async () => {
    fakeApi({
      'GET /play/invites': outgoing([asked({ userId: 'u2', name: 'Rojda' })]),
      'GET /friends': {
        friends: [
          { userId: 'u2', username: 'rojda', displayName: 'Rojda', avatarUrl: null, online: false, lastSeenAt: null },
          { userId: 'u3', username: 'zana', displayName: 'Zana', avatarUrl: null, online: false, lastSeenAt: null },
        ],
      },
    });
    renderPlay(<InviteFriendsButton game="wordle-battle" lobbyId="b1" room={2} />);

    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    await userEvent.click(screen.getByRole('button', { name: 'Invite friends' }));
    const sheet = await screen.findByRole('dialog', { name: 'Invite friends' });
    expect(await within(sheet).findByRole('checkbox', { name: /Zana/ })).toBeInTheDocument();
    expect(within(sheet).queryByRole('checkbox', { name: /Rojda/ })).not.toBeInTheDocument();
  });

  it('cannot be used once the lobby is full', () => {
    fakeApi({ 'GET /play/invites': { incoming: [], outgoing: [] } });
    renderPlay(<InviteFriendsButton game="wordle-battle" lobbyId="b1" room={0} />);
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeDisabled();
  });
});
