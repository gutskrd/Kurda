import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Games, featuredGame, shelfLayout, type GameEntry } from './Games';
import { TopNav } from '../components/TopNav';
import { renderApp, jsonResponse } from '../test/utils';

const DAY = 86_400_000;

/**
 * The game put forward changes with the day (shared `gameOfTheDay`), and it
 * is not drawn as the others are: its ways in stand under it as buttons,
 * where a stamp on the shelf is pressed whole. So every test here is held on
 * a day of its choosing. With only the three games that are always here able
 * to be played, `place` is which of them is put forward: Peyvok, the rhymes,
 * or the typing race. Unless a test says otherwise it is the race, so the two
 * games with two ways in are both stamps on the shelf.
 */
function onADayFeaturing(place: 0 | 1 | 2): void {
  const day = Math.floor(Date.UTC(2026, 10, 16) / DAY);
  vi.setSystemTime((day - (day % 3) + place) * DAY + DAY / 2);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  onADayFeaturing(2);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function signIn(): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me'))
        return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'ada@example.com', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

/** Somebody reading without an account: the server answers, and knows nobody. */
function visit(): void {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
}

/** The stamp of the game with this name: its `article`. */
const stampOf = (name: string): HTMLElement => screen.getByRole('heading', { name }).closest('article')!;

/** What a stamp says to a screen reader, signed in: the game, who it is played with, and what you do in it. */
const SAID = {
  peyvok: 'Peyvok, On your own, With friends. Guess the Kurdish word in six tries.',
  rhyme: 'Peyvên Hevserwa, On your own, With friends. Find words that rhyme, against the clock.',
  race: 'Pêşbaziya Nivîsandinê, On your own. Type a Kurdish text quickly and accurately.',
} as const;

describe('Games hub', () => {
  it('shows one stamp per game (not one per mode)', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) expect(screen.getAllByRole('heading', { name })).toHaveLength(1);
    // each an article of its own, and nothing else drawn as a stamp
    expect(document.querySelectorAll('article.gp-stamp')).toHaveLength(3);
    // the ranked quiz is gone, and the stories that took its place have a group of their own now
    expect(screen.queryByText('Ranked Quiz')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stories' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('href', '/app/learn/stories');
    // a game played against somebody is a way into its game, not a second stamp
    expect(screen.queryByRole('heading', { name: 'Pêşbaziya Peyvan' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Pêşbaziya Serwayan' })).toBeNull();
  });

  it('names each part of the page, and each game under the part it is in', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const featured = await screen.findByRole('region', { name: 'Featured' });
    const games = screen.getByRole('region', { name: 'Games' });
    // the parts are headings a level under the page's own, and a game's name a level under its part's
    expect(within(featured).getByRole('heading', { name: 'Featured', level: 2 })).toBeInTheDocument();
    expect(within(games).getByRole('heading', { name: 'Games', level: 2 })).toBeInTheDocument();
    expect(within(featured).getAllByRole('article')).toHaveLength(1);
    expect(within(featured).getByRole('heading', { name: 'Pêşbaziya Nivîsandinê', level: 3 })).toBeInTheDocument();
    expect(within(games).getAllByRole('article')).toHaveLength(2);
    expect(within(games).getAllByRole('heading', { level: 3 }).map((name) => name.textContent)).toEqual(['Peyvok', 'Peyvên Hevserwa']);
  });

  it('makes a stamp with one way in the link to its page: the whole stamp, and no second step', async () => {
    onADayFeaturing(0);
    signIn();
    renderApp(<Games />, ['/app/games']);
    const stamp = (await screen.findByRole('heading', { name: 'Pêşbaziya Nivîsandinê' })).closest('article')!;
    // wait for the session to land: until it does, the page is drawn for a visitor, whose stamps lead to signing in
    const way = await within(stamp).findByRole('link', { name: SAID.race });
    expect(way).toHaveAttribute('href', '/app/games/race');
    // the one thing on the stamp to press
    expect(stamp.querySelectorAll('a, button')).toHaveLength(1);
    await userEvent.click(way);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Deliberately changed. A game with a page for each way to play had a
   * button for each on its card, so that nothing stood between the card and
   * the game. Two buttons do not fit on a stamp, and a shelf where half the
   * stamps carried buttons was a list of buttons: the stamp is pressed whole
   * now, and for these games the press opens a dialog that says what the game
   * is and offers each way. It is one step more for two of the games, and
   * the same thing the phone app does.
   */
  it('opens a dialog from a stamp with two ways in, and offers each as a link to its page', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const stamp = (await screen.findByRole('heading', { name: 'Peyvok' })).closest('article')!;
    const press = await within(stamp).findByRole('button', { name: SAID.peyvok });
    expect(press).toHaveAttribute('aria-haspopup', 'dialog');
    // no way in is on the stamp itself, and nothing is open until it is pressed
    expect(within(stamp).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(press);
    const dialog = await screen.findByRole('dialog', { name: 'Peyvok' });
    expect(within(dialog).getByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    // what the game is, said in full, as under the game put forward
    expect(within(dialog).getByText('Guess the Kurdish word in six tries — on your own, or racing a friend.')).toBeInTheDocument();
    // each way said with the game's name; the first the app's own button, the second the quiet one
    const solo = within(dialog).getByRole('link', { name: 'Peyvok, Play solo' });
    const online = within(dialog).getByRole('link', { name: 'Peyvok, Play online' });
    expect(solo).toHaveAttribute('href', '/app/games/peyvok');
    expect(solo).toHaveTextContent('Play solo');
    expect(solo).toHaveClass('btn-primary');
    expect(online).toHaveAttribute('href', '/app/games/peyvok-battle');
    expect(online).toHaveTextContent('Play online');
    expect(online).toHaveClass('btn-secondary');

    // put away, it is gone, and the keyboard is back on the stamp it came from
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(press).toHaveFocus();
  });

  it('opens the same dialog from the keyboard, for whichever stamp it is on', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const stamp = (await screen.findByRole('heading', { name: 'Peyvên Hevserwa' })).closest('article')!;
    const press = await within(stamp).findByRole('button', { name: SAID.rhyme });
    press.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Peyvên Hevserwa' });
    // a name's meaning goes with it into the dialog
    expect(within(dialog).getByText('Rhyming words')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Peyvên Hevserwa, Play solo' })).toHaveAttribute('href', '/app/games/rhyme');
    expect(within(dialog).getByRole('link', { name: 'Peyvên Hevserwa, Play online' })).toHaveAttribute('href', '/app/games/rhyme-match');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says nothing about signing in to somebody who is signed in', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Play' });
    expect(screen.queryByText('Playable')).toBeNull();
    expect(screen.queryByText('Sign in to play')).toBeNull();
    expect(screen.queryByRole('link', { name: /Sign in to play/ })).toBeNull();
  });

  it('puts one game forward above the shelf, and does not say it twice', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const featured = await screen.findByRole('region', { name: 'Featured' });
    expect(screen.getAllByText('Featured')).toHaveLength(1);
    // one large stamp, what the game is said in full under it, and its way in under that
    expect(within(featured).getByRole('heading', { name: 'Pêşbaziya Nivîsandinê' })).toBeInTheDocument();
    expect(within(featured).getByText('Typing race')).toBeInTheDocument();
    expect(within(featured).getByText('Type a Kurdish text as fast and as accurately as you can — speed is measured server-side.')).toBeInTheDocument();
    expect(await within(featured).findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Play' })).toHaveAttribute('href', '/app/games/race');
    // its stamp is pressed as any stamp is
    expect(within(stampOf('Pêşbaziya Nivîsandinê')).getByRole('link', { name: SAID.race })).toHaveAttribute('href', '/app/games/race');
    // above the shelf, and not on it
    const shelf = document.querySelector<HTMLElement>('.gp-shelf')!;
    expect(featured.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(shelf).queryByRole('heading', { name: 'Pêşbaziya Nivîsandinê' })).toBeNull();
    expect(within(shelf).getAllByRole('heading')).toHaveLength(2);
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) expect(screen.getAllByRole('heading', { name })).toHaveLength(1);
  });

  /**
   * Deliberately changed. Every game had a Play of its own on its card: gold
   * on the game put forward and grey on the shelf at first, then a colour for
   * each game, then the one solid button on every card. A stamp is pressed
   * whole, so the shelf has no buttons left to be alike. The game put forward
   * is the one that keeps them, under its stamp, and they are the app's own:
   * the solid button for its first way in, the quiet one for a second. The
   * night-coloured card it stood on, with a white Play of its own, is gone
   * with the cards.
   */
  it('keeps buttons for the game put forward only: its first way the app’s own button, a second the quiet one', async () => {
    onADayFeaturing(0);
    signIn();
    renderApp(<Games />, ['/app/games']);
    const featured = await screen.findByRole('region', { name: 'Featured' });
    const solo = await within(featured).findByRole('link', { name: 'Peyvok, Play solo' });
    const online = within(featured).getByRole('link', { name: 'Peyvok, Play online' });
    expect(solo).toHaveAttribute('href', '/app/games/peyvok');
    expect(solo).toHaveClass('btn', 'btn-primary');
    expect(online).toHaveAttribute('href', '/app/games/peyvok-battle');
    expect(online).toHaveClass('btn', 'btn-secondary');
    // its own stamp opens the same two ways, as it would on the shelf
    await userEvent.click(within(stampOf('Peyvok')).getByRole('button', { name: SAID.peyvok }));
    expect(await screen.findByRole('dialog', { name: 'Peyvok' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // and nothing on the shelf is a button to play: each stamp is one thing to press
    const shelf = document.querySelector<HTMLElement>('.gp-shelf')!;
    expect(shelf.querySelectorAll('.btn')).toHaveLength(0);
    for (const stamp of shelf.querySelectorAll('.gp-stamp')) expect(stamp.querySelectorAll('a, button')).toHaveLength(1);
  });

  it('has no filter to work: a handful of games is read faster than a control that sorts them', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Play' });
    expect(screen.queryByRole('button', { name: 'With friends' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Games' })).toBeNull();
  });

  /**
   * Who a game is played with used to be written on its card. A stamp has
   * room for a picture and a name, so a reader who sees it reads the cover,
   * and a reader who does not is told in words: the game, who it is played
   * with, and what you do in it, on the thing that is pressed.
   */
  it('says with each stamp who its game is played with and what you do in it', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Play' });
    expect(within(stampOf('Peyvok')).getByRole('button')).toHaveAccessibleName(SAID.peyvok);
    expect(within(stampOf('Peyvên Hevserwa')).getByRole('button')).toHaveAccessibleName(SAID.rhyme);
    expect(within(stampOf('Pêşbaziya Nivîsandinê')).getByRole('link')).toHaveAccessibleName(SAID.race);
  });

  /**
   * Deliberately changed, twice. This page used to offer a signed-out visitor
   * the solo modes, but every game route on the server needs an account — the
   * solo rounds are scored against the player too — so the offer led to an
   * error, and each card came to say "Sign in to play" where its Play had
   * been. A stamp has no button to say it on. So it is said once where the
   * stamps begin, and on the one button the page still has, under the game
   * put forward; every stamp leads to signing in, and says so to a screen
   * reader; and none of them opens a dialog of ways that would all lead there.
   */
  it('offers a signed-out visitor no game it cannot start', async () => {
    visit();
    renderApp(<Games />, ['/app/games']);

    // the way to sign in: under the game put forward, and where the stamps begin
    const ways = await screen.findAllByRole('link', { name: 'Sign in to play' });
    expect(ways).toHaveLength(2);
    for (const way of ways) expect(way).toHaveAttribute('href', '/login');
    expect(within(screen.getByRole('region', { name: 'Featured' })).getByRole('link', { name: 'Sign in to play' })).toHaveClass('btn-primary');
    const told = ways.find((way) => !way.classList.contains('btn'))!;
    const shelf = document.querySelector<HTMLElement>('.gp-shelf')!;
    expect(told.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // nothing on the page leads into a game, and nothing says it would
    expect(document.querySelectorAll('a[href^="/app/games/"]')).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /(^|, )play( solo| online)?$/i })).toHaveLength(0);
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) {
      const stamp = stampOf(name);
      expect(stamp.querySelectorAll('a, button')).toHaveLength(1);
      const press = within(stamp).getByRole('link');
      expect(press).toHaveAttribute('href', '/login');
      expect(press).toHaveAccessibleName(expect.stringMatching(new RegExp(`^${name}, .+\\. Sign in to play$`)));
    }
    // a game with two ways in is no different for a visitor: no dialog
    await userEvent.click(within(stampOf('Peyvok')).getByRole('link'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // and the way to make an account
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/register');
  });

  it('sends a visitor who presses a stamp to sign in, and remembers to bring them back to the games', async () => {
    visit();
    function SigningIn(): React.JSX.Element {
      const from = (useLocation().state as { from?: string } | null)?.from;
      return <output>{from}</output>;
    }
    renderApp(
      <Routes>
        <Route path="/app/games" element={<Games />} />
        <Route path="/login" element={<SigningIn />} />
      </Routes>,
      ['/app/games'],
    );
    await userEvent.click(within((await screen.findByRole('heading', { name: 'Peyvên Hevserwa' })).closest('article')!).getByRole('link'));
    expect(await screen.findByRole('status')).toHaveTextContent('/app/games');
  });

  it('still says what each game is, and what the one put forward is in full', async () => {
    visit();
    renderApp(<Games />, ['/app/games']);

    // knowing what is here once you sign up is the reason to sign up
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    expect(within(stampOf('Peyvên Hevserwa')).getByText('Rhyming words')).toBeInTheDocument();
    expect(within(stampOf('Peyvên Hevserwa')).getByRole('link')).toHaveAccessibleName(expect.stringContaining('Find words that rhyme, against the clock.'));
    expect(screen.getByText('Type a Kurdish text as fast and as accurately as you can — speed is measured server-side.')).toBeInTheDocument();
  });

  /**
   * The catalogue holds keys, not text, and is built once when the module
   * loads. A label baked in there would keep whichever language the app started
   * in — so this checks the whole page in a language nobody defaulted to.
   */
  it('names the games in the chosen language', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    visit();
    renderApp(<Games />, ['/app/games']);

    // the games are Learn's second half: the page is Learn, and the switch says Games
    expect(await screen.findByRole('heading', { name: 'Lernen', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Spiele' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Lektionen' })).toHaveAttribute('href', '/app/learn');
    expect(screen.getByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    // a game keeps its Kurmancî name in every language, and says what it means in the reader's under it
    expect(within(stampOf('Peyvên Hevserwa')).getByText('Reimwörter')).toBeInTheDocument();
    expect(within(stampOf('Pêşbaziya Nivîsandinê')).getByText('Schreibwettlauf')).toBeInTheDocument();
    // the one put forward is called that, and said in full, in the reader's language
    const featured = screen.getByRole('region', { name: 'Empfohlen' });
    const inFull = 'Tippe einen kurdischen Text so schnell und genau wie möglich – die Geschwindigkeit misst der Server.';
    expect(within(featured).getByText(inFull)).toBeInTheDocument();
    // what a stamp says to a screen reader is in it too: who the game is played with, what you do in it, and where a visitor's press leads
    const said = 'Peyvok, Allein, Mit Freunden. Errate das kurdische Wort in sechs Versuchen. Zum Spielen anmelden';
    expect(within(stampOf('Peyvok')).getByRole('link')).toHaveAccessibleName(said);
    // the way in a visitor is given
    expect(screen.getAllByRole('link', { name: 'Zum Spielen anmelden' })).toHaveLength(2);
  });

  it('translates the ways in too', async () => {
    localStorage.setItem('hevalo_locale', 'tr');
    signIn();
    renderApp(<Games />, ['/app/games']);

    // the game's name is the same in every language, so wait for the Turkish around it
    const featured = await screen.findByRole('region', { name: 'Öne çıkan' });
    expect(within(featured).getByText('Yazma yarışı')).toBeInTheDocument();
    expect(await within(featured).findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Oyna' })).toHaveAttribute('href', '/app/games/race');
    // and the ways a stamp's dialog offers
    const said = 'Peyvok, Tek başına, Arkadaşlarla. Kürtçe kelimeyi altı denemede bul.';
    await userEvent.click(within(stampOf('Peyvok')).getByRole('button', { name: said }));
    const dialog = await screen.findByRole('dialog', { name: 'Peyvok' });
    expect(within(dialog).getByText('Kürtçe kelimeyi altı denemede bul — tek başına ya da bir arkadaşınla yarışarak.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Peyvok, Tek başına oyna' })).toHaveAttribute('href', '/app/games/peyvok');
    expect(within(dialog).getByRole('link', { name: 'Peyvok, Çevrimiçi oyna' })).toHaveAttribute('href', '/app/games/peyvok-battle');
  });
});

describe('the game put forward', () => {
  const game = (id: GameEntry['id'], ready: boolean): GameEntry => ({ id, nameKey: 'games.title', lineKey: 'games.title', bodyKey: 'games.title', ways: [], company: ['solo'], ready });

  it('is one that can be played, a different one each day and the same one all day', () => {
    const games = [game('peyvok', true), game('last-letter', false), game('rhyme', true), game('race', true)];
    const picks = [0, 1, 2, 3].map((day) => featuredGame(games, day * DAY)!.id);
    expect(picks).toEqual(['peyvok', 'rhyme', 'race', 'peyvok']);
    expect(featuredGame(games, DAY + 1)!.id).toBe(featuredGame(games, 2 * DAY - 1)!.id);
  });

  it('is nothing while nothing can be played', () => {
    expect(featuredGame([game('last-letter', false)], 0)).toBeNull();
    expect(featuredGame([], 0)).toBeNull();
  });
});

describe('how the stamps are laid out', () => {
  /** The room between two stamps on the shelf, which the page hands to the stylesheet. */
  const GAP = 28;

  it('stands two to a row on a phone and more as the page widens', () => {
    // a page 320 across, and one 390 across, less their gutters
    expect(shelfLayout(288)).toMatchObject({ columns: 2, width: 130 });
    expect(shelfLayout(358)).toMatchObject({ columns: 2, width: 165 });
    expect(shelfLayout(560).columns).toBe(3);
    // a desk's page beside its side rail, and with the whole column to itself
    expect(shelfLayout(844)).toMatchObject({ columns: 4, width: 190 });
    expect(shelfLayout(1072).columns).toBe(5);
  });

  it('never draws a stamp wider than 200, nor a row wider than the page', () => {
    for (let room = 240; room <= 1400; room += 7) {
      const { columns, width } = shelfLayout(room);
      expect(columns).toBeGreaterThanOrEqual(2);
      expect(width).toBeLessThanOrEqual(200);
      expect(columns * width + (columns - 1) * GAP).toBeLessThanOrEqual(room);
    }
  });

  // a stamp is drawn from its width, and one with none cannot be drawn at all: a page with no room is laid out as the narrowest one that has
  it('still has a stamp to draw however little room it is given', () => {
    // a folded phone's outer screen, 280 across
    expect(shelfLayout(248)).toMatchObject({ columns: 2, width: 110 });
    for (const room of [0, 1, 60, 239]) expect(shelfLayout(room)).toEqual(shelfLayout(240));
    expect(shelfLayout(240).width).toBeGreaterThan(0);
    expect(shelfLayout(240).hero).toBeGreaterThan(shelfLayout(240).width);
  });

  it('draws the one put forward as wide as the phone app’s, wider where the shelf’s stamps are, and never to the page’s edge', () => {
    expect(shelfLayout(358).hero).toBe(228);
    expect(shelfLayout(288).hero).toBe(224);
    expect(shelfLayout(844).hero).toBe(257);
    for (let room = 288; room <= 1400; room += 7) {
      const { width, hero } = shelfLayout(room);
      expect(hero).toBeGreaterThan(width);
      expect(hero).toBeLessThanOrEqual(room - 64);
    }
  });

  /** What the page has counted out for its stylesheet: how many stamps to a row, and how wide each is. */
  const drawnFor = (): { columns: string; width: string } => {
    const games = screen.getByRole('region', { name: 'Games' });
    return { columns: games.style.getPropertyValue('--gp-columns'), width: games.style.getPropertyValue('--gp-stamp') };
  };

  it('is drawn by the window’s width where the page cannot be measured', async () => {
    // nothing is laid out here: every box is 0 wide, and there is no observer to ask
    vi.stubGlobal('ResizeObserver', undefined);
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findByRole('heading', { name: 'Peyvok' });
    // the window, less a wide page's gutters
    const guess = shelfLayout(Math.min(window.innerWidth, 1120) - 48);
    expect(drawnFor()).toEqual({ columns: String(guess.columns), width: `${guess.width}px` });
  });

  it('is drawn for the page’s own width once that is known, and again when it changes', async () => {
    let across = 358;
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => across);
    const watching: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(changed: () => void) {
          watching.push(changed);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findByRole('heading', { name: 'Peyvok' });
    // a phone, whatever the window said
    expect(drawnFor()).toEqual({ columns: '2', width: '165px' });
    // the window is made wider
    across = 844;
    act(() => watching.forEach((changed) => changed()));
    expect(drawnFor()).toEqual({ columns: '4', width: '190px' });
  });
});

describe('Join with a code, on the Games hub', () => {
  it('is a card at the top of the page that opens the code boxes', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const card = await screen.findByRole('button', { name: /^Join with a code/ });
    expect(card).toHaveTextContent('Got a code from a friend? Type it in and you’re in their game.');
    // the session lands before the sheet is opened, so it shows the boxes and not the gate
    await screen.findByRole('link', { name: 'Pêşbaziya Nivîsandinê, Play' });
    // ahead of the shelf of games, where somebody holding a code looks first (the shelf itself: which game is put forward above it changes by the day)
    const shelf = document.querySelector('.gp-shelf');
    expect(shelf).not.toBeNull();
    expect(card.compareDocumentPosition(shelf!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(card);
    const sheet = await screen.findByRole('dialog', { name: 'Join with a code' });
    expect(within(sheet).getByLabelText('Join with a code')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  it('asks a visitor for an account the way every game does', async () => {
    visit();
    renderApp(<Games />, ['/app/games']);
    await userEvent.click(await screen.findByRole('button', { name: /^Join with a code/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Join with a code' });
    expect(within(sheet).queryByLabelText('Join with a code')).toBeNull();
    expect(within(sheet).getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  });

  it('opens by itself on the way back from signing in', async () => {
    signIn();
    renderApp(<Games />, ['/app/games?join=1']);
    expect(await screen.findByRole('dialog', { name: 'Join with a code' })).toBeInTheDocument();
  });
});

describe('TopNav brand', () => {
  it('sends a signed-in user to the app, not the marketing site', async () => {
    signIn();
    renderApp(<TopNav links={[{ label: 'Home', to: '/app' }]} />, ['/app']);
    const brand = await screen.findByRole('link', { name: /hevalo home/i });
    expect(brand).toHaveAttribute('href', '/app');
  });

  it('sends a signed-out visitor to the landing page', async () => {
    visit();
    renderApp(<TopNav links={[{ label: 'Stories', to: '/stories' }]} />, ['/']);
    expect(screen.getByRole('link', { name: /hevalo home/i })).toHaveAttribute('href', '/');
  });
});
