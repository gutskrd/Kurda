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
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { TagsScreen } from './TagsScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COFFEE = { key: 'coffee', label: 'Coffee lover', category: 'interest', value: null, sensitive: false, displayed: true };

describe('showing a tag on your profile', () => {
  it('moves the switch at once, ends quick taps on the last one, and puts a refused one back with the reason', async () => {
    const said = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const answers: ((r: unknown) => void)[] = [];
    const client = fakeClient({
      'GET /me/tags': ok({ main: null, claimable: [] }),
      'GET /me/tags/claimed': ok({ tags: [COFFEE] }),
      'GET /tags': ok({ tags: [] }),
      'POST /me/tags/display': () => new Promise((resolve) => answers.push(resolve)),
    } as never);
    testAuth.client = client;
    renderWithProviders(<TagsScreen onExit={() => undefined} />);
    const toggle = () => screen.getByRole('switch', { name: 'Show Coffee lover on profile' });
    await screen.findByRole('switch', { name: 'Show Coffee lover on profile' });
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    const sent = () => client.calls.filter((c) => c.method === 'POST').map((c) => c.body);
    expect(sent()).toEqual([{ key: 'coffee', displayed: false }]);
    await act(async () => answers[0]!({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(said).toHaveBeenCalledWith('Can’t reach Hevalo right now. Check your connection and try again.');
  });
});
