import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountStanding as Standing, MyReport, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { MyReports } from './MyReports';
import { AccountStanding } from './AccountStanding';
import { scheduledDeletion, SuspensionGate, SuspensionScreen } from './SuspensionGate';
import { Login } from '../pages/Login';
import { StandingWarnings } from './StandingWarnings';


afterEach(() => vi.restoreAllMocks());

const signIn = (): void => localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));

interface Call {
  url: string;
  method: string;
  body: unknown;
  auth: string | undefined;
}

function stub(routes: Record<string, unknown>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null, auth: headers.authorization });
      const key = Object.keys(routes).find((k) => url.endsWith(k));
      const value = key ? routes[key] : {};
      return typeof value === 'function' ? (value as (init?: RequestInit) => Response)(init) : jsonResponse(200, value);
    }),
  );
  return calls;
}

const report = (over: Partial<MyReport> = {}): MyReport => ({
  id: 'r1',
  targetType: 'dm_message',
  category: 'harassment',
  status: 'open',
  targetLabel: '@rojda',
  createdAt: '2026-10-01T10:00:00.000Z',
  closedAt: null,
  canAppeal: false,
  caseId: null,
  ...over,
});

const sanction = (over: Partial<StandingSanction> = {}): StandingSanction => ({
  id: 's1',
  kind: 'chat_mute',
  policy: 'harassment',
  policyLabelKey: 'report.category.harassment',
  statement: 'You kept sending unkind messages to someone who asked you to stop.',
  startsAt: '2026-10-10T10:00:00.000Z',
  endsAt: '2030-10-20T10:00:00.000Z',
  origin: 'report',
  reviewedByPerson: true,
  active: true,
  revokedAt: null,
  acknowledged: true,
  appeal: { allowed: true, deadline: '2027-04-10T10:00:00.000Z', current: null },
  ...over,
});

const standing = (over: Partial<Standing> = {}): Standing => ({
  status: 'limited',
  active: [sanction()],
  past: [],
  unacknowledgedWarnings: [],
  reportAppeals: [],
  restrictions: { chat: { until: '2030-10-20T10:00:00.000Z' } },
  ...over,
});

describe('My reports', () => {
  it('says what became of each report, without saying what the other person got', async () => {
    stub({
      '/me/reports': {
        reports: [
          report(),
          report({ id: 'r2', status: 'actioned', closedAt: '2026-10-03T10:00:00.000Z', targetType: 'user', category: 'spam' }),
        ],
      },
    });
    renderApp(<MyReports />);
    expect(await screen.findByText('Someone on the team will look at it. The most urgent reports come first.')).toBeInTheDocument();
    expect(screen.getByText('We took action. Thanks for keeping Hevalo safe.')).toBeInTheDocument();
    expect(screen.getByText('Being looked at')).toBeInTheDocument();
    expect(screen.getByText('Action taken')).toBeInTheDocument();
    expect(screen.getAllByText('@rojda')).toHaveLength(2);
  });

  it('asks for another look at a "no rule broken" answer, naming its case', async () => {
    const calls = stub({
      '/me/reports': { reports: [report({ status: 'no_violation', canAppeal: true, caseId: 'case-9', closedAt: '2026-10-02T10:00:00.000Z' })] },
      '/me/appeals': { id: 'a1' },
    });
    renderApp(<MyReports />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask for another look' }));
    await userEvent.type(screen.getByLabelText('What should we look at again?'), 'It happened again.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Thanks. Someone will look at it again.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/me/appeals'))!.body).toEqual({ caseId: 'case-9', text: 'It happened again.' });
  });

  it('says in the app’s words, not the server’s, that a second look was already asked for', async () => {
    stub({
      '/me/reports': { reports: [report({ status: 'no_violation', canAppeal: true, caseId: 'case-9', closedAt: '2026-10-02T10:00:00.000Z' })] },
      '/me/appeals': () => jsonResponse(409, { code: 'ALREADY_APPEALED', message: 'you have already asked for a review of this decision' }),
    });
    renderApp(<MyReports />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask for another look' }));
    await userEvent.type(screen.getByLabelText('What should we look at again?'), 'Again.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You’ve already asked us to look at this again.')).toBeInTheDocument();
    expect(screen.queryByText(/already asked for a review of this decision/)).not.toBeInTheDocument();
  });

  it('is calm about having none', async () => {
    stub({ '/me/reports': { reports: [] } });
    renderApp(<MyReports />);
    expect(await screen.findByText('No reports')).toBeInTheDocument();
  });
});

