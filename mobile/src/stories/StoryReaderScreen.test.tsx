// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { resetPrefsCache } from './prefs';
import { NANE_GERM, gameView } from './testing/views';
import { StoryReaderScreen } from './StoryReaderScreen';

// jsdom has no matchMedia, and react-native-web reads the colour scheme and
// Reduce Motion through it
vi.hoisted(() => {
  window.matchMedia ??= ((media: string) => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// nothing is played in these tests; the narrator only needs a player to exist
vi.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    addListener: () => ({ remove: () => undefined }),
    replace: () => undefined,
    play: () => undefined,
    pause: () => undefined,
    setPlaybackRate: () => undefined,
    remove: () => undefined,
  }),
}));

const routes = (extra: Parameters<typeof fakeClient>[0] = {}) =>
  fakeClient({
    'GET /stories/nane-germ': ok(NANE_GERM),
    'GET /story-games/options': ok({ canHostOpen: false }),
    'GET /story-games/active': ok({ games: [] }),
    ...extra,
  });

describe('StoryReaderScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    navigation.navigate.mockClear();
  });
  afterEach(cleanup);

  it('lists the story’s words again, the way a screen reader reaches their meanings', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    const word = await screen.findByRole('button', { name: 'germ' });
    expect(word.getAttribute('lang')).toBe('ku');
    fireEvent.click(word);
    expect(screen.getByText('Meaning')).toBeTruthy();
    expect(screen.getAllByText('warm').length).toBeGreaterThan(1);
  });

  it('quizzes you at once with the plain defaults, straight to the questions', async () => {
    const client = routes({ 'POST /story-games': ok(gameView({ id: 'g7', mode: 'solo', status: 'question' })) });
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz yourself' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g7' }));
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/story-games')?.body).toEqual({
      mode: 'solo',
      storyId: 's1',
      questionCount: 3,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      skipReading: true,
    });
  });

  it('offers to continue an unfinished quiz on this story rather than throw it away', async () => {
    const client = routes({
      'GET /story-games/active': ok({
        games: [{ id: 'old', mode: 'solo', status: 'question', storyTitle: 'Nanê Germ', dialect: 'kurmanci', currentIndex: 2, total: 3 }],
      }),
      'GET /story-games/old': ok(gameView({ id: 'old', mode: 'solo', status: 'question' })),
      'POST /story-games': ok(gameView({ id: 'new', mode: 'solo', status: 'question' })),
    });
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz yourself' }));
    expect(await screen.findByText('You started a quiz on this story')).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/story-games')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'old' });
  });

  it('opens the setup sheet for this story to play it with a friend', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'With a friend' }));
    const mode = await screen.findByRole('radiogroup', { name: 'Who’s playing' });
    expect(within(mode).getByRole('radio', { name: 'With a friend' }).getAttribute('aria-checked')).toBe('true');
  });

  it('says a story being updated is being updated, not that something broke', async () => {
    testAuth.client = fakeClient({ 'GET /stories/gone': fail({ status: 404, code: 'NOT_FOUND' }) });
    renderWithProviders(<StoryReaderScreen slug="gone" onExit={() => undefined} />);
    expect(await screen.findByText('This story is being updated. Try again later.')).toBeTruthy();
  });

  it('remembers a larger text size', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    await screen.findByRole('button', { name: 'Quiz yourself' });
    expect(screen.getByRole('button', { name: 'Smaller text' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(JSON.parse(localStorage.getItem('hevalo_stories_prefs_v1') ?? '{}').textScale).toBe(1.15);
  });
});
