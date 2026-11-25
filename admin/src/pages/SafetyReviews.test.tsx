// @vitest-environment jsdom
/**
 * Safety reviews against a fake API: a superadmin opens one for a named account with a reason and a note, confirmed
 * before anything is sent; a moderator sees the reviews open for them and nothing to open one with; the reader sees
 * the conversations before any message, then one conversation at a time, the account's own messages marked; and a
 * review that ended or is someone else's says so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type { ReviewConversationPage, ReviewOpened, SafetyReview } from '@kurda/shared';
import { setToken } from '../api';
import { parseRoute } from '../navigation';
import { SessionProvider, type AdminSession } from '../session';
import { failure, fakeApi, json, on, type Call, type Route } from '../test/fetch';
import { ME_ID, SUBJECT_ID } from '../test/moderation';
import { renderUi } from '../test/render';
import { SafetyReviews } from './SafetyReviews';

const HOUR = 3_600_000;
const ago = (h: number): string => new Date(Date.now() - h * HOUR).toISOString();
const ahead = (h: number): string => new Date(Date.now() + h * HOUR).toISOString();
const REVIEW_ID = '9e2f0000-0000-4000-8000-000000000001';
const THREAD_ID = '9e2f0000-0000-4000-8000-0000000000a1';
const FRIEND_ID = '9e2f0000-0000-4000-8000-0000000000b1';
const MOD_ID = '9e2f0000-0000-4000-8000-0000000000c1';

const OWNER: AdminSession = { roles: ['superadmin'], staffRoles: ['superadmin'], capabilities: ['moderation.act', 'users.view'], needsEnrollment: false, needsVerification: false };
const MODERATOR: AdminSession = { roles: ['moderator'], staffRoles: ['moderator'], capabilities: ['moderation.act', 'users.view'], needsEnrollment: false, needsVerification: false };
const NOTE = 'A report says an adult asks a teen in letters to meet in secret.';

function review(over: Partial<SafetyReview> = {}): SafetyReview {
  return {
    id: REVIEW_ID,
    subject: { id: SUBJECT_ID, username: 'baran' },
    reviewer: { id: ME_ID, username: 'rojda' },
    grantedBy: { id: ME_ID, username: 'rojda' },
    reason: 'child_safety',
    note: NOTE,
    caseId: null,
    grantedAt: ago(1),
    expiresAt: ahead(23),
    endedAt: null,
    endedBy: null,
    open: true,
    yours: true,
    ...over,
  };
}

const opened: ReviewOpened = {
  review: review(),
  conversations: [
    { kind: 'letters', id: THREAD_ID, with: { id: FRIEND_ID, username: 'dilan' }, title: null, messages: 2, firstAt: ago(30), lastAt: ago(2) },
    { kind: 'direct', id: FRIEND_ID, with: { id: FRIEND_ID, username: 'dilan' }, title: null, messages: 51, firstAt: ago(40), lastAt: ago(1) },
  ],
};

const letters: ReviewConversationPage = {
  conversation: opened.conversations[0]!,
  messages: [
    { id: 'l-1', sender: { id: SUBJECT_ID, username: 'baran' }, fromSubject: true, kind: 'letter', body: 'Do not tell your parents about me.', createdAt: ago(30), status: 'delivered', decor: null },
    {
      id: 'l-2',
      sender: { id: FRIEND_ID, username: 'dilan' },
      fromSubject: false,
      kind: 'letter',
      body: 'Why not?',
      createdAt: ago(2),
      status: 'delivered',
      decor: { paper: { style: 'lined', tone: 'cream', ink: 'navy' }, strokes: [{ tool: 'pen', color: 'navy', width: 6, points: [100, 100, 200, 200] }], notes: [{ text: 'Spas', x: 500, y: 300, size: 'm', color: 'navy', turn: 0 }] },
    },
  ],
  olderCursor: null,
};

const direct = (n: number, cursor: string | null): ReviewConversationPage => ({
  conversation: opened.conversations[1]!,
  messages: [{ id: `d-${n}`, sender: { id: FRIEND_ID, username: 'dilan' }, fromSubject: false, kind: 'text', body: `message ${n}`, createdAt: ago(n), status: null }],
  olderCursor: cursor,
});

function show(hash: string, session: AdminSession, ...routes: Route[]): ReturnType<typeof fakeApi> {
  setToken('tok');
  const api = fakeApi(...routes);
  renderUi(
    <SessionProvider value={session}>
      <SafetyReviews route={parseRoute(hash)} />
    </SessionProvider>,
  );
  return api;
}

const posts = (calls: Call[]): Call[] => calls.filter((c) => c.method === 'POST');

afterEach(() => {
  setToken(null);
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('opening a safety review', () => {
  const routes = (): Route[] => [
    on('GET', '/admin/safety-reviews', json({ reviews: [] })),
    on('GET', '/admin/me', json({ userId: ME_ID })),
    on(
      'GET',
      '/admin/users?filter=staff&limit=100',
      json({ users: [{ id: ME_ID, username: 'rojda', roles: ['superadmin'] }, { id: MOD_ID, username: 'rojin', roles: ['moderator'] }, { id: 'sup', username: 'azad', roles: ['support'] }] }),
    ),
    on('GET', '/admin/users?q=baran&limit=25', json({ users: [{ id: 'u-x', username: 'baran2' }, { id: SUBJECT_ID, username: 'baran', kind: 'person' }] })),
    on('POST', `/admin/users/${SUBJECT_ID}/safety-reviews`, json({ review: review({ reviewer: { id: MOD_ID, username: 'rojin' }, yours: false }) }, 201)),
  ];

  it('says what is missing before anything is sent', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/safety-reviews', OWNER, ...routes());
    await user.click(await screen.findByRole('button', { name: 'Open the review…' }));
    expect(screen.getByText('Find the account first.')).toBeInTheDocument();
    expect(screen.getByText('Choose the reason.')).toBeInTheDocument();
    expect(screen.getByText('Say why in at least 20 characters.')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('opens one named account for a moderator to read, with the reason and note, once confirmed', async () => {
    const user = userEvent.setup();
    const { calls } = show('#/safety-reviews', OWNER, ...routes());
    await user.type(await screen.findByLabelText('Username'), '@baran');
    await user.click(screen.getByRole('button', { name: 'Find the account' }));
    expect(await screen.findByRole('link', { name: '@baran' })).toBeInTheDocument();
    // only those who moderate can read, and never the one granting twice over
    const reader = screen.getByLabelText('Who reads') as HTMLSelectElement;
    await waitFor(() => expect([...reader.options].map((o) => o.textContent)).toEqual(['Me', '@rojin']));
    await user.selectOptions(reader, MOD_ID);
    await user.click(screen.getByRole('radio', { name: /Child safety/ }));
    await user.type(screen.getByLabelText(/Why this account/), NOTE);
    await user.click(screen.getByRole('button', { name: 'Open the review…' }));

    const ask = await screen.findByRole('alertdialog', { name: 'Open @baran’s letters and private chats?' });
    expect(ask).toHaveTextContent('@rojin can read them, read-only, until');
    expect(ask).toHaveTextContent('@baran is not told');
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(posts(calls)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Open the review…' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Open the review' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]).toEqual({ method: 'POST', path: `/admin/users/${SUBJECT_ID}/safety-reviews`, body: { reason: 'child_safety', note: NOTE, reviewerId: MOD_ID } });
  });

  it('starts from the person’s page with the account already named, and asks for the case when a report needs context', async () => {
    const user = userEvent.setup();
    const { calls } = show(`#/safety-reviews?user=${SUBJECT_ID}`, OWNER, ...routes(), on('GET', `/admin/users/${SUBJECT_ID}`, json({ id: SUBJECT_ID, username: 'baran', kind: 'person' })));
    expect(await screen.findByRole('link', { name: '@baran' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A report that needs more context/ }));
    await user.type(screen.getByLabelText(/Why this account/), NOTE);
    await user.click(screen.getByRole('button', { name: 'Open the review…' }));
    expect(screen.getByText('Name the case that needs more context.')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('will not open a child’s profile, which writes to nobody', async () => {
    show(`#/safety-reviews?user=${SUBJECT_ID}`, OWNER, ...routes(), on('GET', `/admin/users/${SUBJECT_ID}`, json({ id: SUBJECT_ID, username: 'zarok', kind: 'child' })));
    expect(await screen.findByText('A child’s profile writes to nobody, so there is nothing to review.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '@zarok' })).not.toBeInTheDocument();
  });

  it('shows a moderator the reviews open for them, and nothing to open one with', async () => {
    show(
      '#/safety-reviews',
      MODERATOR,
      on('GET', '/admin/safety-reviews', json({ reviews: [review(), review({ id: 'other', subject: { id: 'u-9', username: 'azad' }, reviewer: { id: 'm-9', username: 'jiyan' }, yours: false })] })),
    );
    const table = await screen.findByRole('table', { name: 'Open safety reviews' });
    expect(within(table).getAllByRole('link', { name: 'Read' })).toHaveLength(1);
    expect(within(table).getByRole('link', { name: 'Read' })).toHaveAttribute('href', `#/safety-reviews/${REVIEW_ID}`);
    // ending is for its reader, or a superadmin
    expect(within(table).getAllByRole('button', { name: 'End now' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open the review…' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only a superadmin can open a safety review/)).toBeInTheDocument();
  });
});

describe('reading under a review', () => {
  const base = `/admin/safety-reviews/${REVIEW_ID}`;

  it('lists the conversations, with nothing anyone wrote until one is opened', async () => {
    const { calls } = show(`#/safety-reviews/${REVIEW_ID}`, MODERATOR, on('GET', base, json(opened)));
    expect(await screen.findByRole('heading', { name: 'Safety review of @baran' })).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Letters with @dilan' })).toHaveAttribute('href', `#/safety-reviews/${REVIEW_ID}/letters/${THREAD_ID}`);
    expect(screen.getByRole('link', { name: 'Messages with @dilan' })).toBeInTheDocument();
    expect(screen.queryByText('Do not tell your parents about me.')).not.toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual([base]);
  });

  it('opens one correspondence, the account’s own letters marked and a drawing hidden until asked', async () => {
    const user = userEvent.setup();
    show(`#/safety-reviews/${REVIEW_ID}/letters/${THREAD_ID}`, MODERATOR, on('GET', base, json(opened)), on('GET', `${base}/conversations/letters/${THREAD_ID}`, json(letters)));
    const line = (await screen.findByText('Do not tell your parents about me.')).closest('li')!;
    expect(within(line).getByText('Written by @baran')).toBeInTheDocument();
    const reply = screen.getByText('Why not?').closest('li')!;
    expect(within(reply).queryByText('Written by @baran')).not.toBeInTheDocument();
    expect(within(reply).getAllByText('Spas').length).toBeGreaterThan(0);
    // a child-safety review asks before a drawing is shown
    await user.click(within(reply).getByRole('button', { name: 'Show drawing' }));
    expect(await screen.findByRole('alertdialog', { name: 'Show this drawing?' })).toBeInTheDocument();
  });

  it('fetches older messages only when asked', async () => {
    const user = userEvent.setup();
    const { calls } = show(
      `#/safety-reviews/${REVIEW_ID}/direct/${FRIEND_ID}`,
      MODERATOR,
      on('GET', base, json(opened)),
      on('GET', `${base}/conversations/direct/${FRIEND_ID}`, json(direct(1, 'd-1'))),
      on('GET', `${base}/conversations/direct/${FRIEND_ID}?before=d-1`, json(direct(2, null))),
    );
    expect(await screen.findByText('message 1')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.includes('before='))).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByText('message 2')).toBeInTheDocument();
    const lines = screen.getAllByRole('listitem').filter((li) => li.classList.contains('chat-line'));
    expect(lines.map((li) => within(li).getByText(/^message/).textContent)).toEqual(['message 2', 'message 1']);
    expect(screen.queryByRole('button', { name: 'Older' })).not.toBeInTheDocument();
  });

  it('shows that a message was deleted, and nothing of what it said', async () => {
    const GROUP_ID = '9e2f0000-0000-4000-8000-0000000000d1';
    const page: ReviewConversationPage = {
      conversation: { kind: 'group', id: GROUP_ID, with: null, title: 'Kurmancî beginners', messages: 2, firstAt: ago(3), lastAt: ago(1) },
      messages: [
        { id: 'g-1', sender: { id: FRIEND_ID, username: 'dilan' }, fromSubject: false, kind: 'text', body: null, createdAt: ago(3), status: 'deleted' },
        { id: 'g-2', sender: { id: SUBJECT_ID, username: 'baran' }, fromSubject: true, kind: 'text', body: 'Silav hemû', createdAt: ago(1), status: null },
      ],
      olderCursor: null,
    };
    show(`#/safety-reviews/${REVIEW_ID}/group/${GROUP_ID}`, MODERATOR, on('GET', base, json(opened)), on('GET', `${base}/conversations/group/${GROUP_ID}`, json(page)));
    const deleted = (await screen.findByText('Deleted')).closest('li')!;
    expect(within(deleted).queryByText('No text')).not.toBeInTheDocument();
    expect(deleted.querySelector('.chat-line-body')).toBeNull();
    expect(screen.getByText('Silav hemû')).toBeInTheDocument();
  });

  it('says when the reader has come to write with the account', async () => {
    show(`#/safety-reviews/${REVIEW_ID}`, MODERATOR, on('GET', base, failure(403, 'REVIEWER_INVOLVED', 'you write with this account now')));
    expect(await screen.findByText('You write with this account')).toBeInTheDocument();
  });

  it('says when a review has ended', async () => {
    show(`#/safety-reviews/${REVIEW_ID}`, MODERATOR, on('GET', base, failure(410, 'REVIEW_ENDED', 'this safety review has ended')));
    expect(await screen.findByText('This review has ended')).toBeInTheDocument();
  });

  it('says when a review is not yours to read', async () => {
    show(`#/safety-reviews/${REVIEW_ID}`, MODERATOR, on('GET', base, failure(404, 'NOT_FOUND', 'no such safety review')));
    expect(await screen.findByText('There is no review here for you')).toBeInTheDocument();
  });

  it('ends a review early from the reader, once confirmed', async () => {
    const user = userEvent.setup();
    const { calls } = show(`#/safety-reviews/${REVIEW_ID}`, MODERATOR, on('GET', base, json(opened)), on('POST', `${base}/end`, json({ review: review({ open: false }) })));
    await user.click(await screen.findByRole('button', { name: 'End now' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'End it now' }));
    await waitFor(() => expect(posts(calls).map((c) => c.path)).toEqual([`${base}/end`]));
    await waitFor(() => expect(location.hash).toBe('#/safety-reviews'));
  });
});
