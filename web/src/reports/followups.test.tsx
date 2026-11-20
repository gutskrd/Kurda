import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ACCOUNT_CHANGED, type AccountStanding as Standing, type StandingSanction } from '@kurda/shared';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import type { RealtimeClient } from '../realtime/RealtimeClient';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { RailProvider } from '../social/RailProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { en } from '../i18n/en';
import { jsonResponse, renderApp } from '../test/utils';
import { PostAuthor } from '../library/PostAuthor';
import { UserProfile } from '../pages/UserProfile';
import { AccountStanding } from './AccountStanding';
import { AccountWatch } from './AccountWatch';
import { HeldBanner } from './HeldNotice';
import { isHoldNotice, isHoldSanction } from './hold';
import { socialNotification } from './notifications';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const t = (key: keyof typeof en, vars?: Record<string, string | number>): string =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key] as string);
const HOLD = { reason: 'possible_return', since: '2026-11-19T10:00:00.000Z' };
const HOLD_STATEMENT =
  'A person is checking your account before you can post, comment, send messages, share pictures, write letters or join groups. Learning works as usual. This is not a finding that you broke a rule.';

const hold = (over: Partial<StandingSanction> = {}): StandingSanction => ({
  id: 'hold-1',
  kind: 'post_mute',
  policy: 'other',
  policyLabelKey: 'report.category.other',
  statement: HOLD_STATEMENT,
  startsAt: '2026-11-19T10:00:00.000Z',
  endsAt: null,
  origin: 'automatic',
  reviewedByPerson: false,
  active: true,
  revokedAt: null,
  acknowledged: true,
  appeal: { allowed: true, deadline: '2027-05-19T10:00:00.000Z', current: null },
  ...over,
});

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** Signs in with `/me` answered by `me()` each time it is read, and the rest from `answers` by method and path. */
function signIn(me: () => unknown, answers: Record<string, (init?: RequestInit) => Response> = {}): Call[] {
  const calls: Call[] = [];
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = new URL(url, 'http://x').pathname;
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === '/me') return jsonResponse(200, { user: me() });
      const answer = answers[`${method} ${path}`];
      return answer ? answer(init) : jsonResponse(404, { code: 'NOT_FOUND', message: 'not here' });
    }),
  );
  return calls;
}
const user = (held: boolean) => ({ id: 'me', username: 'baran', email: 'b@x.test', displayName: null, emailVerified: true, accountHold: held ? HOLD : null });

