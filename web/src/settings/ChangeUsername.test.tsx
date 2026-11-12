import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeUsername } from './ChangeUsername';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const STATUS = { username: 'ada', needsPassword: true, canChange: true, availableAt: null, cooldownDays: 30, holdDays: 60, held: [] };

/** The three username routes, and /me so the session restores. `change` answers the POST. */
function stubApi(options: { status?: Record<string, unknown>; available?: (name: string) => Response; change?: () => Response } = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.includes('/me/username/available')) {
      const name = new URL(path, 'http://x').searchParams.get('username') ?? '';
      return options.available ? options.available(name) : jsonResponse(200, { available: true, username: name });
    }
    if (path.endsWith('/me/username')) {
      if (init?.method === 'POST') return options.change ? options.change() : jsonResponse(200, {});
      return jsonResponse(200, { ...STATUS, ...options.status });
    }
    if (path.endsWith('/me')) {
      return jsonResponse(200, { user: { id: 'u1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true } });
    }
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const calls = (fetchMock: ReturnType<typeof vi.fn>, part: string, method = 'GET'): Array<[string, RequestInit | undefined]> =>
  (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).filter(([u, init]) => String(u).includes(part) && (init?.method ?? 'GET') === method);

async function openForm(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: en['settings.username.change'] }));
  return user;
}

