// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExpectedGains } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { LobbyRated, RatedPill } from './Rated';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));

const LOBBY = 'b0000000-0000-4000-8000-00000000000c';
const gains = (over: Partial<ExpectedGains> = {}): ExpectedGains => ({
  game: 'wordle-battle',
  lobbyId: LOBBY,
  rated: true,
  wouldCount: true,
  friendlyReason: null,
  self: false,
  me: { points: 412, tier: 'gir', division: 2, placing: false },
  opponents: [{ seat: 2, tier: 'gir', division: 1, placing: false, win: 24, lose: -9 }],
  first: null,
  last: null,
  ...over,
});
const seatName = (seat: number) => (seat === 2 ? 'Azad' : `Player ${seat}`);
const rated = { rated: true, counts: null, friendlyReason: null, damped: false };

describe('RatedPill', () => {
  afterEach(cleanup);
  it('says Rated or Friendly in words, not only in colour', () => {
    renderWithProviders(<RatedPill rated />);
    expect(screen.getByLabelText('Rated')).toBeTruthy();
    cleanup();
    renderWithProviders(<RatedPill rated={false} />);
    expect(screen.getByLabelText('Friendly')).toBeTruthy();
  });
});

describe('LobbyRated', () => {
  afterEach(cleanup);

  it('shows the chess.com line per opponent, by name or seat', async () => {
    testAuth.client = fakeClient({ [`GET /ranks/expected/wordle-battle/${LOBBY}`]: ok(gains()) });
    renderWithProviders(<LobbyRated game="wordle-battle" lobbyId={LOBBY} rated={rated} isHost players={2} seatName={seatName} onChanged={() => undefined} />);
    expect(await screen.findByText('Win ≈ +24 · Lose ≈ −9')).toBeTruthy();
    expect(screen.getByText('Azad')).toBeTruthy();
    expect(screen.getByText('Gir I')).toBeTruthy();
  });

  it('says why it would be friendly if it started now, to the viewer when it is theirs', async () => {
    testAuth.client = fakeClient({
      [`GET /ranks/expected/wordle-battle/${LOBBY}`]: ok(gains({ wouldCount: false, friendlyReason: 'unverified', self: true })),
    });
    renderWithProviders(<LobbyRated game="wordle-battle" lobbyId={LOBBY} rated={rated} isHost players={2} seatName={seatName} onChanged={() => undefined} />);
    expect(await screen.findByText('This game is friendly: confirm your email to play rated games.')).toBeTruthy();
  });

  it('gives the host the only switch, and changes it in the lobby', async () => {
    const client = fakeClient({
      [`GET /ranks/expected/wordle-battle/${LOBBY}`]: ok(gains()),
      [`PUT /play/wordle-battle/${LOBBY}/rated`]: ok({ ok: true, rated: false }),
    });
    testAuth.client = client;
    const onChanged = vi.fn();
    renderWithProviders(<LobbyRated game="wordle-battle" lobbyId={LOBBY} rated={rated} isHost players={2} seatName={seatName} onChanged={onChanged} />);
    const toggle = screen.getByRole('switch', { name: 'Rated game' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ rated: false });
  });

  it('tells everyone else the host chooses, and that they may leave without penalty', () => {
    testAuth.client = fakeClient({ [`GET /ranks/expected/wordle-battle/${LOBBY}`]: ok(gains()) });
    renderWithProviders(<LobbyRated game="wordle-battle" lobbyId={LOBBY} rated={rated} isHost={false} players={2} seatName={seatName} onChanged={() => undefined} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('The host chooses. If it changes, you can leave without it counting against you.')).toBeTruthy();
  });

  it('asks for no expected gains in a friendly lobby', () => {
    const client = fakeClient();
    testAuth.client = client;
    renderWithProviders(
      <LobbyRated game="wordle-battle" lobbyId={LOBBY} rated={{ ...rated, rated: false }} isHost players={2} seatName={seatName} onChanged={() => undefined} />,
    );
    expect(screen.getByLabelText('Friendly')).toBeTruthy();
    expect(client.calls.some((c) => c.path.startsWith('/ranks/expected'))).toBe(false);
  });
});
