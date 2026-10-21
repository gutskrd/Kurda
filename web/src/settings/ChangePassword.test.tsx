import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePassword } from './ChangePassword';
import { renderApp, jsonResponse } from '../test/utils';
import { createTokenStorage, persistTokens } from '../lib/tokenStorage';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** Answers POST /me/password with `answer`, and /me so the session restores. */
function stubApi(answer: () => Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/me/password')) return answer();
    if (String(url).endsWith('/me')) {
      return jsonResponse(200, { user: { id: 'u1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true } });
    }
    void init;
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentTo(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([u]) => String(u).endsWith('/me/password'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

async function fill(current: string, next: string, again = next): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: en['settings.password.change'] }));
  await user.type(screen.getByLabelText(en['settings.password.current']), current);
  await user.type(screen.getByLabelText(en['auth.newPassword']), next);
  await user.type(screen.getByLabelText(en['auth.reset.confirmNew']), again);
  return user;
}

async function submit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const form = screen.getByLabelText(en['settings.password.current']).closest('form')!;
  await user.click(within(form).getByRole('button', { name: en['settings.password.change'] }));
}

describe('changing the password in Settings', () => {
  it('opens a form with the three fields, each with a show-password toggle and the policy hint', async () => {
    stubApi(() => jsonResponse(200, {}));
    renderApp(<ChangePassword />);
    await userEvent.click(screen.getByRole('button', { name: en['settings.password.change'] }));
    expect(screen.getByLabelText(en['settings.password.current'])).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText(en['auth.newPassword'])).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(en['auth.reset.confirmNew'])).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getAllByRole('button', { name: en['auth.showPassword'] })).toHaveLength(3);
    expect(screen.getByText(en['auth.passwordHint'])).toBeInTheDocument();
  });

  it('changes it, swaps in the new access token and keeps the refresh token', async () => {
    persistTokens({ accessToken: 'old-access', refreshToken: 'the-refresh' }, true);
    const fetchMock = stubApi(() => jsonResponse(200, { changed: true, accessToken: 'new-access', accessExpiresInSeconds: 900 }));
    const onChanged = vi.fn();
    renderApp(<ChangePassword onChanged={onChanged} />);

    const user = await fill('old-password1', 'a-new-password2');
    await submit(user);

    expect(await screen.findByText(en['settings.password.changed'])).toBeInTheDocument();
    expect(sentTo(fetchMock)).toEqual([{ currentPassword: 'old-password1', newPassword: 'a-new-password2' }]);
    expect(createTokenStorage().get()).toEqual({ accessToken: 'new-access', refreshToken: 'the-refresh' });
    expect(onChanged).toHaveBeenCalledTimes(1);
    // the form closes, and nothing typed is left in the page
    expect(screen.queryByLabelText(en['settings.password.current'])).not.toBeInTheDocument();
  });

  it('leaves the tokens alone when the answer carries none', async () => {
    persistTokens({ accessToken: 'old-access', refreshToken: 'the-refresh' }, true);
    stubApi(() => jsonResponse(200, { changed: true, accessToken: null, accessExpiresInSeconds: 900 }));
    renderApp(<ChangePassword />);
    await submit(await fill('old-password1', 'a-new-password2'));
    await screen.findByText(en['settings.password.changed']);
    expect(createTokenStorage().get()).toEqual({ accessToken: 'old-access', refreshToken: 'the-refresh' });
  });

  it('says a wrong current password under that field', async () => {
    stubApi(() => jsonResponse(400, { code: 'WRONG_PASSWORD', message: 'the current password is not correct' }));
    renderApp(<ChangePassword />);
    await submit(await fill('not-it-1', 'a-new-password2'));

    const current = screen.getByLabelText(en['settings.password.current']);
    await waitFor(() => expect(current).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(current.getAttribute('aria-describedby')!)).toHaveTextContent(en['error.code.wrongPassword']);
    expect(current).toHaveFocus();
    // and the complaint goes the moment the field is touched
    await userEvent.type(current, 'x');
    expect(screen.queryByText(en['error.code.wrongPassword'])).not.toBeInTheDocument();
  });

  it('says a breached new password under the new password', async () => {
    stubApi(() => jsonResponse(400, { code: 'PASSWORD_BREACHED', message: 'x', details: { reason: 'breached' } }));
    renderApp(<ChangePassword />);
    await submit(await fill('old-password1', 'password123'));
    const next = screen.getByLabelText(en['auth.newPassword']);
    await waitFor(() => expect(next).toHaveAttribute('aria-invalid', 'true'));
    expect(next.getAttribute('aria-describedby')).toContain('pw-new-hint');
    expect(screen.getByText(en['error.code.passwordBreached'])).toHaveAttribute('id', 'pw-new-error');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says which rule a weak new password missed, under it', async () => {
    stubApi(() => jsonResponse(400, { code: 'WEAK_PASSWORD', message: 'x', details: { reason: 'needs-letter' } }));
    renderApp(<ChangePassword />);
    // passes the check here (a letter and a number), so the server's reason is the one shown
    await submit(await fill('old-password1', 'abcdefg1'));
    expect(await screen.findByText(en['error.code.passwordNeedsLetter'])).toHaveAttribute('id', 'pw-new-error');
  });

  it('checks the policy and the match here first, without spending one of the five tries', async () => {
    const fetchMock = stubApi(() => jsonResponse(200, {}));
    renderApp(<ChangePassword />);
    const user = await fill('old-password1', 'short1');
    await submit(user);
    expect(await screen.findByText('Use at least 8 characters for your password.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(en['auth.newPassword']));
    await user.type(screen.getByLabelText(en['auth.newPassword']), 'a-new-password2');
    await user.clear(screen.getByLabelText(en['auth.reset.confirmNew']));
    await user.type(screen.getByLabelText(en['auth.reset.confirmNew']), 'a-new-password3');
    await submit(user);
    expect(await screen.findByText(en['auth.reset.mismatch'])).toHaveAttribute('id', 'pw-confirm-error');
    expect(screen.getByLabelText(en['auth.reset.confirmNew'])).toHaveFocus();
    expect(sentTo(fetchMock)).toHaveLength(0);
  });

  /** An account made with Google or Apple has no password to change. */
  it('offers to set a password when the account has none', async () => {
    stubApi(() => jsonResponse(400, { code: 'NO_PASSWORD', message: 'this account has no password yet' }));
    renderApp(<ChangePassword />);
    await submit(await fill('anything1', 'a-new-password2'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.code.noPassword']);
    expect(within(alert).getByRole('link', { name: en['settings.password.setOne'] })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText(en['settings.password.current'])).not.toBeInTheDocument();
  });

  it('says anything else above the form, and keeps what was typed', async () => {
    stubApi(() => new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'slow down' }), { status: 429, headers: { 'retry-after': '600', 'content-type': 'application/json' } }));
    renderApp(<ChangePassword />);
    await submit(await fill('old-password1', 'a-new-password2'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 10 min.');
    expect(screen.getByLabelText(en['settings.password.current'])).toHaveValue('old-password1');
  });

  it('puts everything away on Cancel', async () => {
    stubApi(() => jsonResponse(200, {}));
    renderApp(<ChangePassword />);
    const user = await fill('old-password1', 'a-new-password2');
    await user.click(screen.getByRole('button', { name: en['common.cancel'] }));
    await user.click(screen.getByRole('button', { name: en['settings.password.change'] }));
    expect(screen.getByLabelText(en['settings.password.current'])).toHaveValue('');
  });
});
