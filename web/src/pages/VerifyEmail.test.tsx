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

/** The one field the code is typed into; the boxes only draw what it holds. */
const field = (): Promise<HTMLInputElement> => screen.findByLabelText<HTMLInputElement>(/verification code/i);
/** What the boxes show, left to right. */
const boxes = (): string[] => [...document.querySelectorAll('.code-box')].map((b) => b.textContent ?? '');

/** The API as the page meets it: what a code is answered with, and every code that was sent. */
function api(answer: () => Response, account: () => unknown = () => user(false)): { sent: unknown[] } {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/verify-email-code')) {
        sent.push(init?.body ? JSON.parse(init.body as string) : null);
        return answer();
      }
      if (url.includes('/me')) return jsonResponse(200, account());
      return jsonResponse(200, {});
    }),
  );
  return { sent };
}

const wrong = (): Response => jsonResponse(400, { code: 'INVALID_CODE', message: 'that code is not correct' });

describe('VerifyEmail', () => {
  it('draws the code a digit to a box, and sends it as the sixth one lands', async () => {
    signedIn();
    const { sent } = api(() => jsonResponse(200, { verified: true }));
    renderApp(<VerifyEmail />, ['/verify-email']);

    const input = await field();
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    await userEvent.type(input, '123');
    expect(boxes()).toEqual(['1', '2', '3', '', '', '']);
    expect(sent).toEqual([]);

    await userEvent.type(input, '456');
    await waitFor(() => expect(sent).toEqual([{ code: '123456' }]));
    // the boxes turn green and the button says so, for the eye and for the ear
    await waitFor(() => expect(document.querySelector('.code-entry')).toHaveClass('is-joined'));
    expect(screen.getByRole('button', { name: 'Confirmed!' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Confirmed!');
  });

  it('reads the digits an Arabic or a Soranî keyboard types, and a code pasted with its space', async () => {
    signedIn();
    const { sent } = api(wrong);
    renderApp(<VerifyEmail />, ['/verify-email']);

    await userEvent.type(await field(), '٤٨٢۹۱۳');
    await waitFor(() => expect(sent).toEqual([{ code: '482913' }]));
    await screen.findByRole('alert');

    await userEvent.click(await field());
    await userEvent.paste('Your code is 482 913');
    await waitFor(() => expect(sent).toEqual([{ code: '482913' }, { code: '482913' }]));
  });

  it('says so when the button is pressed on a code that is not whole, and sends nothing', async () => {
    signedIn();
    const { sent } = api(wrong);
    renderApp(<VerifyEmail />, ['/verify-email']);

    await userEvent.type(await field(), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the 6-digit code from your email.');
    expect(sent).toEqual([]);
    // the typing goes on where it was
    expect(await field()).toHaveFocus();
    await userEvent.type(await field(), '4');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(boxes()).toEqual(['1', '2', '3', '4', '', '']);
  });

  it('sends a newly confirmed account to its first lesson, not the wall', async () => {
    signedIn();
    let verified = false;
    api(
      () => {
        verified = true;
        return jsonResponse(200, { verified: true });
      },
      () => user(verified),
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

    await userEvent.type(await field(), '123456');

    expect(await screen.findByText('Your first lesson', {}, MOVES_ON)).toBeInTheDocument();
    expect(screen.queryByText('The wall')).not.toBeInTheDocument();
  });

  it('sends a new account made for a friend’s game to that game once confirmed', async () => {
    signedIn();
    rememberAfterSignup('/app/games/peyvok-battle?id=b1');
    let verified = false;
    api(
      () => {
        verified = true;
        return jsonResponse(200, { verified: true });
      },
      () => user(verified),
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

    await userEvent.type(await field(), '123456');

    expect(await screen.findByText('The battle', {}, MOVES_ON)).toBeInTheDocument();
    expect(screen.queryByText('Your first lesson')).not.toBeInTheDocument();
  });

  it('says a wrong code is wrong under the boxes, empties them, and is ready for the next try', async () => {
    signedIn();
    const { sent } = api(wrong);
    renderApp(<VerifyEmail />, ['/verify-email']);

    const input = await field();
    await userEvent.type(input, '000000');

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent(/isn’t correct/i);
    expect(document.querySelector('.code-entry')).toHaveClass('is-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringMatching(/isn’t correct/i));
    // typed again from the first box, without a click: the field kept the focus
    expect(boxes()).toEqual(['', '', '', '', '', '']);
    expect(input).toHaveFocus();

    await userEvent.type(input, '1');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.code-entry')).not.toHaveClass('is-error');
    await userEvent.type(input, '23456');
    await waitFor(() => expect(sent).toEqual([{ code: '000000' }, { code: '123456' }]));
  });

  it('says so over the form when an emailed link no longer works, until the code is typed instead', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/verify-email')) return jsonResponse(400, { code: 'INVALID_TOKEN', message: 'no such link' });
        if (url.includes('/me')) return jsonResponse(200, user(false));
        return jsonResponse(200, {});
      }),
    );

    renderApp(<VerifyEmail />, ['/verify-email?token=gone']);
    expect(await screen.findByRole('alert')).toHaveTextContent('That confirmation link is invalid or has expired — enter the code below instead.');
    // it is said above the boxes it points to
    const said = screen.getByRole('alert');
    expect(said.compareDocumentPosition(await field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.type(await field(), '1');
    expect(screen.queryByRole('alert')).toBeNull();
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
    // asking again waits a minute, and the link says how long is left
    expect(screen.getByRole('button', { name: /send a new code \(\d+s\)/i })).toBeDisabled();
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
    // the address is shown as it was typed, and it is the button that puts it right
    const chip = await screen.findByRole('button', { name: 'ada@exmaple.com. Wrong address? Change it' });
    // how long an unconfirmed sign-up is kept is said on the screen
    expect(screen.getByText(/isn’t confirmed within 7 days is removed/)).toBeInTheDocument();

    await userEvent.click(chip);
    // one thing at a time: the code for the old address is not asked for meanwhile
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    await userEvent.type(screen.getByLabelText('New email address'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send the code there' }));

    await waitFor(() => expect(changed).toEqual([{ email: 'ada@example.com' }]));
    expect(await screen.findByText('We sent a code to your new address.')).toBeInTheDocument();
    // the screen now shows the address the code went to, and the boxes are back, ready
    expect(await screen.findByRole('button', { name: 'ada@example.com. Wrong address? Change it' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New email address')).toBeNull();
    expect(await field()).toHaveFocus();
  });

  it('goes back to the code when changing the address is cancelled', async () => {
    signedIn();
    api(wrong);
    renderApp(<VerifyEmail />, ['/verify-email']);

    await userEvent.click(await screen.findByRole('button', { name: /Change it/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New email address')).toBeNull();
    expect(await field()).toBeInTheDocument();
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
