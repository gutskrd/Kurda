import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { VerifyEmail } from './VerifyEmail';
import { rememberAfterSignup } from '../auth/afterSignup';
import { renderApp, jsonResponse, MOVES_ON } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const user = (emailVerified: boolean) => ({
  user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified },
});

function signedIn(): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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

  it('sends a newly confirmed account to its first lesson, not the wall', async () => {
    signedIn();
    let verified = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/verify-email-code')) {
          verified = true;
          return jsonResponse(200, { verified: true });
        }
        if (url.includes('/me')) return jsonResponse(200, user(verified));
        return jsonResponse(200, {});
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email']}>
          <ProfileModalProvider>
            <Routes>
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/app/learn/next" element={<div>Your first lesson</div>} />
              <Route path="/app" element={<div>The wall</div>} />
            </Routes>
          </ProfileModalProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm email/i }));

    expect(await screen.findByText('Your first lesson', {}, MOVES_ON)).toBeInTheDocument();
    expect(screen.queryByText('The wall')).not.toBeInTheDocument();
  });

  it('sends a new account made for a friend’s game to that game once confirmed', async () => {
    signedIn();
    rememberAfterSignup('/app/games/peyvok-battle?id=b1');
    let verified = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/verify-email-code')) {
          verified = true;
          return jsonResponse(200, { verified: true });
        }
        if (url.includes('/me')) return jsonResponse(200, user(verified));
        return jsonResponse(200, {});
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email']}>
          <ProfileModalProvider>
            <Routes>
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/app/learn/next" element={<div>Your first lesson</div>} />
              <Route path="/app/games/peyvok-battle" element={<div>The battle</div>} />
            </Routes>
          </ProfileModalProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    await userEvent.type(await screen.findByLabelText(/verification code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm email/i }));

    expect(await screen.findByText('The battle', {}, MOVES_ON)).toBeInTheDocument();
    expect(screen.queryByText('Your first lesson')).not.toBeInTheDocument();
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

  it('puts a mistyped address right without starting over, and says where the code went', async () => {
    signedIn();
    let address = 'ada@exmaple.com';
    const changed: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/auth/change-pending-email')) {
          const body = JSON.parse(String(init?.body)) as { email: string };
          changed.push(body);
          address = body.email;
          return jsonResponse(200, { user: { email: address }, sent: true });
        }
        if (url.includes('/me')) return jsonResponse(200, { user: { ...user(false).user, email: address } });
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email']);
    expect(await screen.findByText(/ada@exmaple\.com/)).toBeInTheDocument();
    // how long an unconfirmed sign-up is kept is said on the screen
    expect(screen.getByText(/isn’t confirmed within 7 days is removed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Change it' }));
    await userEvent.type(screen.getByLabelText('New email address'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send the code there' }));

    await waitFor(() => expect(changed).toEqual([{ email: 'ada@example.com' }]));
    expect(await screen.findByText('We sent a code to your new address.')).toBeInTheDocument();
    // the screen now shows the address the code went to, and the field is put away
    expect(await screen.findByText(/ada@example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New email address')).toBeNull();
  });

  it('says so when no more confirmation emails can be sent today', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/resend-verification-code')) {
          return jsonResponse(429, { code: 'VERIFICATION_EMAIL_LIMIT', message: 'too many confirmation emails today' });
        }
        if (url.includes('/me')) return jsonResponse(200, user(false));
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email']);
    await userEvent.click(await screen.findByRole('button', { name: /send a new code/i }));
    expect(await screen.findByText(/Too many emails for today\. The last code still works/)).toBeInTheDocument();
  });
});
