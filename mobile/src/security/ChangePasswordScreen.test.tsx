// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiClient } from '../api/client';
import { MemoryTokenStorage } from '../api/types';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { testAuth } from '../reports/testing/auth';
import { ChangePasswordScreen } from './ChangePasswordScreen';

patchReactNativeWeb();
afterEach(() => cleanup());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * The real client over a stored session, answering POST /me/password with
 * `answer` — so what reaches the keystore is what the app would store.
 */
async function serve(answer: (body: { currentPassword: string; newPassword: string }) => Response | Promise<Response>) {
  const storage = new MemoryTokenStorage();
  await storage.set({ accessToken: 'acc-old', refreshToken: 'ref-1' });
  const fetchFn = vi.fn(async (_url: string, init: RequestInit) => answer(JSON.parse(String(init.body))));
  testAuth.client = new ApiClient({ baseUrl: 'http://api.test', storage, onLogout: vi.fn(), fetchFn });
  return { storage, fetchFn };
}

function open() {
  const onSetPassword = vi.fn();
  const onExit = vi.fn();
  renderWithProviders(<ChangePasswordScreen onExit={onExit} onSetPassword={onSetPassword} />);
  return { onSetPassword, onExit };
}

/** The labelled field a text box belongs to: its label, the box and what is said under it. */
const fieldOf = (testID: string) => screen.getByTestId(testID).parentElement!.parentElement!;

async function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByTestId('current-password'), { target: { value: current } });
  fireEvent.change(screen.getByTestId('new-password'), { target: { value: next } });
  fireEvent.change(screen.getByTestId('confirm-password'), { target: { value: confirm } });
  // react-native-web wires a press in an effect after the draw: let it run first
  await act(async () => undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('changing the password', () => {
  it('asks for the passwords the way the keychain and the keyboard understand', () => {
    open();
    const current = screen.getByTestId('current-password');
    const next = screen.getByTestId('new-password');
    const confirm = screen.getByTestId('confirm-password');
    expect(current.getAttribute('autocomplete')).toBe('current-password');
    expect(next.getAttribute('autocomplete')).toBe('new-password');
    expect(confirm.getAttribute('autocomplete')).toBe('new-password');
    for (const field of [current, next, confirm]) expect(field.getAttribute('type')).toBe('password');
    expect(current.getAttribute('enterkeyhint')).toBe('next');
    expect(next.getAttribute('enterkeyhint')).toBe('next');
    expect(confirm.getAttribute('enterkeyhint')).toBe('done');
    // each one can be shown, to check what was typed
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(3);
  });

  it('moves to the next field on Next', async () => {
    open();
    await act(async () => undefined);
    fireEvent.keyDown(screen.getByTestId('current-password'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByTestId('new-password'));
    fireEvent.keyDown(screen.getByTestId('new-password'), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByTestId('confirm-password'));
  });

  it('says on the field when the two new passwords differ, before asking the server', async () => {
    const { fetchFn } = await serve(() => json(200, {}));
    open();
    await fill('old-pass-1', 'berbang2026', 'berbang2027');
    expect(within(fieldOf('confirm-password')).getByText('Those passwords don’t match.')).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  /*
   * The server ends every other session and the old access token with them;
   * the fresh one it hands back takes its place, and the refresh token stays.
   */
  it('keeps this phone signed in with the new access token, and says the others were signed out', async () => {
    const { storage, fetchFn } = await serve(() => json(200, { changed: true, accessToken: 'acc-new', accessExpiresInSeconds: 900 }));
    const { onExit } = open();
    await fill('old-pass-1', 'berbang2026');
    const done = await screen.findByTestId('password-changed');
    expect(done.textContent).toBe('Password changed. You’ve been signed out everywhere else.');
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body))).toEqual({ currentPassword: 'old-pass-1', newPassword: 'berbang2026' });
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api.test/me/password');
    expect(await storage.get()).toEqual({ accessToken: 'acc-new', refreshToken: 'ref-1' });
    // nothing typed is left on screen
    expect(screen.queryByTestId('current-password')).toBeNull();
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('leaves the stored tokens as they are when no new one comes back', async () => {
    const { storage } = await serve(() => json(200, { changed: true, accessToken: null, accessExpiresInSeconds: 900 }));
    open();
    await fill('old-pass-1', 'berbang2026');
    await screen.findByTestId('password-changed');
    expect(await storage.get()).toEqual({ accessToken: 'acc-old', refreshToken: 'ref-1' });
  });

  it('says on the current field when that password is not right', async () => {
    const { storage } = await serve(() => json(400, { code: 'WRONG_PASSWORD', message: 'the current password is not correct' }));
    open();
    await fill('not-it-1', 'berbang2026');
    expect(await within(fieldOf('current-password')).findByText('Your current password isn’t right.')).toBeTruthy();
    expect(within(fieldOf('new-password')).queryByText('Your current password isn’t right.')).toBeNull();
    expect(await storage.get()).toEqual({ accessToken: 'acc-old', refreshToken: 'ref-1' });
  });

  it('says on the new field which rule it broke, or that it has been in a data leak', async () => {
    let answer = json(400, { code: 'WEAK_PASSWORD', message: 'password must be at least 10 characters', details: { reason: 'too-short' } });
    await serve(() => answer);
    open();
    await fill('old-pass-1', 'berbang2026');
    expect(await within(fieldOf('new-password')).findByText('Password must be at least 8 characters')).toBeTruthy();

    answer = json(400, { code: 'PASSWORD_BREACHED', message: 'this password has appeared in a data breach', details: { reason: 'breached' } });
    // the button was busy a moment ago: let it hear presses again before pressing
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await within(fieldOf('new-password')).findByText('This password has shown up in a data leak, so it isn’t safe. Choose a different one.'),
    ).toBeTruthy();
  });

  /* Google and Apple accounts have no password to change: the reset link is how they get one. */
  it('offers to set a password for an account that has none, through the reset link', async () => {
    await serve(() => json(400, { code: 'NO_PASSWORD', message: 'this account has no password yet' }));
    const { onSetPassword } = open();
    await fill('anything-1', 'berbang2026');
    const none = await screen.findByTestId('password-none');
    expect(none.textContent).toContain('Your account doesn’t have a password yet.');
    expect(none.textContent).toContain('You sign in with Google or Apple.');
    await act(async () => undefined);
    fireEvent.click(within(none).getByRole('button', { name: 'Set a password' }));
    expect(onSetPassword).toHaveBeenCalledWith('r@example.com');
  });

  it('says anything else above the form, and keeps what was typed', async () => {
    await serve(() => Promise.reject(new Error('offline')));
    open();
    await fill('old-pass-1', 'berbang2026');
    await waitFor(() => expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy());
    expect((screen.getByTestId('current-password') as HTMLInputElement).value).toBe('old-pass-1');
  });
});
