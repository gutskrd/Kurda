// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import { ChangeUsernameScreen } from './ChangeUsernameScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const ME = ok({ user: { username: 'rojda' } });

async function tryName(refusal: ApiResult<never>, name = 'rojda_amed'): Promise<void> {
  testAuth.client = fakeClient({ 'GET /me': ME, 'PATCH /me': refusal });
  renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
  expect(await screen.findByText('rojda')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('new_username'), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  });
}

describe('changing the username', () => {
  /*
   * Without the current name nothing can be compared and Save never enables:
   * the screen says it did not load and asks again, rather than waiting on "…".
   */
  it('says the current name did not load and asks again, instead of waiting for ever', async () => {
    let me: ApiResult<unknown> = { ok: false, error: { kind: 'network', message: 'Network request failed' } };
    testAuth.client = fakeClient({ 'GET /me': () => me });
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    expect(await screen.findByText('Couldn’t load')).toBeTruthy();
    me = ME;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByText('rojda')).toBeTruthy();
  });

  it('says a taken name in the reader’s words, not the server’s', async () => {
    await tryName({ ok: false, error: { kind: 'client', status: 409, code: 'USERNAME_TAKEN', message: 'username already in use' } });
    expect(screen.getByText('That username is already taken.')).toBeTruthy();
    expect(screen.queryByText('username already in use')).toBeNull();
  });

  it('says when the name can be changed again, rather than “too many attempts”', async () => {
    await tryName({
      ok: false,
      error: {
        kind: 'rate_limited',
        status: 429,
        code: 'USERNAME_CHANGE_COOLDOWN',
        message: 'You can change your username again on 2026-11-20.',
        retryAfterSec: 1_296_000,
        details: { availableAt: '2026-11-20T09:00:00.000Z', cooldownDays: 30 },
      },
    });
    expect(screen.getByText(/^You can change your username again on .*20.*\.$/)).toBeTruthy();
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
  });

  it('says it could not update the name when the server’s answer is nothing a reader should see', async () => {
    await tryName({ ok: false, error: { kind: 'client', status: 400, code: 'BAD_REQUEST', message: 'body/username must be string' } });
    expect(screen.getByText('Couldn’t update your username. Please try again.')).toBeTruthy();
  });
});