describe('Account standing', () => {
  it('lists what is paused and until when, with the statement of reasons', async () => {
    stub({ '/me/standing': standing() });
    renderApp(<AccountStanding />);
    expect(await screen.findByRole('heading', { name: 'Some things are paused on your account' })).toBeInTheDocument();
    expect(screen.getByText('Messages, gifts and game cards in chats')).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Messages paused' }).closest('article')!;
    expect(within(card).getByText('Rule: Bullying or harassment')).toBeInTheDocument();
    expect(within(card).getByText(/kept sending unkind messages/)).toBeInTheDocument();
    expect(within(card).getByText('Someone reported it, and a person on our team reviewed it.')).toBeInTheDocument();
  });

  it('asks for a review of a decision, once', async () => {
    const calls = stub({
      '/me/standing': standing(),
      '/me/appeals': () =>
        jsonResponse(201, {
          id: 'a1',
          sanctionId: 's1',
          caseId: null,
          text: 'I was joking with my cousin.',
          status: 'open',
          decisionNote: null,
          createdAt: '2026-10-12T10:00:00.000Z',
          decidedAt: null,
        }),
    });
    renderApp(<AccountStanding />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask for a review' }));
    await userEvent.type(screen.getByLabelText('Why do you think we got it wrong?'), 'I was joking with my cousin.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/You asked for a review on .*We’ll answer here\./)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/me/appeals'))!.body).toEqual({ sanctionId: 's1', text: 'I was joking with my cousin.' });
    expect(screen.queryByRole('button', { name: 'Ask for a review' })).not.toBeInTheDocument();
  });

  it('says plainly when the time to ask has passed', async () => {
    stub({
      '/me/standing': standing(),
      '/me/appeals': () => jsonResponse(409, { code: 'APPEAL_WINDOW_CLOSED', message: 'the six months to ask for a review have passed' }),
    });
    renderApp(<AccountStanding />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask for a review' }));
    await userEvent.type(screen.getByLabelText('Why do you think we got it wrong?'), 'Please.');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('The time to ask us to look at this again has passed.')).toBeInTheDocument();
  });

  it('shows the picture a removal is about, small, so its owner knows which one to ask about', async () => {
    const removal = { ...sanction({ id: 's2', kind: 'content_removal', policy: 'sexual', endsAt: null }), picture: { url: 'https://private.test/removed.webp?sig=1' } };
    stub({ '/me/standing': standing({ status: 'good', active: [], past: [removal], restrictions: {} }) });
    renderApp(<AccountStanding />);
    const card = (await screen.findByText('The picture this is about')).closest('article')!;
    const img = card.querySelector('.sanction-picture img')!;
    expect(img).toHaveAttribute('src', 'https://private.test/removed.webp?sig=1');
    expect(within(card).getByRole('button', { name: 'Ask for a review' })).toBeInTheDocument();
    // The private link may have run out by the time the page is read: a plain tile, never a broken image.
    fireEvent.error(img);
    expect(card.querySelector('.sanction-picture img')).toBeNull();
    expect(card.querySelector('.sanction-picture-frame svg')).not.toBeNull();
    expect(within(card).getByText('The picture this is about')).toBeInTheDocument();
  });

  it('shows no picture for a decision that is not about one', async () => {
    stub({ '/me/standing': standing() });
    renderApp(<AccountStanding />);
    await screen.findByRole('heading', { name: 'Messages paused' });
    expect(screen.queryByText('The picture this is about')).not.toBeInTheDocument();
  });

  it('says so plainly when the account is in good standing', async () => {
    stub({ '/me/standing': standing({ status: 'good', active: [], restrictions: {} }) });
    renderApp(<AccountStanding />);
    expect(await screen.findByRole('heading', { name: 'Your account is in good standing' })).toBeInTheDocument();
    expect(screen.getByText('There are no decisions about your account.')).toBeInTheDocument();
  });
});

