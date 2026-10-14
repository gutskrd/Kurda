// @vitest-environment jsdom
/**
 * The moderation queue and the case view, against a fake API: what a
 * moderator sees, and exactly what each action sends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { CaseDetail, ModerationSummary } from '@kurda/shared';
import { setToken } from '../api';
import { AuthProvider } from '../auth';
import { rememberQueueOrder } from '../moderation';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { CASE_ID, ME_ID, REPORTER_A, SUBJECT_ID, caseDetail, preview, queueItem } from '../test/moderation';
import { renderUi } from '../test/render';
import { Moderation } from './Moderation';

const posts = (calls: Call[], path: string | RegExp): Call[] =>
  calls.filter((c) => c.method === 'POST' && (typeof path === 'string' ? c.path === path : path.test(c.path)));
const decisions = (calls: Call[]): Call[] => posts(calls, `/admin/moderation/cases/${CASE_ID}/decide`);
const applied = (calls: Call[]): Call[] => decisions(calls).filter((c) => !(c.body as { preview?: boolean }).preview);

const summary: ModerationSummary = {
  open: 3,
  byPriority: { 0: 1, 1: 0, 2: 2, 3: 0 },
  byStatus: { open: 3 },
  oldestOpenAgeSeconds: 5 * 3600,
  slaBreaches: 1,
  slaBreachesByPriority: { 0: 1, 1: 0, 2: 0, 3: 0 },
  appealsWaiting: 2,
  pendingApprovals: 1,
  openEscalations: 0,
};

const me: Route = on('GET', '/me', json({ user: { id: ME_ID, username: 'rojda' } }));

function show(hash: string, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  location.hash = hash;
  const api = fakeApi(me, on('GET', '/admin/moderation/summary', json(summary)), ...routes);
  renderUi(
    <AuthProvider>
      <Moderation />
    </AuthProvider>,
  );
  return api;
}

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('the queue', () => {
  it('lists open cases, most urgent first, with who, how many reports and how long they have', async () => {
    const { calls } = show(
      '#/moderation',
      on('GET', /^\/admin\/moderation\/queue/, json({ cases: [queueItem({ priority: 0, category: 'child_safety', slaBreached: true, slaDueAt: new Date(Date.now() - 3_600_000).toISOString() }), queueItem({ id: 'c-2' })], nextCursor: null, added: 0 })),
    );
    await screen.findByText('Child safety');
    const rows = screen.getAllByRole('row');
    const first = rows[1]!;
    expect(within(first).getByText('Urgent')).toBeInTheDocument();
    expect(within(first).getByText('Child safety')).toBeInTheDocument();
    expect(within(first).getByText('Minor involved')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: '@baran' })).toHaveAttribute('href', `#/users/${SUBJECT_ID}`);
    expect(within(first).getByText(/^Overdue by/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText('2 reports')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('by 2 people')).toBeInTheDocument();
    expect(calls.find((c) => c.path.startsWith('/admin/moderation/queue'))!.path).toBe('/admin/moderation/queue?status=open&limit=50');
    // the counts by priority, and what else waits
    expect(screen.getByRole('button', { name: /Urgent\s*1\s*1 overdue/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2 appeals waiting' })).toHaveAttribute('href', '#/appeals');
  });

  it('says a failed load failed — never that there is nothing to review', async () => {
    show('#/moderation', on('GET', /^\/admin\/moderation\/queue/, failure(500, 'INTERNAL', 'boom')));
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to decide')).not.toBeInTheDocument();
  });

  it('keeps its filters in the address, and asks the API for them', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/moderation', on('GET', /^\/admin\/moderation\/queue/, json({ cases: [], nextCursor: null })));
    expect(await screen.findByText('Nothing to decide')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Source'), 'bots');
    await waitFor(() => expect(location.hash).toBe('#/moderation?source=bots'));
    await waitFor(() => expect(calls.some((c) => c.path === '/admin/moderation/queue?source=bots&status=open&limit=50')).toBe(true));
    expect(await screen.findByText('No case matches these filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location.hash).toBe('#/moderation'));
  });

  it('pages on from the cursor the server gave', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/moderation',
      on('GET', /cursor=next-1/, json({ cases: [queueItem({ id: 'c-3', summary: 'The third one' })], nextCursor: null })),
      on('GET', '/admin/moderation/queue?status=open&limit=50', json({ cases: [queueItem()], nextCursor: 'next-1' })),
    );
    await user.click(await screen.findByRole('button', { name: 'Show more cases' }));
    expect(await screen.findByText('The third one')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/admin/moderation/queue?status=open&limit=50&cursor=next-1')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Show more cases' })).not.toBeInTheDocument();
  });

  it('moves with j and k, and claims with c', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      '#/moderation',
      on('GET', /^\/admin\/moderation\/queue/, json({ cases: [queueItem(), queueItem({ id: 'c-2', category: 'spam' })], nextCursor: null })),
      on('POST', /\/claim$/, json({ claimed: true, leaseUntil: new Date().toISOString() })),
    );
    await screen.findAllByText('Bullying or harassment');
    await user.keyboard('j');
    expect(document.activeElement).toHaveAttribute('href', `#/moderation/${CASE_ID}`);
    await user.keyboard('j');
    expect(document.activeElement).toHaveAttribute('href', '#/moderation/c-2');
    await user.keyboard('k');
    expect(document.activeElement).toHaveAttribute('href', `#/moderation/${CASE_ID}`);
    await user.keyboard('c');
    await waitFor(() => expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/claim`)).toHaveLength(1));
    expect(await screen.findByText(/Claimed for 15 minutes/)).toBeInTheDocument();
  });

  it('filters by priority from the counts', async () => {
    const user = userEvent.setup();
    show('#/moderation', on('GET', /^\/admin\/moderation\/queue/, json({ cases: [], nextCursor: null })));
    await user.click(await screen.findByRole('button', { name: /^Urgent/ }));
    await waitFor(() => expect(location.hash).toBe('#/moderation?priority=0'));
    expect(screen.getByRole('button', { name: /^Urgent/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('a case', () => {
  const at = `#/moderation/${CASE_ID}`;
  const detailRoute = (d: CaseDetail): Route => on('GET', `/admin/moderation/cases/${CASE_ID}`, json(d));
  const previewRoute = (result = preview()): Route => on('POST', `/admin/moderation/cases/${CASE_ID}/decide`, (c) => json((c.body as { preview?: boolean }).preview ? result : { ...result, preview: false }));

  it('shows the content in its conversation, the reporters and how far to trust them, and the reported person’s past', async () => {
    show(at, detailRoute(caseDetail()));
    expect(await screen.findByRole('heading', { name: 'Bullying or harassment' })).toBeInTheDocument();
    // the second report's capture is folded away below; the first is the content
    const reported = screen.getAllByText('Reported message')[0]!.closest('li')!;
    expect(reported).toHaveAttribute('aria-current', 'true');
    expect(within(reported).getByText('nobody wants you here')).toBeInTheDocument();
    expect(screen.getByText('Kurmancî beginners')).toBeInTheDocument();
    expect(screen.getByText('He keeps saying this to new people.')).toBeInTheDocument();
    expect(screen.getByText(/80% of their decided reports led to action/)).toBeInTheDocument();
    expect(screen.getByText(/None of their reports has been decided yet/)).toBeInTheDocument();
    // the child reporter is marked as one
    const zana = screen.getAllByRole('link', { name: '@zana' })[0]!.closest('.user-link')!;
    expect(within(zana as HTMLElement).getByText('Minor')).toBeInTheDocument();
    expect(screen.getByText('1 earlier sanction')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@baran2' })).toBeInTheDocument();
    expect(screen.getByText('same device')).toBeInTheDocument();
    expect(screen.getByText('Claimed it')).toBeInTheDocument();
  });

  it('shows a report’s own capture once, not again as automatic-check facts', async () => {
    const full = caseDetail();
    const capture = full.reports[0]!.evidence as Record<string, unknown>;
    show(at, detailRoute({ ...full, case: { ...full.case, evidence: { ...capture, extra: { kind: 'text' } } } }));
    expect(await screen.findByRole('heading', { name: 'Bullying or harassment' })).toBeInTheDocument();
    expect(screen.queryByText('What the automatic check recorded')).not.toBeInTheDocument();
    expect(screen.queryByText('Context 1 › Id')).not.toBeInTheDocument();
  });

  it('blurs pictures until asked, and asks first when a child may be at risk', async () => {
    const user = userEvent.setup();
    const d = caseDetail({
      case: { category: 'child_safety', targetType: 'image_post' },
      media: [{ key: 'posts/a.webp', url: 'https://cdn.test/a.webp?sig=1', contentType: 'image/webp', quarantine: null }],
    });
    show(at, detailRoute(d));
    const img = (await screen.findByRole('button', { name: 'Show picture' })).closest('figure')!.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    await user.click(screen.getByRole('button', { name: 'Show picture' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Show this picture?' });
    expect(ask).toHaveTextContent('Never download, forward or screenshot it');
    await user.click(within(ask).getByRole('button', { name: 'Show it' }));
    expect(img.closest('figure')).toHaveClass('is-shown');
    await user.click(screen.getByRole('button', { name: 'Blur again' }));
    expect(img.closest('figure')).not.toHaveClass('is-shown');
  });

  it('claims the case, and locks the decision while another moderator holds it', async () => {
    const user = userEvent.setup();
    const { calls, use } = show(at, detailRoute(caseDetail()), on('POST', /\/claim$/, json({ claimed: true, leaseUntil: new Date(Date.now() + 900_000).toISOString() })));
    await user.click(await screen.findByRole('button', { name: 'Claim' }));
    expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/claim`)).toHaveLength(1);

    use(detailRoute(caseDetail({ case: { status: 'in_review', claimedBy: { id: 'other', username: 'dilan' }, leaseUntil: new Date(Date.now() + 600_000).toISOString() } })));
    await user.click(screen.getByRole('button', { name: 'Claim' }));
    expect(await screen.findByText(/@dilan is working on it until/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply decision' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sanction this person' })).not.toBeInTheDocument();
  });

  it('puts a decision together, shows the exact messages, and sends exactly that', async () => {
    const user = userEvent.setup();
    const { calls } = show(at, detailRoute(caseDetail()), previewRoute(), on('POST', /\/claim$/, json({ claimed: true })));
    await user.click(await screen.findByRole('button', { name: 'Sanction this person' }));
    // the case's own rule is chosen; the moderator picks a chat mute for 7 days
    expect(screen.getByLabelText(/^Rule broken/)).toHaveValue('harassment');
    await user.selectOptions(screen.getByLabelText('Action'), 'chat_mute');
    await user.click(screen.getByRole('radio', { name: '7 d' }));
    expect(screen.getByLabelText('What @baran is told')).toHaveValue('Your messages broke Hevalo’s rule on bullying and harassment.');
    await user.click(screen.getByLabelText('Remove the content'));

    // the server's own preview of what people will read
    expect(await screen.findByText("You can't send messages for a while", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText('To The reporters')).toBeInTheDocument();
    await waitFor(() =>
      expect(decisions(calls).at(-1)!.body).toMatchObject({ preview: true, outcome: 'actioned', policy: 'harassment', removeContent: true, notifyReporters: true }),
    );

    await user.click(screen.getByRole('button', { name: 'Apply decision' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Apply this decision?' });
    expect(confirm).toHaveTextContent('Chat mute, 7 days — @baran');
    expect(confirm).toHaveTextContent('Remove the content');
    await user.click(within(confirm).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applied(calls)).toHaveLength(1));
    expect(applied(calls)[0]!.body).toEqual({
      outcome: 'actioned',
      policy: 'harassment',
      actions: [{ target: 'subject', kind: 'chat_mute', durationHours: 168, statement: 'Your messages broke Hevalo’s rule on bullying and harassment.' }],
      removeContent: true,
      notifyReporters: true,
    });
    expect(await screen.findByText('Decision applied. Everyone it concerns has been told.')).toBeInTheDocument();
  });

  it('closes a false report as no violation and warns the reporter who made it', async () => {
    const user = userEvent.setup();
    const { calls } = show(at, detailRoute(caseDetail()), previewRoute(preview({ messages: [] })));
    const rojin = (await screen.findByText('He keeps saying this to new people.')).closest('li')!;
    await user.click(within(rojin).getByRole('button', { name: 'Sanction this reporter' }));
    expect(within(rojin).getByRole('button', { name: 'In the decision' })).toBeDisabled();
    await user.click(screen.getByLabelText(/No rule broken/));
    expect((screen.getByLabelText('What @rojin is told') as HTMLTextAreaElement).value).toMatch(/report button is for real problems/);
    await screen.findByText('Nobody is sent anything.', {}, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: 'Close: no rule broken' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Close the case' }));
    await waitFor(() => expect(applied(calls)).toHaveLength(1));
    expect(applied(calls)[0]!.body).toMatchObject({
      outcome: 'no_violation',
      removeContent: false,
      actions: [{ target: `reporter:${REPORTER_A}`, kind: 'warning' }],
    });
  });

  it('asks the only moderator to type the username before a permanent ban', async () => {
    const user = userEvent.setup();
    const ban = preview({ permanentBans: [{ target: 'subject', userId: SUBJECT_ID, username: 'baran', mode: 'single', usernameRequired: true }] });
    const { calls } = show(at, detailRoute(caseDetail()), previewRoute(ban));
    await user.click(await screen.findByRole('button', { name: 'Sanction this person' }));
    await user.selectOptions(screen.getByLabelText('Action'), 'suspension');
    // "Permanent" on a suspension is a permanent ban
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    expect(screen.getByLabelText('Action')).toHaveValue('permanent_ban');
    expect(await screen.findByText(/You are the only moderator/, {}, { timeout: 2000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply decision' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Ban @baran for good?' });
    const go = within(ask).getByRole('button', { name: 'Ban for good' });
    expect(go).toBeDisabled();
    await user.type(within(ask).getByLabelText('Type baran to confirm'), 'baran');
    await user.click(go);
    await waitFor(() => expect(applied(calls)).toHaveLength(1));
    expect(applied(calls)[0]!.body).toMatchObject({ confirmUsername: 'baran', actions: [{ target: 'subject', kind: 'permanent_ban' }] });
    expect((applied(calls)[0]!.body as { actions: Array<Record<string, unknown>> }).actions[0]).not.toHaveProperty('durationHours');
  });

  it('says a permanent ban waits for a second admin when there is one', async () => {
    const user = userEvent.setup();
    const ban = preview({ permanentBans: [{ target: 'subject', userId: SUBJECT_ID, username: 'baran', mode: 'second_approval', usernameRequired: false }] });
    show(at, detailRoute(caseDetail()), on('POST', `/admin/moderation/cases/${CASE_ID}/decide`, (c) => json((c.body as { preview?: boolean }).preview ? ban : { ...ban, preview: false, status: 'needs_second_approval' })));
    await user.click(await screen.findByRole('button', { name: 'Sanction this person' }));
    await user.selectOptions(screen.getByLabelText('Action'), 'permanent_ban');
    await screen.findByText(/Another moderator has to approve a permanent ban within 72 hours/, {}, { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: 'Apply decision' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Ban @baran for good?' });
    expect(within(ask).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(ask).getByRole('button', { name: 'Ask for the ban' }));
    expect(await screen.findByText(/The ban waits for a second admin/)).toBeInTheDocument();
  });

  it('helps someone who may hurt themselves instead of sanctioning them', async () => {
    const user = userEvent.setup();
    const { calls } = show(at, detailRoute(caseDetail({ case: { category: 'self_harm', priority: 0 } })), previewRoute(preview({ messages: [] })));
    // the person's panel offers help, not a sanction
    expect(await screen.findByRole('button', { name: 'Send a caring message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sanction this person' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Add a caring message' }));
    expect(screen.getByLabelText('Action')).toHaveValue('caring_message');
    await user.selectOptions(screen.getByLabelText('Action'), 'chat_mute');
    expect(screen.getByText('Someone who may hurt themselves gets a caring message, not a sanction.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply decision' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Action'), 'caring_message');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply decision' })).toBeEnabled(), { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: 'Apply decision' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applied(calls)).toHaveLength(1));
    expect(applied(calls)[0]!.body).toMatchObject({ policy: 'self_harm', actions: [{ target: 'subject', kind: 'caring_message' }] });
  });

  it('runs the CSAM action from its playbook, with the hotlines to file with', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      at,
      detailRoute(caseDetail()),
      on('POST', `/admin/moderation/cases/${CASE_ID}/csam`, json({ status: 'escalated', escalation: {}, sanctions: [{}] })),
    );
    await user.click(await screen.findByRole('button', { name: 'Child abuse material…' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Child sexual abuse material' });
    expect(dialog).toHaveTextContent('Don’t download, forward or screenshot it.');
    expect(within(dialog).getByRole('link', { name: /NCMEC CyberTipline/ })).toHaveAttribute('target', '_blank');
    await user.type(within(dialog).getByLabelText(/Note for the case record/), 'seen in the group chat');
    await user.click(within(dialog).getByRole('button', { name: 'Hide, preserve and ban' }));
    await waitFor(() => expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/csam`)).toHaveLength(1));
    expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/csam`)[0]!.body).toEqual({ note: 'seen in the group chat' });
    expect(await screen.findByText(/Hidden, preserved and banned/)).toBeInTheDocument();
  });

  it('shows a copyright notice that came with the case, whatever its fields', async () => {
    const d = { ...caseDetail({ case: { category: 'copyright' as never } }), notice: { claimantName: 'Rojda Ahmed', work: 'Stranên min', goodFaith: true } };
    show(at, detailRoute(d as CaseDetail));
    expect(await screen.findByRole('heading', { name: 'Copyright notice' })).toBeInTheDocument();
    expect(screen.getByText('Claimant name')).toBeInTheDocument();
    expect(screen.getByText('Stranên min')).toBeInTheDocument();
    expect(screen.getByText('Good faith').nextElementSibling).toHaveTextContent('Yes');
    expect(screen.getByRole('heading', { name: 'Copyright' })).toBeInTheDocument();
  });

  it('keeps notes, and goes to the next case with j', async () => {
    const user = userEvent.setup();
    rememberQueueOrder(['c-0', CASE_ID, 'c-2']);
    const { calls } = show(
      at,
      detailRoute(caseDetail()),
      on('POST', `/admin/moderation/cases/${CASE_ID}/note`, json({ id: 'n-1', authorId: ME_ID, authorUsername: 'rojda', text: 'Asked dilan to check the group.', createdAt: new Date().toISOString() }, 201)),
    );
    await user.type(await screen.findByLabelText('Add a note'), 'Asked dilan to check the group.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Asked dilan to check the group.', { selector: 'p' })).toBeInTheDocument();
    expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/note`)[0]!.body).toEqual({ text: 'Asked dilan to check the group.' });
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('j');
    expect(location.hash).toBe('#/moderation/c-2');
  });

  it('reopens a decided case with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      at,
      detailRoute(caseDetail({ case: { status: 'actioned', policy: 'harassment', resolvedAt: new Date().toISOString(), resolutionNote: 'Muted for a week' } })),
      on('POST', `/admin/moderation/cases/${CASE_ID}/reopen`, json({ reopened: true })),
    );
    expect(await screen.findByText('Muted for a week')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen for a second look' }));
    await user.type(await screen.findByLabelText('Why it needs a second look'), 'The reporter sent more screenshots');
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/reopen`)).toHaveLength(1));
    expect(posts(calls, `/admin/moderation/cases/${CASE_ID}/reopen`)[0]!.body).toEqual({ reason: 'The reporter sent more screenshots' });
  });

  it('on a phone, puts the decision in a sheet behind a bar at the bottom', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    show(at, detailRoute(caseDetail()), previewRoute());
    await screen.findByRole('heading', { name: 'Bullying or harassment' });
    expect(screen.queryByRole('button', { name: 'Apply decision' })).not.toBeInTheDocument();
    expect(screen.getByText('Nothing decided yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sanction this person' }));
    const sheet = await screen.findByRole('dialog', { name: 'Decision' });
    expect(within(sheet).getByLabelText('Action')).toHaveValue('warning');
  });

  it('tells a moderator who is part of the case that someone else handles it', async () => {
    show(at, on('GET', `/admin/moderation/cases/${CASE_ID}`, failure(403, 'CONFLICT_OF_INTEREST', 'you are part of this case; another moderator must handle it')));
    expect(await screen.findByText('Another moderator has to do this')).toBeInTheDocument();
    expect(screen.queryByText('Your role can’t open this')).not.toBeInTheDocument();
  });
});
