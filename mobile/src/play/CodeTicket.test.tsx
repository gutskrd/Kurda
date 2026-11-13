// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { clipboardStub } from '../reports/testing/stubs';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { CodeTicket, LobbyShare } from './CodeTicket';

vi.mock('react-native', () => import('./testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('./testing/navigation'));

let felt: HapticEvent[] = [];
let stopFeeling: () => void = () => undefined;
beforeEach(() => {
  resetHaptics();
  clipboardStub.text = null;
  felt = [];
  stopFeeling = onHaptic((event) => felt.push(event));
  testAuth.client = fakeClient({ 'GET /play/invites': ok({ incoming: [], outgoing: [] }) });
});
afterEach(() => {
  stopFeeling();
  cleanup();
  vi.restoreAllMocks();
});

describe('CodeTicket', () => {
  it('shows the code in six tiles, split as it is read out, and spells it to a screen reader', () => {
    renderWithProviders(<CodeTicket game="wordle-battle" code="ABC234" />);
    const code = screen.getByRole('button', { name: 'Join code: A B C 2 3 4' });
    expect(['A', 'B', 'C', '2', '3', '4'].map((ch) => screen.getByText(ch).textContent)).toHaveLength(6);
    // the tiles are a picture of what the button says
    expect(code.querySelector('[aria-hidden="true"]')?.textContent).toBe('ABC234');
    expect(screen.getByText('Friends open Games → Join with a code and type it in.')).toBeTruthy();
  });

  it('copies the code, says so in words and with a buzz, then goes back to Copy', async () => {
    renderWithProviders(<CodeTicket game="rhyme-match" code="ABC234" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(clipboardStub.text).toBe('ABC234');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(screen.getByText('Code copied')).toBeTruthy();
    expect(felt).toEqual(['tap']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy(), { timeout: 3000 });
  });

  it('copies it from a tap on the code itself', () => {
    renderWithProviders(<CodeTicket game="stories" code="XYZ789" />);
    fireEvent.click(screen.getByRole('button', { name: 'Join code: X Y Z 7 8 9' }));
    expect(clipboardStub.text).toBe('XYZ789');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('shares the game, where to type the code and the code, with the code’s own link on a line under it', () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    renderWithProviders(<CodeTicket game="wordle-battle" code="ABC234" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const sent = share.mock.calls[0]?.[0] as { message: string; url?: string };
    expect(sent.message).toBe('Play Pêşbaziya Peyvan with me on Hevalo! Open Games → Join with a code and type ABC 234\nOr tap to join: https://hevalo.app/join/peyvok-battle/ABC234');
    // one message for every phone: a link sent beside the words is dropped by some share targets
    expect(sent.url).toBeUndefined();
  });

  it('shares a story game by its story', () => {
    const share = vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    renderWithProviders(<CodeTicket game="stories" code="ABC234" storyTitle="Nanê Germ" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const { message } = share.mock.calls[0]?.[0] as { message: string };
    expect(message).toBe('Play “Nanê Germ” with me on Hevalo! Open Games → Join with a code and type ABC 234\nOr tap to join: https://hevalo.app/join/stories/ABC234');
  });
});

describe('LobbyShare', () => {
  it('is not there once the game has no code: it can no longer be joined', () => {
    renderWithProviders(<LobbyShare game="wordle-battle" lobbyId="b1" code={null} canInvite mode="group" />);
    expect(screen.queryByText('Join code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
  });

  it('puts Invite friends beside the code for the host only, since the server takes invites from no one else', () => {
    renderWithProviders(<LobbyShare game="rhyme-match" lobbyId="m1" code="ABC234" canInvite={false} mode="duo" />);
    expect(screen.getByRole('button', { name: 'Join code: A B C 2 3 4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
    cleanup();
    renderWithProviders(<LobbyShare game="rhyme-match" lobbyId="m1" code="ABC234" canInvite mode="duo" />);
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
  });
});
