// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('./testing/svg'));
vi.mock('expo-secure-store', () => import('./testing/stubs'));
vi.mock('expo-linear-gradient', () => import('./testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('./testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('./testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('./testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../navigation/hardwareBack', () => import('../navigation/testing/hardwareBack'));
vi.mock('../chat/useChatSocket', () => ({ useChatSocket: () => undefined }));
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: null }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ACCOUNT_HELD } from '@kurda/shared';
import { renderWithProviders } from './testing/harness';
import { patchReactNativeWeb } from './testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from './testing/auth';
import { navigation } from '../play/testing/navigation';
import { TRANSLATIONS } from '../i18n/translations';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { memoryStore } from '../keyboard/deviceStore';
import { describePictureFailure, describePostError } from '../composer/errors';
import { describeUploadFailure } from '../profile/photoUploadResult';
import { ChatScreen } from '../chat/ChatScreen';
import { ComposeScreen } from '../composer/ComposeScreen';
import { CommentComposer } from '../comments/CommentList';
import type { CommentThread } from '../comments/useCommentThread';
import { LetterComposer } from '../letters/LetterComposer';
import { NewGroupSheet } from '../groups/NewGroupSheet';
import { HeldBanner, HeldNotice } from './HeldNotice';
import { SendErrorNotice } from './SendError';
import { restrictionOf, sendErrorOf } from './sendErrors';

patchReactNativeWeb({ reduceMotion: true });

const en = TRANSLATIONS.en;
const t = (key: keyof typeof en, vars?: Record<string, string | number>): string =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), en[key]);
const HELD_SENTENCE = en['hold.title'];
const HOLD = { reason: 'possible_return' as const, since: '2026-11-19T10:00:00.000Z' };
const refusal = { code: ACCOUNT_HELD, status: 403, message: 'this account is held' };
const asError = (over: Partial<ApiError> = {}): ApiError => ({ kind: 'client', ...refusal, ...over });
const heldBody = JSON.stringify({ code: ACCOUNT_HELD, message: 'this account is held' });
const disabled = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true';

const signIn = (held: boolean): void => {
  testAuth.user = { ...testAuth.user, id: 'me', username: 'baran', accountHold: held ? HOLD : null };
};

beforeEach(() => navigation.navigate.mockClear());
afterEach(() => {
  cleanup();
  signIn(false);
});

