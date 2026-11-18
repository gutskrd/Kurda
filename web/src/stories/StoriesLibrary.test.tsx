import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { storyRugFor } from '@kurda/shared';
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
    // A story's words are marked as Kurdish; its level is a plain name with a hover hint, never a CEFR letter.
    expect(within(card).getByText('Şengê û Pengê')).toHaveAttribute('lang', 'ku');
    expect(within(card).getByText('Beginner')).toHaveAttribute('title', 'Everyday sentences and short stories');
    expect(within(card).queryByText('A2')).toBeNull();
    expect(within(card).getByText('Animal fables')).toBeInTheDocument();
    expect(within(card).getByText('~4 min')).toBeInTheDocument();
    expect(within(card).getByText('Read aloud')).toBeInTheDocument();
    // A story without a chosen cover lies on its own rug; one with a cover wears its picture.
    expect(card.querySelector('.story-cover img')).toHaveAttribute('src', `/cosmetics/backgrounds/${storyRugFor('senge-u-penge').file}`);
    expect(card.querySelector('.story-cover svg')).toBeNull();
    expect(cardOf('Dara Tûyê', shelf('Bookmarks')).querySelector('.story-cover img')).toHaveAttribute('src', '/cosmetics/backgrounds/made-06-gola-sin.webp');

    // A story part-read says how long is left, and shows it as a hairline.
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
    expect(calls.filter((c) => c.path.startsWith('/stories?')).map((c) => c.path)).toEqual(['/stories?q=qelem&dialect=kurmanci&limit=24']);
    expect(screen.getByText('Stories found: 1')).toBeInTheDocument();
    // The shelves make way for the finds.
    expect(screen.queryByRole('region', { name: 'Featured' })).toBeNull();
  });

  it('filters by level and narration from the panel, in the variety on show, and brings more on request', async () => {
    const page = Array.from({ length: 24 }, (_, i) => listItem({ id: `p${i}`, slug: `p${i}`, title: `Çîrok ${i}` }));
    const { calls } = fakeApi({
      'GET /stories/library': libraryFixture(),
      'GET /stories': (c: Call) => (c.path.includes('offset=24') ? { stories: [listItem({ id: 'p24', slug: 'p24', title: 'Çîrok 24' })], total: 25 } : { stories: page, total: 25 }),
    });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    const panel = screen.getByRole('dialog', { name: 'Sort and filter' });
    await userEvent.click(within(panel).getByRole('radio', { name: 'Beginner' }));
    await userEvent.click(within(panel).getByRole('switch', { name: 'Read aloud' }));
    await userEvent.click(await within(panel).findByRole('button', { name: 'Show 25 stories' }));
    expect(await screen.findByText('Stories found: 25')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.includes('limit=24')).map((c) => c.path)).toEqual(['/stories?level=2&dialect=kurmanci&audio=1&limit=24']);

    await userEvent.click(screen.getByRole('button', { name: 'More stories' }));
    expect(await screen.findByText('Çîrok 24')).toBeInTheDocument();
    expect(calls.at(-1)?.path).toBe('/stories?level=2&dialect=kurmanci&audio=1&limit=24&offset=24');
    // Every find is here: no More to ask for.
    expect(screen.queryByRole('button', { name: 'More stories' })).toBeNull();

    // The filters let go all at once, the shelves come back.
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(await screen.findByRole('region', { name: 'Featured' })).toBeInTheDocument();
  });

  it('opens a category as a filtered list from its chip', async () => {
    const { calls } = fakeApi({ 'GET /stories/library': libraryFixture(), 'GET /stories': { stories: [], total: 0 } });
    library();
    const categories = await screen.findByRole('region', { name: 'Categories' });
    // Only categories with a story in them are offered.
    expect(within(categories).queryByRole('button', { name: /Legends/ })).toBeNull();
    await userEvent.click(within(categories).getByRole('button', { name: /Nature/ }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe('/stories?category=nature&dialect=kurmanci&limit=24'));
    expect(await screen.findByText('No stories match these filters yet.')).toBeInTheDocument();
  });

  it('names a category in the reader’s language when it has one', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    // On the Categories shelf, and in the panel's categories alike.
    expect(await screen.findAllByRole('button', { name: /Çîrokên ajalan/ })).toHaveLength(1);
    await userEvent.click(await screen.findByRole('button', { name: 'Rêz bike û parzûn bike' }));
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: /Çîrokên ajalan/ })).toBeInTheDocument();
  });

  it('names the categories it knows in every language from its own words, and one added since from the list', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    const kawa = listItem({ id: 'k1', slug: 'kmr-kawaye-hesinkar', title: 'Kawayê Hesinkar', level: 3, length: 'saga', category: 'legend', cover: 'kawa' });
    const fixture = libraryFixture({ legends: [kawa] });
    // The list names categories in English, Kurmancî and Soranî only; the last two were added by an editor since.
    fixture.categories = [
      ...fixture.categories.map((c) => (c.slug === 'legend' ? { ...c, count: 1 } : c)),
      { slug: 'poems', name: { en: 'Poems', de: 'Gedichte' }, position: 8, count: 1 },
      { slug: 'songs', name: { en: 'Songs' }, position: 9, count: 1 },
    ];
    fakeApi({ 'GET /stories/library': fixture });
    library();
    // The legends' shelf is named in German, and so is every chip of a category the app knows.
    expect(await screen.findByRole('region', { name: 'Sagen und Geschichte' })).toBeInTheDocument();
    const categories = shelf('Kategorien');
    for (const name of [/^Tierfabeln/, /^Alltag/, /^Natur/, /^Sagen und Geschichte/]) expect(within(categories).getByRole('button', { name })).toBeInTheDocument();
    // A category the app does not know keeps the list's own name: German where it has one, else English.
    expect(within(categories).getByRole('button', { name: /^Gedichte/ })).toBeInTheDocument();
    expect(within(categories).getByRole('button', { name: /^Songs/ })).toBeInTheDocument();
    // And a card says its category the same way.
    expect(within(shelf('Empfohlen')).getByText('Tierfabeln')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
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

  it('keeps the way into a game with friends: an unfinished game, and the code boxes that join any game', async () => {
    const { calls } = fakeApi({
      'GET /stories/library': libraryFixture(),
      'GET /story-games/active': {
        games: [{ id: 'g9', mode: 'solo', status: 'question', storyId: 'a', storyTitle: 'Qelema Şîn', dialect: 'kurmanci', currentIndex: 1, total: 5 }],
      },
      'POST /play/join': { game: 'stories', lobbyId: 'g7' },
    });
    library();
    const card = (await screen.findByText(/Question 2 of 5/)).closest('a')!;
    expect(card).toHaveAttribute('href', '/app/games/stories/play/g9');
    // The sixth character joins on its own, through the one join every game shares.
    await userEvent.type(screen.getByLabelText('Join with a code'), 'abc-234');
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/play/join')?.body).toEqual({ code: 'ABC234' });
  });

  it('follows an invite link straight into its game', async () => {
    const { calls } = fakeApi({ 'POST /story-games/join': gameView({ id: 'g5' }) });
    library('/app/learn/stories?id=g5');
    expect(await screen.findByText('the game page')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/story-games/join')?.body).toEqual({ id: 'g5', extraTime: false });
  });

  /** The Soranî page: its own stories and counts, with the reader's own shelves as they are on either page. */
  const SORANI = () => {
    const bazar = listItem({ id: 's9', slug: 'bazar-ckb', title: 'بازاڕ', dialect: 'sorani', category: 'everyday', me: { bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0 } });
    return libraryFixture({ featured: [], recent: [bazar], total: 1, me: { finished: 0, total: 1, averageScore: null }, categories: [{ slug: 'everyday', name: { en: 'Everyday life' }, position: 6, count: 1 }] });
  };
  const pages = (calls: Call[]): string[] => calls.filter((c) => c.path.startsWith('/stories/library')).map((c) => c.path);
  const sides = () => within(screen.getByRole('group', { name: 'Which Kurdish' })).getAllByRole('radio');
  const chosen = () => sides().filter((r) => (r as HTMLInputElement).checked).map((r) => r.closest('label')?.textContent);

  it('shows one variety at a time: Kurmancî first, Soranî from the switch, and keeps the choice on this device', async () => {
    const { calls } = fakeApi({ 'GET /stories/library': (c: Call) => (c.path.includes('dialect=sorani') ? SORANI() : libraryFixture()) });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    expect(sides().map((r) => r.closest('label')?.textContent)).toEqual(['Kurmancî', 'Soranî']);
    expect(chosen()).toEqual(['Kurmancî']);
    expect(localStorage.getItem('hevalo.stories.variety')).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '1 of 4 stories finished');

    await userEvent.click(within(screen.getByRole('group', { name: 'Which Kurdish' })).getByRole('radio', { name: 'Soranî' }));
    // The Soranî page: its own newest, its own counts and tally, and no Kurmancî story on its shelves.
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '0 of 1 stories finished'));
    expect(chosen()).toEqual(['Soranî']);
    expect(localStorage.getItem('hevalo.stories.variety')).toBe('sorani');
    expect(within(shelf('Recently added')).getByText('بازاڕ')).toBeInTheDocument();
    expect(within(shelf('Recently added')).queryByText('Şengê û Pengê')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Featured' })).toBeNull();
    // What the reader is part-way through is theirs, whatever its variety.
    expect(within(shelf('Continue reading')).getByText('Bazar')).toBeInTheDocument();
    expect(pages(calls)).toEqual(['/stories/library?dialect=kurmanci', '/stories/library?dialect=sorani']);

    // Back again: the page shown before is there at once, and asked for again behind it.
    await userEvent.click(within(screen.getByRole('group', { name: 'Which Kurdish' })).getByRole('radio', { name: 'Kurmancî' }));
    expect(screen.getByRole('region', { name: 'Featured' })).toBeInTheDocument();
    await waitFor(() => expect(pages(calls)).toHaveLength(3));
    expect(localStorage.getItem('hevalo.stories.variety')).toBe('kurmanci');
  });

  it('searches and sets a game up in the variety on show', async () => {
    localStorage.setItem('hevalo.stories.variety', 'sorani');
    const { calls } = fakeApi({
      'GET /stories/library': (c: Call) => (c.path.includes('dialect=sorani') ? SORANI() : libraryFixture()),
      'GET /stories': { stories: [listItem({ id: 's9', slug: 'bazar-ckb', title: 'بازاڕ', dialect: 'sorani' })], total: 1 },
    });
    library();
    await waitFor(() => expect(chosen()).toEqual(['Soranî']));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the stories' }), 'baz');
    await waitFor(() => expect(calls.some((c) => c.path === '/stories?q=baz&dialect=sorani&limit=24')).toBe(true));
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search the stories' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Play with friends' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/stories?dialect=sorani&limit=50')).toBe(true));
    expect(calls.some((c) => c.path.includes('dialect=kurmanci'))).toBe(false);
  });

  it('opens on the variety an address names, without making it the reader’s choice', async () => {
    localStorage.setItem('hevalo.stories.variety', 'kurmanci');
    const { calls } = fakeApi({ 'GET /stories/library': (c: Call) => (c.path.includes('dialect=sorani') ? SORANI() : libraryFixture()) });
    library('/app/learn/stories?dialect=sorani');
    await waitFor(() => expect(pages(calls)).toEqual(['/stories/library?dialect=sorani']));
    expect(chosen()).toEqual(['Soranî']);
    expect(localStorage.getItem('hevalo.stories.variety')).toBe('kurmanci');
  });

  it('opens on Soranî for a Soranî interface until the reader chooses', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    const { calls } = fakeApi({ 'GET /stories/library': (c: Call) => (c.path.includes('dialect=sorani') ? SORANI() : libraryFixture()) });
    library();
    await waitFor(() => expect(pages(calls)).toEqual(['/stories/library?dialect=sorani']));
    expect(localStorage.getItem('hevalo.stories.variety')).toBeNull();
  });

  it('gives the legends a shelf of their own after the editors’ picks, named as their category is', async () => {
    const kawa = listItem({ id: 'k1', slug: 'kmr-kawaye-hesinkar', title: 'Kawayê Hesinkar', level: 3, length: 'saga', category: 'legend', cover: 'kawa' });
    const fixture = libraryFixture({ legends: [kawa] });
    fixture.categories = fixture.categories.map((c) => (c.slug === 'legend' ? { ...c, count: 1 } : c));
    fakeApi({ 'GET /stories/library': fixture });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    const order = ['Featured', 'Legends and history', 'Recently added'];
    expect(regions().filter((n) => order.includes(n))).toEqual(order);
    expect(within(shelf('Legends and history')).getByRole('link', { name: /Kawayê Hesinkar/ })).toHaveAttribute('href', '/app/learn/stories/kmr-kawaye-hesinkar');
    // The shelf's name says what they are once: no card on it says it again.
    expect(within(shelf('Legends and history')).queryByText('Legends and history', { selector: '.story-card-meta span' })).toBeNull();
    expect(within(shelf('Legends and history')).getByText('Kawayê Hesinkar').closest('.story-card')!.querySelector('.story-cover img')).toHaveAttribute(
      'src',
      '/cosmetics/backgrounds/story-kawa.webp',
    );
  });

  it('keeps the switch when a variety has no story yet, as the way to the other', async () => {
    fakeApi({
      'GET /stories/library': (c: Call) =>
        c.path.includes('dialect=sorani') ? libraryFixture({ featured: [], recent: [], continue: [], bookmarks: [], total: 0 }) : libraryFixture(),
    });
    library();
    await screen.findByRole('region', { name: 'Featured' });
    await userEvent.click(within(screen.getByRole('group', { name: 'Which Kurdish' })).getByRole('radio', { name: 'Soranî' }));
    expect(await screen.findByText(/Stories are on their way/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: 'Which Kurdish' })).getByRole('radio', { name: 'Kurmancî' }));
    expect(await screen.findByRole('region', { name: 'Featured' })).toBeInTheDocument();
  });

  it('is Learn, on its Stories group', async () => {
    fakeApi({ 'GET /stories/library': libraryFixture() });
    library();
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('aria-current', 'page');
    expect(localStorage.getItem('hevalo_learn_view')).toBe('stories');
  });
});

