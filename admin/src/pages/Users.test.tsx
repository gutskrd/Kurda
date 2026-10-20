// @vitest-environment jsdom
/**
 * People, against a fake API: the list with its search and filters in the
 * address, and a person's page tab by tab — what each shows, and exactly
 * what each action sends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { SessionProvider, type AdminSession } from '../session';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { ME_ID, SUBJECT_ID, sanction } from '../test/moderation';
import { renderUi } from '../test/render';
import type { UserDetail } from './UserPage';
import { USERS_Q_MAX, Users, usersPath } from './Users';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h: number): string => new Date(Date.now() + h * HOUR).toISOString();

const MODERATOR: AdminSession = { roles: ['moderator'], staffRoles: ['moderator'], capabilities: ['users.view', 'users.moderate', 'moderation.act'], needsEnrollment: false, needsVerification: false };
const OWNER: AdminSession = { ...MODERATOR, roles: ['superadmin'], staffRoles: ['superadmin'] };
const SUPPORT: AdminSession = { roles: ['support'], staffRoles: ['support'], capabilities: ['users.view', 'economy.view'], needsEnrollment: false, needsVerification: false };

const me: Route = on('GET', '/me', json({ user: { id: ME_ID, username: 'rojda', roles: ['moderator'] } }));

function person(over: Partial<UserDetail> = {}): UserDetail {
  return {
    id: SUBJECT_ID,
    username: 'baran',
    email: 'baran@example.org',
    displayName: 'Baran',
    roles: ['user'],
    createdAt: ago(24 * 90),
    age: 'adult',
    ban: 'active',
    bannedUntil: null,
    mutedUntil: null,
    balances: { zer: 1200, gems: 15 },
    ledger: [
      { currency: 'zer', amount: -300, reason: 'shop_purchase', createdAt: ago(30) },
      { currency: 'zer', amount: 500, reason: 'admin_adjustment', createdAt: ago(48) },
    ],
    sessions: [{ deviceName: 'Pixel 8', createdAt: ago(2), expiresAt: ahead(24 * 30) }],
    actions: [{ action: 'mute', reason: 'insults in the beginners group', meta: null, adminId: 'a-1', adminUsername: 'rojda', createdAt: ago(24 * 40) }],
    reportsAgainst: [{ id: 'r-1', targetType: 'group_message', category: 'harassment', status: 'actioned', caseId: 'case-1', createdAt: ago(24 * 41) }],
    reportsFiled: [
      { id: 'r-2', targetType: 'user', category: 'spam', status: 'actioned', caseId: 'case-2', createdAt: ago(24 * 10) },
      { id: 'r-3', targetType: 'dm_message', category: 'hate', status: 'no_violation', caseId: 'case-3', createdAt: ago(24 * 5) },
    ],
    sanctions: [
      sanction({ id: 's-now', kind: 'post_mute', active: true, startsAt: ago(2), endsAt: ahead(70), caseId: 'case-1', createdAt: ago(2) }),
      sanction({ id: 's-old', caseId: null }),
    ],
    appeals: [{ id: 'ap-1', sanctionId: 's-now', caseId: null, text: 'It was a joke.', status: 'open', decisionNote: null, createdAt: ago(1), decidedAt: null }],
    cases: [{ id: 'case-1', status: 'actioned', priority: 2, category: 'harassment', summary: 'Group message reported', createdAt: ago(24 * 41) }],
    linkedAccounts: [{ id: 'u-alt', username: 'baran2', via: 'device', banned: true }],
    chatOffenses: null,
    mutedPermanently: false,
    ...over,
  };
}

const detailRoute = (u: UserDetail): Route => on('GET', `/admin/users/${u.id}`, json(u));
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

function show(hash: string, session: AdminSession, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(me, ...routes);
  renderUi(
    <AuthProvider>
      <SessionProvider value={session}>
        <Users />
      </SessionProvider>
    </AuthProvider>,
  );
  return api;
}

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('the list', () => {
  const rows = {
    users: [
      { id: 'u-1', username: 'rojin', email: 'rojin@example.org', ban: 'temp_banned', muted: false, roles: ['user'], createdAt: ago(3) },
      { id: 'u-2', username: 'dilan', email: 'dilan@example.org', ban: 'active', muted: true, roles: ['user', 'moderator'], createdAt: ago(30) },
      { id: 'u-3', username: 'azad', email: 'azad@example.org', ban: 'active', muted: false, limited: true, roles: ['user'], createdAt: ago(40) },
    ],
    total: 60,
  };

  it('loads itself, with the total, and each person’s standing and roles', async () => {
    const { calls } = show('#/users', MODERATOR, on('GET', /^\/admin\/users\?/, json(rows)));
    expect(await screen.findByText('@rojin')).toBeInTheDocument();
    expect(screen.getByText('60 accounts, newest first.')).toBeInTheDocument();
    const [, first, second, third] = screen.getAllByRole('row');
    expect(within(first!).getByText('Suspended')).toBeInTheDocument();
    expect(within(second!).getByText('Muted')).toBeInTheDocument();
    expect(within(second!).getByText('Moderator')).toBeInTheDocument();
    // a posting mute is not "Active"
    expect(within(third!).getByText('Limited')).toBeInTheDocument();
    expect(within(third!).queryByText('Active')).not.toBeInTheDocument();
    expect(within(first!).getByRole('link', { name: 'Open @rojin' })).toHaveAttribute('href', '#/users/u-1');
    expect(calls.some((c) => c.path === usersPath('', '', 0))).toBe(true);
  });

  it('keeps the search, the filter and the page in the address', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/users', MODERATOR, on('GET', /^\/admin\/users\?/, json(rows)));
    await screen.findByText('@rojin');
    await user.selectOptions(screen.getByLabelText('Show'), 'restricted');
    await waitFor(() => expect(location.hash).toBe('#/users?filter=restricted'));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/users?limit=25&offset=0&filter=restricted')).toBe(true));
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(location.hash).toBe('#/users?filter=restricted&page=2'));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/users?limit=25&offset=25&filter=restricted')).toBe(true));
    await user.type(screen.getByLabelText('Search people'), 'roj');
    await waitFor(() => expect(location.hash).toBe('#/users?q=roj&filter=restricted'));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/users?limit=25&offset=0&q=roj&filter=restricted')).toBe(true));
  });

  it('cuts a pasted search to what the API takes, in the box and in the request', async () => {
    const long = 'x'.repeat(USERS_Q_MAX + 50);
    show(`#/users?q=${long}`, MODERATOR, on('GET', /^\/admin\/users\?/, json(rows)));
    expect(await screen.findByText('@rojin')).toBeInTheDocument();
    expect(screen.getByLabelText('Search people')).toHaveAttribute('maxLength', String(USERS_Q_MAX));
    expect(new URLSearchParams(usersPath(long, '', 0).split('?')[1]).get('q')).toHaveLength(USERS_Q_MAX);
  });

  it('says when nobody matches', async () => {
    show('#/users?q=zzz', MODERATOR, on('GET', /^\/admin\/users\?/, json({ users: [], total: 0 })));
    expect(await screen.findByText(/Nobody matches/)).toBeInTheDocument();
  });

  it('says a failed load failed, not that there is nobody', async () => {
    show('#/users', MODERATOR, on('GET', /^\/admin\/users\?/, failure(500, 'INTERNAL', 'boom')));
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('No accounts yet.')).not.toBeInTheDocument();
  });
});

describe('a person', () => {
  const at = `#/users/${SUBJECT_ID}`;

  it('opens on the profile, with their age, standing and the accounts that share their device', async () => {
    show(at, MODERATOR, detailRoute(person()));
    expect(await screen.findByRole('heading', { name: '@baran' })).toBeInTheDocument();
    expect(screen.getByText('baran@example.org')).toBeInTheDocument();
    expect(screen.getByText('18 or over')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@baran2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Standing/ })).toHaveAttribute('href', `${at}/standing`);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '#/users');
    // a posting mute in force: the header does not call the account "Active"
    expect(screen.getByText('Limited')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('calls an account with nothing in force "Active"', async () => {
    show(at, MODERATOR, detailRoute(person({ sanctions: [] })));
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Limited')).not.toBeInTheDocument();
  });

  it('marks a minor where nobody can miss it', async () => {
    show(at, MODERATOR, detailRoute(person({ age: 'minor' })));
    expect(await screen.findByText('Under 18')).toBeInTheDocument();
    expect(screen.getAllByText('Minor').length).toBeGreaterThan(0);
  });

  it('shows their standing: what is in force, before, their appeals and the cases about them', async () => {
    show(`${at}/standing`, MODERATOR, detailRoute(person()));
    expect(await screen.findByText(/Posting mute until/)).toBeInTheDocument();
    const now = screen.getByRole('region', { name: 'In force now' });
    expect(within(now).getByText('Posting mute')).toBeInTheDocument();
    expect(within(now).getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', '#/moderation/case-1');
    expect(within(screen.getByRole('region', { name: 'Before' })).getByText('Chat mute')).toBeInTheDocument();
    expect(screen.getByText('It was a joke.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Answer it in Appeals' })).toHaveAttribute('href', '#/appeals');
  });

  it('gives a sanction with the rule, the length and the words they read', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/standing`, MODERATOR, detailRoute(person()), on('POST', `/admin/users/${SUBJECT_ID}/sanctions`, json({ sanctions: [], pendingApproval: false }, 201)));
    await user.click(await screen.findByRole('button', { name: 'Sanction…' }));
    const drawer = await screen.findByRole('dialog', { name: 'Sanction @baran' });
    await user.selectOptions(within(drawer).getByLabelText('Action'), 'chat_mute');
    await user.click(within(drawer).getByRole('radio', { name: '3 d' }));
    await user.selectOptions(within(drawer).getByLabelText(/^Rule broken/), 'harassment');
    // the rule's standard words, until someone types their own
    expect(within(drawer).getByLabelText(/What @baran is told/)).toHaveValue('Your messages broke Hevalo’s rule on bullying and harassment.');
    expect(within(drawer).getByLabelText(/^Rule broken/).querySelector('option[value="self_harm"]')).toBeNull();
    await user.type(within(drawer).getByLabelText('Note for moderators'), 'Third time this week.');
    await user.click(within(drawer).getByRole('button', { name: 'Give the chat mute' }));
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/sanctions`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/sanctions`)[0]!.body).toEqual({
      kind: 'chat_mute',
      policy: 'harassment',
      statement: 'Your messages broke Hevalo’s rule on bullying and harassment.',
      durationHours: 72,
      internalNote: 'Third time this week.',
    });
    expect(await screen.findByText('Chat mute given. @baran has been told why.')).toBeInTheDocument();
  });

  it('says what is missing before sending', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/standing`, MODERATOR, detailRoute(person()));
    await user.click(await screen.findByRole('button', { name: 'Sanction…' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Give the warning' }));
    expect(within(drawer).getByText('Choose the rule that was broken.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('bans for life only after the username is typed, and says when a second moderator must approve', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/standing`, MODERATOR, detailRoute(person()), on('POST', `/admin/users/${SUBJECT_ID}/sanctions`, json({ sanctions: [], pendingApproval: true }, 201)));
    await user.click(await screen.findByRole('button', { name: 'Sanction…' }));
    const drawer = await screen.findByRole('dialog');
    await user.selectOptions(within(drawer).getByLabelText('Action'), 'suspension');
    await user.click(within(drawer).getByRole('radio', { name: 'Permanent' }));
    expect(within(drawer).getByLabelText('Action')).toHaveValue('permanent_ban');
    await user.selectOptions(within(drawer).getByLabelText(/^Rule broken/), 'hate');
    await user.click(within(drawer).getByRole('button', { name: 'Ban for good…' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Ban @baran for good?' });
    const go = within(ask).getByRole('button', { name: 'Ban for good' });
    expect(go).toBeDisabled();
    await user.type(within(ask).getByLabelText('Type baran to confirm'), 'baran');
    await user.click(go);
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/sanctions`)).toHaveLength(1));
    const body = posts(calls, `/admin/users/${SUBJECT_ID}/sanctions`)[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ kind: 'permanent_ban', policy: 'hate', confirmUsername: 'baran' });
    expect(body).not.toHaveProperty('durationHours');
    expect(await screen.findByText(/The ban waits for a second moderator/)).toBeInTheDocument();
  });

  it('lifts a sanction with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/standing`, MODERATOR, detailRoute(person()), on('POST', '/admin/sanctions/s-now/revoke', json({ sanction: sanction() })));
    await user.click(await screen.findByRole('button', { name: 'More for the posting mute' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lift it…' }));
    const ask = await screen.findByRole('dialog', { name: 'Lift this posting mute?' });
    await user.type(within(ask).getByLabelText('Why (for the record)'), 'Overturned after a second look.');
    await user.click(within(ask).getByRole('button', { name: 'Lift it' }));
    await waitFor(() => expect(posts(calls, '/admin/sanctions/s-now/revoke')).toHaveLength(1));
    expect(posts(calls, '/admin/sanctions/s-now/revoke')[0]!.body).toEqual({ reason: 'Overturned after a second look.' });
  });

  it('lifts a ban, a mute and the automatic chat mute from the standing', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `${at}/standing`,
      MODERATOR,
      detailRoute(person({ ban: 'perm_banned', mutedUntil: ahead(5), chatOffenses: { count: 4, mutedUntil: null, permanent: true } })),
      on('POST', `/admin/users/${SUBJECT_ID}/unban`, json({ ok: true })),
      on('POST', `/admin/users/${SUBJECT_ID}/unmute`, json({ lifted: 1 })),
      on('POST', `/admin/users/${SUBJECT_ID}/chat-mute/lift`, json({ lifted: true })),
    );
    expect(await screen.findByText(/Banned for good/)).toBeInTheDocument();
    for (const [button, path] of [
      ['Lift the ban…', 'unban'],
      ['Lift the mute…', 'unmute'],
      ['Lift the automatic chat mute…', 'chat-mute/lift'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: button }));
      const ask = await screen.findByRole('dialog');
      await user.type(within(ask).getByLabelText('Why (for the record)'), 'Reviewed.');
      await user.click(within(ask).getByRole('button', { name: 'Lift it' }));
      await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/${path}`)).toHaveLength(1));
      expect(posts(calls, `/admin/users/${SUBJECT_ID}/${path}`)[0]!.body).toEqual({ reason: 'Reviewed.' });
    }
  });

  it('lists the reports about them and the ones they made, with how often theirs led to action', async () => {
    show(`${at}/reports`, MODERATOR, detailRoute(person()));
    expect(await screen.findByText('1 of 2 decided reports led to action.')).toBeInTheDocument();
    const against = screen.getByRole('table', { name: 'Reports about them' });
    expect(within(against).getByText('Bullying or harassment')).toBeInTheDocument();
    expect(within(against).getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', '#/moderation/case-1');
    const filed = screen.getByRole('table', { name: 'Reports they made' });
    expect(within(filed).getByText('No rule broken')).toBeInTheDocument();
  });

  it('signs them out everywhere after a confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/sessions`, MODERATOR, detailRoute(person()), on('POST', `/admin/users/${SUBJECT_ID}/sessions/revoke`, json({ revoked: 1 })));
    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/sessions/revoke`)).toHaveLength(1));
    expect(await screen.findByText('Signed out of 1 session.')).toBeInTheDocument();
  });

  it('shows the wallet and ledger, and lets only a superadmin change a balance', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/wallet`, OWNER, detailRoute(person()), on('POST', `/admin/users/${SUBJECT_ID}/wallet`, json({ ok: true, balance: 700 })));
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('Shop purchase')).toBeInTheDocument();
    expect(screen.getByText('Changed by an admin')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument();
    // more than the API takes at once: refused before anything is asked
    await user.type(screen.getByLabelText(/^Amount/), '2000000');
    await user.type(screen.getByLabelText(/^Reason/), 'Refunded twice by mistake');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('At most 1,000,000 at a time.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Amount/));
    await user.type(screen.getByLabelText(/^Amount/), '-500');
    // said back, with the balance it leaves, before anything moves; Cancel sends nothing
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Take 500 Zêr from @baran?' });
    expect(ask).toHaveTextContent('Their balance goes from 1,200 to 700 Zêr.');
    expect(ask).toHaveTextContent('Reason: Refunded twice by mistake');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/wallet`)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Take 500 Zêr' }));
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/wallet`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/wallet`)[0]!.body).toEqual({ currency: 'zer', amount: -500, reason: 'Refunded twice by mistake' });
    expect(await screen.findByText('Took away 500 Zêr. New balance: 700.')).toBeInTheDocument();
  });

  it('makes a large credit typed again before it is sent', async () => {
    const user = userEvent.setup();
    const { calls } = show(`${at}/wallet`, OWNER, detailRoute(person()), on('POST', `/admin/users/${SUBJECT_ID}/wallet`, json({ ok: true, balance: 6200 })));
    await screen.findByText('1,200');
    await user.type(screen.getByLabelText(/^Amount/), '5000');
    await user.type(screen.getByLabelText(/^Reason/), 'Prize for the spring contest');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Add 5,000 Zêr to @baran?' });
    const yes = within(ask).getByRole('button', { name: 'Add 5,000 Zêr' });
    expect(yes).toBeDisabled();
    await user.type(within(ask).getByLabelText('Type 5000 to confirm'), '500');
    expect(yes).toBeDisabled();
    await user.type(within(ask).getByLabelText('Type 5000 to confirm'), '0');
    await user.click(yes);
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/wallet`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/wallet`)[0]!.body).toEqual({ currency: 'zer', amount: 5000, reason: 'Prize for the spring contest' });
  });

  it('shows a moderator the balances without a way to change them', async () => {
    show(`${at}/wallet`, MODERATOR, detailRoute(person()));
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('lists what they own, and a superadmin takes an item back with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `${at}/items`,
      OWNER,
      detailRoute(person()),
      on('GET', `/admin/users/${SUBJECT_ID}/items`, json({ items: [{ sku: 'bg-sunrise', name: 'Sunrise', category: 'background', quantity: 1, source: 'purchase', equipped: true }] })),
      on('GET', '/admin/shop/items', json({ items: [{ sku: 'icon-deer', name: 'Deer', category: 'icon' }] })),
      on('DELETE', `/admin/users/${SUBJECT_ID}/items/bg-sunrise`, json({ ok: true })),
    );
    expect(await screen.findByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText('In use')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take back' }));
    const ask = await screen.findByRole('dialog', { name: 'Take “Sunrise” back from @baran?' });
    await user.type(within(ask).getByLabelText('Why (for the audit log)'), 'Given by mistake');
    await user.click(within(ask).getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.find((c) => c.method === 'DELETE')!.body).toEqual({ reason: 'Given by mistake' });
  });

  it('gives an item with a reason, saying what is missing rather than greying the button out', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `${at}/items`,
      OWNER,
      detailRoute(person()),
      on('GET', `/admin/users/${SUBJECT_ID}/items`, json({ items: [] })),
      on('GET', '/admin/shop/items', json({ items: [{ sku: 'icon-deer', name: 'Deer', category: 'icon' }] })),
      on('POST', `/admin/users/${SUBJECT_ID}/items`, json({ ok: true })),
    );
    const give = await screen.findByRole('button', { name: 'Give the item' });
    expect(give).toBeEnabled();
    await user.click(give);
    expect(screen.getByText('Choose the item to give.')).toBeInTheDocument();
    expect(screen.getByText('Say why, for the audit log.')).toBeInTheDocument();
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/items`)).toHaveLength(0);
    // each goes as soon as it is put right
    await user.selectOptions(await screen.findByRole('combobox', { name: /^Item/ }), 'icon-deer');
    expect(screen.queryByText('Choose the item to give.')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Reason/), 'Lost in the outage');
    expect(screen.queryByText('Say why, for the audit log.')).not.toBeInTheDocument();
    await user.click(give);
    await waitFor(() => expect(posts(calls, `/admin/users/${SUBJECT_ID}/items`)).toHaveLength(1));
    expect(posts(calls, `/admin/users/${SUBJECT_ID}/items`)[0]!.body).toEqual({ sku: 'icon-deer', reason: 'Lost in the outage' });
  });

  it('shows what admins did to the account, in words', async () => {
    show(`${at}/audit`, MODERATOR, detailRoute(person()));
    expect(await screen.findByText('Chat mute')).toBeInTheDocument();
    expect(screen.getByText('insults in the beginners group')).toBeInTheDocument();
    // the admin by name, not by eight characters of an id
    expect(screen.getByRole('link', { name: '@rojda' })).toHaveAttribute('href', '#/users/a-1');
  });

  it('gives support the page without what moderation knows', async () => {
    // the API leaves the moderation fields out for support
    const plain: Partial<UserDetail> = { ...person() };
    for (const key of ['reportsAgainst', 'reportsFiled', 'sanctions', 'appeals', 'cases', 'linkedAccounts', 'chatOffenses', 'mutedPermanently'] as const) delete plain[key];
    show(at, SUPPORT, detailRoute(plain as UserDetail));
    expect(await screen.findByRole('heading', { name: '@baran' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Standing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Reports/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Wallet & ledger' })).toBeInTheDocument();
  });

  it('says a person who is not there is not found', async () => {
    show(at, MODERATOR, on('GET', `/admin/users/${SUBJECT_ID}`, failure(404, 'NOT_FOUND', 'no such user')));
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});
