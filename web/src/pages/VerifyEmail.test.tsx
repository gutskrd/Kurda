import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { VerifyEmail } from './VerifyEmail';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const user = (emailVerified: boolean) => ({
  user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified },
});

function signedIn(): void {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
}

describe('email verification gate', () => {
  it('holds an unverified account at the verify screen instead of the app', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/me') ? jsonResponse(200, user(false)) : jsonResponse(200, {}))),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app']}>
          <ProfileModalProvider>
            <Routes>
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <div>Secret app content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/verify-email" element={<div>Confirm your email</div>} />
            </Routes>
          </ProfileModalProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Confirm your email')).toBeInTheDocument();
    expect(screen.queryByText('Secret app content')).not.toBeInTheDocument();
  });

  it('lets a verified account through', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/me') ? jsonResponse(200, user(true)) : jsonResponse(200, {}))),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app']}>
          <ProfileModalProvider>
            <Routes>
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <div>Secret app content</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/verify-email" element={<div>Confirm your email</div>} />
            </Routes>
          </ProfileModalProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText('Secret app content')).toBeInTheDocument();
  });
});

describe('VerifyEmail', () => {
  it('submits the 6-digit code to the API', async () => {
    signedIn();
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth/verify-email-code')) {
          calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
          return jsonResponse(200, { verified: true });
        }
        if (url.includes('/me')) return jsonResponse(200, user(false));
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email']);

    await userEvent.type(await screen.findByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm email/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ code: '123456' });
  });

  it('surfaces a wrong code and keeps the user on the screen', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/verify-email-code'))
          return jsonResponse(400, { code: 'INVALID_CODE', message: 'that code is not correct' });
        if (url.includes('/me')) return jsonResponse(200, user(false));
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email']);
    await userEvent.type(await screen.findByLabelText(/verification code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /confirm email/i }));

    expect(await screen.findByText(/isn’t correct/i)).toBeInTheDocument();
  });

  it('can send a new code', async () => {
    signedIn();
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/resend-verification-code')) {
          sent.push(url);
          return jsonResponse(200, { sent: true });
        }
        if (url.includes('/me')) return jsonResponse(200, user(false));
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email']);
    await userEvent.click(await screen.findByRole('button', { name: /send a new code/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(await screen.findByText(/sent a new code/i)).toBeInTheDocument();
  });
});
