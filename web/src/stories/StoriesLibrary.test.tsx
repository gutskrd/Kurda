import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderApp } from '../test/utils';
import { StoriesLibrary } from './StoriesLibrary';
import { clearStoryLists } from './catalogue';
import { resetSessionVariety } from './prefs';
import { fakeApi, gameView, libraryFixture, listItem, refused, type Call } from './testing';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearStoryLists();
  resetSessionVariety();
});

const library = (entry = '/app/learn/stories') =>
  renderApp(
    <Routes>
      <Route path="/app/learn/stories" element={<StoriesLibrary />} />
      <Route path="/app/learn/stories/:slug" element={<p>the story page</p>} />
      <Route path="/app/games/stories/play/:id" element={<p>the game page</p>} />
    </Routes>,
    [entry],
  );

const shelf = (name: string) => screen.getByRole('region', { name });
const cardOf = (title: string, inside: HTMLElement = document.body) => within(inside).getByText(title).closest('.story-card') as HTMLElement;
/** The regions on the page, by name, in the order they are drawn. */
const regions = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent ?? '');

describe('the library', () => {
  it('lays out the shelves in order, each card with its facts', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    const order = ['Your progress', 'Continue reading', 'Featured', 'Recently added', 'Categories', 'Bookmarks'];
    expect(regions().filter((n) => order.includes(n))).toEqual(order);

    const card = cardOf('Şengê û Pengê', shelf('Featured'));
    expect(within(card).getByRole('link')).toHaveAttribute('href', '/app/learn/stories/senge-u-penge');
    // a story's own words are marked as Kurdish; the CEFR letter carries its word for the hover and the ear
    expect(within(card).getByText('Şengê û Pengê')).toHaveAttribute('lang', 'ku');
    expect(within(card).getByTitle('A2 · Elementary')).toBeInTheDocument();
    expect(within(card).getByText('Fables')).toBeInTheDocument();
    expect(within(card).getByText('~4 min')).toBeInTheDocument();
    expect(within(card).getByText('Read aloud')).toBeInTheDocument();
    expect(card.querySelector('.story-cover svg')).not.toBeNull();

    // a story part-read says how long is left, and shows it as a hairline
    const started = cardOf('Bazar', shelf('Continue reading'));
    expect(within(started).getByText('2 min left')).toBeInTheDocument();
    expect(started.querySelector('.story-card-progress > span')).toHaveStyle({ width: '50%' });
  });

  it('shows the reader their progress: the ring of stories finished and the average check score', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    const ring = await screen.findByRole('progressbar', { name: 'Stories finished' });
    expect(ring).toHaveAttribute('aria-valuenow', '25');
    expect(ring).toHaveAttribute('aria-valuetext', '1 of 4 stories finished');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('bookmarks a story at once, tells the server, and the Bookmarks shelf follows', async () => {
    const { calls } = fakeApi({ 'GET /stories/library': libraryFixture(), 'PUT /stories/f1/bookmark': { bookmarked: true }, 'DELETE /stories/b1/bookmark': { bookmarked: false } });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    const mark = within(shelf('Featured')).getByRole('button', { name: 'Bookmark Şengê û Pengê' });
    await userEvent.click(mark);
    expect(within(shelf('Featured')).getByRole('button', { name: 'Remove the bookmark on Şengê û Pengê' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/stories/f1/bookmark')).toBe(true));
    expect(within(shelf('Bookmarks')).getByText('Şengê û Pengê')).toBeInTheDocument();

    await userEvent.click(within(shelf('Bookmarks')).getByRole('button', { name: 'Remove the bookmark on Dara Tûyê' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/stories/b1/bookmark')).toBe(true));
    expect(within(shelf('Bookmarks')).queryByText('Dara Tûyê')).toBeNull();
  });

  it('puts a refused bookmark back and says so', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture(), 'PUT /stories/f1/bookmark': refused(500, 'DOWN') });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    await userEvent.click(within(shelf('Featured')).getByRole('button', { name: 'Bookmark Şengê û Pengê' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The bookmark didn’t save.');
    expect(within(shelf('Featured')).getByRole('button', { name: 'Bookmark Şengê û Pengê' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('searches as you type, a moment after you stop', async () => {
    const { calls } = fakeApi({
      'GET /stories/library': libraryFixture(),
      'GET /stories': { stories: [listItem({ id: 'q1', slug: 'q1', title: 'Qelema Şîn' })], total: 1 },
    });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the stories' }), 'qelem');
    expect(await screen.findByText('Qelema Şîn')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/stories?')).map((c) => c.path)).toEqual(['/stories?q=qelem&limit=24']);
    expect(screen.getByText('Stories found: 1')).toBeInTheDocument();
    // the shelves make way for the finds
    expect(screen.queryByRole('region', { name: 'Featured' })).toBeNull();
  });

  it('filters by level, variety, narration and category, and brings more on request', async () => {
    const page = Array.from({ length: 24 }, (_, i) => listItem({ id: `p${i}`, slug: `p${i}`, title: `Çîrok ${i}` }));
    const { calls } = fakeApi({
      'GET /stories/library': libraryFixture(),
      'GET /stories': (c: Call) => (c.path.includes('offset=24') ? { stories: [listItem({ id: 'p24', slug: 'p24', title: 'Çîrok 24' })], total: 25 } : { stories: page, total: 25 }),
    });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    await userEvent.click(screen.getByRole('button', { name: 'A2' }));
    expect(await screen.findByText('Stories found: 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A2' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Soranî' }));
    await userEvent.click(screen.getByRole('button', { name: 'Narrated' }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe('/stories?level=2&dialect=sorani&audio=1&limit=24'));

    await userEvent.click(screen.getByRole('button', { name: 'More stories' }));
    expect(await screen.findByText('Çîrok 24')).toBeInTheDocument();
    expect(calls.at(-1)?.path).toBe('/stories?level=2&dialect=sorani&audio=1&limit=24&offset=24');
    // every find is here: no More to ask for
    expect(screen.queryByRole('button', { name: 'More stories' })).toBeNull();

    // the filters let go, the shelves come back
    await userEvent.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(await screen.findByRole('region', { name: 'Featured' })).toBeInTheDocument();
  });

  it('opens a category as a filtered list from its chip', async () => {
    const { calls } = fakeApi({ 'GET /stories/library': libraryFixture(), 'GET /stories': { stories: [], total: 0 } });
    library();
    const categories = await screen.findByRole('region', { name: 'Categories' });
    // only categories with a story in them are offered
    expect(within(categories).queryByRole('button', { name: /Legends/ })).toBeNull();
    await userEvent.click(within(categories).getByRole('button', { name: /Nature/ }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe('/stories?category=nature&limit=24'));
    expect(await screen.findByText('No stories match these filters yet.')).toBeInTheDocument();
  });

  it('names a category in the reader’s language when it has one', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    // on the filter chips and on the Categories shelf alike
    expect(await screen.findAllByRole('button', { name: /Çîrokên heywanan/ })).toHaveLength(2);
  });

  it('lets a visitor browse without personal shelves, and says what signing in adds', async () => {
    const anonymous = libraryFixture({ continue: [], bookmarks: [] });
    delete anonymous.me;
    anonymous.featured = anonymous.featured.map(({ me: _me, ...s }) => s);
    anonymous.recent = anonymous.recent.map(({ me: _me, ...s }) => s);
    fakeApi({ 'GET /stories/library': anonymous }, { signedIn: false });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Continue reading' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bookmark/ })).toBeNull();
    expect(screen.getByText(/Reading is free\. Sign in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Join with a code')).toBeNull();
  });

  it('says when nothing is published yet, and when the shelves could not be fetched', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture({ featured: [], recent: [], continue: [], bookmarks: [], total: 0 }) });
    const empty = library();
    expect(await screen.findByText(/Stories are on their way/)).toBeInTheDocument();
    empty.unmount();

    fakeApi({ 'GET /stories/library': refused(500, 'DOWN') });
    library();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load the stories');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps the way into a game with friends: an unfinished game, a code, an invite link', async () => {
    const { calls } = fakeApi({
      'GET /stories/library': libraryFixture(),
      'GET /story-games/active': {
        games: [{ id: 'g9', mode: 'solo', status: 'question', storyId: 'a', storyTitle: 'Qelema Şîn', dialect: 'kurmanci', currentIndex: 1, total: 5 }],
      },
      'POST /story-games/join': gameView({ id: 'g7' }),
    });
    library();
    const card = (await screen.findByText(/Question 2 of 5/)).closest('a')!;
    expect(card).toHaveAttribute('href', '/app/games/stories/play/g9');
    await userEvent.type(screen.getByLabelText('Join with a code'), 'abc-234');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ code: 'ABC234', extraTime: false });
  });

  it('follows an invite link straight into its game', async () => {
    const { calls } = fakeApi({ 'POST /story-games/join': gameView({ id: 'g5' }) });
    library('/app/learn/stories?id=g5');
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: 'g5', extraTime: false });
  });

  it('is Learn, on its Stories group', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('aria-current', 'page');
    expect(localStorage.getItem('hevalo_learn_view')).toBe('stories');
  });
});