describe('the held notice', () => {
  it('says what waits and that learning does not, with why and the way to Account standing', () => {
    signIn(true);
    renderWithProviders(<HeldNotice />);
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy();
    const why = screen.getByRole('button', { name: 'Why?' });
    expect(screen.queryByText(en['hold.whyBody'])).toBeNull();
    fireEvent.click(why);
    expect(screen.getByText(en['hold.whyBody'])).toBeTruthy();
    expect(why.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(navigation.navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('never speaks of other people, networks or devices', () => {
    for (const key of ['hold.title', 'hold.why', 'hold.whyBody'] as const) {
      expect(en[key]).not.toMatch(/network|device|internet|address|\bIP\b|someone else|other (people|accounts?)|banned/i);
    }
  });

  it('shows nothing for an account nobody is checking', () => {
    signIn(false);
    renderWithProviders(<HeldBanner />);
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull();
  });

  it('reads in Soranî, in the reader’s own words', async () => {
    signIn(true);
    localStorage.setItem('kurda_locale_v1', 'ckb');
    try {
      renderWithProviders(<HeldNotice />);
      await act(async () => undefined);
      expect(screen.getByText(TRANSLATIONS.ckb['hold.title'])).toBeTruthy();
      expect(screen.getByRole('button', { name: TRANSLATIONS.ckb['hold.why'] })).toBeTruthy();
    } finally {
      localStorage.removeItem('kurda_locale_v1');
    }
  });
});

describe('an ACCOUNT_HELD refusal', () => {
  it('is a limit on the account, said in the same sentence by every path that words a refusal', () => {
    expect(restrictionOf(asError())).toEqual({ kind: 'held' });
    expect(describeError(asError(), t)).toBe(HELD_SENTENCE);
    expect(sendErrorOf(asError(), t, 'en')).toEqual({ message: HELD_SENTENCE, restriction: { kind: 'held' } });
    expect(describePostError(asError(), t)).toBe(HELD_SENTENCE);
    expect(describePictureFailure(403, heldBody, t, 'en')).toBe(HELD_SENTENCE);
    expect(describeUploadFailure(403, heldBody, t, 'en')).toBe(HELD_SENTENCE);
    // A rate limit that happens to carry the code is still a rate limit.
    expect(restrictionOf(asError({ kind: 'rate_limited', status: 429 }))).toBeNull();
  });

  it('shows the sentence and the way to Account standing wherever a send error is shown', () => {
    renderWithProviders(<SendErrorNotice error={asError()} />);
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeTruthy();
    expect(screen.queryByText(refusal.message)).toBeNull();
  });

  it('is said once beside a composer that already shows the notice', () => {
    signIn(true);
    renderWithProviders(<SendErrorNotice error={asError()} heldShownBeside />);
    expect(screen.queryByText(HELD_SENTENCE)).toBeNull();
  });
});

describe('each place a held account would post, message, upload, write or join', () => {
  it('a message: the notice stands where the field was', async () => {
    signIn(true);
    testAuth.client = fakeClient({ 'GET /chat/u2/messages': ok({ messages: [] }), 'POST /chat/u2/read': ok({ ok: true }) });
    renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send a gift' })).toBeNull();
  });

  it('a message refused as held says the sentence, not the server’s words', async () => {
    signIn(false);
    testAuth.client = fakeClient({
      'GET /chat/u2/messages': ok({ messages: [] }),
      'POST /chat/u2/read': ok({ ok: true }),
      'POST /chat/u2/typing': ok({ ok: true }),
      'POST /chat/u2/messages': fail(refusal),
    });
    renderWithProviders(<ChatScreen userId="u2" username="rojda" onExit={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Silav' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.queryByText(refusal.message)).toBeNull();
  });

  it('a post: the composer says so before anything is written, with Post off', async () => {
    signIn(true);
    testAuth.client = fakeClient({ 'GET /me/library/drafts?limit=20': ok({ posts: [] }) });
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy();
    expect(disabled(screen.getByRole('button', { name: 'Post' }))).toBe(true);
    expect(screen.queryByLabelText('Your post')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add pictures' })).toBeNull();
  });

  it('a post refused as held says the sentence, not the server’s words', async () => {
    signIn(false);
    testAuth.client = fakeClient({ 'GET /me/library/drafts?limit=20': ok({ posts: [] }), 'POST /library/posts': fail(refusal) });
    renderWithProviders(<ComposeScreen onExit={() => undefined} store={memoryStore()} />);
    fireEvent.change(await screen.findByLabelText('Your post'), { target: { value: 'Silav hevalno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.queryByText(refusal.message)).toBeNull();
  });

  it('a comment: the notice stands where the box was', () => {
    signIn(true);
    const thread = { replyingTo: null, cancelReply: () => undefined } as unknown as CommentThread;
    renderWithProviders(
      <CommentComposer thread={thread} value="" onChangeText={() => undefined} onSubmit={() => undefined} ready={false} placeholder="Add a comment…" maxLength={2000} />,
    );
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.queryByLabelText('Add a comment…')).toBeNull();
  });

  it('a letter: the notice stands where the paper was', () => {
    signIn(true);
    renderWithProviders(<LetterComposer label="Your letter" busy={false} onSend={() => undefined} canDraw={false} />);
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.queryByLabelText('Your letter')).toBeNull();
  });

  it('a group: starting one says the sentence, with Create off', () => {
    signIn(true);
    testAuth.client = fakeClient();
    renderWithProviders(<NewGroupSheet open limit={null} onClose={() => undefined} onCreated={() => undefined} />);
    expect(screen.getByText(HELD_SENTENCE)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hevalên Kurmancî' } });
    expect(disabled(screen.getByRole('button', { name: 'Create group' }))).toBe(true);
  });

  it('a group refused as held says the sentence calmly, with the way to Account standing', async () => {
    signIn(false);
    const client = fakeClient({ 'POST /groups': fail(refusal) });
    testAuth.client = client;
    renderWithProviders(<NewGroupSheet open limit={null} onClose={() => undefined} onCreated={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hevalên Kurmancî' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/groups')).toBe(true));
    expect(await screen.findByText(HELD_SENTENCE)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeTruthy();
    expect(screen.queryByText(refusal.message)).toBeNull();
  });
});
