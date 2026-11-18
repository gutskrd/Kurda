// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, ok, testAuth } from '../../reports/testing/auth';
import { renderWithProviders } from '../../reports/testing/harness';
import { resetPrefsCache } from '../prefs';
import { gameView } from '../testing/views';
import { ExtraTimeSwitch } from './ExtraTimeSwitch';

vi.mock('react-native', () => import('../../play/testing/native'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
});
afterEach(cleanup);

describe('ExtraTimeSwitch', () => {
  it('turns on from a tap on its words, and is one switch to a screen reader', async () => {
    const view = gameView({ status: 'lobby' }, { timerSeconds: 30 });
    const client = fakeClient({ 'POST /story-games/g1/extra-time': ok({ ...view, extraTime: true }) });
    testAuth.client = client;
    const apply = vi.fn(() => null);
    renderWithProviders(<ExtraTimeSwitch view={view} apply={apply} />);
    await act(async () => undefined);
    // The row is the switch, named and described, and the system switch inside is not a second one.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    const row = screen.getByRole('switch', { name: 'Extra time' });
    expect(row.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByText('Twice as long on timed questions. Only you know.'));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(client.calls.find((c) => c.method === 'POST')?.body).toEqual({ on: true });
  });

  it('is not there in a game without a timer', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<ExtraTimeSwitch view={gameView({ status: 'lobby' }, { timerSeconds: 0 })} apply={() => null} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
