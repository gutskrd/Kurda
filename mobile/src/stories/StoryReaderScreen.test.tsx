// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryDetail, StoryMe } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { resetPrefsCache } from './prefs';
import { NANE_GERM, gameView } from './testing/views';
import { StoryReaderScreen, minutesLeft, readingPosition, translationFor } from './StoryReaderScreen';

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
    seekTo: () => Promise.resolve(),
    setPlaybackRate: () => undefined,
    remove: () => undefined,
  }),
}));

const me = (over: Partial<StoryMe> = {}): StoryMe => ({
  bookmarked: false,
  paragraph: 0,
  share: 0,
  finishedAt: null,
  bestCorrect: null,
  total: null,
  attemptsToday: 0,
  ...over,
});

const CATEGORIES = { categories: [{ slug: 'everyday', name: { en: 'Everyday life', ku: 'Jiyana rojane' }, position: 7 }] };

const routes = (extra: Parameters<typeof fakeClient>[0] = {}, story: StoryDetail = NANE_GERM) =>
  fakeClient({
    'GET /stories/nane-germ': ok(story),
    'GET /stories/categories': ok(CATEGORIES),
    'GET /story-games/options': ok({ canHostOpen: false }),
    'GET /story-games/active': ok({ games: [] }),
    'PUT /stories/s1/progress': (body) => ok({ me: me({ paragraph: (body as { paragraph: number }).paragraph, finishedAt: (body as { finished?: boolean }).finished ? '2026-11-04T10:00:00.000Z' : null }) }),
    ...extra,
  });

/** The text, scrolled: jsdom lays nothing out, so the scroller's sizes are given to it. */
function scrollText(scrollTop: number, scrollHeight: number, offsetHeight: number): void {
  const el = screen.getByTestId('story-text');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: offsetHeight, configurable: true });
  fireEvent.scroll(el, { target: { scrollTop } });
}

describe('the reader’s arithmetic', () => {
  it('reads the paragraph whose top has passed the reading line, and the end at the foot of the text', () => {
    const tops = new Map([
      [0, 0],
      [1, 300],
      [2, 600],
    ]);
    expect(readingPosition(0, 800, 2000, 100, tops, 3)).toEqual({ paragraph: 1, share: 2 / 3, finished: false });
    expect(readingPosition(0, 400, 2000, 100, tops, 3)).toEqual({ paragraph: 0, share: 1 / 3, finished: false });
    expect(readingPosition(1200, 800, 2000, 100, tops, 3)).toEqual({ paragraph: 2, share: 1, finished: true });
    // nothing measured yet: the first paragraph, honestly
    expect(readingPosition(0, 0, 0, 0, new Map(), 3)).toEqual({ paragraph: 0, share: 1 / 3, finished: false });
    expect(readingPosition(0, 0, 0, 0, new Map(), 0)).toEqual({ paragraph: 0, share: 0, finished: false });
  });

  it('counts the minutes left from how far the story has been read, never below one', () => {
    expect(minutesLeft(4, 0)).toBe(4);
    expect(minutesLeft(4, 0.5)).toBe(2);
    expect(minutesLeft(4, 0.99)).toBe(1);
    expect(minutesLeft(4, 1)).toBe(1);
  });

  it('shows the translation in the reader’s language, else English, else none', () => {
    const story = { translations: { en: ['Bread.'], de: ['Brot.'] } };
    expect(translationFor(story, 'de')).toEqual({ paragraphs: ['Brot.'], lang: 'de' });
    expect(translationFor(story, 'fr')).toEqual({ paragraphs: ['Bread.'], lang: 'en' });
    expect(translationFor({ translations: {} }, 'fr')).toBeNull();
  });
});

