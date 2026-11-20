// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('./testing/svg'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
vi.mock('expo-linear-gradient', () => import('./testing/stubs'));
vi.mock('expo-notifications', () => import('./testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('./testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('./testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('./testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
// Your own channel's events, handed to the test to send.
const live = vi.hoisted(() => ({ handlers: new Set<(event: { type: string }) => void>() }));
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (onEvent: (event: { type: string }) => void) => {
    live.handlers.add(onEvent);
  },
}));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ACCOUNT_CHANGED, type AccountStanding, type StandingSanction } from '@kurda/shared';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from './testing/auth';
import { TRANSLATIONS } from '../i18n/translations';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { notificationText } from '../notifications/followLink';
import { CommentList } from '../comments/CommentList';
import type { CommentThread } from '../comments/useCommentThread';
import type { ThreadComment } from '../comments/thread';
import { FeedCard } from '../feed/FeedCard';
import type { FeedItem } from '../feed/types';
import { PublicProfileScreen } from '../social/PublicProfileScreen';
import { AccountStandingScreen } from './AccountStandingScreen';
import { AccountWatch } from './AccountWatch';
import { isHoldNotice, isHoldSanction } from './hold';

patchReactNativeWeb({ reduceMotion: true });

const en = TRANSLATIONS.en;
const t = (key: keyof typeof en, vars?: Record<string, string | number>): string =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key]);
const send = (type: string): void => act(() => live.handlers.forEach((h) => h({ type })));

beforeEach(() => {
  live.handlers.clear();
  testAuth.user = { ...testAuth.user, id: 'me', accountHold: null };
});
afterEach(() => cleanup());

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
const standing = (active: StandingSanction[]): AccountStanding => ({
  status: 'limited',
  active,
  past: [],
  unacknowledgedWarnings: [],
  reportAppeals: [],
  restrictions: { post: { until: null } },
});

