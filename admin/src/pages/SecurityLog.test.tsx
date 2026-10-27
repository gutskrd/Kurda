// @vitest-environment jsdom
/**
 * The security log, against a fake API: the state of things at the top, the
 * alerts waiting on someone, the filters, marking reviewed, and seeing an
 * address only by giving a reason.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { fakeApi, json, on } from '../test/fetch';
import { renderUi } from '../test/render';
import { SecurityLog, change, groupAlerts, networkName, type SecurityEvent, type SecuritySummary } from './SecurityLog';

const NET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function event(over: Partial<SecurityEvent> = {}): SecurityEvent {
  return {
    id: 'ev-1',
    occurredAt: ago(5),
    kind: 'signin.failed',
    severity: 'notice',
    category: 'sign-in',
    user: { id: 'u-1', username: 'rojin' },
    actor: null,
    network: NET,
    country: 'DE',
    device: 'Chrome on Windows',
    requestId: 'req-9',
    details: { reason: 'wrong-password', route: 'POST /auth/login' },
    hasAddress: true,
    alert: null,
    ...over,
  };
}

const newPlace = event({
  id: 'ev-2',
  kind: 'console.signin_new_device',
  severity: 'critical',
  category: 'console',
  alert: { reviewedAt: null, reviewedBy: null, note: null, emailedAt: ago(4) },
});

const summary: SecuritySummary = {
  window: { from: ago(24 * 60), to: ago(0) },
  counts: { total: 40, info: 20, notice: 15, warning: 4, critical: 1 },
  previous: { total: 10, info: 6, notice: 4, warning: 0, critical: 0 },
  failedSignIns: { now: 12, before: 4 },
  blocked: { now: 3, before: 3 },
  hourly: Array.from({ length: 24 }, (_, i) => ({ hour: ago((24 - i) * 60), info: i, notice: 1, warning: i === 20 ? 3 : 0, critical: i === 22 ? 1 : 0 })),
  networks: [{ network: NET, events: 14, failures: 12, serious: 2, accounts: 5, country: 'DE', lastAt: ago(5) }],
  open: { warning: 0, critical: 1 },
  lastConsoleSignIn: { at: ago(4), device: 'Firefox on Linux', country: 'NL' },
};

function show(): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(
    on('GET', '/admin/security/summary', json(summary)),
    on('GET', /^\/admin\/security\/events\?open=true/, json({ events: [newPlace] })),
    on('GET', /^\/admin\/security\/events\?limit=50/, json({ events: [newPlace, event()] })),
    on('GET', /^\/admin\/security\/events\?limit=50&network=/, json({ events: [event()] })),
    on('POST', '/admin/security/alerts/review', json({ reviewed: 1 })),
    on('POST', '/admin/security/events/ev-1/reveal-address', json({ address: '203.0.113.7' })),
  );
  renderUi(<SecurityLog />);
  return api;
}

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
});

describe('the parts', () => {
  it('names a network by the start of its hash, and compares a day with the one before', () => {
    expect(networkName(NET)).toBe('Network a1b2c3d4');
    expect(change(12, 4)).toBe('+200% on the day before');
    expect(change(3, 3)).toBe('Same as the day before');
    expect(change(0, 0)).toBe('None the day before either');
    expect(change(2, 0)).toBe('None the day before');
  });

  it('puts critical alerts first, one group per kind', () => {
    const groups = groupAlerts([
      event({ id: 'a', kind: 'console.2fa_failed', severity: 'warning' }),
      newPlace,
      event({ id: 'b', kind: 'console.2fa_failed', severity: 'warning' }),
    ]);
    expect(groups.map((g) => [g.kind, g.events.length])).toEqual([
      ['console.signin_new_device', 1],
      ['console.2fa_failed', 2],
    ]);
  });
});

describe('the security log page', () => {
  it('says what needs attention first, with the last day’s numbers', async () => {
    show();
    expect(await screen.findByText('1 critical alert needs you')).toBeTruthy();
    expect(screen.getByText('+200% on the day before')).toBeTruthy();
    const attention = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(attention).getByText('Admin console sign-in from a new device or network')).toBeTruthy();
    // the chart says what is in it, for a screen reader too
    expect(screen.getByRole('img', { name: /events in the last 24 hours/ })).toBeTruthy();
  });

  it('marks an alert reviewed with an optional note', async () => {
    const api = show();
    const attention = await screen.findByRole('region', { name: 'Needs attention' });
    await userEvent.click(within(attention).getByRole('button', { name: 'Reviewed' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'It was me');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.path === '/admin/security/alerts/review')).toBe(true));
    expect(api.calls.find((c) => c.path === '/admin/security/alerts/review')!.body).toEqual({ kind: 'console.signin_new_device', note: 'It was me' });
  });

  it('shows only one network when it is picked', async () => {
    const api = show();
    await userEvent.click(await screen.findByRole('button', { name: /Network a1b2c3d4/ }));
    await waitFor(() => expect(api.calls.some((c) => c.path.includes(`network=${NET}`))).toBe(true));
    expect(screen.getByRole('button', { name: 'Stop showing only Network a1b2c3d4' })).toBeTruthy();
  });

  it('reveals an address only with a reason, in the event’s details', async () => {
    const api = show();
    const rows = await screen.findAllByRole('button', { name: 'Details' });
    await userEvent.click(rows[1]!);
    await userEvent.click(await screen.findByRole('button', { name: 'See the address' }));
    const dialog = await screen.findByRole('dialog', { name: 'See the address' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'abuse report');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show the address' }));
    expect(await screen.findByText('203.0.113.7')).toBeTruthy();
    expect(api.calls.find((c) => c.path.endsWith('/reveal-address'))!.body).toEqual({ reason: 'abuse report' });
  });
});
