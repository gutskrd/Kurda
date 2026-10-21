import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { SignedInDevices, type DeviceSession } from './SignedInDevices';
import { renderApp, jsonResponse } from '../test/utils';
import { persistTokens } from '../lib/tokenStorage';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

const HERE: DeviceSession = { id: '11111111-1111-4111-8111-111111111111', deviceName: 'Chrome on Windows', startedAt: ago(60 * 24 * 20), lastSeenAt: ago(3), current: true };
const PHONE: DeviceSession = { id: '22222222-2222-4222-8222-222222222222', deviceName: 'Safari on iPhone', startedAt: ago(60 * 24 * 5), lastSeenAt: ago(125), current: false };
const MYSTERY: DeviceSession = { id: '33333333-3333-4333-8333-333333333333', deviceName: null, startedAt: ago(60 * 24 * 9), lastSeenAt: ago(60 * 24 * 3), current: false };

type Answer = (url: string, init?: RequestInit) => Response | undefined;

/** Answers GET /me/sessions with each list in turn, and anything else via `other`. */
function stubApi(lists: DeviceSession[][], other: Answer = () => undefined): ReturnType<typeof vi.fn> {
  let next = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const answered = other(String(url), init);
    if (answered) return answered;
    if (method === 'GET' && String(url).endsWith('/me/sessions')) {
      const sessions = lists[Math.min(next, lists.length - 1)];
      next += 1;
      return jsonResponse(200, { sessions });
    }
    if (method === 'GET' && String(url).endsWith('/me')) {
      return jsonResponse(200, { user: { id: 'u1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true } });
    }
    return jsonResponse(200, { ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calls(fetchMock: ReturnType<typeof vi.fn>, method: string, path: string): number {
  return fetchMock.mock.calls.filter(([u, i]) => ((i as RequestInit | undefined)?.method ?? 'GET') === method && String(u).endsWith(path)).length;
}

function renderDevices(): void {
  renderApp(
    <Routes>
      <Route path="/app/settings" element={<SignedInDevices />} />
      <Route path="/" element={<div>Signed-out home</div>} />
    </Routes>,
    ['/app/settings'],
  );
}

/** ConfirmButton: the first press arms it, the second does it. */
async function confirm(user: ReturnType<typeof userEvent.setup>, name: string | RegExp): Promise<void> {
  await user.click(screen.getByRole('button', { name }));
  await user.click(screen.getByRole('button', { name: /press again to confirm/i }));
}

describe('signed-in devices in Settings', () => {
  it('lists every device: this one first, a name or "Unknown device", and when each was last used', async () => {
    stubApi([[PHONE, HERE, MYSTERY]]);
    renderDevices();

    await screen.findByText('Safari on iPhone');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // this device leads, however the server ordered them
    expect(rows[0]).toHaveTextContent('Chrome on Windows');
    expect(within(rows[0]!).getByText(en['settings.devices.thisDevice'])).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent(`${en['settings.devices.thisDevice']} · ${en['settings.devices.activeNow']}`);
    expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();

    expect(rows[1]).toHaveTextContent('Safari on iPhone');
    expect(rows[1]).toHaveTextContent('Last active 2 hours ago');
    expect(rows[2]).toHaveTextContent(en['settings.devices.unknown']);
    expect(rows[2]).toHaveTextContent('Last active 3 days ago');

    // every row but this one can be signed out on its own
    expect(within(rows[1]!).getByRole('button', { name: 'Sign out Safari on iPhone' })).toBeInTheDocument();
    expect(within(rows[2]!).getByRole('button', { name: 'Sign out Unknown device' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.devices.signOutOthers'] })).toBeInTheDocument();
  });

  it('shows the rows’ shape while it loads', async () => {
    let answer: (r: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    renderDevices();
    const loading = screen.getByRole('status');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toHaveTextContent(en['settings.devices.loading']);
    // drawn a moment late, so a quick answer never flashes grey
    expect(loading).toHaveClass('skeleton-region');
    answer(jsonResponse(200, { sessions: [HERE] }));
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
  });

  it('says so when this is the only device, and offers nothing to sign out of', async () => {
    stubApi([[HERE]]);
    renderDevices();
    expect(await screen.findByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['settings.devices.signOutOthers'] })).not.toBeInTheDocument();
  });

  it('says so, and tries again, when the list does not load', async () => {
    let fail = true;
    stubApi([[HERE, PHONE]], (url) => {
      if (fail && url.endsWith('/me/sessions')) return jsonResponse(500, { code: 'INTERNAL', message: 'boom' });
      return undefined;
    });
    renderDevices();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en['error.server']);
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: en['common.retry'] }));
    expect(await screen.findByText('Safari on iPhone')).toBeInTheDocument();
  });

  it('signs one device out after a second press, and takes its row away', async () => {
    const fetchMock = stubApi([[HERE, PHONE, MYSTERY]], (url, init) =>
      init?.method === 'DELETE' && url.endsWith(`/me/sessions/${PHONE.id}`) ? jsonResponse(200, { revoked: true, current: false }) : undefined,
    );
    renderDevices();
    await screen.findByText('Safari on iPhone');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Sign out Safari on iPhone' }));
    // one press only arms it
    expect(calls(fetchMock, 'DELETE', `/me/sessions/${PHONE.id}`)).toBe(0);
    await user.click(screen.getByRole('button', { name: /press again to confirm/i }));

    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument());
    expect(calls(fetchMock, 'DELETE', `/me/sessions/${PHONE.id}`)).toBe(1);
    expect(screen.getByText(en['settings.devices.unknown'])).toBeInTheDocument();
  });

  it('takes away a row whose device had already signed out, and says so', async () => {
    stubApi([[HERE, PHONE]], (url, init) =>
      init?.method === 'DELETE' && url.includes('/me/sessions/') ? jsonResponse(404, { code: 'SESSION_NOT_FOUND', message: 'no active session with that id' }) : undefined,
    );
    renderDevices();
    await screen.findByText('Safari on iPhone');
    await confirm(userEvent.setup(), 'Sign out Safari on iPhone');
    expect(await screen.findByText('That device is already signed out.')).toBeInTheDocument();
    expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument();
    expect(screen.getByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
  });

  it('signs this browser out when the session ended was its own', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'r' }, true);
    // the list was fetched elsewhere: the row is not marked as this one, but the server knows
    stubApi([[HERE, { ...PHONE }]], (url, init) =>
      init?.method === 'DELETE' && url.includes('/me/sessions/') ? jsonResponse(200, { revoked: true, current: true }) : undefined,
    );
    renderDevices();
    await screen.findByText('Safari on iPhone');
    await confirm(userEvent.setup(), 'Sign out Safari on iPhone');
    expect(await screen.findByText('Signed-out home')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_tokens')).toBeNull();
  });

  it('signs out everywhere else, says how many, and fetches the list again', async () => {
    const fetchMock = stubApi([[HERE, PHONE, MYSTERY], [HERE]], (url, init) =>
      init?.method === 'DELETE' && url.endsWith('/me/sessions?except=current')
        ? jsonResponse(200, { revoked: true, everywhere: false, sessionsEnded: 2 })
        : undefined,
    );
    renderDevices();
    await screen.findByText('Safari on iPhone');
    await confirm(userEvent.setup(), en['settings.devices.signOutOthers']);

    expect(await screen.findByText('Signed out of 2 other devices.')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/me/sessions?except=current')).toBe(1);
    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument());
    expect(calls(fetchMock, 'GET', '/me/sessions')).toBe(2);
    expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText(en['settings.devices.onlyThis'])).toBeInTheDocument();
  });

  it('says one device as one', async () => {
    stubApi([[HERE, PHONE], [HERE]], (url, init) =>
      init?.method === 'DELETE' && url.endsWith('?except=current') ? jsonResponse(200, { revoked: true, everywhere: false, sessionsEnded: 1 }) : undefined,
    );
    renderDevices();
    await screen.findByText('Safari on iPhone');
    await confirm(userEvent.setup(), en['settings.devices.signOutOthers']);
    expect(await screen.findByText(en['settings.devices.endedOne'])).toBeInTheDocument();
  });

  it('still signs out here, or everywhere at once, which ends this session too', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'r' }, true);
    const fetchMock = stubApi([[HERE, PHONE]]);
    renderDevices();
    await screen.findByText('Safari on iPhone');
    await confirm(userEvent.setup(), /^sign out everywhere$/i);
    expect(await screen.findByText('Signed-out home')).toBeInTheDocument();
    // no parameter: every session, this one included
    expect(calls(fetchMock, 'DELETE', '/me/sessions')).toBe(1);
    expect(localStorage.getItem('hevalo_tokens')).toBeNull();
  });
});