describe('StoryReaderScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    navigation.navigate.mockClear();
  });
  afterEach(cleanup);

  it('opens on the overview: the facts, the synopsis, where it comes from, and Read', async () => {
    testAuth.client = routes({}, { ...NANE_GERM, author: 'Hevalo', source: 'Written for Hevalo', audioCoverage: 'partial' });
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Nanê Germ' })).toBeTruthy();
    expect(screen.getByText('A1 · Beginner')).toBeTruthy();
    expect(await screen.findByText('Everyday life')).toBeTruthy();
    expect(screen.getByText('40 words')).toBeTruthy();
    expect(screen.getByText('Partly narrated')).toBeTruthy();
    expect(screen.getByText('Dayik nan dipêje.')).toBeTruthy();
    expect(screen.getByText('By Hevalo · Written for learners')).toBeTruthy();
    expect(screen.getByText('Source: Written for Hevalo')).toBeTruthy();
    // the check waits for the story to be read
    expect(screen.getByText('Finish the story first.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start the check' }).getAttribute('aria-disabled')).toBe('true');
    // Read opens the text, in the story's language
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    const text = await screen.findByText(/Dayika min nan dipêje/);
    expect(text.closest('[lang]')?.getAttribute('lang')).toBe('ku');
    expect(screen.getByText('1 min left')).toBeTruthy();
  });

  it('offers to continue where the reading stopped, with the minutes left, and the paragraph to go on from', async () => {
    testAuth.client = routes({}, { ...NANE_GERM, readingMinutes: 4, me: me({ paragraph: 1, share: 0.5 }) });
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue · 2 min left' }));
    expect(await screen.findByRole('button', { name: 'Continue from paragraph 2' })).toBeTruthy();
  });

  it('remembers where the reader is on the server as the text scrolls, and unlocks the check at the end', async () => {
    const client = routes({ 'POST /story-games': ok(gameView({ id: 'g7', mode: 'solo', status: 'question' })) });
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    await screen.findByText(/Dayika min nan dipêje/);
    scrollText(10, 0, 0);
    await waitFor(() => expect(client.calls.some((c) => c.method === 'PUT' && c.path === '/stories/s1/progress')).toBe(true));
    expect(client.calls.find((c) => c.path === '/stories/s1/progress')?.body).toEqual({ paragraph: 0, share: 0.5, finished: false });

    // the foot of the text: finished, and the check opens (an enabled button carries no aria-disabled at all).
    // The scroller reports at most one scroll a tenth of a second, so the second comes after that.
    await new Promise((resolve) => setTimeout(resolve, 150));
    scrollText(900, 1300, 400);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Start the check' })[0]!.getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(screen.getAllByRole('button', { name: 'Start the check' })[0]!);
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g7' }));
    expect(client.calls.find((c) => c.method === 'POST' && c.path === '/story-games')?.body).toEqual({
      mode: 'solo',
      storyId: 's1',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      skipReading: true,
      extraTime: false,
    });
  });

  it('shows the best score and the XP note once the story is finished and checked', async () => {
    testAuth.client = routes({}, { ...NANE_GERM, me: me({ finishedAt: '2026-11-01T10:00:00.000Z', bestCorrect: 4, total: 5, attemptsToday: 2 }) });
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    expect(await screen.findByText('Best so far: 4 of 5')).toBeTruthy();
    expect(screen.getByText('You’ve checked this story twice today, so another check earns no XP.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' }).getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText('Finish the story first.')).toBeNull();
  });

  it('saves a word from its sheet when it is a headword, and says why when the vocabulary is full', async () => {
    const client = routes(
      {
        'GET /me/saved-words': ok({ words: [] }),
        'PUT /dictionary/entries/e1/save': fail({ status: 409, code: 'LIMIT_REACHED', details: { limit: 'saved_words', max: 500 } }),
      },
      { ...NANE_GERM, glossary: [{ term: 'germ', meanings: { en: 'warm' }, entryId: 'e1', pos: 'adjective' }] },
    );
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    const word = await screen.findByRole('button', { name: 'germ' });
    expect(word.getAttribute('lang')).toBe('ku');
    fireEvent.click(word);
    expect(screen.getByText('Meaning')).toBeTruthy();
    expect(screen.getByText('adjective')).toBeTruthy();
    // the sheet's button comes after the list's
    fireEvent.click(screen.getAllByRole('button', { name: 'Save word' }).at(-1)!);
    // at once Saved; the server's refusal takes it back and says the limit
    await waitFor(() => expect(client.calls.some((c) => c.method === 'PUT' && c.path === '/dictionary/entries/e1/save')).toBe(true));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Save word' })).toHaveLength(2));
    expect(screen.getByText(/500/)).toBeTruthy();
  });

  it('knows the words already saved, and saves one from the key vocabulary that its sheet then shows as saved', async () => {
    const client = routes(
      {
        'GET /me/saved-words': ok({ words: [{ entryId: 'e2' }] }),
        'PUT /dictionary/entries/e1/save': ok({ saved: true }),
        'DELETE /dictionary/entries/e2/save': ok({ saved: false }),
      },
      {
        ...NANE_GERM,
        glossary: [
          { term: 'germ', meanings: { en: 'warm' }, entryId: 'e1' },
          { term: 'nan', meanings: { en: 'bread' }, entryId: 'e2' },
          { term: 'dayik', meanings: { en: 'mother' } },
        ],
      },
    );
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    await screen.findByRole('button', { name: 'germ' });
    // one Save per dictionary word, and the one already saved says so
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Saved' })).toHaveLength(1));
    expect(screen.getAllByRole('button', { name: 'Save word' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save word' }));
    expect(screen.getAllByRole('button', { name: 'Saved' })).toHaveLength(2);
    await waitFor(() => expect(client.calls.some((c) => c.method === 'PUT' && c.path === '/dictionary/entries/e1/save')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'germ' }));
    expect(screen.getAllByRole('button', { name: 'Saved' })).toHaveLength(3);
    // and taken out again from the list
    fireEvent.click(screen.getAllByRole('button', { name: 'Saved' })[1]!);
    await waitFor(() => expect(client.calls.some((c) => c.method === 'DELETE' && c.path === '/dictionary/entries/e2/save')).toBe(true));
  });

  it('shows a paragraph’s translation on request, in the reader’s language or English', async () => {
    testAuth.client = routes({}, { ...NANE_GERM, translations: { en: ['My mother bakes bread. The bread is warm.', 'We sit by the stove.'] } });
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Translation of paragraph 2' }));
    expect(screen.getByText('We sit by the stove.')).toBeTruthy();
    expect(screen.queryByText('My mother bakes bread. The bread is warm.')).toBeNull();
  });

  it('offers to continue an unfinished check on this story rather than throw it away', async () => {
    const client = routes({
      'GET /story-games/active': ok({
        games: [{ id: 'old', mode: 'solo', status: 'question', storyId: 's1', storyTitle: 'Nanê Germ', dialect: 'kurmanci', currentIndex: 2, total: 5 }],
      }),
      'POST /story-games': ok(gameView({ id: 'new', mode: 'solo', status: 'question' })),
    }, { ...NANE_GERM, me: me({ finishedAt: '2026-11-01T10:00:00.000Z' }) });
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the check' }));
    expect(await screen.findByText('You started a quiz on this story')).toBeTruthy();
    expect(client.calls.some((c) => c.method === 'POST' && c.path === '/story-games')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'old' });
  });

  it('bookmarks from the header at once, and opens the setup sheet to play with a friend', async () => {
    const client = routes({ 'PUT /stories/s1/bookmark': ok({ bookmarked: true }) });
    testAuth.client = client;
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bookmark' }));
    expect(screen.getByRole('button', { name: 'Bookmarked' })).toBeTruthy();
    await waitFor(() => expect(client.calls.some((c) => c.method === 'PUT' && c.path === '/stories/s1/bookmark')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'With a friend' }));
    const mode = await screen.findByRole('radiogroup', { name: 'Who’s playing' });
    expect(within(mode).getByRole('radio', { name: 'With a friend' }).getAttribute('aria-checked')).toBe('true');
  });

  it('says a story being updated is being updated, not that something broke', async () => {
    testAuth.client = fakeClient({ 'GET /stories/gone': fail({ status: 404, code: 'NOT_FOUND' }), 'GET /stories/categories': ok(CATEGORIES) });
    renderWithProviders(<StoryReaderScreen slug="gone" onExit={() => undefined} />);
    expect(await screen.findByText('This story is being updated. Try again later.')).toBeTruthy();
  });

  it('remembers a larger text size, chosen while reading', async () => {
    testAuth.client = routes();
    renderWithProviders(<StoryReaderScreen slug="nane-germ" onExit={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Read' }));
    expect(screen.getByRole('button', { name: 'Smaller text' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(JSON.parse(localStorage.getItem('hevalo_stories_prefs_v1') ?? '{}').textScale).toBe(1.15);
  });
});
