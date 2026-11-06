// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryLibrary, StoryListItem } from '@kurda/shared';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { resetPrefsCache } from './prefs';
import { NO_FILTER, isFiltering, libraryQuery } from './LibraryFilter';
import { StoriesView, defaultDialect } from './StoriesView';
import { StoriesScreen } from './StoriesScreen';

// jsdom has no matchMedia, and react-native-web reads the colour scheme and
// Reduce Motion (for the loading skeleton) through it
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
// the pull to refresh as a button: the web's control has nothing to pull
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));

const story = (over: Partial<StoryListItem>): StoryListItem => ({
  id: 's1',
  slug: 'nane-germ',
  title: 'Nanê Germ',
  summary: 'Dayik nan dipêje.',
  dialect: 'kurmanci',
  level: 1,
  length: 'short',
  wordCount: 180,
  readingMinutes: 2,
  fullyNarrated: false,
  language: 'ku',
  cefr: 'A1',
  audioCoverage: 'none',
  category: 'everyday',
  tradition: 'original',
  author: null,
  featured: false,
  cover: null,
  publishedAt: null,
  ...over,
});

const me = (over: Partial<NonNullable<StoryListItem['me']>> = {}): NonNullable<StoryListItem['me']> => ({
  bookmarked: false,
  paragraph: 0,
  share: 0,
  finishedAt: null,
  bestCorrect: null,
  total: null,
  attemptsToday: 0,
  ...over,
});

const NAN = story({ featured: true, cover: 'gola-sin', me: me() });
const BAJAR = story({ id: 's2', slug: 'bajar', title: 'Bajar', length: 'long', level: 2, cefr: 'A2', category: 'village', audioCoverage: 'full', fullyNarrated: true, me: me({ share: 0.4, paragraph: 3 }) });
const BAZAR = story({ id: 's3', slug: 'bazar', title: 'بازاڕ', dialect: 'sorani', category: 'fable', me: me({ bookmarked: true }) });

const CATEGORIES: StoryLibrary['categories'] = [
  { slug: 'fable', name: { en: 'Animal fables', ku: 'Çîrokên heywanan' }, position: 2, count: 1 },
  { slug: 'village', name: { en: 'Village life' }, position: 5, count: 1 },
  { slug: 'everyday', name: { en: 'Everyday life' }, position: 7, count: 1 },
];

const library = (over: Partial<StoryLibrary> = {}): StoryLibrary => ({
  featured: [NAN],
  recent: [NAN, BAJAR, BAZAR],
  continue: [BAJAR],
  bookmarks: [BAZAR],
  categories: CATEGORIES,
  total: 3,
  me: { finished: 1, total: 3, averageScore: 0.8 },
  ...over,
});

function client(extra: Parameters<typeof fakeClient>[0] = {}, lib: StoryLibrary = library()) {
  return fakeClient({
    'GET /stories/library': ok(lib),
    'GET /story-games/active': ok({ games: [] }),
    ...extra,
  });
}

async function openJoin(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
  await screen.findByLabelText('Join code');
}

/** Typed or pasted into the one field under the six boxes; the sixth character sends it. */
function typeCode(value: string): void {
  fireEvent.change(screen.getByLabelText('Join code'), { target: { value } });
}

describe('the library’s helpers', () => {
  it('sets a game up in Soranî in a Soranî interface, else in what was chosen last, else Kurmancî', () => {
    expect(defaultDialect('ckb', 'kurmanci')).toBe('sorani');
    expect(defaultDialect('en', 'sorani')).toBe('sorani');
    expect(defaultDialect('de', null)).toBe('kurmanci');
  });

  it('turns the shelves into a search for anything typed or chosen, and asks the list in the server’s own terms', () => {
    expect(isFiltering('', NO_FILTER)).toBe(false);
    expect(isFiltering('  ', NO_FILTER)).toBe(false);
    expect(isFiltering('nan', NO_FILTER)).toBe(true);
    expect(isFiltering('', { ...NO_FILTER, narrated: true })).toBe(true);
    expect(isFiltering('', { ...NO_FILTER, all: true })).toBe(true);
    expect(isFiltering('', { ...NO_FILTER, sort: 'newest' })).toBe(true);
    expect(isFiltering('', { ...NO_FILTER, length: 'long' })).toBe(true);
    expect(libraryQuery(' nan ', { ...NO_FILTER, level: 3, dialect: 'sorani', length: 'short', narrated: true, category: 'fable', sort: 'title' })).toEqual({
      q: 'nan',
      category: 'fable',
      level: 3,
      dialect: 'sorani',
      length: 'short',
      audio: true,
      sort: 'title',
      limit: 24,
      offset: undefined,
    });
    // the list's own order is left out, so its question is the one it always was
    expect(libraryQuery('', { ...NO_FILTER, level: 1 }).sort).toBeUndefined();
    expect(libraryQuery('', { ...NO_FILTER, all: true }, 24)).toMatchObject({ limit: 24, offset: 24 });
  });

});

