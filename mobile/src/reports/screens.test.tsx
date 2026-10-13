// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('./testing/svg'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
vi.mock('expo-linear-gradient', () => import('./testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('./testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('./testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('./testing/auth'));
const navigate = vi.fn();
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate, goBack: vi.fn() }) }));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { AccountStanding, MyReport, StandingSanction } from '@kurda/shared';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from './testing/auth';
import { MyReportsScreen } from './MyReportsScreen';
import { AccountStandingScreen } from './AccountStandingScreen';
import { WarningDialog } from './WarningDialog';
import { SendErrorNotice } from './SendError';
import { SuspensionScreen } from './SuspensionScreen';

patchReactNativeWeb();

beforeEach(() => navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const report = (over: Partial<MyReport>): MyReport => ({
  id: 'r1',
  targetType: 'user',
  category: 'harassment',
  status: 'open',
  targetLabel: '@azad',
  createdAt: '2026-10-01T10:00:00.000Z',
  closedAt: null,
  canAppeal: false,
  caseId: 'case-1',
  ...over,
});

const sanction = (over: Partial<StandingSanction>): StandingSanction => ({
  id: 's1',
  kind: 'chat_mute',
  policy: 'harassment',
  policyLabelKey: 'report.category.harassment',
  statement: 'You sent repeated insults to another learner.',
  startsAt: '2026-10-10T09:00:00.000Z',
  endsAt: '2026-10-17T09:00:00.000Z',
  origin: 'report',
  reviewedByPerson: true,
  active: true,
  revokedAt: null,
  acknowledged: true,
  appeal: { allowed: true, deadline: '2027-04-10T09:00:00.000Z', current: null },
  ...over,
});

const standing = (over: Partial<AccountStanding>): AccountStanding => ({
  status: 'good',
  active: [],
  past: [],
  unacknowledgedWarnings: [],
  reportAppeals: [],
  restrictions: {},
  ...over,
});

describe('MyReportsScreen', () => {
  it('lists each report with what became of it, never what the sanction was', async () => {
    testAuth.client = fakeClient({
      'GET /me/reports': ok({
        reports: [
          report({ id: 'a', status: 'actioned' }),
          report({ id: 'b', status: 'open', targetType: 'game_player', targetLabel: null }),
        ],
      }),
    });
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    await waitFor(() => expect(screen.getByText('We took action. Thanks for keeping Hevalo safe.')).toBeTruthy());
    expect(screen.getByText('Waiting for review')).toBeTruthy();
    // a player is never named in your reports
    expect(screen.getByText('A player in a game')).toBeTruthy();
    expect(screen.queryByText('Ask for a second look')).toBeNull();
  });

  it('asks for a second look at a “doesn’t break our rules” answer, by its case, once', async () => {
    const client = fakeClient({
      'GET /me/reports': ok({ reports: [report({ status: 'no_violation', canAppeal: true })] }),
      'POST /me/appeals': ok({ id: 'ap', sanctionId: null, caseId: 'case-1', text: 'x', status: 'open', decisionNote: null, createdAt: '', decidedAt: null }),
    });
    testAuth.client = client;
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for a second look' }));
    fireEvent.change(screen.getByLabelText('Tell us why you think we got it wrong'), { target: { value: 'It keeps happening.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Sent. We’ll look at it again and let you know what we decide.')).toBeTruthy());
    expect(client.calls.find((c) => c.path === '/me/appeals')?.body).toEqual({ caseId: 'case-1', text: 'It keeps happening.' });
  });

  it('says so when there is nothing yet', async () => {
    testAuth.client = fakeClient({ 'GET /me/reports': ok({ reports: [] }) });
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    expect(await screen.findByText('Nothing reported yet. When you report something, you can follow it here.')).toBeTruthy();
  });
});

describe('AccountStandingScreen', () => {
  it('says what is limited, why, until when, and how it came about', async () => {
    testAuth.client = fakeClient({
      'GET /me/standing': ok(
        standing({
          status: 'limited',
          active: [sanction({})],
          past: [sanction({ id: 's0', kind: 'warning', active: false, endsAt: null, appeal: { allowed: false, deadline: '2026-01-01T00:00:00.000Z', current: { id: 'a0', sanctionId: 's0', caseId: null, text: 'x', status: 'upheld', decisionNote: 'We looked again.', createdAt: '', decidedAt: '' } } })],
          restrictions: { chat: { until: '2026-10-17T09:00:00.000Z' } },
        }),
      ),
    });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByText('Some things are limited for now.')).toBeTruthy();
    expect(screen.getByText('Sending messages')).toBeTruthy();
    expect(screen.getByText('Messages paused')).toBeTruthy();
    expect(screen.getAllByText('Rule: Bullying or harassment')).toHaveLength(2);
    expect(screen.getAllByText('You sent repeated insults to another learner.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After a report · Reviewed by a person').length).toBeGreaterThan(0);
    // an earlier decision with its review answered
    expect(screen.getByText('Reviewed: the decision stays')).toBeTruthy();
    expect(screen.getByText('We looked again.')).toBeTruthy();
  });

  it('files a review of a sanction and shows that it is waiting', async () => {
    const client = fakeClient({
      'GET /me/standing': ok(standing({ status: 'limited', active: [sanction({})] })),
      'POST /me/appeals': ok({ id: 'ap', sanctionId: 's1', caseId: null, text: 'x', status: 'open', decisionNote: null, createdAt: '', decidedAt: null }),
    });
    testAuth.client = client;
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for a review' }));
    fireEvent.change(screen.getByLabelText('Tell us why you think we got it wrong'), { target: { value: 'I was quoting a poem.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Review requested — waiting for an answer')).toBeTruthy());
    expect(client.calls.find((c) => c.path === '/me/appeals')?.body).toEqual({ sanctionId: 's1', text: 'I was quoting a poem.' });
  });

  it('is plain about good standing', async () => {
    testAuth.client = fakeClient({ 'GET /me/standing': ok(standing({})) });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByText('Your account is in good standing. Nothing is limited.')).toBeTruthy();
    expect(screen.getByText('There are no decisions on your account.')).toBeTruthy();
  });
});

