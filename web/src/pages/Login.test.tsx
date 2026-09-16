import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Login } from './Login';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

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

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument());
  });

  it('toggles password visibility', async () => {
    renderLogin();
    const pw = screen.getByLabelText('Password') as HTMLInputElement;
    expect(pw.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(pw.type).toBe('text');
  });
});
