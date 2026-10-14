import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { StoryGameView } from '@kurda/shared';
import { asked, renderPlay } from '../play/testing';
import { StoryGame } from './StoryGame';
import { detail, fakeApi, gameView, heldPoll, type Call } from './testing';

/*
 * A story game and the play layer (contract §A1 / §B): the host's
 * "Invite friends" and the friends asked, in the lobby; "Play again" on the
 * results of a duo or a group.
 */

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const game = () =>
  renderPlay(
    <Routes>
      <Route path="/app/games/stories/play/:gameId" element={<StoryGame />} />
    </Routes>,
    { route: '/app/games/stories/play/g-1' },
  );

const player = (seat: number, over: Partial<StoryGameView['players'][number]> = {}) => ({
  seat,
  name: null,
  avatarUrl: null,
  isHost: false,
  isMe: false,
  away: false,
  gone: false,
  score: 0,
  correct: 0,
  ...over,
});

/** The lobby, as a long-poll that never moves on. */
function lobby(view: StoryGameView): Record<string, unknown> {
  const poll = heldPoll();
  return { 'GET /story-games/g-1': (c: Call) => (c.path.includes('?v=') ? poll.answer(c) : view) };
}

describe('a story game with friends', () => {
  it('lets the host invite friends from the lobby, and shows who was asked', async () => {
    fakeApi({
      ...lobby(gameView()),
      'GET /play/invites': {
        incoming: [],
        outgoing: [{ game: 'stories', lobbyId: 'g-1', invitees: [asked({ name: 'Rojda', status: 'declined', declineReason: 'later' })] }],
      },
    });
    game();

    expect(await screen.findByRole('button', { name: 'Invite friends' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Invited' })).toBeInTheDocument();
    expect(screen.getByText('Rojda').closest('li')).toHaveTextContent('Can’t play right now');
  });

  it('does not offer invites to someone holding the controls while the host is away', async () => {
    fakeApi({
      ...lobby(
        gameView({
          isHost: true,
          players: [player(1, { name: 'Rojda', isHost: true, away: true }), player(2, { name: 'Ada', isMe: true })],
        }),
      ),
      'GET /play/invites': { incoming: [], outgoing: [] },
    });
    game();
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).not.toBeInTheDocument();
  });

  it('offers a duo a rematch on its results, naming the other player', async () => {
    const results = gameView({
      status: 'finished',
      code: null,
      players: [player(1, { name: 'Ada', isMe: true, isHost: true }), player(2, { name: 'Rojda' })],
      results: {
        standings: [
          { seat: 1, name: 'Ada', avatarUrl: null, isMe: true, score: 400, correct: 4, place: 1 },
          { seat: 2, name: 'Rojda', avatarUrl: null, isMe: false, score: 300, correct: 3, place: 2 },
        ],
        me: { place: 1, score: 400, correct: 4, answered: 5, total: 5, xp: 15, learningCounted: true },
        review: [],
      },
    });
    const { calls } = fakeApi({
      'GET /story-games/g-1/story': detail(),
      'GET /story-games/g-1': results,
      'GET /play/stories/g-1/rematch': {
        kind: 'pair',
        offeredByMe: false,
        offeredByOther: true,
        otherDeclined: false,
        nextLobbyId: null,
        canOpenRound: false,
        series: null,
      },
      'POST /play/stories/g-1/rematch': { kind: 'pair', offeredByMe: true, offeredByOther: true, otherDeclined: false, nextLobbyId: 'g-2', canOpenRound: false, series: null },
    });
    game();

    expect(await screen.findByText('Rojda wants a rematch')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/play/stories/g-1/rematch')).toBe(true));
  });
});
