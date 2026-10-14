import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { AppGate } from './AppGate';
import { Register } from '../pages/Register';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const account = (over: Record<string, unknown> = {}) => ({
  id: 'me',
  email: 'a@b.com',
  username: 'ada',
  displayName: null,
  emailVerified: true,
  ...over,
});

/**
 * A signed-in account, and a server that answers /me with `me()` and
 * POST /me/birth-date with `answer`.
 */
function signedIn(me: () => Record<string, unknown>, answer: () => Response): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/me/birth-date')) return answer();
    if (url.includes('/me')) return jsonResponse(200, { user: me() });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderGate() {
  return renderApp(
    <Routes>
      <Route
        path="/app"
        element={
          <AppGate>
            <p>the app</p>
          </AppGate>
        }
      />
      <Route path="/register" element={<Register />} />
    </Routes>,
    ['/app'],
  );
}

describe('AppGate and the one-time birth month question', () => {
  it('lets an account with a birth month straight through', async () => {
    signedIn(() => account({ birthDateRequired: false }), () => jsonResponse(500, {}));
    renderGate();
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  /**
   * An account from before the question was asked (or a Google or Apple
   * sign-up) is asked once, and nothing else is offered until it answers.
   */
  it('asks an account without one before anything else, and lets it in once answered', async () => {
    let answered = false;
    const fetchMock = signedIn(
      () => account({ birthDateRequired: !answered }),
      () => {
        answered = true;
        return jsonResponse(200, { user: account({ birthDateRequired: false }) });
      },
    );
    renderGate();

    expect(await screen.findByRole('heading', { name: en['age.prompt.title'] })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    expect(screen.getByText(en['age.prompt.once'])).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(en['age.month']), '11');
    await userEvent.selectOptions(screen.getByLabelText(en['age.year']), '1985');
    await userEvent.click(screen.getByRole('button', { name: en['age.prompt.save'] }));

    expect(await screen.findByText('the app')).toBeInTheDocument();
    const sent = fetchMock.mock.calls.find(([url]) => String(url).includes('/me/birth-date'));
    expect(JSON.parse(String((sent![1] as RequestInit).body))).toEqual({ birthYear: 1985, birthMonth: 11 });
  });

  it('needs both halves before it sends anything', async () => {
    const fetchMock = signedIn(() => account({ birthDateRequired: true }), () => jsonResponse(200, {}));
    renderGate();
    await screen.findByRole('heading', { name: en['age.prompt.title'] });
    await userEvent.selectOptions(screen.getByLabelText(en['age.month']), '2');
    await userEvent.click(screen.getByRole('button', { name: en['age.prompt.save'] }));

    expect(await screen.findByRole('alert')).toHaveTextContent(en['age.required']);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/me/birth-date'))).toBe(false);
  });

  /**
   * Under 13 the server closes the account. The session goes with it and the
   * explanation is what is left, not an empty sign-up form.
   */
  it('signs out and explains when the account has been closed for age', async () => {
    signedIn(
      () => account({ birthDateRequired: true }),
      () => jsonResponse(403, { code: 'UNDER_MINIMUM_AGE', message: 'no', details: { accountClosed: true } }),
    );
    renderGate();
    await screen.findByRole('heading', { name: en['age.prompt.title'] });
    await userEvent.selectOptions(screen.getByLabelText(en['age.month']), '5');
    await userEvent.selectOptions(screen.getByLabelText(en['age.year']), String(new Date().getUTCFullYear() - 9));
    await userEvent.click(screen.getByRole('button', { name: en['age.prompt.save'] }));

    expect(await screen.findByRole('heading', { name: en['age.stop.title'] })).toBeInTheDocument();
    expect(screen.getByText(en['age.stop.closed'])).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_tokens')).toBeNull();
  });

  it('is never a dead end: signing out is offered', async () => {
    signedIn(() => account({ birthDateRequired: true }), () => jsonResponse(200, {}));
    renderGate();
    await screen.findByRole('heading', { name: en['age.prompt.title'] });
    await userEvent.click(screen.getByRole('button', { name: en['settings.sessions.signOut'] }));

    // signed out, the app is open to read as a guest again
    await waitFor(() => expect(screen.getByText('the app')).toBeInTheDocument());
    expect(localStorage.getItem('hevalo_tokens')).toBeNull();
  });
});