describe('the suspension screen', () => {
  const details: SuspendedErrorDetails = {
    until: null,
    policy: 'hate',
    statement: 'Slurs against another dialect.',
    appealable: true,
    appealToken: 'appeal-token',
  };

  it('reads the standing and files the appeal with the appeal token, and nothing else', async () => {
    const calls = stub({
      '/me/standing': standing({
        status: 'banned',
        active: [sanction({ id: 'ban1', kind: 'permanent_ban', policy: 'hate', statement: 'Slurs against another dialect.', endsAt: null })],
        restrictions: { account: { until: null } },
      }),
      '/me/appeals': () =>
        jsonResponse(201, { id: 'a1', sanctionId: 'ban1', caseId: null, text: 'x', status: 'open', decisionNote: null, createdAt: '2026-10-12T10:00:00.000Z', decidedAt: null }),
    });
    const onClose = vi.fn();
    renderApp(<SuspensionScreen details={details} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'Your account is permanently suspended' })).toBeInTheDocument();
    expect(screen.getByText('It has no end date.')).toBeInTheDocument();
    const card = (await screen.findByRole('heading', { name: 'Account permanently suspended' })).closest('article')!;
    expect(within(card).getByText('Slurs against another dialect.')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Ask for a review' }));
    await userEvent.type(within(card).getByRole('textbox'), 'It was a quote from a song.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/me/appeals'))).toBe(true));
    for (const c of calls) expect(c.auth).toBe('Bearer appeal-token');
    expect(calls.find((c) => c.url.endsWith('/me/appeals'))!.body).toEqual({ sanctionId: 'ban1', text: 'It was a quote from a song.' });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks to sign in again when the appeal token has run out', async () => {
    stub({
      '/me/standing': standing({
        status: 'banned',
        active: [sanction({ id: 'ban1', kind: 'permanent_ban', policy: 'hate', statement: 'Slurs against another dialect.', endsAt: null })],
        restrictions: { account: { until: null } },
      }),
      '/me/appeals': () => jsonResponse(401, { code: 'UNAUTHORIZED', message: 'authentication required' }),
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const card = (await screen.findByRole('heading', { name: 'Account permanently suspended' })).closest('article')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Ask for a review' }));
    await userEvent.type(within(card).getByRole('textbox'), 'It was a quote.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('This page was open for a long time. Sign in again to ask for a review.')).toBeInTheDocument();
  });

  it('replaces the sign-in form when sign-in answers that the account is suspended', async () => {
    stub({
      '/auth/login': () => jsonResponse(403, { code: 'ACCOUNT_SUSPENDED', message: 'this account is suspended', details }),
      '/me/standing': standing({ status: 'banned', active: [], restrictions: { account: { until: null } } }),
    });
    renderApp(
      <SuspensionGate>
        <Login />
      </SuspensionGate>,
      ['/login'],
    );
    await userEvent.type(screen.getByLabelText('Email'), 'b@x.test');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Your account is permanently suspended' })).toBeInTheDocument();
    expect(await screen.findByText('Slurs against another dialect.')).toBeInTheDocument();
  });

  const banned = (): Standing =>
    standing({
      status: 'banned',
      active: [sanction({ id: 'ban1', kind: 'permanent_ban', policy: 'hate', statement: 'Slurs against another dialect.', endsAt: null })],
      restrictions: { account: { until: null } },
    });

  it('asks for a copy of the data with the appeal token, and says it is being prepared', async () => {
    let asked = false;
    const calls = stub({
      '/me/standing': banned(),
      '/me/export': (init?: RequestInit) => {
        if (init?.method !== 'POST') return jsonResponse(200, asked ? { status: 'pending', requestedAt: '2026-11-20T10:00:00.000Z' } : { status: 'none' });
        asked = true;
        return jsonResponse(202, { requested: true });
      },
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    await userEvent.click(await data.findByRole('button', { name: 'Download a copy of my data' }));
    expect(await data.findByText('Your copy is being prepared. Sign in again later to download it here.')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/me/export')).map((c) => c.method)).toContain('POST');
    for (const c of calls) expect(c.auth).toBe('Bearer appeal-token');
  });

  it('offers a copy that is ready as a download, by its fresh link', async () => {
    stub({
      '/me/standing': banned(),
      '/me/export': { status: 'ready', downloadUrl: 'https://files.test/export.json?sig=1', requestedAt: '2026-11-18T10:00:00.000Z' },
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    expect(await data.findByRole('link', { name: 'Download a copy of my data' })).toHaveAttribute('href', 'https://files.test/export.json?sig=1');
    expect(data.getByText(/Your copy from .* is ready\./)).toBeInTheDocument();
    expect(data.getByRole('button', { name: 'Prepare a new copy' })).toBeInTheDocument();
  });

  it('deletes the account with the appeal token only after asking, and says when it goes', async () => {
    const calls = stub({
      '/me/standing': banned(),
      '/me/export': { status: 'none' },
      '/me': (init?: RequestInit) => (init?.method === 'DELETE' ? jsonResponse(200, { deletionScheduled: true, graceDays: 14 }) : jsonResponse(404, {})),
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    await userEvent.click(data.getByRole('button', { name: 'Delete my account' }));
    expect(data.getByText(/permanently deleted after 14 days; until then you can keep your account from this screen\. Records of moderation decisions are kept/)).toBeInTheDocument();
    // Cancel takes it back without asking the server anything.
    await userEvent.click(data.getByRole('button', { name: 'Cancel' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(data.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(data.getByRole('button', { name: 'Yes, delete my account' }));
    expect(await data.findByText('Your account is set to be deleted. It will be gone for good in 14 days.')).toBeInTheDocument();
    const deleted = calls.filter((c) => c.method === 'DELETE');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.url).toMatch(/\/me$/);
    expect(deleted[0]!.auth).toBe('Bearer appeal-token');
    expect(data.queryByRole('button', { name: 'Download a copy of my data' })).not.toBeInTheDocument();
  });

  it('keeps the account from this screen while its deletion waits, and goes back to the usual view', async () => {
    const calls = stub({
      '/me/standing': banned(),
      '/me/export': { status: 'none' },
      '/me': (init?: RequestInit) => (init?.method === 'DELETE' ? jsonResponse(200, { deletionScheduled: true, graceDays: 14 }) : jsonResponse(404, {})),
      '/me/deletion/cancel': () => jsonResponse(200, { cancelled: true }),
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    await userEvent.click(data.getByRole('button', { name: 'Delete my account' }));
    expect(data.getByText(/until then you can keep your account from this screen/)).toBeInTheDocument();
    await userEvent.click(data.getByRole('button', { name: 'Yes, delete my account' }));
    await userEvent.click(await data.findByRole('button', { name: 'Keep my account' }));
    expect(await data.findByText('Your account will stay. Nothing has been deleted.')).toBeInTheDocument();
    expect(data.getByRole('button', { name: 'Download a copy of my data' })).toBeInTheDocument();
    expect(data.getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
    const cancel = calls.find((c) => c.url.endsWith('/me/deletion/cancel'));
    expect(cancel).toMatchObject({ method: 'POST', auth: 'Bearer appeal-token' });
  });

  it('offers to keep the account on a later visit, when its deletion was asked for before', async () => {
    stub({ '/me/standing': banned(), '/me/export': { status: 'none' }, '/me/deletion/cancel': () => jsonResponse(200, { cancelled: true }) });
    const at = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
    renderApp(<SuspensionScreen details={{ ...details, deletionScheduledFor: at }} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    expect(data.getByText('Your account is set to be deleted. It will be gone for good in 3 days.')).toBeInTheDocument();
    await userEvent.click(data.getByRole('button', { name: 'Keep my account' }));
    expect(await data.findByText('Your account will stay. Nothing has been deleted.')).toBeInTheDocument();
  });

  it('counts a waiting deletion in whole days, and forgets one already past', () => {
    const now = Date.parse('2026-11-20T12:00:00.000Z');
    expect(scheduledDeletion('2026-11-21T11:00:00.000Z', now)).toEqual({ kind: 'scheduled', days: 1 });
    expect(scheduledDeletion('2026-12-04T12:00:00.000Z', now)).toEqual({ kind: 'scheduled', days: 14 });
    expect(scheduledDeletion('2026-11-19T12:00:00.000Z', now)).toBeNull();
    expect(scheduledDeletion(null, now)).toBeNull();
  });

  it('says plainly when no copy can be made right now', async () => {
    stub({
      '/me/standing': banned(),
      '/me/export': (init?: RequestInit) =>
        init?.method === 'POST' ? jsonResponse(503, { code: 'EXPORT_NOT_AVAILABLE', message: 'data export is not available right now' }) : jsonResponse(200, { status: 'none' }),
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    await userEvent.click(await data.findByRole('button', { name: 'Download a copy of my data' }));
    expect(await data.findByText('Copies can’t be made right now. Please try again later.')).toBeInTheDocument();
    expect(screen.queryByText('data export is not available right now')).not.toBeInTheDocument();
  });

  it('asks to sign in again when the token has run out before deleting', async () => {
    stub({
      '/me/standing': banned(),
      '/me/export': { status: 'none' },
      '/me': () => jsonResponse(401, { code: 'UNAUTHORIZED', message: 'authentication required' }),
    });
    renderApp(<SuspensionScreen details={details} onClose={() => undefined} />);
    const data = within(await screen.findByRole('region', { name: 'Your data' }));
    await userEvent.click(data.getByRole('button', { name: 'Delete my account' }));
    await userEvent.click(data.getByRole('button', { name: 'Yes, delete my account' }));
    expect(await data.findByText('This page has been open too long. Sign in again to continue.')).toBeInTheDocument();
    expect(screen.queryByText('authentication required')).not.toBeInTheDocument();
  });

  it('still gives the reasons when the decisions cannot be read', async () => {
    stub({ '/me/standing': () => jsonResponse(500, { code: 'X', message: 'no' }) });
    renderApp(<SuspensionScreen details={{ ...details, until: '2030-01-05T12:00:00.000Z' }} onClose={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Your account is suspended' })).toBeInTheDocument();
    expect(screen.getByText(/It ends on .*2030/)).toBeInTheDocument();
    expect(await screen.findByText('Slurs against another dialect.')).toBeInTheDocument();
    expect(screen.getByText('Rule: Hate')).toBeInTheDocument();
  });
});

describe('the warning, shown once', () => {
  it('shows an unseen warning as a dialog, and marks it seen when closed', async () => {
    signIn();
    const calls = stub({
      '/me': { user: { id: 'u1', username: 'baran', email: 'b@x.test' } },
      '/me/standing': standing({ status: 'good', active: [], unacknowledgedWarnings: [sanction({ id: 'w1', kind: 'warning', endsAt: null, active: false })] }),
      '/me/standing/ack': { acknowledged: 1 },
    });
    renderApp(<StandingWarnings />);
    const dialog = await screen.findByRole('dialog', { name: 'A warning about your account' });
    expect(within(dialog).getByText(/kept sending unkind messages/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'I understand' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/me/standing/ack'))?.body).toEqual({ ids: ['w1'] }));
  });

  it('shows nothing when there is nothing to show', async () => {
    signIn();
    const calls = stub({ '/me': { user: { id: 'u1', username: 'baran', email: 'b@x.test' } }, '/me/standing': standing({ status: 'good', active: [] }) });
    renderApp(<StandingWarnings />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/me/standing'))).toBe(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

