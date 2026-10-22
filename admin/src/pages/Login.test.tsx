// @vitest-environment jsdom
/**
 * Signing in, against a fake API: labelled fields, what is missing said on
 * leaving a field or on "Sign in" (and gone once put right), the server's
 * refusals in plain words, and the pause after too many tries with how long.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { getRefreshToken, getToken, setToken } from '../api';
import { AuthProvider } from '../auth';
import { failure, fakeApi, json, on, type Route } from '../test/fetch';
import { renderUi } from '../test/render';
import { Login } from './Login';

function show(...routes: Route[]): { api: ReturnType<typeof fakeApi>; done: ReturnType<typeof vi.fn> } {
  setToken(null);
  const api = fakeApi(on('GET', '/me', json({ user: { id: 'me', username: 'rojda', roles: ['admin'] } })), ...routes);
  const done = vi.fn();
  renderUi(
    <AuthProvider>
      <Login onDone={done} />
    </AuthProvider>,
  );
  return { api, done };
}

afterEach(() => {
  setToken(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** What the form says (the toasts' live regions share the role, and stay empty here). */
const said = (role: 'alert' | 'status'): Promise<HTMLElement> =>
  waitFor(() => {
    const el = screen.getAllByRole(role).find((e) => e.textContent?.trim());
    if (!el) throw new Error(`nothing said as ${role}`);
    return el;
  });

describe('signing in', () => {
  it('labels its fields where they can be seen, not only in placeholders', () => {
    show();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByText('Email').tagName).toBe('LABEL');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('says what is missing on "Sign in", sends nothing, and clears each problem once it is put right', async () => {
    const { api } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter the email address of your admin account.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(api.calls.some((c) => c.path === '/admin/auth/login')).toBe(false);
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    expect(screen.queryByText('Enter the email address of your admin account.')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password'), 'p');
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();
  });

  it('checks the email when the field is left, not while it is still being typed', async () => {
    show();
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@');
    expect(screen.queryByText(/whole email address/)).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByText('Enter the whole email address, like name@hevalo.app.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(screen.getByLabelText('Email'), 'hevalo.app');
    expect(screen.queryByText(/whole email address/)).not.toBeInTheDocument();
  });

  it('says a wrong password plainly, as an alert', async () => {
    const { done } = show(on('POST', '/admin/auth/login', failure(401, 'INVALID_CREDENTIALS', 'invalid email or password')));
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong{Enter}');
    expect(await said('alert')).toHaveTextContent('That email and password don’t match. Check both and try again.');
    expect(done).not.toHaveBeenCalled();
  });

  it('signs in, with the email as typed less its spaces', async () => {
    const { api, done } = show(on('POST', '/admin/auth/login', json({ tokens: { accessToken: 'tok-9', refreshToken: 'ref-9' } })));
    await userEvent.type(screen.getByLabelText('Email'), ' rojda@hevalo.app ');
    await userEvent.type(screen.getByLabelText('Password'), 'right{Enter}');
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    const login = api.calls.find((c) => c.path === '/admin/auth/login')!;
    // named for the admin's own list of signed-in devices, and remembered unless told otherwise
    expect(login.body).toEqual({ email: 'rojda@hevalo.app', password: 'right', deviceName: expect.stringMatching(/^Admin console/), remember: true });
    expect(login.headers['x-device-id']).toMatch(/^[0-9a-f-]{36}$/);
    // the session is kept to be renewed, not signed in to again in fifteen minutes
    expect(getToken()).toBe('tok-9');
    expect(getRefreshToken()).toBe('ref-9');
  });

  it('keeps a sign-in that is not to be remembered for this tab only, and says so to the server', async () => {
    const { api, done } = show(on('POST', '/admin/auth/login', json({ tokens: { accessToken: 'tok-9', refreshToken: 'ref-9' } })));
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    await userEvent.type(screen.getByLabelText('Password'), 'right');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect((api.calls.find((c) => c.path === '/admin/auth/login')!.body as { remember: boolean }).remember).toBe(false);
    expect(sessionStorage.getItem('kurda_admin_refresh')).toBe('ref-9');
    expect(localStorage.getItem('kurda_admin_refresh')).toBeNull();
  });

  it('says how long signing in is paused after too many tries, and counts it down on the button', async () => {
    show(on('POST', '/admin/auth/login', failure(429, 'LOCKED', 'too many failed attempts — try again later', { retryAfterSec: 900 })));
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong{Enter}');
    const alert = await said('alert');
    expect(alert).toHaveTextContent('signing in is paused for a while to keep the account safe. You can try again in 15 minutes.');
    expect(alert).not.toHaveTextContent('try again later');
    expect(screen.getByRole('button', { name: /Try again in (15:00|14:5\d)/ })).toBeDisabled();
  });

  it('shows the password behind one toggle whose name stays the same', async () => {
    show();
    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(eye);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks for the email before sending a reset link', async () => {
    const { api } = show(on('POST', '/auth/request-password-reset', json({ ok: true })));
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password' }));
    expect(screen.getByText('Enter your email address first, then choose “Forgot password”.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/auth/request-password-reset')).toBe(false);
    await userEvent.type(screen.getByLabelText('Email'), 'rojda@hevalo.app');
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password' }));
    expect(await said('status')).toHaveTextContent('If that account exists, a password-reset link has been sent.');
  });
});
