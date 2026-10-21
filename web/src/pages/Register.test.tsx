import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Register } from './Register';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function renderRegister() {
  return renderApp(
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<div>App home</div>} />
    </Routes>,
    ['/register'],
  );
}

async function fillAccount(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
  await userEvent.type(screen.getByLabelText('Username'), 'ada');
  await userEvent.type(screen.getByLabelText('Password'), 'a-strong-password1');
}

async function chooseBirth(month: string, year: string): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText(en['age.month']), month);
  await userEvent.selectOptions(screen.getByLabelText(en['age.year']), year);
}

/** The JSON body of the first request to `path`, or undefined. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, path: string): Record<string, unknown> | undefined {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes(path));
  if (!call) return undefined;
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe('Register', () => {
  /**
   * Nothing on the form may hint at which answer gets an account, or gets more:
   * no default to accept, and the years that are too young are listed like
   * every other.
   */
  it('asks for the birth month and year with nothing chosen and every year offered', () => {
    renderRegister();
    const month = screen.getByLabelText(en['age.month']) as HTMLSelectElement;
    const year = screen.getByLabelText(en['age.year']) as HTMLSelectElement;
    expect(month.value).toBe('');
    expect(year.value).toBe('');

    const years = within(year).getAllByRole('option').map((o) => o.textContent);
    const thisYear = String(new Date().getUTCFullYear());
    expect(years).toContain(thisYear);
    expect(years).toContain('1900');
    expect(within(month).getByRole('option', { name: 'January' })).toBeInTheDocument();
  });

  it('will not send the form until the month and year are chosen', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, {}));
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    await fillAccount();
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['age.required']);
    expect(bodyOf(fetchMock, '/auth/register')).toBeUndefined();
  });

  it('sends the month and year with the new account', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: false, birthDateRequired: false },
        tokens: { accessToken: 'x', refreshToken: 'y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument());
    expect(bodyOf(fetchMock, '/auth/register')).toMatchObject({ birthYear: 1990, birthMonth: 3, acceptTerms: true });
  });

  it('names this browser, so Settings can list the new session by it', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    );
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: false, birthDateRequired: false },
        tokens: { accessToken: 'x', refreshToken: 'y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));
    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument());
    expect(bodyOf(fetchMock, '/auth/register')).toMatchObject({ deviceName: 'Safari on iPhone' });
  });

  it('says a password found in a data leak is not safe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 'PASSWORD_BREACHED', message: 'x', details: { reason: 'breached' } })),
    );
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en['error.code.passwordBreached']);
  });

  /**
   * Someone sent here from a friend's game invite gets there once the account
   * exists and its email is confirmed — not the first lesson (pages/VerifyEmail).
   */
  it('remembers where the new account was going, for after the email is confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(201, {
          user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: false, birthDateRequired: false },
          tokens: { accessToken: 'x', refreshToken: 'y' },
        }),
      ),
    );
    renderApp(
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/app" element={<div>App home</div>} />
      </Routes>,
      [{ pathname: '/register', state: { from: '/app/games/wordle-battle?id=b1' } }],
    );
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('hevalo.afterSignup') ?? '{}')).toMatchObject({ path: '/app/games/wordle-battle?id=b1' });
  });

  /**
   * Under 13 no account is made. The form gives way to an explanation, and it
   * stays for the rest of the browser session — an empty form handed straight
   * back would only invite a different year.
   */
  /**
   * An address that already has an account is refused without saying so (the
   * server will not tell anybody which addresses are registered). The page
   * says what can be done instead, and offers both, rather than "Something
   * went wrong".
   */
  it('offers to log in or reset the password when the details cannot make an account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, { code: 'REGISTRATION_FAILED', message: 'unable to register with these details' }),
      ),
    );
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.code.registrationFailed']);
    expect(within(alert).getByRole('link', { name: en['nav.login'] })).toHaveAttribute('href', '/login');
    expect(within(alert).getByRole('link', { name: en['auth.reset.title'] })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByText(en['error.generic'])).not.toBeInTheDocument();
  });

  it('says which password rule was missed, in the form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, { code: 'WEAK_PASSWORD', message: 'Password must include at least one number.', details: { reason: 'needs-number' } }),
      ),
    );
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.code.passwordNeedsNumber']);
    // a refusal about the form itself has no ways out of it, only the fix
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains, and keeps explaining, when the server will not make an account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(403, { code: 'UNDER_MINIMUM_AGE', message: 'accounts are for people aged 13 and over' }),
      ),
    );
    const first = renderRegister();
    await fillAccount();
    const thisYear = String(new Date().getUTCFullYear() - 10);
    await chooseBirth('6', thisYear);
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    expect(await screen.findByRole('heading', { name: en['age.stop.title'] })).toBeInTheDocument();
    expect(screen.getByText(en['age.stop.body'])).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    first.unmount();
    renderRegister();
    expect(screen.getByRole('heading', { name: en['age.stop.title'] })).toBeInTheDocument();
    expect(screen.queryByLabelText(en['age.month'])).not.toBeInTheDocument();
  });
});
