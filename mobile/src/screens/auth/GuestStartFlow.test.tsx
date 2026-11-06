// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('@react-navigation/native', () => import('../../auth/guide/testing/navigation'));
const auth = vi.hoisted(() => ({ continueAsGuest: vi.fn(), client: { put: vi.fn() } }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { TRANSLATIONS } from '../../i18n/translations';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { GuestStartFlow } from './GuestStartFlow';

/*
 * Trying Hevalo first: he says who he is and what a guest can do, asks how
 * much to learn each day, and Start learning makes the session and sets the
 * goal on it; a refusal is said under the picker.
 */

patchReactNativeWeb({ reduceMotion: true });
const en = TRANSLATIONS.en;

afterEach(() => {
  cleanup();
  auth.continueAsGuest.mockReset();
  auth.client.put.mockReset();
});

async function turned(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-testid^="slide-out"]')).toBeNull());
}

async function press(name: string): Promise<void> {
  await turned();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('starting as a guest', () => {
  it('introduces Hevalo and what a guest can do, asks the daily goal, and starts the session with it', async () => {
    auth.continueAsGuest.mockResolvedValue(null);
    auth.client.put.mockResolvedValue({ ok: true, data: {} });
    renderWithProviders(<GuestStartFlow onExit={() => undefined} />);
    expect(screen.getByText(en['guide.guest.hello.question'])).toBeTruthy();
    expect(screen.getByTestId('speech-bubble').textContent).toBe(en['guide.guest.hello.says']);
    for (const line of ['guide.guest.can.lessons', 'guide.guest.can.games', 'guide.guest.can.dictionary', 'guide.guest.can.later'] as const) {
      expect(screen.getByText(en[line])).toBeTruthy();
    }
    await press(en['common.continue']);
    expect(await screen.findByText(en['guide.guest.goal.question'])).toBeTruthy();
    await turned();
    fireEvent.click(screen.getByRole('button', { name: '30' }));
    await press(en['guide.guest.start']);
    await waitFor(() => expect(auth.continueAsGuest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(auth.client.put).toHaveBeenCalledWith('/me/daily-goal', { goal: 30 }));
  });

  it('leaves the goal alone when the one everyone starts with is kept', async () => {
    auth.continueAsGuest.mockResolvedValue(null);
    renderWithProviders(<GuestStartFlow onExit={() => undefined} />);
    await press(en['common.continue']);
    await screen.findByText(en['guide.guest.goal.question']);
    await press(en['guide.guest.start']);
    await waitFor(() => expect(auth.continueAsGuest).toHaveBeenCalledTimes(1));
    expect(auth.client.put).not.toHaveBeenCalled();
  });

  it('says a refusal under the picker and stays', async () => {
    auth.continueAsGuest.mockResolvedValue({ message: 'Too many accounts from this network.', code: 'SIGNUP_BLOCKED' });
    renderWithProviders(<GuestStartFlow onExit={() => undefined} />);
    await press(en['common.continue']);
    await screen.findByText(en['guide.guest.goal.question']);
    await press(en['guide.guest.start']);
    expect((await screen.findByTestId('step-error')).textContent).toBe('Too many accounts from this network.');
    expect(screen.getByText(en['guide.guest.goal.question'])).toBeTruthy();
  });

  it('goes back out to the sign-in choice from the first step', async () => {
    const onExit = vi.fn();
    renderWithProviders(<GuestStartFlow onExit={onExit} />);
    await press(en['common.back']);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