describe('a hold in Account standing', () => {
  it('is one calm item, in the reader’s words, with no rule broken, and its review can be asked for', async () => {
    const client = fakeClient({
      'GET /me/standing': ok(standing([hold()])),
      'POST /me/appeals': ok({ id: 'a1', sanctionId: 'hold-1', caseId: null, text: 'x', status: 'open', decisionNote: null, createdAt: '2026-11-20T10:00:00.000Z', decidedAt: null }),
    });
    testAuth.client = client;
    testAuth.user = { ...testAuth.user, accountHold: { reason: 'possible_return', since: '2026-11-19T10:00:00.000Z' } };
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Your account is being checked' })).toBeTruthy();
    // Said once: no notice above the decisions repeating it, and no rule, no "found it".
    expect(screen.getAllByText(en['hold.statement'])).toHaveLength(1);
    expect(screen.queryByText(en['hold.title'])).toBeNull();
    expect(screen.queryByText(/^Rule:/)).toBeNull();
    expect(screen.queryByText(/automatic checks/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ask for a review' }));
    fireEvent.change(screen.getByLabelText('Tell us why you think we got it wrong'), { target: { value: 'This is my first account.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path === '/me/appeals')?.body).toEqual({ sanctionId: 'hold-1', text: 'This is my first account.' }));
  });

  it('is read again when the server says the account changed', async () => {
    const client = fakeClient({ 'GET /me/standing': ok(standing([hold()])) });
    testAuth.client = client;
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    await screen.findByRole('heading', { name: 'Your account is being checked' });
    const reads = () => client.calls.filter((c) => c.path === '/me/standing').length;
    const before = reads();
    send(ACCOUNT_CHANGED);
    await waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('is told apart from a post mute someone decided', () => {
    expect(isHoldSanction(hold())).toBe(true);
    expect(isHoldSanction(hold({ origin: 'moderator', statement: 'Spam links in posts.' }))).toBe(false);
  });

  it('follows the server’s own marker whatever its words, and never shows a marked hold as a rule broken', async () => {
    const marked = { ...hold({ statement: 'Worded differently one day.' }), hold: true };
    expect(isHoldSanction(marked)).toBe(true);
    expect(isHoldNotice({ title: 'Something else', data: { kind: 'sanction', sanction: 'post_mute', policy: 'other', hold: true } })).toBe(true);
    testAuth.client = fakeClient({ 'GET /me/standing': ok(standing([marked])) });
    renderWithProviders(<AccountStandingScreen onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Your account is being checked' })).toBeTruthy();
    expect(screen.queryByText(/^Rule:/)).toBeNull();
    expect(screen.queryByText('Worded differently one day.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask for a review' })).toBeTruthy();
  });

  it('is announced calmly in the inbox, in the reader’s language', () => {
    const note = { title: 'Your account is being checked', body: 'server words', data: { kind: 'sanction', sanctionId: 'hold-1', sanction: 'post_mute', policy: 'other', until: null } };
    expect(isHoldNotice(note)).toBe(true);
    expect(notificationText(note, t, 'en')).toEqual({ title: en['hold.heading'], body: en['hold.statement'] });
    const ckb = TRANSLATIONS.ckb;
    const tCkb = (key: keyof typeof ckb): string => ckb[key];
    expect(notificationText(note, tCkb, 'ckb')).toEqual({ title: ckb['hold.heading'], body: ckb['hold.statement'] });
  });
});

describe('a hold lifted while the app is open', () => {
  it('reads the account again as soon as the server says it changed', () => {
    const refresh = vi.fn(async () => undefined);
    testAuth.refreshUser = refresh;
    renderWithProviders(<AccountWatch />);
    send('gift_received');
    expect(refresh).not.toHaveBeenCalled();
    send(ACCOUNT_CHANGED);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('an account that isn’t available', () => {
  const refusal = (code: string, status: number): ApiError => ({ kind: 'client', status, code, message: 'server words' });

  it('is said the same way when messaging, inviting or adding to a group meets it', () => {
    expect(describeError(refusal('ACCOUNT_UNAVAILABLE', 403), t)).toBe('This account isn’t available.');
    expect(describeError(refusal('CANNOT_JOIN_YET', 409), t)).toBe('This person can’t join groups right now.');
    expect(describeError({ kind: 'server', status: 503, code: 'EXPORT_NOT_AVAILABLE', message: 'x' }, t)).toBe('Copies can’t be made right now. Please try again later.');
  });

  it('shows its profile calmly', async () => {
    testAuth.client = fakeClient({ 'GET /users/u2': fail({ status: 404, code: 'ACCOUNT_UNAVAILABLE', message: 'This account isn’t available' }) });
    renderWithProviders(<PublicProfileScreen userId="u2" onExit={() => undefined} />);
    expect(await screen.findByText('This account isn’t available.')).toBeTruthy();
  });

  it('keeps a comment it wrote under a byline that names nobody and opens nothing', () => {
    const c: ThreadComment = {
      id: 'c1',
      postId: 'p1',
      authorId: 'u2',
      authorRole: 'member',
      author: { id: 'u2', username: 'rojda', avatarUrl: 'https://cdn.test/rojda.png', unavailable: true },
      parentCommentId: null,
      depth: 0,
      body: 'Pir xweş e',
      status: 'visible',
      replyCount: 0,
      createdAt: '2026-10-19T10:00:00Z',
    };
    const thread = { state: { top: [c], replies: {} }, loadingReplies: [], replyingTo: null, reply: vi.fn() } as unknown as CommentThread;
    renderWithProviders(<CommentList thread={thread} onReport={vi.fn()} />);
    expect(screen.getByText('Account unavailable')).toBeTruthy();
    expect(screen.getByText('Pir xweş e')).toBeTruthy();
    expect(screen.queryByText('rojda')).toBeNull();
    expect(screen.queryByRole('button', { name: /rojda/ })).toBeNull();
  });

  it('keeps a post it shared under a byline that names nobody and opens nothing', () => {
    const item: FeedItem = {
      key: 'library:p1',
      id: 'p1',
      targetType: 'library',
      kind: 'poem',
      title: 'Şev',
      excerpt: 'Şev e…',
      imageUrl: null,
      href: '/library/p1',
      viewCount: 0,
      at: '2026-10-19T10:00:00Z',
      author: { id: 'u2', username: 'rojda', displayName: 'Rojda', avatarUrl: null, unavailable: true },
      commentCount: 0,
      engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false, bookmarks: 0 },
    };
    renderWithProviders(<FeedCard item={item} />);
    expect(screen.getByTestId('post-author').textContent).toBe('Account unavailable');
    expect(screen.queryByText('Rojda')).toBeNull();
    expect(screen.queryByRole('link', { name: /Rojda|Account unavailable/ })).toBeNull();
    expect(screen.getByText('Şev e…')).toBeTruthy();
  });
});