describe('StoriesView', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    // each test starts with a quiet phone: the chips tapped in the one before must not use up the bookmark's buzz
    resetHaptics();
    testAuth.user = { ...testAuth.user, guest: false };
    navigation.navigate.mockClear();
    navigation.replace.mockClear();
  });
  afterEach(cleanup);

  it('reads the library and the games under way again when pulled down', async () => {
    const c = client();
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByLabelText(/Your progress\. 1 of 3 stories read/);
    const count = (path: string) => c.calls.filter((call) => call.path === path).length;
    const before = [count('/stories/library'), count('/story-games/active')];
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect([count('/stories/library'), count('/story-games/active')]).toEqual([before[0]! + 1, before[1]! + 1]));
  });

  it('opens on the reading so far, then the shelves: continue, featured, recent, categories, bookmarks', async () => {
    testAuth.client = client();
    renderWithProviders(<StoriesView />);
    expect(await screen.findByLabelText(/Your progress\. 1 of 3 stories read\. Average check score: 80%/)).toBeTruthy();
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings).toEqual(['Continue reading', 'Featured', 'Recently added', 'Categories', 'Bookmarks', 'Play together']);
    // a card reads its title in the story's language and shows its facts in the app's
    const cards = screen.getAllByRole('button', { name: 'Bajar' });
    expect(cards[0]!.getAttribute('lang')).toBe('ku');
    // its level by a plain name, never the CEFR letter
    expect(within(cards[0]!).getByText('Beginner')).toBeTruthy();
    expect(within(cards[0]!).queryByText('A2')).toBeNull();
    expect(within(cards[0]!).getByText('Village life · ~2 min')).toBeTruthy();
    fireEvent.click(cards[0]!);
    expect(navigation.navigate).toHaveBeenCalledWith('StoryReader', { slug: 'bajar' });
  });

  it('shows a guest the shelves without the personal rows, and asks the server for no games', async () => {
    testAuth.user = { ...testAuth.user, guest: true };
    const c = client();
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    expect(screen.queryByText('Your progress')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Continue reading' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Bookmarks' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Play together' })).toBeNull();
    expect(c.calls.some((call) => call.path === '/story-games/active')).toBe(false);
  });

  it('searches as you type, with a short pause, and pages with More', async () => {
    const c = client({
      'GET /stories?q=nan&limit=24': ok({ stories: [NAN], total: 25 }),
      'GET /stories?q=nan&limit=24&offset=1': ok({ stories: [BAJAR], total: 25 }),
    });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    fireEvent.change(screen.getByLabelText('Search stories'), { target: { value: 'na' } });
    fireEvent.change(screen.getByLabelText('Search stories'), { target: { value: 'nan' } });
    expect(await screen.findByText('25 stories found')).toBeTruthy();
    // the pause swallowed the half-typed word
    expect(c.calls.filter((call) => call.path.startsWith('/stories?')).map((call) => call.path)).toEqual(['/stories?q=nan&limit=24']);
    expect(screen.queryByRole('heading', { name: 'Featured' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('button', { name: 'Bajar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nanê Germ' })).toBeTruthy();
    // back to the shelves
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { name: 'Featured' })).toBeTruthy();
  });

  /** The sheet's radio groups by name, and what each choice in one is called. */
  const sheet = () => screen.getByTestId('stories-filter-sheet');
  const group = (name: string) => within(sheet()).getByRole('radiogroup', { name });
  const names = (radios: HTMLElement) => within(radios).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
  const counts = (c: ReturnType<typeof client>) => c.calls.filter((call) => call.path.includes('limit=1&') || call.path.endsWith('limit=1')).map((call) => call.path);
  const lists = (c: ReturnType<typeof client>) => c.calls.filter((call) => call.path.includes('limit=24')).map((call) => call.path);

  it('puts sorting and filtering behind one funnel beside the search, every choice in plain words', async () => {
    const c = client({}, library({ levels: [{ level: 1, count: 2 }, { level: 2, count: 1 }] }));
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    // no row of bare level letters over the shelves any more
    expect(screen.queryByRole('button', { name: 'A2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Narrated' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));

    expect(names(group('Sort by'))).toEqual(['Easiest first', 'Newest', 'A to Z']);
    // only the levels that have a story, each by a plain name with what it means
    expect(names(group('Level'))).toEqual(['Any level', 'Starter, First words and short sentences', 'Beginner, Everyday sentences and short stories']);
    expect(names(group('Kurdish'))).toEqual(['Either', 'Kurmancî, Northern Kurdish · Latin letters', 'Soranî, Central Kurdish · Arabic script']);
    expect(names(group('Length'))).toEqual(['Any length', 'Short, 1–2 min', 'Medium, 3–5 min', 'Long, 5–8 min']);
    expect(within(sheet()).getByRole('switch', { name: 'Read aloud' })).toBeTruthy();
    expect(names(group('Category'))).toEqual(['Any category', 'Animal fables, 1', 'Village life, 1', 'Everyday life, 1']);
    expect(sheet().textContent).not.toMatch(/\b[ABC][12]\b/);
    // the whole library's count is known without asking
    expect(within(sheet()).getByRole('button', { name: 'Show 3 stories' })).toBeTruthy();
    expect(counts(c)).toEqual([]);
  });

  it('is a draft until Show N stories, whose number the server is asked for once the choices settle', async () => {
    const c = client({
      'GET /stories?level=2&length=long&limit=1': ok({ stories: [BAJAR], total: 1 }),
      'GET /stories?level=2&length=long&sort=newest&limit=24': ok({ stories: [BAJAR], total: 1 }),
    });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    fireEvent.click(within(group('Level')).getByRole('radio', { name: 'Beginner, Everyday sentences and short stories' }));
    fireEvent.click(within(group('Length')).getByRole('radio', { name: 'Long, 5–8 min' }));
    expect(await within(sheet()).findByRole('button', { name: 'Show 1 story' })).toBeTruthy();
    // one question for the settled choices, not one per tap; the order changes no count; no list yet
    fireEvent.click(within(group('Sort by')).getByRole('radio', { name: 'Newest' }));
    expect(counts(c)).toEqual(['/stories?level=2&length=long&limit=1']);
    expect(lists(c)).toEqual([]);
    expect(screen.getByRole('heading', { name: 'Featured' })).toBeTruthy();

    fireEvent.click(within(sheet()).getByRole('button', { name: 'Show 1 story' }));
    expect(await screen.findByText('1 story found')).toBeTruthy();
    expect(lists(c)).toEqual(['/stories?level=2&length=long&sort=newest&limit=24']);
    // the funnel says what is on, and a chip under the search says each part
    expect(screen.getByRole('button', { name: 'Sort and filter — Newest, Beginner, Long' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Newest' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Beginner' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Long' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
  });

  it('says so on its button when nothing would match', async () => {
    testAuth.client = client({ 'GET /stories?dialect=sorani&length=long&limit=1': ok({ stories: [], total: 0 }) });
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    fireEvent.click(within(group('Kurdish')).getByRole('radio', { name: 'Soranî, Central Kurdish · Arabic script' }));
    fireEvent.click(within(group('Length')).getByRole('radio', { name: 'Long, 5–8 min' }));
    expect(await within(sheet()).findByRole('button', { name: 'No stories match' })).toBeTruthy();
  });

  it('leaves the library as it was when the sheet is closed another way, and Reset puts the choices back', async () => {
    const c = client({ 'GET /stories?audio=1&limit=1': ok({ stories: [BAJAR], total: 1 }) });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    const reset = () => within(sheet()).getByRole('button', { name: 'Reset' }).getAttribute('aria-disabled') === 'true';
    expect(reset()).toBe(true);
    fireEvent.click(within(sheet()).getByRole('switch', { name: 'Read aloud' }));
    expect(reset()).toBe(false);
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Reset' }));
    expect(reset()).toBe(true);
    fireEvent.click(within(group('Level')).getByRole('radio', { name: 'Starter, First words and short sentences' }));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }));
    // closed without Show: nothing was asked for, and the sheet opens again on what the library shows
    expect(lists(c)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Sort and filter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    await waitFor(() => expect(group('Level').querySelector('[aria-checked="true"]')?.getAttribute('aria-label')).toBe('Any level'));
  });

  it('opens a category from the shelf, and lets each part go from its chip, or all of them at once', async () => {
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    const c = client({
      'GET /stories?category=fable&limit=24': ok({ stories: [BAZAR], total: 1 }),
      'GET /stories?category=fable&dialect=sorani&limit=1': ok({ stories: [BAZAR], total: 1 }),
      'GET /stories?category=fable&dialect=sorani&limit=24': ok({ stories: [BAZAR], total: 1 }),
    });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    // a category from the shelves' own chips, with its count
    fireEvent.click(screen.getByRole('button', { name: 'Animal fables, 1' }));
    expect(felt).toEqual(['select']);
    expect(await screen.findByRole('button', { name: 'بازاڕ' })).toBeTruthy();
    expect(screen.getByText('1 story found')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sort and filter — Animal fables' })).toBeTruthy();

    // a chip opens the sheet on what is shown
    fireEvent.click(screen.getByRole('button', { name: 'Animal fables' }));
    expect(group('Category').querySelector('[aria-checked="true"]')?.getAttribute('aria-label')).toBe('Animal fables, 1');
    fireEvent.click(within(group('Kurdish')).getByRole('radio', { name: 'Soranî, Central Kurdish · Arabic script' }));
    fireEvent.click(await within(sheet()).findByRole('button', { name: 'Show 1 story' }));
    await waitFor(() => expect(lists(c).at(-1)).toBe('/stories?category=fable&dialect=sorani&limit=24'));

    // each part's ✕ lets just that part go
    fireEvent.click(screen.getByRole('button', { name: 'Remove Soranî' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sort and filter — Animal fables' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    // and with two on, Clear all lets both go
    fireEvent.click(screen.getByRole('button', { name: 'Animal fables' }));
    fireEvent.click(within(group('Kurdish')).getByRole('radio', { name: 'Soranî, Central Kurdish · Arabic script' }));
    fireEvent.click(await within(sheet()).findByRole('button', { name: 'Show 1 story' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(await screen.findByRole('heading', { name: 'Featured' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Animal fables' })).toBeNull();
    stop();
  });

  it('bookmarks at once, asks the server after, and takes it back when the server refuses', async () => {
    const c = client({
      'PUT /stories/s1/bookmark': ok({ bookmarked: true }),
      'DELETE /stories/s3/bookmark': fail({ status: 500, kind: 'server', message: 'no' }),
    });
    testAuth.client = c;
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    // Nanê Germ is on two shelves; one tap marks both and files it under Bookmarks
    const featured = screen.getByRole('heading', { name: 'Featured' }).parentElement!;
    fireEvent.click(within(featured).getByRole('button', { name: 'Bookmark' }));
    expect(felt).toEqual(['tap']);
    await waitFor(() => expect(c.calls.some((call) => call.method === 'PUT' && call.path === '/stories/s1/bookmark')).toBe(true));
    const bookmarks = screen.getByRole('heading', { name: 'Bookmarks' }).parentElement!;
    expect(within(bookmarks).getByRole('button', { name: 'Nanê Germ' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Bookmarked' }).length).toBeGreaterThanOrEqual(3);

    // the Soranî story's bookmark cannot be taken off: the mark comes back and the refusal is said
    const before = screen.getAllByRole('button', { name: 'Bookmarked' }).length;
    fireEvent.click(within(bookmarks).getAllByRole('button', { name: 'Bookmarked' }).at(-1)!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Bookmarked' }).length).toBe(before));
    expect(screen.getByText(/try again|went wrong|could not/i)).toBeTruthy();
    stop();
  });

  it('says the stories are on their way rather than showing empty shelves', async () => {
    testAuth.client = client({}, library({ featured: [], recent: [], continue: [], bookmarks: [], categories: [], total: 0, me: { finished: 0, total: 0, averageScore: null } }));
    renderWithProviders(<StoriesView />);
    expect(await screen.findByText('Stories are on their way — a native speaker checks each one first.')).toBeTruthy();
    expect(screen.getByText('No checks yet')).toBeTruthy();
  });

  it('offers to try again when the library does not load', async () => {
    const c = fakeClient({ 'GET /stories/library': fail({ status: 500, kind: 'server', message: 'down' }), 'GET /story-games/active': ok({ games: [] }) });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(c.calls.filter((call) => call.path === '/stories/library').length).toBe(2));
  });

  it('joins any game by its code, however it was typed, in the same boxes as the Games hub', async () => {
    const c = client({ 'POST /play/join': ok({ game: 'stories', lobbyId: 'g9' }) });
    testAuth.client = c;
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    await openJoin();
    // too short to be a code, and nothing a code cannot hold: nothing is asked yet
    typeCode('AB1');
    expect((screen.getByLabelText('Join code') as HTMLInputElement).value).toBe('AB');
    expect(c.calls.some((call) => call.path === '/play/join')).toBe(false);
    typeCode('abc-234');
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('StoryGame', { id: 'g9' }));
    expect(c.calls.find((call) => call.path === '/play/join')?.body).toEqual({ code: 'ABC234' });
  });

  it('takes a pasted invite link to any game straight to that game', async () => {
    testAuth.client = client();
    renderWithProviders(<StoriesView />);
    await screen.findByRole('heading', { name: 'Featured' });
    await openJoin();
    const lobby = 'a1b2c3d4-0000-4000-8000-000000000001';
    typeCode(`https://hevalo.app/app/games/rhyme-match?id=${lobby}`);
    await act(async () => undefined);
    expect(navigation.navigate).toHaveBeenCalledWith('RhymeMatch', { id: lobby });
  });
});

describe('StoriesScreen', () => {
  afterEach(cleanup);

  it('hands an invite link that opened the app over to the game itself', () => {
    testAuth.client = client();
    renderWithProviders(<StoriesScreen id="g7" onExit={() => undefined} />);
    expect(navigation.replace).toHaveBeenCalledWith('StoryGame', { id: 'g7' });
  });
});
