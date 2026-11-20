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
// The pull to refresh as a button: the web's control has nothing to pull.
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Alert, AppState, Linking } from 'react-native';
import type { AccountStanding, MyReport, StandingSanction } from '@kurda/shared';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from './testing/auth';
import { MyReportsScreen } from './MyReportsScreen';
import { AccountStandingScreen } from './AccountStandingScreen';
import { WarningDialog } from './WarningDialog';
import { SendErrorNotice } from './SendError';
import { SuspensionScreen, accountSanction, scheduledDeletion } from './SuspensionScreen';

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
  it('reads the reports again when pulled down: an outcome may have come since', async () => {
    const client = fakeClient({ 'GET /me/reports': ok({ reports: [report({ id: 'b', status: 'open' })] }) });
    testAuth.client = client;
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    await screen.findByText('Waiting for review');
    const count = () => client.calls.filter((c) => c.path === '/me/reports').length;
    const before = count();
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect(count()).toBe(before + 1));
  });

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
    // A player is never named in your reports.
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
    expect(await screen.findByText('Nothing reported yet.')).toBeTruthy();
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
    expect(screen.getByText('Messages, gifts and game cards in chats')).toBeTruthy();
    expect(screen.getByText('Messages paused')).toBeTruthy();
    expect(screen.getAllByText('Rule: Bullying or harassment')).toHaveLength(2);
    expect(screen.getAllByText('You sent repeated insults to another learner.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Someone reported it, and a person on our team reviewed it.').length).toBeGreaterThan(0);
    // An earlier decision with its review answered.
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

  it('shows the picture a removal is about, small, and says so when its link no longer opens', async () => {
    const removal = (id: string, url: string) => ({
      ...sanction({ id, kind: 'content_removal', policy: 'sexual', endsAt: null, statement: 'This picture shows nudity.' }),
      picture: { url },
    });
    testAuth.client = fakeClient({ 'GET /me/standing': ok(standing({ past: [removal('s2', 'https://media.test/private/removed.webp')] })) });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByText('The picture this is about')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'The picture this is about' }).length).toBeGreaterThan(0);
    cleanup();

    // A private link lasts minutes: one that has run out leaves words, not an empty box.
    vi.stubGlobal(
      'Image',
      class {
        onerror: ((e: unknown) => void) | null = null;
        onload: ((e: unknown) => void) | null = null;
        set src(_uri: string) {
          setTimeout(() => this.onerror?.({ type: 'error' }));
        }
      },
    );
    testAuth.client = fakeClient({ 'GET /me/standing': ok(standing({ past: [removal('s3', 'https://media.test/private/expired.webp')] })) });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByText('This picture can’t be shown right now.')).toBeTruthy();
    expect(screen.queryAllByRole('img', { name: 'The picture this is about' })).toHaveLength(0);
  });

  it('shows no picture for a removal about something else', async () => {
    const removal = { ...sanction({ kind: 'content_removal', endsAt: null }), picture: null };
    testAuth.client = fakeClient({ 'GET /me/standing': ok(standing({ past: [removal] })) });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByText('Rule: Bullying or harassment')).toBeTruthy();
    expect(screen.queryByTestId('standing-picture')).toBeNull();
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
    expect(await screen.findByText('A warning about your account')).toBeTruthy();
    expect(screen.getByText('This is a warning about one of our rules: Scam or spam. A warning doesn’t limit anything on your account.')).toBeTruthy();
    expect(screen.getByText('Please stop posting links.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'I understand' }));
    await waitFor(() => expect(screen.queryByText('A warning about your account')).toBeNull());
    expect(client.calls.find((c) => c.path === '/me/standing/ack')?.body).toEqual({ ids: ['w1'] });
  });

  it('shows nothing when there is no warning', async () => {
    const client = fakeClient({ 'GET /me/standing': ok(standing({})) });
    testAuth.client = client;
    renderWithProviders(<WarningDialog />);
    await waitFor(() => expect(client.calls.length).toBe(1));
    expect(screen.queryByText('A warning about your account')).toBeNull();
  });

  it('asks again when the app comes back to the front, and shows a warning given meanwhile', async () => {
    const listeners: Array<(state: string) => void> = [];
    const spy = vi.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: (state: string) => void) => {
      listeners.push(cb);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener);
    const answers = [
      standing({}),
      standing({ unacknowledgedWarnings: [sanction({ id: 'w2', kind: 'warning', policy: 'spam' })] }),
    ];
    const client = fakeClient({ 'GET /me/standing': () => ok(answers.shift() ?? standing({})) });
    testAuth.client = client;
    renderWithProviders(<WarningDialog />);
    await waitFor(() => expect(client.calls.length).toBe(1));
    expect(screen.queryByText('A warning about your account')).toBeNull();
    act(() => listeners.forEach((cb) => cb('active')));
    expect(await screen.findByText('A warning about your account')).toBeTruthy();
    spy.mockRestore();
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

  it('says when the standing could not be loaded, and loads it again on Try again', async () => {
    let answers = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      // The copy of the data is read beside the standing; only the standing fails here.
      if (url.endsWith('/me/export')) return new Response(JSON.stringify({ status: 'none' }), { status: 200, headers: { 'content-type': 'application/json' } });
      answers += 1;
      return answers === 1
        ? new Response(JSON.stringify({ code: 'INTERNAL', message: 'x' }), { status: 500 })
        : new Response(JSON.stringify(standing({ status: 'suspended', active: [sanction({ id: 'sus', kind: 'suspension' })] })), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    const ask = await screen.findByRole('button', { name: 'Ask for a review' });
    await waitFor(() => expect(ask.getAttribute('aria-disabled')).not.toBe('true'));
    expect(answers).toBe(2);
  });
});

describe('SuspensionScreen: a copy of the data and deleting the account', () => {
  const details = {
    until: null,
    policy: 'harassment' as const,
    statement: 'Threats in group chat.',
    appealable: true,
    appealToken: 'appeal-tok',
  };
  type Answer = { status: number; body: unknown };

  /** The API answering by method and path, with every call recorded with its token. */
  function serve(answer: (method: string, path: string) => Answer | undefined) {
    const calls: Array<{ method: string; path: string; auth: string | null }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      const path = new URL(url).pathname;
      calls.push({ method, path, auth: (init.headers as Record<string, string>).authorization ?? null });
      const got =
        path === '/me/standing'
          ? { status: 200, body: standing({ status: 'banned', active: [sanction({ id: 'ban', kind: 'permanent_ban', endsAt: null })] }) }
          : (answer(method, path) ?? { status: 404, body: { code: 'NOT_FOUND', message: 'x' } });
      return new Response(JSON.stringify(got.body), { status: got.status, headers: { 'content-type': 'application/json' } });
    });
    return calls;
  }

  afterEach(() => vi.restoreAllMocks());

  it('asks for a copy with the appeal token, and says it is being prepared', async () => {
    let asked = false;
    const calls = serve((method, path) => {
      if (path !== '/me/export') return undefined;
      if (method === 'POST') {
        asked = true;
        return { status: 202, body: { requested: true } };
      }
      return { status: 200, body: asked ? { status: 'pending' } : { status: 'none' } };
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    expect(screen.getByText('You can still download a copy of your data or delete your account.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Download a copy of my data' }));
    expect(await screen.findByText('Your copy is being prepared. Sign in again later to download it here.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/me/export')).toBe(true);
    expect(calls.every((c) => c.auth === 'Bearer appeal-tok')).toBe(true);
  });

  it('opens a copy that is ready by a fresh link, as Settings does', async () => {
    const url = 'https://files.test/export.json?sig=fresh';
    serve((method, path) => (path === '/me/export' ? { status: 200, body: { status: 'ready', downloadUrl: url, requestedAt: '2026-11-18T10:00:00.000Z' } } : undefined));
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Download your data')?.onPress?.();
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    expect(await screen.findByText(/^Your copy from .* is ready\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download a copy of my data' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(url));
  });

  it('deletes the account with the appeal token only once it is confirmed, and says when it goes', async () => {
    const calls = serve((method, path) => {
      if (path === '/me/export') return { status: 200, body: { status: 'none' } };
      if (method === 'DELETE' && path === '/me') return { status: 200, body: { deletionScheduled: true, graceDays: 14 } };
      return undefined;
    });
    let confirm: (() => void) | undefined;
    const alert = vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      confirm = buttons?.find((b) => b.text === 'Yes, delete my account')?.onPress;
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    expect(alert).toHaveBeenCalledWith(
      'Delete account?',
      expect.stringMatching(/permanently deleted after 14 days; until then you can keep your account from this screen\. Records of moderation decisions are kept/),
      expect.any(Array),
    );
    // Asking is not deleting.
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await act(async () => confirm?.());
    expect(await screen.findByText('Your account is set to be deleted. It will be gone for good in 14 days.')).toBeTruthy();
    const deleted = calls.filter((c) => c.method === 'DELETE');
    expect(deleted).toEqual([{ method: 'DELETE', path: '/me', auth: 'Bearer appeal-tok' }]);
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
  });

  it('keeps the account from this screen while its deletion waits, and goes back to the usual view', async () => {
    const calls = serve((method, path) => {
      if (path === '/me/export') return { status: 200, body: { status: 'none' } };
      if (method === 'DELETE' && path === '/me') return { status: 200, body: { deletionScheduled: true, graceDays: 14 } };
      if (method === 'POST' && path === '/me/deletion/cancel') return { status: 200, body: { cancelled: true } };
      return undefined;
    });
    vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Yes, delete my account')?.onPress?.();
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my account' }));
    expect(await screen.findByText('Your account will stay. Nothing has been deleted.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download a copy of my data' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy();
    expect(calls.find((c) => c.path === '/me/deletion/cancel')).toEqual({ method: 'POST', path: '/me/deletion/cancel', auth: 'Bearer appeal-tok' });
  });

  it('offers to keep the account on a later visit, when its deletion was asked for before', async () => {
    serve((method, path) => {
      if (path === '/me/export') return { status: 200, body: { status: 'none' } };
      if (method === 'POST' && path === '/me/deletion/cancel') return { status: 200, body: { cancelled: true } };
      return undefined;
    });
    const at = new Date(Date.now() + 3 * 86_400_000 - 60_000).toISOString();
    renderWithProviders(<SuspensionScreen details={{ ...details, deletionScheduledFor: at }} baseUrl="http://api.test" onBack={() => undefined} />);
    expect(await screen.findByText('Your account is set to be deleted. It will be gone for good in 3 days.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my account' }));
    expect(await screen.findByText('Your account will stay. Nothing has been deleted.')).toBeTruthy();
  });

  it('counts a waiting deletion in whole days, and forgets one already past', () => {
    const now = Date.parse('2026-11-20T12:00:00.000Z');
    expect(scheduledDeletion('2026-11-21T11:00:00.000Z', now)).toEqual({ kind: 'scheduled', days: 1 });
    expect(scheduledDeletion('2026-11-19T12:00:00.000Z', now)).toBeNull();
    expect(scheduledDeletion(null, now)).toBeNull();
  });

  it('says plainly when no copy can be made right now', async () => {
    serve((method, path) => {
      if (path !== '/me/export') return undefined;
      return method === 'POST'
        ? { status: 503, body: { code: 'EXPORT_NOT_AVAILABLE', message: 'data export is not available right now' } }
        : { status: 200, body: { status: 'none' } };
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download a copy of my data' }));
    expect(await screen.findByText('Copies can’t be made right now. Please try again later.')).toBeTruthy();
    expect(screen.queryByText('data export is not available right now')).toBeNull();
  });

  it('asks to sign in again when the token has run out before deleting', async () => {
    serve((method, path) => {
      if (path === '/me/export') return { status: 200, body: { status: 'none' } };
      return { status: 401, body: { code: 'UNAUTHORIZED', message: 'authentication required' } };
    });
    const alert = vi.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.text === 'Yes, delete my account')?.onPress?.();
    });
    renderWithProviders(<SuspensionScreen details={details} baseUrl="http://api.test" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not delete account', 'This page has been open too long. Sign in again to continue.'));
  });
});

describe('accountSanction', () => {
  it('picks the ban the server signs in against: permanent first, then the one ending last, then the newest', () => {
    const early = sanction({ id: 'early', kind: 'suspension', endsAt: '2026-10-20T09:00:00.000Z' });
    const late = sanction({ id: 'late', kind: 'suspension', endsAt: '2026-11-20T09:00:00.000Z' });
    const open = sanction({ id: 'open', kind: 'suspension', endsAt: null });
    const ban = sanction({ id: 'ban', kind: 'permanent_ban', endsAt: null, startsAt: '2026-10-01T09:00:00.000Z' });
    const mute = sanction({ id: 'mute', kind: 'chat_mute', endsAt: null });
    expect(accountSanction(standing({ active: [early, late, mute] }))?.id).toBe('late');
    expect(accountSanction(standing({ active: [early, open] }))?.id).toBe('open');
    expect(accountSanction(standing({ active: [early, ban, open] }))?.id).toBe('ban');
    const newer = sanction({ id: 'newer', kind: 'suspension', endsAt: null, startsAt: '2026-10-12T09:00:00.000Z' });
    expect(accountSanction(standing({ active: [open, newer] }))?.id).toBe('newer');
    expect(accountSanction(standing({ active: [mute] }))).toBeNull();
    expect(accountSanction(null)).toBeNull();
  });
});

// A failed load says so, and offers to try again.
describe('load failures', () => {
  it('My reports offers a retry', async () => {
    testAuth.client = fakeClient({ 'GET /me/reports': fail({ kind: 'server', status: 500 }) });
    renderWithProviders(<MyReportsScreen onExit={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
