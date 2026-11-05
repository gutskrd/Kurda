import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
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
    // a story's own words are marked as Kurdish; its level is a plain name, with what that means on hover, and never a CEFR letter
    expect(within(card).getByText('Şengê û Pengê')).toHaveAttribute('lang', 'ku');
    expect(within(card).getByText('Beginner')).toHaveAttribute('title', 'Everyday sentences and short stories');
    expect(within(card).queryByText('A2')).toBeNull();
    expect(within(card).getByText('Fables')).toBeInTheDocument();
    expect(within(card).getByText('~4 min')).toBeInTheDocument();
    expect(within(card).getByText('Read aloud')).toBeInTheDocument();
    // a story without a chosen cover wears its category's kilim band; one with a cover, its picture
    expect(card.querySelector('.story-cover svg')).not.toBeNull();
    expect(cardOf('Dara Tûyê', shelf('Bookmarks')).querySelector('.story-cover img')).toHaveAttribute('src', '/cosmetics/backgrounds/made-06-gola-sin.webp');

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

  it('filters by level, variety and narration from the panel, and brings more on request', async () => {
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
    await userEvent.click(within(panel).getByRole('radio', { name: 'Soranî' }));
    await userEvent.click(within(panel).getByRole('switch', { name: 'Read aloud' }));
    await userEvent.click(await within(panel).findByRole('button', { name: 'Show 25 stories' }));
    expect(await screen.findByText('Stories found: 25')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.includes('limit=24')).map((c) => c.path)).toEqual(['/stories?level=2&dialect=sorani&audio=1&limit=24']);

    await userEvent.click(screen.getByRole('button', { name: 'More stories' }));
    expect(await screen.findByText('Çîrok 24')).toBeInTheDocument();
    expect(calls.at(-1)?.path).toBe('/stories?level=2&dialect=sorani&audio=1&limit=24&offset=24');
    // every find is here: no More to ask for
    expect(screen.queryByRole('button', { name: 'More stories' })).toBeNull();

    // the filters let go all at once, the shelves come back
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
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
    // on the Categories shelf, and in the panel's categories alike
    expect(await screen.findAllByRole('button', { name: /Çîrokên heywanan/ })).toHaveLength(1);
    await userEvent.click(await screen.findByRole('button', { name: 'Rêz bike û parzûn bike' }));
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: /Çîrokên heywanan/ })).toBeInTheDocument();
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
    // the sixth character joins on its own, through the one join every game shares
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
      'GET /stories': (c: Call) => ({ stories: [listItem({ id: 'r1', slug: 'r1', title: 'Rovî û Hirç' })], total: c.path.includes('dialect=sorani') ? 0 : 7 }),
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
    // no rows of chips over the shelves any more, and no chip while nothing is on
    expect(screen.queryByRole('button', { name: 'Beginner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
    const funnel = screen.getByRole('button', { name: 'Sort and filter' });
    expect(funnel).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(funnel);

    // the order: the list’s three, easiest first as it always was, and where the keyboard starts
    expect(names(group('Sort by'))).toEqual(['Easiest first', 'Newest', 'A to Z']);
    expect(within(group('Sort by')).getByRole('radio', { name: 'Easiest first' })).toHaveFocus();
    // only the levels that have a story, each by a plain name with what it means
    expect(names(group('Level'))).toEqual(['Any level', 'Starter', 'Beginner', 'Intermediate']);
    expect(within(group('Level')).getByRole('radio', { name: 'Starter' })).toHaveAccessibleDescription('First words and short sentences');
    expect(names(group('Kurdish'))).toEqual(['Either', 'Kurmancî', 'Soranî']);
    expect(within(group('Kurdish')).getByRole('radio', { name: 'Kurmancî' })).toHaveAccessibleDescription('Northern Kurdish · Latin letters');
    expect(within(group('Kurdish')).getByRole('radio', { name: 'Soranî' })).toHaveAccessibleDescription('Central Kurdish · Arabic script');
    expect(names(group('Length'))).toEqual(['Any length', 'Short', 'Medium', 'Long']);
    expect(within(group('Length')).getByRole('radio', { name: 'Short' })).toHaveAccessibleDescription('1–2 min');
    const aloud = within(panel()).getByRole('switch', { name: 'Read aloud' });
    expect(aloud).toHaveAttribute('aria-checked', 'false');
    expect(aloud).toHaveAccessibleDescription('Only stories you can listen to from start to finish');
    // the categories with something in them, each with how many
    expect(names(group('Category'))).toEqual(['Any category', 'Fables, Stories: 1', 'Everyday, Stories: 1', 'Nature, Stories: 1']);
    // never a bare CEFR letter
    expect(panel().textContent).not.toMatch(/\b[ABC][12]\b/);

    // nothing to reset yet, and the whole library's count is known without asking
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
    // one cheap question for the settled choices, not one per tap, and no list yet
    expect(counts(calls)).toEqual(['/stories?level=2&length=short&limit=1']);
    expect(lists(calls)).toEqual([]);
    expect(where()).toBe('');
    // the order does not change how many there are, so it asks nothing
    await userEvent.click(within(group('Sort by')).getByRole('radio', { name: 'Newest' }));
    expect(counts(calls)).toHaveLength(1);

    await userEvent.click(within(panel()).getByRole('button', { name: 'Show 7 stories' }));
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?level=2&length=short&sort=newest&limit=24']));
    expect(where()).toBe('?level=A2&length=short&sort=newest');
    expect(screen.queryByRole('dialog')).toBeNull();
    // the funnel says what is on, and has the keyboard back; a chip says each part
    expect(screen.getByRole('button', { name: 'Sort and filter — Newest, Beginner, Short' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Newest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beginner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Short' })).toBeInTheDocument();
    expect(await screen.findByText('Stories found: 7')).toBeInTheDocument();
  });

  it('says so on the button when nothing would match', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Sort and filter' }));
    await userEvent.click(within(group('Kurdish')).getByRole('radio', { name: 'Soranî' }));
    expect(await within(panel()).findByRole('button', { name: 'No stories match' })).toBeInTheDocument();
  });

  it('changes nothing when it is closed without showing, and Reset puts the draft back', async () => {
    const { calls } = await open('/app/learn/stories?dialect=kurmanci');
    await screen.findByText('Stories found: 7');
    const funnel = screen.getByRole('button', { name: 'Sort and filter — Kurmancî' });
    for (const close of ['escape', 'cross'] as const) {
      await userEvent.click(funnel);
      await userEvent.click(within(group('Level')).getByRole('radio', { name: 'Starter' }));
      if (close === 'escape') await userEvent.keyboard('{Escape}');
      else await userEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    expect(lists(calls)).toEqual(['/stories?dialect=kurmanci&limit=24']);
    expect(where()).toBe('?dialect=kurmanci');

    await userEvent.click(funnel);
    // it opens on what is shown, and the list on show already says how many
    expect(within(group('Kurdish')).getByRole('radio', { name: 'Kurmancî' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group('Level')).getByRole('radio', { name: 'Any level' })).toHaveAttribute('aria-checked', 'true');
    expect(within(panel()).getByRole('button', { name: 'Show 7 stories' })).toBeInTheDocument();
    const reset = within(panel()).getByRole('button', { name: 'Reset' });
    await userEvent.click(reset);
    expect(within(group('Kurdish')).getByRole('radio', { name: 'Either' })).toHaveAttribute('aria-checked', 'true');
    expect(reset).toBeDisabled();
    expect(within(panel()).getByRole('button', { name: 'Show 4 stories' })).toBeInTheDocument();
    await userEvent.click(within(panel()).getByRole('button', { name: 'Show 4 stories' }));
    expect(await screen.findByRole('region', { name: 'Featured' })).toBeInTheDocument();
    expect(where()).toBe('');
  });

  it('reads the order, the length and read aloud back from the address, and lets each part go from its chip', async () => {
    const { calls } = await open('/app/learn/stories?sort=title&length=long&audio=1&category=fable');
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?category=fable&length=long&audio=1&sort=title&limit=24']));
    // the category is named once the library has said what it is called
    expect(await screen.findByRole('button', { name: 'Sort and filter — A to Z, Long, Read aloud, Fables' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Long' }));
    await waitFor(() => expect(where()).toBe('?audio=1&category=fable&sort=title'));
    // the chip went, so the keyboard lands on the funnel rather than nowhere
    expect(screen.getByRole('button', { name: 'Sort and filter — A to Z, Read aloud, Fables' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Back to easiest first' }));
    await waitFor(() => expect(where()).toBe('?audio=1&category=fable'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Read aloud' }));
    await waitFor(() => expect(where()).toBe('?category=fable'));
    // one part left: its own ✕ is enough
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();

    // a chip opens the panel on its part, and the keyboard goes back to it on Escape
    const chip = screen.getByRole('button', { name: 'Fables' });
    await userEvent.click(chip);
    expect(within(group('Category')).getByRole('radio', { name: 'Fables, Stories: 1' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Escape}');
    expect(chip).toHaveFocus();
  });

  it('passes over what the address does not mean, and still reads an old level link', async () => {
    const { calls } = await open('/app/learn/stories?sort=popular&length=huge&level=b1');
    await waitFor(() => expect(lists(calls)).toEqual(['/stories?level=3&limit=24']));
    expect(screen.getByRole('button', { name: 'Sort and filter — Intermediate' })).toBeInTheDocument();
  });
});
