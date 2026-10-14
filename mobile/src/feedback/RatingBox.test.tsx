// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('./storeReview', () => ({ requestStoreReview: vi.fn(async () => true) }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Linking, Platform } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { RatingBox } from './RatingBox';
import { GameFeedbackHost } from './GameFeedbackHost';
import { FeedbackSettingsRows } from './FeedbackSettings';
import { reportGameFinished } from './gameFinished';
import { FeedbackSession } from './session';
import { requestStoreReview } from './storeReview';
import { APP_VERSION } from './appInfo';

patchReactNativeWeb({ reduceMotion: true });

const STATE = `GET /me/app-feedback/state?platform=web&appVersion=${APP_VERSION}`;

beforeEach(() => {
  testAuth.user = { ...testAuth.user, id: 'me' };
  vi.mocked(requestStoreReview).mockClear();
});
afterEach(cleanup);

describe('RatingBox after a first game', () => {
  it('asks under three stars what could be better, and sends the stars, the chips and the words', async () => {
    const client = fakeClient({ 'POST /me/app-feedback': ok({ id: 'f1' }) });
    testAuth.client = client;
    const onClose = vi.fn();
    renderWithProviders(<RatingBox source="first_game" onClose={onClose} />);

    expect(screen.getByText('How are you enjoying Hevalo?')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    expect(screen.getByRole('radio', { name: '2 stars' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Thanks for telling us — what could be better?')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bugs' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Too hard' }));
    fireEvent.change(screen.getByLabelText('What could be better?'), { target: { value: '  The race froze  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Thank you — we read every message.')).toBeTruthy();
    expect(client.calls[0]).toMatchObject({
      method: 'POST',
      path: '/me/app-feedback',
      body: {
        stars: 2,
        categories: ['bugs', 'too_hard'],
        comment: 'The race froze',
        source: 'first_game',
        platform: 'web',
        appVersion: APP_VERSION,
        locale: 'en',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledWith('answered');
  });

  it('thanks three stars and up, with an optional “what do you love?”, and no store link anywhere', async () => {
    const client = fakeClient({ 'POST /me/app-feedback': ok({ id: 'f2' }) });
    testAuth.client = client;
    renderWithProviders(<RatingBox source="first_game" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getByText('Thank you! 💛')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Bugs' })).toBeNull();
    expect(screen.getByLabelText('What do you love?')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/store|App Store|Google Play/i);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Thank you — we read every message.');
    expect(client.calls[0]?.body).toEqual({ stars: 4, source: 'first_game', platform: 'web', appVersion: APP_VERSION, locale: 'en' });
  });

  it('asks each question once: a label that stays, never repeated by the line above it or the placeholder', () => {
    testAuth.client = fakeClient({});
    renderWithProviders(<RatingBox source="first_game" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    // the thank-you line already asks; the box keeps its name for a screen reader only
    expect(screen.queryByText('What could be better?')).toBeNull();
    expect(screen.getByLabelText('What could be better?').getAttribute('placeholder')).toBe('Tell us more (optional)');
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(screen.getAllByText('What do you love?')).toHaveLength(1);
    expect(screen.getByLabelText('What do you love?').getAttribute('placeholder')).toBe('Tell us more (optional)');
  });

  it('keeps chips picked under three out of a happy answer changed to five', async () => {
    const client = fakeClient({ 'POST /me/app-feedback': ok({ id: 'f3' }) });
    testAuth.client = client;
    renderWithProviders(<RatingBox source="first_game" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: '1 star' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lessons' }));
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Thank you — we read every message.');
    expect(client.calls[0]?.body).not.toHaveProperty('categories');
  });

  it('closes on “Not now” and tells the server it was shown', async () => {
    const client = fakeClient({ 'POST /me/app-feedback/dismiss': ok({ ok: true }) });
    testAuth.client = client;
    const onClose = vi.fn();
    renderWithProviders(<RatingBox source="first_game" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledWith('dismissed');
    expect(client.calls.map((c) => c.path)).toEqual(['/me/app-feedback/dismiss']);
  });

  it('says what went wrong when sending fails, and keeps what was written', async () => {
    testAuth.client = fakeClient({});
    renderWithProviders(<RatingBox source="first_game" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: '2 stars' }));
    fireEvent.change(screen.getByLabelText('What could be better?'), { target: { value: 'slow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByText('Thank you — we read every message.')).toBeNull());
    expect((screen.getByLabelText('What could be better?') as HTMLTextAreaElement).value).toBe('slow');
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });
});

describe('Send feedback from Settings', () => {
  it('is the same form, all at once, with the stars optional', async () => {
    const client = fakeClient({ 'POST /me/app-feedback': ok({ id: 'f4' }) });
    testAuth.client = client;
    renderWithProviders(<FeedbackSettingsRows os="ios" />);
    // no store address in app.json yet, so no "Rate Hevalo"
    expect(screen.queryByRole('button', { name: 'Rate Hevalo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(await screen.findByRole('checkbox', { name: 'Stories' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Thank you — we read every message.');
    expect(client.calls[0]?.body).toMatchObject({ categories: ['stories'], source: 'settings' });
    expect(client.calls[0]?.body).not.toHaveProperty('stars');
  });

  it('opens the store page at its reviews once the address exists', async () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    renderWithProviders(<FeedbackSettingsRows os="ios" storeUrls={{ ios: 'https://apps.apple.com/app/id1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rate Hevalo' }));
    expect(open).toHaveBeenCalledWith('https://apps.apple.com/app/id1?action=write-review');
    open.mockRestore();
  });
});

describe('GameFeedbackHost', () => {
  it('opens the box a moment after the first finished game, over the results', async () => {
    testAuth.client = fakeClient({ [STATE]: ok({ shouldPrompt: true, storeReviewEligible: false }) });
    const session = new FeedbackSession();
    renderWithProviders(<GameFeedbackHost session={session} />);
    act(() => reportGameFinished({ moment: 'won' }));
    expect(screen.queryByText('How are you enjoying Hevalo?')).toBeNull();
    expect(await screen.findByText('How are you enjoying Hevalo?', undefined, { timeout: 3000 })).toBeTruthy();
    expect(session.boxShown).toBe(true);
    // a second game this session does not open it again
    act(() => reportGameFinished({ moment: 'won' }));
    await waitFor(() => expect(screen.getAllByText('How are you enjoying Hevalo?')).toHaveLength(1));
  });

  it('never opens it after a game given up', async () => {
    const client = fakeClient({ [STATE]: ok({ shouldPrompt: true, storeReviewEligible: false }) });
    testAuth.client = client;
    const session = new FeedbackSession();
    renderWithProviders(<GameFeedbackHost session={session} />);
    act(() => reportGameFinished({ moment: 'other', gaveUp: true }));
    await waitFor(() => expect(client.calls).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByText('How are you enjoying Hevalo?')).toBeNull();
    expect(session.boxShown).toBe(false);
  });

  it('asks for the system’s store prompt after a win on a phone, when the API allows it, and records it', async () => {
    const os = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';
    try {
      const client = fakeClient({
        [`GET /me/app-feedback/state?platform=ios&appVersion=${APP_VERSION}`]: ok({ shouldPrompt: false, storeReviewEligible: true }),
        'POST /me/store-review/prompted': ok({ ok: true }),
      });
      testAuth.client = client;
      const session = new FeedbackSession();
      renderWithProviders(<GameFeedbackHost session={session} />);
      act(() => reportGameFinished({ moment: 'won' }));
      await waitFor(() => expect(requestStoreReview).toHaveBeenCalledOnce(), { timeout: 3000 });
      await waitFor(() => expect(client.calls.map((c) => c.path)).toContain('/me/store-review/prompted'));
      expect(client.calls.find((c) => c.path === '/me/store-review/prompted')?.body).toEqual({ appVersion: APP_VERSION });
      // and never the box in the same session
      expect(session.storeAsked).toBe(true);
      expect(screen.queryByText('How are you enjoying Hevalo?')).toBeNull();
    } finally {
      (Platform as { OS: string }).OS = os;
    }
  });
});
