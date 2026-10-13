// @vitest-environment jsdom
/**
 * The pages moved onto the kit: what each asks before it acts, what it sends,
 * and what it says back. One file for the smaller pages; Lessons, Stories,
 * the audio studio and the dashboard have their own.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { fakeApi, json, on, type Call } from '../test/fetch';
import { renderUi } from '../test/render';
import { Approvals } from './Approvals';
import { Audit, describeAction } from './Audit';
import { Events, lifecycle } from './Events';
import { Experiments, shares } from './Experiments';
import { Fraud } from './Fraud';
import { System } from './System';
import { Tags } from './Tags';

afterEach(() => {
  setToken(null);
});

const posts = (calls: Call[], path: string | RegExp): Call[] =>
  calls.filter((c) => c.method !== 'GET' && (typeof path === 'string' ? c.path === path : path.test(c.path)));

describe('Approvals', () => {
  const pending = [
    { id: 'c-mine', target: 'shop_item', payload: { sku: 'crown', name: 'Crown', price: 1500, currency: 'gems' }, sensitive: true, proposerId: 'me-1', createdAt: '2026-10-12T10:00:00.000Z' },
    { id: 'c-theirs', target: 'event', payload: { key: 'newroz', name: 'Newroz', startsAt: '2027-03-20T00:00:00.000Z', endsAt: '2027-03-27T00:00:00.000Z', rewards: { gems: 50 } }, sensitive: true, proposerId: 'other-2', createdAt: '2026-10-12T11:00:00.000Z' },
  ];

  function show(): ReturnType<typeof fakeApi> {
    setToken('tok');
    const api = fakeApi(
      on('GET', '/me', json({ user: { id: 'me-1', username: 'rojda', roles: ['admin'] } })),
      on('GET', '/admin/config/changes', json({ pending })),
      on('POST', /\/approve$/, json({ ok: true, status: 'applied' })),
      on('POST', /\/reject$/, json({ ok: true, status: 'rejected' })),
    );
    renderUi(
      <AuthProvider>
        <Approvals />
      </AuthProvider>,
    );
    return api;
  }

  it('will not offer to approve your own change, and asks before approving another admin’s', async () => {
    const user = userEvent.setup();
    const { calls } = show();
    const mine = await screen.findByRole('button', { name: 'Yours: another admin approves' });
    expect(mine).toBeDisabled();

    const theirs = screen.getAllByRole('button', { name: 'Approve' });
    expect(theirs).toHaveLength(1);
    await user.click(theirs[0]!);
    const dialog = screen.getByRole('alertdialog', { name: 'Schedule “Newroz”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posts(calls, '/admin/config/changes/c-theirs/approve')).toHaveLength(1));
    expect(await screen.findByText('Approved and applied.')).toBeInTheDocument();
  });

  it('sends the reason a change is rejected with', async () => {
    const user = userEvent.setup();
    const { calls } = show();
    await screen.findByText('Newroz');
    await user.click(screen.getAllByRole('button', { name: 'Reject' })[1]!);
    await user.type(screen.getByLabelText(/^why/i), 'Rewards are too high');
    await user.click(within(screen.getByRole('dialog', { name: 'Reject this change?' })).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(posts(calls, '/admin/config/changes/c-theirs/reject')[0]?.body).toEqual({ reason: 'Rewards are too high' }));
  });
});

describe('Live events', () => {
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const later = new Date(Date.now() + 12 * 86_400_000).toISOString();
  const event = {
    key: 'newroz',
    name: 'Newroz',
    type: 'holiday',
    startsAt: soon,
    endsAt: later,
    priority: 2,
    theme: 'spring',
    quests: [{ key: 'q1', goal: 3 }],
    rewards: { gems: 50 },
    enabled: true,
  };

  it('saves an edit with its quests and without touching its rewards', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/events', json({ events: [event] })), on('POST', '/admin/events', json({ ok: true })));
    renderUi(<Events />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'Newroz 2027');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts(calls, '/admin/events')).toHaveLength(1));
    const body = posts(calls, '/admin/events')[0]!.body as Record<string, unknown>;
    expect(body.name).toBe('Newroz 2027');
    expect(body.quests).toEqual(event.quests);
    expect(body).not.toHaveProperty('rewards');
  });

  it('sends a change of rewards to Approvals, and says it is waiting there', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/events', json({ events: [event] })),
      on('POST', '/admin/config/changes', json({ id: 'c-1', status: 'pending' })),
    );
    renderUi(<Events />);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/^rewards/i), { target: { value: '{ "gems": 80 }' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts(calls, '/admin/config/changes')).toHaveLength(1));
    const sent = posts(calls, '/admin/config/changes')[0]!.body as { target: string; payload: Record<string, unknown> };
    expect(sent.target).toBe('event');
    expect(sent.payload.rewards).toEqual({ gems: 80 });
    expect(sent.payload.quests).toEqual(event.quests);
    expect(posts(calls, '/admin/events')).toHaveLength(0);
    expect(await screen.findByText(/waiting in Approvals/)).toBeInTheDocument();
  });

  it('asks before turning a live event off', async () => {
    const user = userEvent.setup();
    const live = { ...event, startsAt: new Date(Date.now() - 86_400_000).toISOString() };
    const { calls } = fakeApi(on('GET', '/admin/events', json({ events: [live] })), on('POST', '/admin/events/newroz/enabled', json({ ok: true })));
    renderUi(<Events />);
    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Turn “Newroz” off?' });
    expect(dialog).toHaveTextContent(/it is live/i);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, /enabled$/)).toHaveLength(0);
  });

  it('names where an event is in its life', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(lifecycle({ enabled: false, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }, now).text).toBe('Off');
    expect(lifecycle({ enabled: true, startsAt: '2026-10-20T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }, now).text).toBe('Upcoming');
    expect(lifecycle({ enabled: true, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }, now).text).toBe('Live');
    expect(lifecycle({ enabled: true, startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' }, now).text).toBe('Ended');
  });
});

describe('Tags', () => {
  it('deactivates a tag only once its key is typed', async () => {
    const user = userEvent.setup();
    const tags = [{ id: 't1', key: 'poet', label: 'Poet', kind: 'claimable', category: 'custom', acquisition: 'self_claim', sensitive: false }];
    const { calls } = fakeApi(on('GET', '/tags', json({ tags })), on('DELETE', '/admin/tags/poet', json({ ok: true })));
    renderUi(<Tags />);
    await user.click(await screen.findByRole('button', { name: 'Deactivate' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate “Poet”?' });
    const go = within(dialog).getByRole('button', { name: 'Deactivate' });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/type the key/i), 'poet');
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(posts(calls, '/admin/tags/poet')).toHaveLength(1));
  });
});

describe('the audit log', () => {
  const entry = (i: number) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    adminId: '11111111-1111-4111-8111-111111111111',
    adminUsername: 'rojda',
    action: i % 2 ? 'POST /admin/users/:id/ban' : 'POST /admin/auth/verify',
    targetType: 'user',
    targetId: '22222222-2222-4222-8222-222222222222',
    before: null,
    after: null,
    reason: null,
    requestId: `req-${i}`,
    createdAt: new Date(Date.parse('2026-10-13T12:00:00Z') - i * 1000).toISOString(),
  });

  it('searches when asked rather than on every keystroke, and refuses half an id', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', /^\/admin\/audit\?/, json({ entries: [entry(1)] })));
    renderUi(<Audit />);
    await screen.findByText('Ban');
    expect(calls.filter((c) => c.path.startsWith('/admin/audit'))).toHaveLength(1);

    await user.type(screen.getByLabelText(/action starts with/i), 'POST /admin/users');
    expect(calls.filter((c) => c.path.startsWith('/admin/audit'))).toHaveLength(1);

    const admin = screen.getByLabelText(/admin’s account id/i);
    await user.type(admin, '1111');
    expect(screen.getByText('A whole account id, or nothing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    await user.clear(admin);

    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith('/admin/audit'))).toHaveLength(2));
    expect(calls.at(-1)!.path).toBe('/admin/audit?limit=100&action=POST+%2Fadmin%2Fusers');
  });

  it('hides sign-ins by default and pages back from the last entry it has', async () => {
    const user = userEvent.setup();
    const page = Array.from({ length: 100 }, (_, i) => entry(i + 1));
    const { calls } = fakeApi(
      on('GET', '/admin/audit?limit=100', json({ entries: page })),
      on('GET', /beforeId=/, json({ entries: [entry(101)] })),
    );
    renderUi(<Audit />);
    expect(await screen.findByText('50+ entries')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /hide sign-ins/i }));
    expect(screen.getByText('100+ entries')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Older entries' }));
    await waitFor(() => expect(calls.at(-1)!.path).toBe(`/admin/audit?limit=100&beforeId=${page[99]!.id}`));
    expect(await screen.findByText('101 entries')).toBeInTheDocument();
  });

  it('reads an action as a verb and a place', () => {
    expect(describeAction('POST /admin/users/:id/ban')).toEqual({ verb: 'Ban', where: 'users' });
    expect(describeAction('DELETE /admin/tags/:key')).toEqual({ verb: 'Delete', where: 'tags' });
    expect(describeAction('POST /admin/events/:key/enabled')).toEqual({ verb: 'Switch on/off', where: 'events' });
    expect(describeAction('POST /admin/gem-rules (dry run)').verb).toBe('Create (dry run)');
  });
});

describe('Fraud', () => {
  const review = { id: 'r1', userId: 'u1', receiptId: 'rcpt-1', flags: ['VELOCITY'], evidence: { purchasesLastHour: 9 }, status: 'open', createdAt: '2026-10-13T10:00:00.000Z' };

  it('gives the held Gems only after asking', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/fraud/reviews', json({ reviews: [review] })),
      on('POST', '/admin/fraud/reviews/r1/resolve', json({ status: 'cleared', grantedGems: 120 })),
    );
    renderUi(<Fraud />);
    expect(await screen.findByText('Many purchases fast')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, /resolve$/)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear and give the Gems' }));
    await waitFor(() => expect(posts(calls, /resolve$/)[0]?.body).toEqual({ decision: 'clear' }));
    expect(await screen.findByText('Cleared: 120 Gems given.')).toBeInTheDocument();
  });

  it('says what each flag means and what the check saw', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/fraud/reviews', json({ reviews: [review] })));
    renderUi(<Fraud />);
    await user.click(await screen.findByRole('button', { name: 'Look' }));
    const drawer = screen.getByRole('dialog', { name: 'Why it was held' });
    expect(drawer).toHaveTextContent('More than 6 purchases on this account in the last hour.');
    expect(drawer).toHaveTextContent('Purchases last hour');
    expect(drawer).toHaveTextContent('9');
  });
});

describe('System', () => {
  const usage = { storedBytes: 9 * 1024 ** 3, storageLimitBytes: 10 * 1024 ** 3, objectCount: 1200, period: '2026-10', classAOps: 10, classALimit: 1_000_000, classBOps: 20, classBLimit: 10_000_000, note: '' };

  it('runs a harmless job straight away and asks before one that changes what players see', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(
      on('GET', '/admin/media/usage', json(usage)),
      on('POST', '/admin/leaderboards/rebuild', json({ rating: 3, weekly_xp: 4 })),
      on('POST', '/admin/leagues/settle', json({ settled: 2 })),
    );
    renderUi(<System />);
    const [rebuild, settle] = screen.getAllByRole('button', { name: 'Run now' });
    await user.click(rebuild!);
    await waitFor(() => expect(posts(calls, '/admin/leaderboards/rebuild')).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(settle!);
    const dialog = screen.getByRole('alertdialog', { name: 'Settle finished league weeks?' });
    expect(posts(calls, '/admin/leagues/settle')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Run it now' }));
    await waitFor(() => expect(posts(calls, '/admin/leagues/settle')).toHaveLength(1));
    expect(await screen.findAllByText('Settled 2 league groups.')).not.toHaveLength(0);
  });

  it('marks storage that is nearly full', async () => {
    fakeApi(on('GET', '/admin/media/usage', json(usage)));
    renderUi(<System />);
    const bar = await screen.findByRole('progressbar', { name: /stored/i });
    expect(bar).toHaveAttribute('aria-valuenow', '90');
    expect(bar.firstElementChild).toHaveClass('is-high');
  });
});

describe('Feature flags', () => {
  it('reads a split as shares', () => {
    expect(shares([{ key: 'control', weight: 1 }, { key: 'new', weight: 3 }])).toBe('control 25% · new 75%');
    expect(shares([{ key: 'control', weight: 0 }])).toBe('control 0%');
  });

  it('refuses two variants with one name before sending anything', async () => {
    const user = userEvent.setup();
    const { calls } = fakeApi(on('GET', '/admin/experiments', json({ experiments: [] })));
    renderUi(<Experiments />);
    await user.click(await screen.findByRole('button', { name: 'New flag' }));
    await user.type(screen.getByLabelText(/^key/i), 'new_home');
    const second = screen.getByLabelText('Variant 2 name');
    await user.clear(second);
    await user.type(second, 'control');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Two variants have the same name.')).toHaveAttribute('role', 'alert');
    expect(posts(calls, '/admin/experiments')).toHaveLength(0);
  });

  it('asks before turning a flag off, and says what that does', async () => {
    const user = userEvent.setup();
    fakeApi(on('GET', '/admin/experiments', json({ experiments: [{ key: 'new_home', description: null, enabled: true, variants: [{ key: 'control', weight: 1 }, { key: 'new', weight: 1 }] }] })));
    renderUi(<Experiments />);
    await user.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Everyone gets “control” straight away.');
  });
});
