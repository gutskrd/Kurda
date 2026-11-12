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
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ApiResult } from '../api/types';
import { ChangeUsernameScreen } from './ChangeUsernameScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const STATUS = { username: 'rojda', needsPassword: true, canChange: true, availableAt: null, cooldownDays: 30, holdDays: 60, held: [] };
const NAME = 'rojda_amed';
const FREE = `GET /me/username/available?username=${NAME}`;

type Routes = Parameters<typeof fakeClient>[0];

/** Opens the screen, types a new name and the password, and presses Save. */
async function tryName(routes: Routes, options: { password?: string | null } = {}): Promise<ReturnType<typeof fakeClient>> {
  const client = fakeClient({ 'GET /me/username': ok(STATUS), [FREE]: ok({ available: true, username: NAME }), ...routes });
  testAuth.client = client;
  renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
  expect(await screen.findByText('rojda')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('new_username'), { target: { value: NAME } });
  const password = options.password === undefined ? 'a-strong-password1' : options.password;
  if (password !== null) fireEvent.change(screen.getByTestId('username-password'), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  });
  return client;
}

const refusal = (error: Record<string, unknown>): ApiResult<never> => ({ ok: false, error: { kind: 'client', status: 400, message: 'refused', ...error } }) as ApiResult<never>;

describe('changing the username', () => {
  /*
   * Without the current name nothing can be compared and Save never enables:
   * the screen says it did not load and asks again, rather than waiting on "…".
   */
  it('says the current name did not load and asks again, instead of waiting for ever', async () => {
    let status: ApiResult<unknown> = { ok: false, error: { kind: 'network', message: 'Network request failed' } };
    testAuth.client = fakeClient({ 'GET /me/username': () => status });
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    expect(await screen.findByText('Couldn’t load')).toBeTruthy();
    status = ok(STATUS);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByText('rojda')).toBeTruthy();
  });

  it('says how long the old name is kept for its owner before anything is typed', async () => {
    testAuth.client = fakeClient({ 'GET /me/username': ok({ ...STATUS, held: [{ username: 'rojda_old', heldUntil: '2027-02-09T12:00:00.000Z' }] }) });
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your old username is kept for you for 60 days, so nobody else can take it.')).toBeTruthy();
    expect(screen.getByText(/^@rojda_old is kept for you until .*2027\.$/)).toBeTruthy();
  });

  it('sends the new name with the password to the route that asks for it, and reads the account again', async () => {
    const client = await tryName({ 'POST /me/username': ok({ user: { username: NAME }, changed: true, status: { ...STATUS, username: NAME } }) });
    const sent = client.calls.filter((c) => c.method === 'POST');
    expect(sent).toEqual([{ method: 'POST', path: '/me/username', body: { username: NAME, currentPassword: 'a-strong-password1' } }]);
    // never through the profile update, which no longer takes a username
    expect(client.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeTruthy();
    expect(testAuth.refreshUser).toHaveBeenCalled();
  });

  it('says a name is free once the typing stops', async () => {
    testAuth.client = fakeClient({ 'GET /me/username': ok(STATUS), [FREE]: ok({ available: true, username: NAME }) });
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    await screen.findByText('rojda');
    fireEvent.change(screen.getByPlaceholderText('new_username'), { target: { value: NAME } });
    expect(await screen.findByText('This username is free.', undefined, { timeout: 2000 })).toBeTruthy();
  });

  it('says a name somebody has, and will not send it', async () => {
    const client = fakeClient({ 'GET /me/username': ok(STATUS), [FREE]: ok({ available: false, reason: 'taken' }) });
    testAuth.client = client;
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    await screen.findByText('rojda');
    fireEvent.change(screen.getByPlaceholderText('new_username'), { target: { value: NAME } });
    fireEvent.change(screen.getByTestId('username-password'), { target: { value: 'a-strong-password1' } });
    expect(await screen.findByText('That username is already taken.', undefined, { timeout: 2000 })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
    });
    expect(client.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('will not send a name without the password an account has', async () => {
    const client = await tryName({}, { password: null });
    expect(client.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('asks no password of an account that has none', async () => {
    const client = await tryName(
      { 'GET /me/username': ok({ ...STATUS, needsPassword: false }), 'POST /me/username': ok({ user: { username: NAME }, changed: true, status: { ...STATUS, username: NAME, needsPassword: false } }) },
      { password: null },
    );
    expect(screen.queryByTestId('username-password')).toBeNull();
    expect(client.calls.filter((c) => c.method === 'POST')[0]?.body).toEqual({ username: NAME });
  });

  it('says a wrong password under the password field', async () => {
    await tryName({ 'POST /me/username': refusal({ code: 'WRONG_PASSWORD', message: 'wrong password' }) });
    await waitFor(() => expect(screen.getByText('Your current password isn’t right.')).toBeTruthy());
    expect(screen.queryByText('wrong password')).toBeNull();
  });

  it('says a taken name in the reader’s words, not the server’s', async () => {
    await tryName({ 'POST /me/username': refusal({ status: 409, code: 'USERNAME_TAKEN', message: 'username already in use' }) });
    expect(screen.getByText('That username is already taken.')).toBeTruthy();
    expect(screen.queryByText('username already in use')).toBeNull();
  });

  it('says when the name can be changed again, rather than “too many attempts”', async () => {
    await tryName({
      'POST /me/username': {
        ok: false,
        error: {
          kind: 'rate_limited',
          status: 429,
          code: 'USERNAME_CHANGE_COOLDOWN',
          message: 'You can change your username again on 2026-11-20.',
          retryAfterSec: 1_296_000,
          details: { availableAt: '2026-11-20T09:00:00.000Z', cooldownDays: 30 },
        },
      },
    });
    expect(screen.getByText(/^You can change your username again on .*20.*\.$/)).toBeTruthy();
    expect(screen.queryByText(/Too many attempts/)).toBeNull();
  });

  it('shows the day the wait ends and nothing to type while a change is not yet allowed', async () => {
    testAuth.client = fakeClient({ 'GET /me/username': ok({ ...STATUS, canChange: false, availableAt: '2027-01-10T12:00:00.000Z' }) });
    renderWithProviders(<ChangeUsernameScreen onExit={() => undefined} />);
    expect(await screen.findByText(/^You can change your username again on .*2027\.$/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('new_username')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save username' })).toBeNull();
  });

  it('says it could not update the name when the server’s answer is nothing a reader should see', async () => {
    await tryName({ 'POST /me/username': refusal({ code: 'BAD_REQUEST', message: 'body/username must be string' }) });
    expect(screen.getByText('Couldn’t update your username. Please try again.')).toBeTruthy();
  });
});