describe('changing the username in Settings', () => {
  it('says the limits and the name as it stands before anything is typed', async () => {
    stubApi();
    renderApp(<ChangeUsername />);
    expect(await screen.findByText('@ada')).toBeInTheDocument();
    expect(screen.getByText(en['settings.username.help'].replace('{cooldown}', '30').replace('{hold}', '60'))).toBeInTheDocument();
    expect(screen.queryByLabelText(en['settings.username.new'])).not.toBeInTheDocument();
  });

  it('asks whether a name is free once the typing stops, and says so', async () => {
    const fetchMock = stubApi();
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    expect(await screen.findByText(en['settings.username.available'])).toBeInTheDocument();
    // one question for the whole word, not one a letter
    expect(calls(fetchMock, '/me/username/available')).toHaveLength(1);
  });

  it('says a name is taken under the field, without the change being tried', async () => {
    const fetchMock = stubApi({ available: () => jsonResponse(200, { available: false, reason: 'taken' }) });
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'grace');
    expect(await screen.findByText(en['error.code.usernameTaken'])).toBeInTheDocument();
    expect(screen.getByLabelText(en['settings.username.new'])).toHaveAttribute('aria-invalid', 'true');
    expect(calls(fetchMock, '/me/username', 'POST')).toHaveLength(0);
  });

  it('never asks the server about a name whose shape it would refuse', async () => {
    const fetchMock = stubApi();
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'a b');
    expect(await screen.findByText(en['error.code.usernameChars'], { selector: '.field-problem' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText(en['settings.username.new']));
    await user.type(screen.getByLabelText(en['settings.username.new']), '_ada');
    expect(await screen.findByText(en['error.code.usernameUnderscore'])).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 600));
    expect(calls(fetchMock, '/me/username/available')).toHaveLength(0);
  });

  it('sends the new name with the password, then shows the new name and the name kept for its owner', async () => {
    const after = { ...STATUS, username: 'lovelace', canChange: false, availableAt: '2027-01-10T12:00:00.000Z', held: [{ username: 'ada', heldUntil: '2027-02-09T12:00:00.000Z' }] };
    const fetchMock = stubApi({ change: () => jsonResponse(200, { user: { username: 'lovelace' }, changed: true, status: after }) });
    const onChanged = vi.fn();
    renderApp(<ChangeUsername onChanged={onChanged} />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    await user.type(screen.getByLabelText(en['settings.username.password']), 'a-strong-password1');
    await user.click(screen.getByRole('button', { name: en['settings.username.change'] }));

    expect(await screen.findByText(en['settings.username.changed'].replace('{name}', 'lovelace'))).toBeInTheDocument();
    const [, init] = calls(fetchMock, '/me/username', 'POST')[0]!;
    expect(JSON.parse(String(init!.body))).toEqual({ username: 'lovelace', currentPassword: 'a-strong-password1' });
    expect(onChanged).toHaveBeenCalledWith('lovelace');
    expect(screen.getByText('@lovelace')).toBeInTheDocument();
    // the wait has begun: its day is said, and there is nothing left to press
    expect(screen.getByText(/You can change your username again on .*2027/)).toBeInTheDocument();
    expect(screen.getByText(/@ada is kept for you until .*2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['settings.username.change'] })).not.toBeInTheDocument();
  });

  it('says a wrong password under the password field and keeps what was typed', async () => {
    stubApi({ change: () => jsonResponse(400, { code: 'WRONG_PASSWORD', message: 'wrong password' }) });
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    await user.type(screen.getByLabelText(en['settings.username.password']), 'not-it');
    await user.click(screen.getByRole('button', { name: en['settings.username.change'] }));

    expect(await screen.findByText(en['error.code.wrongPassword'])).toBeInTheDocument();
    expect(screen.getByLabelText(en['settings.username.new'])).toHaveValue('lovelace');
    await waitFor(() => expect(screen.getByLabelText(en['settings.username.password'])).toHaveFocus());
  });

  it('says a name somebody took in the meantime under the name field', async () => {
    stubApi({ change: () => jsonResponse(409, { code: 'USERNAME_TAKEN', message: 'taken' }) });
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    await user.type(screen.getByLabelText(en['settings.username.password']), 'a-strong-password1');
    await user.click(screen.getByRole('button', { name: en['settings.username.change'] }));
    expect(await screen.findByText(en['error.code.usernameTaken'])).toBeInTheDocument();
  });

  it('asks no password of an account that has none', async () => {
    const fetchMock = stubApi({ status: { needsPassword: false }, change: () => jsonResponse(200, { user: { username: 'lovelace' }, changed: true, status: { ...STATUS, username: 'lovelace', needsPassword: false } }) });
    renderApp(<ChangeUsername />);
    const user = await openForm();
    expect(screen.queryByLabelText(en['settings.username.password'])).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    await user.click(screen.getByRole('button', { name: en['settings.username.change'] }));
    await screen.findByText(en['settings.username.changed'].replace('{name}', 'lovelace'));
    const [, init] = calls(fetchMock, '/me/username', 'POST')[0]!;
    expect(JSON.parse(String(init!.body))).toEqual({ username: 'lovelace' });
  });

  it('shows only the day the wait ends while a change is not yet allowed', async () => {
    stubApi({ status: { canChange: false, availableAt: '2027-01-10T12:00:00.000Z' } });
    renderApp(<ChangeUsername />);
    expect(await screen.findByText(/You can change your username again on .*2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['settings.username.change'] })).not.toBeInTheDocument();
  });

  it('reads the wait again when the server says a change was made somewhere else', async () => {
    let waiting = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/me/username/available')) return jsonResponse(200, { available: true, username: 'lovelace' });
      if (path.endsWith('/me/username') && init?.method === 'POST') {
        waiting = true;
        return jsonResponse(429, { code: 'USERNAME_CHANGE_COOLDOWN', message: 'wait', details: { availableAt: '2027-01-10T12:00:00.000Z' } });
      }
      if (path.endsWith('/me/username')) return jsonResponse(200, waiting ? { ...STATUS, canChange: false, availableAt: '2027-01-10T12:00:00.000Z' } : STATUS);
      return jsonResponse(200, { user: { id: 'u1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<ChangeUsername />);
    const user = await openForm();
    await user.type(screen.getByLabelText(en['settings.username.new']), 'lovelace');
    await user.type(screen.getByLabelText(en['settings.username.password']), 'a-strong-password1');
    await user.click(screen.getByRole('button', { name: en['settings.username.change'] }));
    expect(await screen.findByText(/You can change your username again on .*2027/)).toBeInTheDocument();
  });
});
