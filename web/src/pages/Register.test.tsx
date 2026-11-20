import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Register } from './Register';
import { renderApp, jsonResponse, MOVES_ON } from '../test/utils';
import { en } from '../i18n/en';

/** What a username may be made of, as the field says it under itself. */
const USERNAME_RULE = en['auth.usernameRule'].replace('{min}', '3').replace('{max}', '30');

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
  // Nothing hints at which answer gets an account: no default, and too-young years are listed like the rest.
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

  it('says beside each field about the person why it is asked, or who will see it', () => {
    renderRegister();
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('We’ll send a code there to check it’s really you.');
    expect(screen.getByLabelText('Username')).toHaveAccessibleDescription(expect.stringContaining('Other learners will see this name.'));
    const birth = screen.getByRole('group', { name: en['age.label'] });
    expect(within(birth).getByText('Your age decides who can find and message you, and who your letters go to. Only the month and year are kept.')).toHaveClass('field-hint');
  });

  it('will not send the form until the month and year are chosen', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, {}));
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    await fillAccount();
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent(en['age.required']);
    expect(bodyOf(fetchMock, '/auth/register')).toBeUndefined();
    // Said under the two it is about, which are marked, and not above the form.
    const birth = screen.getByRole('group', { name: en['age.label'] });
    expect(birth).toContainElement(said);
    expect(birth).toHaveClass('has-problem');
    // And gone once an answer is being given.
    await chooseBirth('3', '1990');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // A taken username is said under the username, which is marked, shaken and focused, and its rule shows from the start.
  it('says what is wrong with the username under the username, and its rule there from the start', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { code: 'USERNAME_TAKEN', message: 'username taken' })),
    );
    renderRegister();
    const username = screen.getByLabelText('Username');
    // Who sees the name and the rule are hints that stay, and the field is typed as it is meant.
    expect(username).toHaveAccessibleDescription(`${en['auth.register.usernameSeen']} ${USERNAME_RULE}`);
    expect(username).toHaveAttribute('autocapitalize', 'none');
    expect(username).toHaveAttribute('spellcheck', 'false');

    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    const said = await screen.findByText(en['error.code.usernameTaken']);
    const field = username.closest('.field')!;
    expect(field).toContainElement(said);
    expect(field).toHaveClass('has-problem', 'is-shake-a');
    expect(username).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(username).toHaveFocus());
    // The rule is still there beside it, and nothing is said above the form.
    expect(within(field as HTMLElement).getByText(USERNAME_RULE)).toHaveClass('field-hint');
    expect(document.querySelector('.msg')).toBeNull();
    // The other fields are not marked for it.
    expect(screen.getByLabelText('Password').closest('.field')).not.toHaveClass('has-problem');

    await userEvent.type(username, '2');
    expect(field).not.toHaveClass('has-problem');
  });

  it('writes the username in lowercase as it is typed, and sends it so', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, {
        user: { id: '1', email: 'a@b.com', username: 'şêrîn.k', displayName: null, emailVerified: false, birthDateRequired: false },
        tokens: { accessToken: 'x', refreshToken: 'y' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    const username = screen.getByLabelText('Username');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(username, 'ŞÊRÎN.K');
    expect(username).toHaveValue('şêrîn.k');
    await userEvent.type(screen.getByLabelText('Password'), 'a-strong-password1');
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));
    await waitFor(() => expect(bodyOf(fetchMock, '/auth/register')).toMatchObject({ username: 'şêrîn.k' }));
  });

  it('says a name the rule refuses under the field, without sending the form', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, {}));
    vi.stubGlobal('fetch', fetchMock);
    renderRegister();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Username'), 'hamo.');
    await userEvent.type(screen.getByLabelText('Password'), 'a-strong-password1');
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent(en['error.code.usernameEdge']);
    expect(screen.getByLabelText('Username').closest('.field')).toContainElement(said);
    expect(bodyOf(fetchMock, '/auth/register')).toBeUndefined();
  });

  it('says a broken username rule once, in the rule’s own place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 'INVALID_USERNAME', message: 'bad', details: { reason: 'charset' } })),
    );
    renderRegister();
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    const said = await screen.findByRole('alert');
    expect(said).toHaveClass('field-problem');
    // Whatever the rule's words are, they are on the page once: not as a grey hint and again in red.
    expect(screen.getAllByText(said.textContent!)).toHaveLength(1);
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

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument(), MOVES_ON);
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
    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument(), MOVES_ON);
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

  // Someone sent from a friend's invite gets there once the email is confirmed, not the first lesson (pages/VerifyEmail).
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
      [{ pathname: '/register', state: { from: '/app/games/peyvok-battle?id=b1' } }],
    );
    await fillAccount();
    await chooseBirth('3', '1990');
    await userEvent.click(screen.getByRole('button', { name: en['auth.register.submit'] }));

    await waitFor(() => expect(screen.getByText('App home')).toBeInTheDocument(), MOVES_ON);
    expect(JSON.parse(localStorage.getItem('hevalo.afterSignup') ?? '{}')).toMatchObject({ path: '/app/games/peyvok-battle?id=b1' });
  });

  // The server never says an address is registered, so the page offers sign-in and a password reset instead.
  it('offers to sign in or reset the password when the details cannot make an account', async () => {
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
    // A refusal about the form itself has no ways out of it, only the fix.
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