describe('the library’s sort and filter panel', () => {
  /** Where the router is, so a test can see a choice reach the address. */
  function Where(): React.JSX.Element {
    return <output data-testid="where">{useLocation().search}</output>;
  }
  const where = (): string | null => screen.getByTestId('where').textContent;
  const panel = (): HTMLElement => screen.getByRole('dialog', { name: 'Sort and filter' });
  const group = (name: string): HTMLElement => within(panel()).getByRole('radiogroup', { name });
  const names = (radios: HTMLElement): string[] => within(radios).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent ?? '');
  const lists = (calls: Call[]): string[] => calls.filter((c) => c.path.startsWith('/stories?') && c.path.includes('limit=24')).map((c) => c.path);
  const counts = (calls: Call[]): string[] => calls.filter((c) => c.path.startsWith('/stories?') && c.path.includes('limit=1')).map((c) => c.path);

  async function open(entry = '/app/learn/stories') {
    const api = fakeApi({
      'GET /stories/library': libraryFixture({ levels: [{ level: 1, count: 1 }, { level: 2, count: 2 }, { level: 3, count: 1 }] }),
      'GET /stories': (c: Call) => ({ stories: [listItem({ id: 'r1', slug: 'r1', title: 'Rovî û Hirç' })], total: c.path.includes('length=saga') ? 0 : 7 }),
    });
    renderApp(
      <Routes>
        <Route
          path="/app/learn/stories"
          element={
            <>
              <StoriesLibrary />
              <Where />
            </>
          }
        />
      </Routes>,
      [entry],
    );
    await screen.findByRole('button', { name: /^Sort and filter/ });
    return api;
  }

  it('puts one funnel beside the search, and every choice in plain words behind it', async () => {
    const { calls } = await open();
    await screen.findByRole('region', { name: 'Featured' });
    // No rows of chips over the shelves any more, and no chip while nothing is on.
    expect(screen.queryByRole('button', { name: 'Beginner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    const funnel = screen.getByRole('button', { name: 'Sort and filter' });
    expect(funnel).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(funnel);

    // The list's three orders, easiest first by default, where the keyboard starts.
    expect(names(group('Sort by'))).toEqual(['Easiest first', 'Newest', 'A to Z']);
    expect(within(group('Sort by')).getByRole('radio', { name: 'Easiest first' })).toHaveFocus();
    // Only the levels that have a story, each by a plain name with what it means.
    expect(names(group('Level'))).toEqual(['Any level', 'Starter', 'Beginner', 'Intermediate']);
    expect(within(group('Level')).getByRole('radio', { name: 'Starter' })).toHaveAccessibleDescription('First words and short sentences');
    // Which Kurdish is the library's switch, never also a control in the panel.
    expect(within(panel()).queryByRole('radiogroup', { name: 'Kurdish' })).toBeNull();
    expect(within(panel()).queryByRole('radio', { name: /Kurmancî|Soranî/ })).toBeNull();
    expect(names(group('Length'))).toEqual(['Any length', 'Short', 'Medium', 'Long', 'In chapters']);
    expect(within(group('Length')).getByRole('radio', { name: 'Short' })).toHaveAccessibleDescription('1–2 min');
    const aloud = within(panel()).getByRole('switch', { name: 'Read aloud' });
    expect(aloud).toHaveAttribute('aria-checked', 'false');
    expect(aloud).toHaveAccessibleDescription('Only stories you can listen to from start to finish');
    // The categories with something in them, each with how many.
    expect(names(group('Category'))).toEqual(['Any category', 'Animal fables, Stories: 1', 'Everyday life, Stories: 1', 'Nature, Stories: 1']);
    // Never a bare CEFR letter.
    expect(panel().textContent).not.toMatch(/\b[ABC][12]\b/);

    // Nothing to reset yet, and the whole library's count is known without asking.
    expect(within(panel()).getByRole('button', { name: 'Reset' })).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Show 4 stories' })).toBeInTheDocument();
    expect(counts(calls)).toEqual([]);
  });

  it('is a draft until Show N stories, whose number the server is asked for as the choices change', async () => {
    const { calls } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    await userEvent.click(within(group('Level')).getByRole('radio', { name: 'Beginner' }));
    await userEvent.click(within(group('Length')).getByRole('radio', { name: 'Short' }));
    expect(await within(panel()).findByRole('button', { name: 'Show 7 stories' })).toBeInTheDocument();
    // One cheap count for the settled choices, not one per tap, and no list yet.
    expect(counts(calls)).toEqual(['/stories?level=2&dialect=kurmanci&length=short&limit=1']);
    expect(lists(calls)).toEqual([]);
    expect(where()).toBe('');
    // The order does not change how many there are, so it asks nothing.
    await userEvent.click(within(group('Sort by')).getByRole('radio', { name: 'Newest' }));
    expect(counts(calls)).toHaveLength(1);

    await userEvent.click(within(panel()).getByRole('button', { name: 'Show 7 stories' }));
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?level=2&dialect=kurmanci&length=short&sort=newest&limit=24']));
    expect(where()).toBe('?level=A2&length=short&sort=newest');
    expect(screen.queryByRole('dialog')).toBeNull();
    // The funnel says what is on, and has the keyboard back; a chip says each part.
    expect(screen.getByRole('button', { name: 'Sort and filter — Newest, Beginner, Short' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Newest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beginner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Short' })).toBeInTheDocument();
    expect(await screen.findByText('Stories found: 7')).toBeInTheDocument();
  });

  it('says so on the button when nothing would match', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    await userEvent.click(within(group('Length')).getByRole('radio', { name: 'In chapters' }));
    expect(await within(panel()).findByRole('button', { name: 'No stories match' })).toBeInTheDocument();
  });

  it('changes nothing when it is closed without showing, and Reset puts the draft back', async () => {
    const { calls } = await open('/app/learn/stories?length=short');
    await screen.findByText('Stories found: 7');
    const funnel = screen.getByRole('button', { name: 'Sort and filter — Short' });
    for (const close of ['escape', 'cross'] as const) {
      await userEvent.click(funnel);
      await userEvent.click(within(group('Level')).getByRole('radio', { name: 'Starter' }));
      if (close === 'escape') await userEvent.keyboard('{Escape}');
      else await userEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    expect(lists(calls)).toEqual(['/stories?dialect=kurmanci&length=short&limit=24']);
    expect(where()).toBe('?length=short');

    await userEvent.click(funnel);
    // It opens on what is shown, and the list on show already says how many.
    expect(within(group('Length')).getByRole('radio', { name: 'Short' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group('Level')).getByRole('radio', { name: 'Any level' })).toHaveAttribute('aria-checked', 'true');
    expect(within(panel()).getByRole('button', { name: 'Show 7 stories' })).toBeInTheDocument();
    const reset = within(panel()).getByRole('button', { name: 'Reset' });
    await userEvent.click(reset);
    expect(within(group('Length')).getByRole('radio', { name: 'Any length' })).toHaveAttribute('aria-checked', 'true');
    expect(reset).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Show 4 stories' })).toBeInTheDocument();
    await userEvent.click(within(panel()).getByRole('button', { name: 'Show 4 stories' }));
    expect(await screen.findByRole('region', { name: 'Featured' })).toBeInTheDocument();
    expect(where()).toBe('');
  });

  it('reads the order, the length and read aloud back from the address, and lets each part go from its chip', async () => {
    const { calls } = await open('/app/learn/stories?sort=title&length=long&audio=1&category=fable');
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?category=fable&dialect=kurmanci&length=long&audio=1&sort=title&limit=24']));
    // The category is named once the library has said what it is called.
    expect(await screen.findByRole('button', { name: 'Sort and filter — A to Z, Long, Read aloud, Animal fables' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Long' }));
    await waitFor(() => expect(where()).toBe('?audio=1&category=fable&sort=title'));
    // The chip went, so the keyboard lands on the funnel rather than nowhere.
    expect(screen.getByRole('button', { name: 'Sort and filter — A to Z, Read aloud, Animal fables' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to easiest first' }));
    await waitFor(() => expect(where()).toBe('?audio=1&category=fable'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Read aloud' }));
    await waitFor(() => expect(where()).toBe('?category=fable'));
    // One part left: its own ✕ is enough.
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();

    // A chip opens the panel on its part, and the keyboard goes back to it on Escape.
    const chip = screen.getByRole('button', { name: 'Animal fables' });
    await userEvent.click(chip);
    expect(within(group('Category')).getByRole('radio', { name: 'Animal fables, Stories: 1' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Escape}');
    expect(chip).toHaveFocus();
  });

  it('passes over what the address does not mean, and still reads an old level link', async () => {
    const { calls } = await open('/app/learn/stories?sort=popular&length=huge&level=b1');
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?level=3&dialect=kurmanci&limit=24']));
    expect(screen.getByRole('button', { name: 'Sort and filter — Intermediate' })).toBeInTheDocument();
  });
});
