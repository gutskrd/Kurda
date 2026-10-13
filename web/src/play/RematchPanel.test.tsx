import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RematchState } from '@kurda/shared';
import { fakeApi, type Call } from '../stories/testing';
import { RematchPanel } from './RematchPanel';
import { renderPlay, signedInAndListening, where } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const pair = (over: Partial<RematchState> = {}): RematchState => ({
  kind: 'pair',
  offeredByMe: false,
  offeredByOther: false,
  otherDeclined: false,
  nextLobbyId: null,
  canOpenRound: false,
  series: null,
  ...over,
});
const round = (over: Partial<RematchState> = {}): RematchState => pair({ kind: 'round', ...over });

const PATH = '/play/rhyme-match/r1/rematch';
const panel = (isHost = false) => <RematchPanel game="rhyme-match" lobbyId="r1" otherName="Rojda" isHost={isHost} />;

describe('RematchPanel — two players', () => {
  it('asks for a rematch, then waits for the other, and can take it back', async () => {
    let state = pair();
    const { calls } = fakeApi({
      [`GET ${PATH}`]: () => state,
      [`POST ${PATH}`]: () => (state = pair({ offeredByMe: true })),
      [`DELETE ${PATH}`]: () => (state = pair()),
    });
    renderPlay(panel());

    await userEvent.click(await screen.findByRole('button', { name: 'Rematch' }));
    expect(await screen.findByText('Rematch asked — waiting for Rojda.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(calls.some((c: Call) => c.method === 'DELETE' && c.path === PATH)).toBe(true));
    expect(await screen.findByRole('button', { name: 'Rematch' })).toBeInTheDocument();
  });

  it('shows the other’s offer with Accept and No thanks', async () => {
    let state = pair({ offeredByOther: true });
    const { calls } = fakeApi({
      [`GET ${PATH}`]: () => state,
      [`DELETE ${PATH}`]: () => (state = pair({ otherDeclined: false })),
    });
    renderPlay(panel());

    expect(await screen.findByText('Rojda wants a rematch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    await waitFor(() => expect(calls.some((c: Call) => c.method === 'DELETE' && c.path === PATH)).toBe(true));
  });

  it('goes to the new game as soon as both asked — on the event that says so', async () => {
    let state = pair({ offeredByMe: true });
    const { calls } = fakeApi({ [`GET ${PATH}`]: () => state, 'GET /play/invites': { incoming: [], outgoing: [] } });
    const { realtime } = renderPlay(panel());
    await screen.findByText('Rematch asked — waiting for Rojda.');
    await signedInAndListening(calls);

    state = pair({ offeredByMe: true, offeredByOther: true, nextLobbyId: 'r2' });
    realtime.emit({ type: 'rematch_update', game: 'rhyme-match', lobbyId: 'r1' });
    await waitFor(() => expect(where()).toBe('/app/games/rhyme-match?id=r2'));
  });

  it('says plainly when the other is not up for it, and offers someone else', async () => {
    fakeApi({ [`GET ${PATH}`]: pair({ otherDeclined: true }) });
    renderPlay(panel());
    expect(await screen.findByText('No rematch with Rojda this time.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invite someone else' }));
    expect(await screen.findByRole('dialog', { name: 'Invite to play' })).toBeInTheDocument();
  });

  it('keeps the running score once there has been a rematch', async () => {
    fakeApi({ [`GET ${PATH}`]: pair({ series: { me: 2, other: 1, draws: 0 } }) });
    renderPlay(panel());
    expect(await screen.findByText('So far: you 2, Rojda 1')).toBeInTheDocument();
  });

  it('takes a standing offer back when the results are left', async () => {
    const { calls } = fakeApi({ [`GET ${PATH}`]: pair({ offeredByMe: true }) });
    const { unmount } = renderPlay(panel());
    await screen.findByText('Rematch asked — waiting for Rojda.');
    unmount();
    await waitFor(() => expect(calls.some((c: Call) => c.method === 'DELETE' && c.path === PATH)).toBe(true));
  });
});

describe('RematchPanel — more players', () => {
  it('lets the host open the next round, and takes them to it', async () => {
    const { calls } = fakeApi({
      [`GET ${PATH}`]: round({ canOpenRound: true }),
      [`POST ${PATH}`]: round({ canOpenRound: true, nextLobbyId: 'r3' }),
    });
    renderPlay(panel(true));
    await userEvent.click(await screen.findByRole('button', { name: 'Play again' }));
    await waitFor(() => expect(where()).toBe('/app/games/rhyme-match?id=r3'));
    // leaving a group's results takes nothing back: there is no offer to withdraw
    expect(calls.some((c: Call) => c.method === 'DELETE')).toBe(false);
  });

  it('tells everyone else the host can open it, then gives them a one-tap Join', async () => {
    let state = round();
    const { calls } = fakeApi({
      [`GET ${PATH}`]: () => state,
      'POST /rhyme/matches/r3/join': { id: 'r3' },
      'GET /play/invites': { incoming: [], outgoing: [] },
    });
    const { realtime } = renderPlay(panel());
    expect(await screen.findByText('The host can open the next round.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
    await signedInAndListening(calls);

    state = round({ nextLobbyId: 'r3' });
    realtime.emit({ type: 'play_changed', game: 'rhyme-match', lobbyId: 'r1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Join next round' }));
    await waitFor(() => expect(where()).toBe('/app/games/rhyme-match?id=r3'));
    expect(calls.some((c: Call) => c.method === 'POST' && c.path === '/rhyme/matches/r3/join')).toBe(true);
  });

  it('joins a story game’s next round through the story join, by its id', async () => {
    const { calls } = fakeApi({
      'GET /play/stories/s1/rematch': round({ nextLobbyId: 's2' }),
      'POST /story-games/join': { id: 's2' },
    });
    renderPlay(<RematchPanel game="stories" lobbyId="s1" otherName="Rojda" isHost={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Join next round' }));
    await waitFor(() => expect(where()).toBe('/app/games/stories/play/s2'));
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: 's2' });
  });
});
