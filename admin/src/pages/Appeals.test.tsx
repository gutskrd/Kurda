// @vitest-environment jsdom
/**
 * Appeals and ban approvals, against a fake API: what a moderator reads, and
 * exactly what each answer sends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { AdminAppealItem, PendingApproval } from '@kurda/shared';
import type { ReactNode } from 'react';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { CASE_ID, ME_ID, SUBJECT_ID, sanction } from '../test/moderation';
import { renderUi } from '../test/render';
import { Appeals } from './Appeals';
import { BanApprovals } from './BanApprovals';

const HOUR = 3_600_000;
const me: Route = on('GET', '/me', json({ user: { id: ME_ID, username: 'rojda', roles: ['moderator'] } }));
const posts = (calls: Call[], path: string): Call[] => calls.filter((c) => c.method === 'POST' && c.path === path);

function appeal(over: Partial<AdminAppealItem> = {}): AdminAppealItem {
  return {
    id: 'ap-1',
    sanctionId: 's-1',
    caseId: null,
    text: 'I was joking with my cousin, he is in the group too.',
    status: 'open',
    decisionNote: null,
    createdAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    decidedAt: null,
    user: { id: SUBJECT_ID, username: 'baran' },
    sanction: sanction({ id: 's-1', kind: 'chat_mute', active: true, endsAt: new Date(Date.now() + 48 * HOUR).toISOString(), caseId: CASE_ID, createdBy: 'other-mod' }),
    originalDeciderId: 'other-mod',
    ...over,
  };
}

function show(hash: string, page: ReactNode, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(me, ...routes);
  renderUi(<AuthProvider>{page}</AuthProvider>);
  return api;
}

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('appeals', () => {
  it('lists waiting appeals with the sanction, what the person wrote, and the case', async () => {
    const { calls } = show('#/appeals', <Appeals />, on('GET', '/admin/appeals?status=open', json({ appeals: [appeal()] })));
    expect(await screen.findByText('I was joking with my cousin, he is in the group too.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@baran' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}`);
    expect(screen.getByText('Chat mute')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', `#/moderation/${CASE_ID}`);
    expect(screen.getByRole('tab', { name: 'Waiting' })).toHaveAttribute('aria-selected', 'true');
    expect(calls.some((c) => c.path === '/admin/appeals?status=open')).toBe(true);
  });

  it('reads the tab from the address', async () => {
    const { calls } = show('#/appeals?status=overturned', <Appeals />, on('GET', /^\/admin\/appeals/, json({ appeals: [] })));
    expect(await screen.findByText('No appeals here')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/admin/appeals?status=overturned')).toBe(true);
    expect(screen.getByRole('tab', { name: 'Overturned' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says when nothing is waiting', async () => {
    show('#/appeals', <Appeals />, on('GET', /^\/admin\/appeals/, json({ appeals: [] })));
    expect(await screen.findByText('No appeal is waiting')).toBeInTheDocument();
  });

  it('shows a load failure as one, not as an empty list', async () => {
    show('#/appeals', <Appeals />, on('GET', /^\/admin\/appeals/, failure(500, 'INTERNAL', 'boom')));
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('No appeal is waiting')).not.toBeInTheDocument();
  });

  it('overturns with an answer the person reads', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/appeals',
      <Appeals />,
      on('GET', /^\/admin\/appeals/, json({ appeals: [appeal()] })),
      on('POST', '/admin/appeals/ap-1/decide', json({ appeal: { ...appeal(), status: 'overturned' } })),
    );
    await user.click(await screen.findByRole('button', { name: 'Answer' }));
    const drawer = await screen.findByRole('dialog', { name: 'Answer @baran' });
    const send = within(drawer).getByRole('button', { name: 'Send the answer' });
    // nothing to read yet: it cannot be sent
    expect(send).toBeDisabled();
    await user.click(within(drawer).getByRole('radio', { name: /Overturn it/ }));
    await user.type(within(drawer).getByLabelText(/What @baran reads/), 'We looked again: it was a joke between family. The mute is lifted.');
    await user.click(send);
    await waitFor(() => expect(posts(calls, '/admin/appeals/ap-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/appeals/ap-1/decide')[0]!.body).toEqual({
      outcome: 'overturned',
      note: 'We looked again: it was a joke between family. The mute is lifted.',
    });
    expect(await screen.findByText('Overturned. They have been told.')).toBeInTheDocument();
  });

  it('changes a sanction to a lighter one, never to a ban', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/appeals',
      <Appeals />,
      on('GET', /^\/admin\/appeals/, json({ appeals: [appeal({ sanction: sanction({ id: 's-1', kind: 'suspension', policy: 'harassment', active: true }) })] })),
      on('POST', '/admin/appeals/ap-1/decide', json({ appeal: appeal({ status: 'modified' }) })),
    );
    await user.click(await screen.findByRole('button', { name: 'Answer' }));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('radio', { name: /Change it/ }));
    const kinds = within(within(drawer).getByLabelText('Action')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(kinds).not.toContain('permanent_ban');
    await user.selectOptions(within(drawer).getByLabelText('Action'), 'chat_mute');
    await user.click(within(drawer).getByRole('radio', { name: '3 d' }));
    // the standard words follow the original rule
    expect(within(drawer).getByLabelText(/What @baran is told/)).toHaveValue('Your messages broke Hevalo’s rule on bullying and harassment.');
    await user.type(within(drawer).getByLabelText(/What @baran reads/), 'A suspension was too much. It is now a 3-day chat mute.');
    await user.click(within(drawer).getByRole('button', { name: 'Send the answer' }));
    await waitFor(() => expect(posts(calls, '/admin/appeals/ap-1/decide')).toHaveLength(1));
    expect(posts(calls, '/admin/appeals/ap-1/decide')[0]!.body).toEqual({
      outcome: 'modified',
      note: 'A suspension was too much. It is now a 3-day chat mute.',
      modifiedSanction: { kind: 'chat_mute', durationHours: 72, statement: 'Your messages broke Hevalo’s rule on bullying and harassment.' },
    });
  });

  it('warns the moderator who made the decision, and shows the server’s refusal in the form', async () => {
    const user = userEvent.setup();
    show(
      '#/appeals',
      <Appeals />,
      on('GET', /^\/admin\/appeals/, json({ appeals: [appeal({ originalDeciderId: ME_ID })] })),
      on('POST', '/admin/appeals/ap-1/decide', failure(403, 'DIFFERENT_ADMIN_REQUIRED', 'another admin has to review your own decision')),
    );
    expect(await screen.findByText('You made this decision')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    const drawer = await screen.findByRole('dialog');
    await user.type(within(drawer).getByLabelText(/What @baran reads/), 'It stands.');
    await user.click(within(drawer).getByRole('button', { name: 'Send the answer' }));
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('Another admin has to review your own decision.');
  });

  it('offers no "change it" for a report’s appeal, which has no sanction', async () => {
    const user = userEvent.setup();
    show('#/appeals', <Appeals />, on('GET', /^\/admin\/appeals/, json({ appeals: [appeal({ sanctionId: null, sanction: null, caseId: CASE_ID })] })));
    expect(await screen.findByText(/a report they made that was closed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).queryByRole('radio', { name: /Change it/ })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('radio', { name: /Overturn it/ })).toHaveAccessibleName(/The case opens again/);
  });
});

function approval(over: Partial<PendingApproval> = {}): PendingApproval {
  return {
    sanction: sanction({ id: 'ban-1', kind: 'permanent_ban', active: false, pendingApproval: true, endsAt: null, caseId: CASE_ID, createdBy: 'other-mod', createdAt: new Date(Date.now() - 2 * HOUR).toISOString() }),
    user: { id: SUBJECT_ID, username: 'baran' },
    caseId: CASE_ID,
    expiresAt: new Date(Date.now() + 70 * HOUR).toISOString(),
    inForce: false,
    ...over,
  };
}

describe('ban approvals', () => {
  it('lists bans waiting for a second moderator, with the time left and the case', async () => {
    show('#/ban-approvals', <BanApprovals />, on('GET', '/admin/moderation/approvals', json({ approvals: [approval()] })));
    expect(await screen.findByRole('link', { name: '@baran' })).toBeInTheDocument();
    expect(screen.getByText(/^Lapses in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', `#/moderation/${CASE_ID}`);
  });

  it('approves after a confirmation', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/ban-approvals',
      <BanApprovals />,
      on('GET', '/admin/moderation/approvals', json({ approvals: [approval()] })),
      on('POST', '/admin/moderation/approvals/ban-1/approve', json({ sanction: approval().sanction })),
    );
    await user.click(await screen.findByRole('button', { name: 'Approve the ban' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Ban @baran for good?' });
    await user.click(within(ask).getByRole('button', { name: 'Ban for good' }));
    await waitFor(() => expect(posts(calls, '/admin/moderation/approvals/ban-1/approve')).toHaveLength(1));
    expect(await screen.findByText('@baran is banned for good.')).toBeInTheDocument();
  });

  it('turns a ban down with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/ban-approvals',
      <BanApprovals />,
      on('GET', '/admin/moderation/approvals', json({ approvals: [approval()] })),
      on('POST', '/admin/moderation/approvals/ban-1/reject', json({ sanction: approval().sanction })),
    );
    await user.click(await screen.findByRole('button', { name: 'Turn it down' }));
    const ask = await screen.findByRole('dialog', { name: 'Turn this ban down?' });
    await user.type(within(ask).getByLabelText('Why (for the record)'), 'A first offence; a suspension is enough.');
    await user.click(within(ask).getByRole('button', { name: 'Turn it down' }));
    await waitFor(() => expect(posts(calls, '/admin/moderation/approvals/ban-1/reject')).toHaveLength(1));
    expect(posts(calls, '/admin/moderation/approvals/ban-1/reject')[0]!.body).toEqual({ reason: 'A first offence; a suspension is enough.' });
  });

  it('lets the moderator who asked withdraw it, never approve it', async () => {
    show('#/ban-approvals', <BanApprovals />, on('GET', '/admin/moderation/approvals', json({ approvals: [approval({ sanction: { ...approval().sanction, createdBy: ME_ID } })] })));
    expect(await screen.findByText('You asked for this ban')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve the ban' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
  });

  it('confirms a zero-tolerance ban after the fact', async () => {
    show('#/ban-approvals', <BanApprovals />, on('GET', '/admin/moderation/approvals', json({ approvals: [approval({ inForce: true })] })));
    expect(await screen.findByText('In force · zero tolerance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm the ban' })).toBeInTheDocument();
  });

  it('says when nothing waits', async () => {
    show('#/ban-approvals', <BanApprovals />, on('GET', '/admin/moderation/approvals', json({ approvals: [] })));
    expect(await screen.findByText('No ban is waiting')).toBeInTheDocument();
  });
});
