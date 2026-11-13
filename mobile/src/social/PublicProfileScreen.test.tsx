// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// the fire as its props: how big it burns, whoever draws it
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { PublicProfileScreen } from './PublicProfileScreen';

/*
 * Another learner's profile: their streak's fire as big as their streak has
 * grown it, so a friend a year in shows the Newroz fire.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function visit(streak: number): void {
  testAuth.client = fakeClient({
    'GET /users/u2': ok({ userId: 'u2', username: 'baran', displayName: 'Baran', friendStatus: 'friends', private: false, xp: 9000, streak, achievements: 4 }),
    'GET /users/u2/activity?kind=posts&limit=12': ok({ items: [] }),
  });
  renderWithProviders(<PublicProfileScreen userId="u2" onExit={() => undefined} />);
}

describe('the streak of another learner', () => {
  it('burns as big as their streak: the Newroz fire after a year', async () => {
    visit(400);
    expect(await screen.findByText('400')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('newroz');
  });

  it('is a campfire after nine days, and cold logs with none', async () => {
    visit(9);
    expect(await screen.findByText('9')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('campfire');
    cleanup();
    visit(0);
    expect(await screen.findByText('@baran')).toBeTruthy();
    expect(screen.getByTestId('fire').dataset.stage).toBe('cold');
  });
});

/**
 * A profile is somebody, before it is their numbers: the name they chose,
 * their handle, where they are from and what they say about themselves, and
 * what you can do — and only then the streak and the XP.
 */
describe('who somebody is', () => {
  const show = (extra: Record<string, unknown>): void => {
    testAuth.client = fakeClient({
      'GET /users/u2': ok({ userId: 'u2', username: 'baran', displayName: 'Baran Şêx', friendStatus: 'friends', private: false, xp: 410, streak: 3, achievements: 5, ...extra }),
      'GET /users/u2/activity?kind=posts&limit=12': ok({ items: [] }),
    });
    renderWithProviders(<PublicProfileScreen userId="u2" onExit={() => undefined} />);
  };

  it('leads with the name they chose, with the handle under it, their country and their own words', async () => {
    show({ bio: 'Ez ji çîrokan hez dikim.', country: 'NL' });
    const name = await screen.findByRole('heading', { name: 'Baran Şêx' });
    const handle = screen.getByText('@baran');
    // the chosen name first, the handle after it
    expect(name.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Netherlands')).toBeTruthy();
    expect(screen.getByText('Ez ji çîrokan hez dikim.')).toBeTruthy();
  });

  it('puts what you can do above the numbers, and falls back to the handle where no name was chosen', async () => {
    show({ displayName: null });
    expect(await screen.findByRole('heading', { name: 'baran' })).toBeTruthy();
    const message = screen.getByRole('button', { name: 'Message' });
    const xp = screen.getByText('410');
    expect(message.compareDocumentPosition(xp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // nothing is said about a bio that is not there
    expect(screen.queryByText(/bio/i)).toBeNull();
  });

  it('shows neither their words nor where they are from on a profile that is private', async () => {
    show({ private: true, friendStatus: 'none', bio: 'Ez ji çîrokan hez dikim.', country: 'NL' });
    expect(await screen.findByRole('heading', { name: 'Baran Şêx' })).toBeTruthy();
    expect(screen.queryByText('Ez ji çîrokan hez dikim.')).toBeNull();
    expect(screen.queryByText('Netherlands')).toBeNull();
  });
});

describe('asking to be friends', () => {
  it('hands the request over from the button, which then says Requested, and takes it back through the same routes', async () => {
    resetHaptics();
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    // a confirmation answered yes, as a person tapping its destructive choice would
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    let status = 'none';
    const client = fakeClient({
      'GET /users/u2': () => ok({ userId: 'u2', username: 'baran', displayName: 'Baran', friendStatus: status, private: false, xp: 10, streak: 0, achievements: 0 }),
      'GET /users/u2/activity?kind=posts&limit=12': ok({ items: [] }),
      'POST /friends/requests': () => {
        status = 'pending_out';
        return ok({ ok: true });
      },
      'DELETE /friends/requests/u2': () => {
        status = 'none';
        return ok({ ok: true });
      },
    });
    testAuth.client = client;
    renderWithProviders(<PublicProfileScreen userId="u2" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add friend' }));
    expect(await screen.findByRole('button', { name: 'Requested' })).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/friends/requests')?.body).toEqual({ userId: 'u2' });
    expect(felt).toEqual(['tap']);
    // said aloud as it goes
    expect(await screen.findByText('Request sent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Requested' }));
    expect(await screen.findByRole('button', { name: 'Add friend' })).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/friends/requests/u2')).toBe(true));
    stop();
  });
});