describe('WarningDialog', () => {
  it('shows a warning once, and marks it seen', async () => {
    const client = fakeClient({
      'GET /me/standing': ok(standing({ unacknowledgedWarnings: [sanction({ id: 'w1', kind: 'warning', policy: 'spam', statement: 'Please stop posting links.' })] })),
      'POST /me/standing/ack': ok({ acknowledged: 1 }),
    });
    testAuth.client = client;
    renderWithProviders(<WarningDialog />);
    expect(await screen.findByText('A note from Hevalo')).toBeTruthy();
    expect(screen.getByText('This is a warning about one of our rules: Scam or spam. A warning doesn’t limit anything on your account.')).toBeTruthy();
    expect(screen.getByText('Please stop posting links.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    await waitFor(() => expect(screen.queryByText('A note from Hevalo')).toBeNull());
    expect(client.calls.find((c) => c.path === '/me/standing/ack')?.body).toEqual({ ids: ['w1'] });
  });

  it('shows nothing when there is no warning', async () => {
    const client = fakeClient({ 'GET /me/standing': ok(standing({})) });
    testAuth.client = client;
    renderWithProviders(<WarningDialog />);
    await waitFor(() => expect(client.calls.length).toBe(1));
    expect(screen.queryByText('A note from Hevalo')).toBeNull();
  });
});

describe('SendErrorNotice', () => {
  it('says what a mute stops and links to Account standing', () => {
    renderWithProviders(
      <SendErrorNotice error={{ kind: 'client', status: 403, code: 'MUTED', message: 'x', details: { scope: 'chat', until: null } }} />,
    );
    expect(screen.getByText('You can’t send messages right now.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('has no link for the automatic pause, whose reasons are not on that page', () => {
    renderWithProviders(<SendErrorNotice error={{ kind: 'client', status: 403, code: 'CHAT_MUTED', message: 'x' }} />);
    expect(screen.getByText('Your messages are paused for a while, because our filter flagged some of your recent ones.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says any other failure as every screen does', () => {
    renderWithProviders(<SendErrorNotice error={{ kind: 'network', message: 'x' }} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('SuspensionScreen', () => {
  const details = {
    until: '2026-10-20T09:00:00.000Z',
    policy: 'harassment' as const,
    statement: 'Threats in group chat.',
    appealable: true,
    appealToken: 'appeal-tok',
  };

  it('explains the suspension and asks for a review with the appeal token', async () => {
    const calls: Array<{ url: string; auth: string | null; body: unknown }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.authorization ?? null, body: init.body ? JSON.parse(String(init.body)) : null });
      const json = url.endsWith('/me/standing')
        ? standing({ status: 'suspended', active: [sanction({ id: 'sus', kind: 'suspension' })] })
        : { id: 'ap', sanctionId: 'sus', caseId: null, text: 'x', status: 'open', decisionNote: null, createdAt: '', decidedAt: null };
      return new Response(JSON.stringify(json), { status: url.endsWith('/me/appeals') ? 201 : 200, headers: { 'content-type': 'application/json' } });
    });
    const onBack = vi.fn();
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={onBack} />);
    expect(screen.getByText('Your account is suspended')).toBeTruthy();
    expect(screen.getByText(/^You can use Hevalo again after /)).toBeTruthy();
    expect(screen.getByText('Rule: Bullying or harassment')).toBeTruthy();
    expect(screen.getByText('Threats in group chat.')).toBeTruthy();

    const ask = await screen.findByRole('button', { name: 'Ask for a review' });
    await waitFor(() => expect(ask.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(ask);
    fireEvent.change(screen.getByLabelText('Tell us why you think we got it wrong'), { target: { value: 'Not me.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Sent. Sign in again later to see the answer here.')).toBeTruthy());
    expect(calls.every((c) => c.auth === 'Bearer appeal-tok')).toBe(true);
    expect(calls.at(-1)).toMatchObject({ url: 'http://api.test/me/appeals', body: { sanctionId: 'sus', text: 'Not me.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('says to sign in again once the appeal token has run out', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'x' }), { status: 401 }));
    renderWithProviders(<SuspensionScreen details={{ ...details, until: null }} baseUrl="http://api.test" onBack={() => undefined} />);
    expect(screen.getByText('This is permanent.')).toBeTruthy();
    expect(await screen.findByText('This page has been open too long. Sign in again to ask for a review.')).toBeTruthy();
  });
});

// a failed load says so, and offers to try again
describe('load failures', () => {
  it('My reports offers a retry', async () => {
    testAuth.client = fakeClient({ 'GET /me/reports': fail({ kind: 'server', status: 500 }) });
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
