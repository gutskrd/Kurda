import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Login } from './Login';
import { renderApp, jsonResponse, MOVES_ON } from '../test/utils';
import { en } from '../i18n/en';
import { deviceId } from '../lib/deviceId';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function renderLogin() {
  return renderApp(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app" element={<div>App home</div>} />
    </Routes>,
    ['/login'],
  );
}

describe('Login', () => {
  it('renders accessible email and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  /**
   * The screen used to print the server's own sentence, which is English
   * whoever is reading it. It now answers INVALID_CREDENTIALS from the
   * catalogue, so the reader gets their own language and the API keeps its
   * message for the log.
   */
  it('answers a rejected sign-in from the catalogue, not with the server\'s English', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'invalid email or password' })),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.code.invalidCredentials']);
    expect(alert).not.toHaveTextContent('invalid email or password');
  });

  it('navigates into the app on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true },
          tokens: { accessToken: 'x', refreshToken: 'y' },
        }),
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'rightpass');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument(), MOVES_ON);
  });

  /**
   * The name is what Settings lists this session under; the id is what the
   * server's sign-in protection keys on, and goes in a header, never the body.
   */
  it('says which browser this is: a name for the devices list, an id for sign-in protection', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    );
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, {
        user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true },
        tokens: { accessToken: 'x', refreshToken: 'y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'rightpass1');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await screen.findByText('App home', {}, MOVES_ON);

    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/login'))!;
    // remembered unless the box is unticked: the server keeps the session a month, not a day
    expect(JSON.parse(String(init!.body))).toEqual({ email: 'a@b.com', password: 'rightpass1', deviceName: 'Chrome on Windows', remember: true });
    expect((init!.headers as Record<string, string>)['x-device-id']).toBe(deviceId());
    expect(url).not.toContain(deviceId());
  });

  it('tells the server a sign-in is not to be remembered, so it keeps the session a day', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, {
        user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true },
        tokens: { accessToken: 'x', refreshToken: 'y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'rightpass1');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await screen.findByText('App home', {}, MOVES_ON);

    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/login'))!;
    expect(JSON.parse(String(init!.body)).remember).toBe(false);
  });

  /**
   * Production has no challenge to show yet, so a sign-in that asks for one
   * says to wait or set a new password, calmly, with the way to do the second.
   */
  it('answers a sign-in that asks for a challenge with a wait, or a new password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, { code: 'CAPTCHA_REQUIRED', message: 'complete the challenge to sign in', details: { captchaRequired: true, reason: 'attempts' } }),
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.code.captchaRequired']);
    expect(alert).not.toHaveClass('msg-error');
    expect(within(alert).getByRole('link', { name: en['auth.reset.title'] })).toHaveAttribute('href', '/forgot-password');
  });

  it('says how long a paused sign-in lasts in words, with the way to a new password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'LOCKED', message: 'too many failed attempts', details: { retryAfterSec: 900 } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '900' },
          }),
      ),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('wait about 15 minutes');
    expect(alert).not.toHaveTextContent('900');
    expect(within(alert).getByRole('link', { name: en['auth.reset.title'] })).toHaveAttribute('href', '/forgot-password');
  });

  it('toggles password visibility', async () => {
    renderLogin();
    const pw = screen.getByLabelText('Password') as HTMLInputElement;
    expect(pw.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw.type).toBe('text');
  });
});
