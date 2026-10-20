// @vitest-environment jsdom
/**
 * The pages that show numbers and settings — Analytics, Economy, Gem rules,
 * My security, the dictionary import: what each shows, what it says when it
 * cannot load (never zeros or "nothing here"), and what it asks before acting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { SessionProvider, sessionFrom } from '../session';
import { failure, fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Analytics, Bars } from './Analytics';
import { DictionaryImport } from './DictionaryImport';
import { Economy } from './Economy';
import { GemRules } from './GemRules';
import { Security } from './Security';

afterEach(() => {
  setToken(null);
});

const writes = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method !== 'GET' && c.path === path);

function asRoles(staffRoles: string[], capabilities: string[], ui: ReactNode): ReactNode {
  return <SessionProvider value={sessionFrom({ roles: staffRoles.filter((r) => r !== 'admin'), staffRoles, capabilities })}>{ui}</SessionProvider>;
}

describe('the bar chart', () => {
  it('reads out the day a finger touches, where a tooltip never showed on a phone', () => {
    const points = [
      { day: '2026-10-11', value: 5 },
      { day: '2026-10-12', value: 9 },
      { day: '2026-10-13', value: 7 },
    ];
    const { container } = renderUi(<Bars points={points} unit="sign-ups" />);
    expect(screen.getByText('21 in all')).toBeInTheDocument();
    // the bars side by side, 10 px apart
    const bars = [...container.querySelectorAll<HTMLElement>('.bars .b')];
    bars.forEach((b, i) => {
      b.getBoundingClientRect = () => new DOMRect(i * 10, 0, 8, 100);
    });
    // jsdom has no PointerEvent: a mouse event of the same name carries the position
    fireEvent(container.querySelector('.bars')!, new MouseEvent('pointerdown', { bubbles: true, clientX: 23 }));
    const label = new Date('2026-10-13T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    expect(container.querySelector('.chart-at')).toHaveTextContent(`${label}: 7 sign-ups`);
    expect(bars[2]).toHaveClass('is-on');
    expect(screen.queryByText('21 in all')).not.toBeInTheDocument();
  });
});

describe('Analytics', () => {
  const activity = [
    { day: '2026-10-11', dau: 40, wau: 120, mau: 300, signups: 5 },
    { day: '2026-10-12', dau: 52, wau: 130, mau: 310, signups: 7 },
  ];
  const steps = [
    { step: 'signup', users: 10, rateFromFirst: 1, rateFromPrev: 1 },
    { step: 'first_lesson', users: 6, rateFromFirst: 0.6, rateFromPrev: 0.6 },
  ];

  it('shows the last day’s numbers, the sign-ups in the range and the funnels', async () => {
    fakeApi(
      on('GET', /^\/admin\/analytics\/activity/, json({ points: activity })),
      on('GET', /^\/admin\/analytics\/funnel/, json({ steps })),
      on('GET', /^\/admin\/analytics\/retention/, json({ cohorts: [] })),
    );
    renderUi(<Analytics />);
    const daily = (await screen.findByText('Active in a day')).closest('.stat') as HTMLElement;
    expect(within(daily).getByText('52')).toBeInTheDocument();
    expect((screen.getByText('New sign-ups').closest('.stat') as HTMLElement).textContent).toContain('12');
    expect(screen.getAllByText('first lesson')).toHaveLength(2);
    expect(screen.getAllByText('6 · 60%')).toHaveLength(2);
    expect(screen.getByText('No group has been around long enough in this range.')).toBeInTheDocument();
  });

  it('says a failure is one, rather than drawing zeros', async () => {
    fakeApi(on('GET', /^\/admin\/analytics\//, failure(500, 'INTERNAL', 'boom')));
    renderUi(<Analytics />);
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('Active in a day')).not.toBeInTheDocument();
  });

  it('works the daily numbers out again on request', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', /^\/admin\/analytics\/activity/, json({ points: activity })),
      on('GET', /^\/admin\/analytics\/funnel/, json({ steps: [] })),
      on('GET', /^\/admin\/analytics\/retention/, json({ cohorts: [] })),
      on('POST', '/admin/analytics/refresh', json({ ok: true })),
    );
    renderUi(<Analytics />);
    await user.click(await screen.findByRole('button', { name: 'Recount' }));
    await waitFor(() => expect(writes(calls, '/admin/analytics/refresh')).toHaveLength(1));
    expect(await screen.findByText(/worked out again from the raw events/)).toBeInTheDocument();
  });
});

describe('Economy', () => {
  it('shows what is in circulation and whether it is drifting, for each currency', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', /^\/admin\/economy\/supply/, json({ points: [{ day: '2026-10-12', faucet: 900, sink: 300, net: 600, supply: 12000 }] })),
      on('GET', /^\/admin\/economy\/drift/, json({ currency: 'zer', windowDays: 7, faucet: 900, sink: 300, ratio: 3, target: 1, drifting: true })),
    );
    renderUi(<Economy />);
    expect(await screen.findByText('Drifting')).toBeInTheDocument();
    expect((screen.getAllByText('Zêr in circulation')[0]!.closest('.stat') as HTMLElement).textContent).toContain('12,000');
    await user.click(screen.getByRole('tab', { name: 'Gems' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/economy/supply?currency=gems&days=30')).toBe(true));
  });

  it('says a role that cannot see the economy is refused, not that nothing is there', async () => {
    fakeApi(on('GET', /^\/admin\/economy\//, failure(403, 'FORBIDDEN', 'insufficient permissions')));
    renderUi(<Economy />);
    expect(await screen.findByText('Your role can’t open this')).toBeInTheDocument();
    expect(screen.queryByText('No days counted yet.')).not.toBeInTheDocument();
  });
});

describe('Gem rules', () => {
  const rule = { key: 'lesson_complete', amount: 5, dailyCap: 50, cooldownSeconds: 0, active: true };

  it('asks before a change that applies to everyone, and sends what was typed', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/gem-rules', json({ rules: [rule] })), on('PUT', '/admin/gem-rules/lesson_complete', json({ ok: true })));
    renderUi(<GemRules />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const amount = screen.getByLabelText(/^gems each time/i);
    await user.clear(amount);
    await user.type(amount, '8');
    await user.clear(screen.getByLabelText(/^most a day/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Change what lesson_complete pays?' });
    expect(dialog).toHaveTextContent('8 Gems, no daily limit');
    await user.click(within(dialog).getByRole('button', { name: 'Save the rule' }));
    await waitFor(() => expect(writes(calls, '/admin/gem-rules/lesson_complete')[0]?.body).toEqual({ amount: 8, dailyCap: null, cooldownSeconds: 0, active: true }));
    expect(await screen.findByText('Saved the rule for lesson_complete.')).toBeInTheDocument();
  });

  it('refuses an amount out of range before asking', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/gem-rules', json({ rules: [rule] })));
    renderUi(<GemRules />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText(/^gems each time/i));
    await user.type(screen.getByLabelText(/^gems each time/i), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Gems is a whole number from 1 to 100,000.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });
});

describe('My security', () => {
  it('reads the session it was let in with, so a legacy admin is not told 2FA is off', async () => {
    setToken('tok');
    const { calls } = fakeApi(on('GET', '/me', json({ user: { id: 'u1', username: 'rojin', roles: ['admin'] } })));
    renderUi(<AuthProvider>{asRoles(['admin'], [], <Security />)}</AuthProvider>);
    expect(await screen.findByText('Signed in as @rojin.')).toBeInTheDocument();
    expect(screen.getByText('Two-factor authentication is on')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    // no /admin/me (which refuses this role) and no way to re-enrol from here
    expect(calls.some((c) => c.path === '/admin/me')).toBe(false);
    expect(screen.queryByRole('button', { name: /set up 2fa/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Live events/)).toBeInTheDocument();
  });

  it('lists what a moderator’s capabilities let them do', async () => {
    fakeApi();
    renderUi(<AuthProvider>{asRoles(['moderator'], ['moderation.act', 'users.view'], <Security />)}</AuthProvider>);
    expect(await screen.findByText('Work the moderation queue')).toBeInTheDocument();
    expect(screen.getByText('Look people up')).toBeInTheDocument();
  });
});

describe('the dictionary import', () => {
  const run = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    lang: 'ku',
    status: 'failed',
    filesTotal: 10,
    filesDone: 4,
    entries: 1200,
    senses: 3000,
    duplicates: 0,
    conflicts: 3,
    startedAt: '2026-10-12T08:00:00.000Z',
    finishedAt: '2026-10-12T08:40:00.000Z',
    error: 'the dump stopped answering',
    percent: 40,
    etaMinutes: null,
    ...over,
  });

  it('is not offered to a role the API refuses it to', () => {
    const { calls } = fakeApi();
    renderUi(asRoles(['content_editor'], ['content.edit'], <DictionaryImport />));
    expect(screen.queryByText('Import the dictionary')).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('says where a failed run stopped, and continues it', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/dictionary/import', json({ run: run(), languages: { ku: 'kurmanji' } })),
      on('POST', '/admin/dictionary/import', json({ run: run({ status: 'running', error: null, finishedAt: null }) })),
    );
    renderUi(asRoles(['admin'], [], <DictionaryImport />));
    expect(await screen.findByText('It stopped after 4 of 10 files')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue the import' }));
    await waitFor(() => expect(writes(calls, '/admin/dictionary/import')[0]?.body).toEqual({ lang: 'ku' }));
    expect(await screen.findByRole('progressbar', { name: 'Import progress' })).toHaveAttribute('aria-valuenow', '40');
  });

  it('asks before it stops watching a run', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/dictionary/import', json({ run: run({ status: 'running', error: null, finishedAt: null }), languages: {} })));
    renderUi(asRoles(['superadmin'], [], <DictionaryImport />));
    await user.click(await screen.findByRole('button', { name: 'Stop watching' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Stop watching this import?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
});
