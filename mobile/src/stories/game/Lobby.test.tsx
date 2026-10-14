// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert, Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { resetPrefsCache } from '../prefs';
import { gameView, player } from '../testing/views';
import { Lobby, playerName, spelledCode } from './Lobby';

vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));

const ME_HOST = player({ seat: 1, isMe: true, isHost: true, name: 'Rojda' });
const FRIEND = player({ seat: 2, name: 'Azad' });
const STRANGER = player({ seat: 3, name: null });

function lobby(over: Partial<StoryGameView> = {}): StoryGameView {
  return gameView({ status: 'lobby', code: 'ABC234', isHost: true, players: [ME_HOST, FRIEND], activeCount: 2, ...over });
}

function routes() {
  return {
    'GET /play/invites': ok({ incoming: [], outgoing: [] }),
    'GET /story-games/options': ok({ canHostOpen: false }),
  } as Parameters<typeof fakeClient>[0];
}

describe('playerName and spelledCode', () => {
  const t = (k: string, v?: Record<string, string | number>) => (k === 'games.you' ? 'You' : `Player ${v?.seat}`);
  it('names a player as this viewer may see them', () => {
    expect(playerName(ME_HOST, t)).toBe('Rojda (You)');
    expect(playerName(FRIEND, t)).toBe('Azad');
    expect(playerName(STRANGER, t)).toBe('Player 3');
  });
  it('spells a code out for a screen reader', () => {
    expect(spelledCode('ABC234')).toBe('A B C 2 3 4');
  });
});

describe('Lobby', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the code as it is read out, who may use it, and the players by name or seat', async () => {
    testAuth.client = fakeClient(routes());
    renderWithProviders(<Lobby view={lobby({ players: [ME_HOST, FRIEND, STRANGER], activeCount: 3, mode: 'group' })} apply={() => null} onLeft={() => undefined} />);
    await act(async () => undefined);
    expect(screen.getByLabelText('Join code: A B C 2 3 4')).toBeTruthy();
    expect(screen.getByText('Friends can join with this code.')).toBeTruthy();
    expect(screen.getByText('Rojda (You)')).toBeTruthy();
    expect(screen.getByText('Azad')).toBeTruthy();
    expect(screen.getByText('Player 3')).toBeTruthy();
    // the host may take out anyone else, by seat
    expect(screen.getByRole('button', { name: 'Remove Azad' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Rojda (You)' })).toBeNull();
  });

  it('shares a message with both the link and the code', async () => {
    testAuth.client = fakeClient(routes());
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    renderWithProviders(<Lobby view={lobby()} apply={() => null} onLeft={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const message = (share.mock.calls[0]?.[0] as { message: string }).message;
    expect(message).toContain('ABC 234');
    expect(message).toContain('/app/games/stories?id=g1');
  });

  it('lets the host start only with enough players, and says why not', async () => {
    const client = fakeClient({ ...routes(), 'POST /story-games/g1/start': ok(lobby({ status: 'reading' })) });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    const view = renderWithProviders(<Lobby view={lobby({ players: [ME_HOST], activeCount: 1 })} apply={apply} onLeft={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Start the game' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Waiting for at least one more player.')).toBeTruthy();

    view.rerender(<Lobby view={lobby()} apply={apply} onLeft={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/story-games/g1/start')).toBe(true));
    expect(apply).toHaveBeenCalled();
  });

  it('removes a player by seat once the host confirms', async () => {
    const client = fakeClient({ ...routes(), 'POST /story-games/g1/remove': ok(lobby({ players: [ME_HOST] })) });
    testAuth.client = client;
    const alert = vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderWithProviders(<Lobby view={lobby()} apply={() => null} onLeft={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Azad' }));
    expect(alert.mock.calls[0]?.[0]).toBe('Remove Azad?');
    await waitFor(() => expect(client.calls.find((c) => c.path === '/story-games/g1/remove')?.body).toEqual({ seat: 2 }));
  });

  it('tells everyone else they are waiting for the host, and lets them leave', async () => {
    const client = fakeClient({ ...routes(), 'POST /story-games/g1/leave': ok({ ok: true }) });
    testAuth.client = client;
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const onLeft = vi.fn();
    const guest = lobby({ isHost: false, players: [player({ seat: 1, isHost: true, name: 'Azad' }), player({ seat: 2, isMe: true })] });
    renderWithProviders(<Lobby view={guest} apply={() => null} onLeft={onLeft} />);
    expect(screen.getByText('Waiting for the host to start.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start the game' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave game' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
  });

  it('offers a guest the link to share, but not the host-only Invite friends', () => {
    testAuth.client = fakeClient(routes());
    const guest = lobby({
      mode: 'group',
      isHost: false,
      players: [player({ seat: 1, isHost: true, name: 'Azad' }), player({ seat: 2, isMe: true })],
    });
    renderWithProviders(<Lobby view={guest} apply={() => null} onLeft={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
    cleanup();
    renderWithProviders(<Lobby view={lobby({ mode: 'group' })} apply={() => null} onLeft={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
  });

  it('offers the host the stories of this length to change to, but no Surprise me for a game that has its story', async () => {
    const item = (id: string, title: string) => ({
      id,
      slug: id,
      title,
      summary: null,
      dialect: 'kurmanci' as const,
      level: 1 as const,
      length: 'short' as const,
      wordCount: 180,
      readingMinutes: 2,
      fullyNarrated: false,
    });
    testAuth.client = fakeClient({
      ...routes(),
      'GET /stories?dialect=kurmanci': ok({ stories: [item('s1', 'Nanê Germ'), item('s9', 'Bajar')] }),
    });
    renderWithProviders(<Lobby view={lobby()} apply={() => null} onLeft={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change settings' }));
    expect(await screen.findByRole('radio', { name: 'Bajar' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Nanê Germ' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('radio', { name: 'Surprise me' })).toBeNull();
  });

  it('warns before a game played from memory', () => {
    testAuth.client = fakeClient(routes());
    renderWithProviders(<Lobby view={gameView({ status: 'lobby', code: 'ABC234' }, { textDuring: 'hidden' })} apply={() => null} onLeft={() => undefined} />);
    expect(screen.getByText(/From memory: the story will be hidden/)).toBeTruthy();
  });
});