describe('a hold in Account standing', () => {
  it('is one calm item, in the reader’s words, with no rule broken, and its review can be asked for', async () => {
    const standing: Standing = { status: 'limited', active: [hold()], past: [], unacknowledgedWarnings: [], reportAppeals: [], restrictions: { post: { until: null } } };
    const calls = signIn(() => user(true), {
      'GET /me/standing': () => jsonResponse(200, standing),
      'POST /me/appeals': () =>
        jsonResponse(201, { id: 'a1', sanctionId: 'hold-1', caseId: null, text: 'x', status: 'open', decisionNote: null, createdAt: '2026-11-20T10:00:00.000Z', decidedAt: null }),
    });
    renderApp(<AccountStanding />);
    const card = (await screen.findByRole('heading', { name: 'Your account is being checked' })).closest('article')!;
    // Said once: no notice above the decisions repeating it, and no rule, no "found it".
    expect(screen.getAllByText(en['hold.statement'])).toHaveLength(1);
    expect(screen.queryByText(en['hold.title'])).not.toBeInTheDocument();
    expect(within(card).queryByText(/^Rule:/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/automatic checks found it/)).not.toBeInTheDocument();
    expect(within(card).getByText('Since Nov 19')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Ask for a review' }));
    await userEvent.type(within(card).getByRole('textbox'), 'This is my first account.');
    await userEvent.click(within(card).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/me/appeals')?.body).toEqual({ sanctionId: 'hold-1', text: 'This is my first account.' }));
  });

  it('is told apart from a post mute someone decided, which keeps its rule and the moderator’s words', () => {
    expect(isHoldSanction(hold())).toBe(true);
    expect(isHoldSanction(hold({ origin: 'moderator', statement: 'Spam links in posts.' }))).toBe(false);
    expect(isHoldSanction(hold({ endsAt: '2026-12-01T10:00:00.000Z' }))).toBe(false);
  });

  it('follows the server’s own marker whatever its words, and never shows a marked hold as a rule broken', async () => {
    const marked = { ...hold({ statement: 'Worded differently one day.' }), hold: true };
    expect(isHoldSanction(marked)).toBe(true);
    expect(isHoldNotice({ title: 'Something else', data: { kind: 'sanction', sanction: 'post_mute', policy: 'other', hold: true } })).toBe(true);
    const standing: Standing = { status: 'limited', active: [marked], past: [], unacknowledgedWarnings: [], reportAppeals: [], restrictions: {} };
    signIn(() => user(true), { 'GET /me/standing': () => jsonResponse(200, standing) });
    renderApp(<AccountStanding />);
    const card = (await screen.findByRole('heading', { name: 'Your account is being checked' })).closest('article')!;
    expect(within(card).queryByText(/^Rule:/)).not.toBeInTheDocument();
    expect(within(card).queryByText('Worded differently one day.')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Ask for a review' })).toBeInTheDocument();
  });

  it('is announced calmly in the inbox, as a check rather than a penalty', () => {
    const note = { title: 'Your account is being checked', body: 'server words', data: { kind: 'sanction', sanctionId: 'hold-1', sanction: 'post_mute', policy: 'other', until: null } };
    expect(isHoldNotice(note)).toBe(true);
    expect(socialNotification(note, t)).toEqual({ title: en['hold.heading'], body: en['hold.statement'], to: '/app/settings/standing' });
    // A post mute a person decided still reads as one.
    const mute = { title: 'Posting paused', body: 'x', data: { kind: 'sanction', sanction: 'post_mute', policy: 'spam', until: null } };
    expect(socialNotification(mute, t)?.title).toBe(en['notify.sanction.title']);
  });
});

/** A realtime connection the test speaks for. */
function fakeRealtime(): { client: RealtimeClient; emit: (env: RealtimeEventEnvelope) => void } {
  const listeners = new Set<(env: RealtimeEventEnvelope) => void>();
  const client = {
    on(type: string, handler: (arg: unknown) => void) {
      if (type !== 'event') return () => undefined;
      listeners.add(handler as (env: RealtimeEventEnvelope) => void);
      return () => listeners.delete(handler as (env: RealtimeEventEnvelope) => void);
    },
    connect() {},
    destroy() {},
    join() {},
    leave() {},
    send() {
      return true;
    },
  };
  return { client: client as unknown as RealtimeClient, emit: (env) => listeners.forEach((h) => h(env)) };
}

function watched(live: RealtimeClient): void {
  render(
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter>
          <RealtimeProvider client={live}>
            <RailProvider>
              <AccountWatch />
              <HeldBanner />
            </RailProvider>
          </RealtimeProvider>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

const rail = (notifications: unknown[]) => ({
  friends: [],
  requests: [],
  challenges: [],
  groups: [],
  notifications,
  unread: { notifications: notifications.length, groups: 0, requests: 0, challenges: 0 },
});

describe('a hold lifted while the app is open', () => {
  it('clears the notice as soon as the server says the account changed', async () => {
    let held = true;
    signIn(() => user(held), { 'GET /me/social': () => jsonResponse(200, rail([])) });
    const live = fakeRealtime();
    watched(live.client);
    expect(await screen.findByText(en['hold.title'])).toBeInTheDocument();
    held = false;
    live.emit({ room: 'user:me', event: { type: ACCOUNT_CHANGED } });
    await waitFor(() => expect(screen.queryByText(en['hold.title'])).not.toBeInTheDocument());
  });

  it('reads the account again when a notice says a decision was lifted, if the ping was missed', async () => {
    let reads = 0;
    const lifted = { id: 'n1', category: 'moderation', title: 'A limit was lifted', body: null, createdAt: '2026-11-20T10:00:00.000Z', readAt: null, data: { kind: 'sanction_lifted', sanctionId: 'hold-1' } };
    // Held when first read; the rail's first answer already carries the lifted notice, and the next read is clear.
    const calls = signIn(() => user(reads++ === 0), { 'GET /me/social': () => jsonResponse(200, rail([lifted])) });
    watched(fakeRealtime().client);
    await waitFor(() => expect(calls.filter((c) => c.path === '/me').length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.queryByText(en['hold.title'])).not.toBeInTheDocument());
  });
});

describe('an account that isn’t available', () => {
  const refusal = (code: string, status: number): ApiError => ({ kind: 'client', status, code, message: 'server words' });

  it('is said the same way when messaging, inviting or adding to a group meets it', () => {
    expect(describeError(refusal('ACCOUNT_UNAVAILABLE', 403), t)).toBe('This account isn’t available.');
    expect(describeError(refusal('CANNOT_JOIN_YET', 409), t)).toBe('This person can’t join groups right now.');
    expect(describeError({ kind: 'server', status: 503, code: 'EXPORT_NOT_AVAILABLE', message: 'x' }, t)).toBe('Copies can’t be made right now. Please try again later.');
  });

  it('shows its profile page calmly, with nothing to try again', async () => {
    signIn(() => user(false), {
      'GET /users/u-gone': () => jsonResponse(404, { code: 'ACCOUNT_UNAVAILABLE', message: 'This account isn’t available' }),
      'GET /users/u-gone/friends': () => jsonResponse(404, { code: 'ACCOUNT_UNAVAILABLE', message: 'x' }),
    });
    render(
      <AuthProvider>
        <I18nProvider>
          <MemoryRouter initialEntries={['/app/users/u-gone']}>
            <ProfileModalProvider>
              <Routes>
                <Route path="/app/users/:id" element={<UserProfile />} />
              </Routes>
            </ProfileModalProvider>
          </MemoryRouter>
        </I18nProvider>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'This account isn’t available.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('keeps what it shared under a byline that names nobody and opens nothing', () => {
    renderApp(<PostAuthor author={{ id: 'u-gone', username: 'rojda', avatarUrl: 'https://cdn.test/rojda.png', unavailable: true }} at="2026-11-18T10:00:00.000Z" />);
    expect(screen.getByText('Account unavailable')).toBeInTheDocument();
    expect(screen.queryByText('rojda')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
