import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeApi } from '../stories/testing';
import { Composer } from '../chat/Composer';
import { ChatGameButton } from './PlayButtons';
import { renderPlay } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const api = () =>
  fakeApi({
    'GET /play/invites': { incoming: [], outgoing: [] },
    'GET /friends': { friends: [{ userId: 'u2', username: 'rojda', displayName: 'Rojda', avatarUrl: null, online: true, lastSeenAt: null }] },
  });

describe('the game button in a chat', () => {
  it('in a conversation with a friend, opens the sheet with them chosen — and never sends the message', async () => {
    api();
    const send = vi.fn();
    renderPlay(
      <Composer
        value="half a sentence"
        onChange={() => undefined}
        onSubmit={send}
        sending={false}
        placeholder="Write a message"
        tools={<ChatGameButton target={{ kind: 'new', friend: { userId: 'u2', name: 'Rojda' } }} />}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    const sheet = await screen.findByRole('dialog', { name: 'Play with Rojda' });
    expect(await within(sheet).findByRole('checkbox', { name: /Rojda/ })).toBeChecked();
    expect(send).not.toHaveBeenCalled();
  });

  it('in a group, offers to post the game to the group', async () => {
    api();
    renderPlay(<ChatGameButton target={{ kind: 'group', groupId: 'g1', groupName: 'Hevalên Kurmancî' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start a game' }));
    expect(await screen.findByRole('dialog', { name: 'Play in Hevalên Kurmancî' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post to the group' })).toBeInTheDocument();
  });
});
