import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountStanding as Standing, MyReport, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { MyReports } from './MyReports';
import { AccountStanding } from './AccountStanding';
import { SuspensionGate, SuspensionScreen } from './SuspensionGate';
import { Login } from '../pages/Login';
import { StandingWarnings } from './StandingWarnings';
import { SafetyCard } from './SafetyCard';

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
      return typeof value === 'function' ? (value as () => Response)() : jsonResponse(200, value);
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

  it('says in the app\'s words, not the server\'s, that a second look was already asked for', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Your account is permanently suspended' })).toBeInTheDocument();
    expect(await screen.findByText('Slurs against another dialect.')).toBeInTheDocument();
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

describe('Settings → Safety', () => {
  it('opens My reports and Account standing', () => {
    renderApp(<SafetyCard />);
    expect(screen.getByRole('link', { name: 'My reports' })).toHaveAttribute('href', '/app/settings/reports');
    expect(screen.getByRole('link', { name: 'Account standing' })).toHaveAttribute('href', '/app/settings/standing');
  });
});
