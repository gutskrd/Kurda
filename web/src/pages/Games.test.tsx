import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Games, featuredGame, type GameEntry } from './Games';
import { TopNav } from '../components/TopNav';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function signIn(): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me'))
        return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

describe('Games hub', () => {
  it('shows one box per game (not one per mode)', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Peyvên Hevserwa' })).toBeInTheDocument();
    // the ranked quiz is gone, and the stories that took its place have a group of their own now
    expect(screen.queryByText('Ranked Quiz')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Stories' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('href', '/app/learn/stories');
    // the separate per-mode cards are gone
    expect(screen.queryByRole('heading', { name: 'Pêşbaziya Peyvan' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Pêşbaziya Serwayan' })).toBeNull();
  });

  it('gives a game with a page for each way to play a button for each, on its card', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const wordle = (await screen.findByRole('heading', { name: 'Peyvok' })).closest('article')!;
    expect(await within(wordle).findByRole('link', { name: 'Play solo' })).toHaveAttribute('href', '/app/games/peyvok');
    expect(within(wordle).getByRole('link', { name: 'Play online' })).toHaveAttribute('href', '/app/games/peyvok-battle');
    // nothing stands between the card and the game: no second question to answer
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks a card only when the mark says something a signed-in player needs', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findAllByRole('link', { name: 'Play' });
    expect(screen.queryByText('Playable')).toBeNull();
    expect(screen.queryByText('Sign in to play')).toBeNull();
  });

  it('links a single-mode game straight to its page', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    // wait for the session to land: until it does, the page is drawn for a
    // signed-out visitor, who has no Play links at all
    const race = (await screen.findByRole('heading', { name: 'Pêşbaziya Nivîsandinê' })).closest('article')!;
    expect(await within(race).findByRole('link', { name: 'Play' })).toHaveAttribute('href', '/app/games/race');
    // one page, so it says who it is for in words rather than on two buttons
    expect(within(race).getByText('On your own')).toBeInTheDocument();
  });

  it('puts one game forward above the shelf, and does not say it twice', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findAllByRole('link', { name: 'Play' });
    expect(screen.getAllByText('Featured')).toHaveLength(1);
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) expect(screen.getAllByRole('heading', { name })).toHaveLength(1);
  });

  /**
   * Deliberately changed. The game put forward had a gold Play and the shelf
   * grey ones, and for a while each game had a Play of its own colour. Now
   * every Play is the same solid button, and a second way in the quiet one:
   * the covers carry the colour.
   */
  it('gives every game the same Play, and a second way in as the quiet button', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findAllByRole('link', { name: 'Play' });

    const plays = [...document.querySelectorAll<HTMLElement>('.gp-play')];
    // one for every card, the one put forward among them, and all of one kind
    expect(plays).toHaveLength(document.querySelectorAll('.gp-card').length);
    for (const play of plays) expect(play).toHaveClass('btn-primary');
    for (const card of document.querySelectorAll<HTMLElement>('.gp-card')) expect(card.style.getPropertyValue('--gp-face')).toBe('');
    const peyvok = screen.getByRole('heading', { name: 'Peyvok' }).closest('article')!;
    expect(within(peyvok).getByRole('link', { name: 'Play online' })).toHaveClass('btn-secondary');
  });

  it('has no filter to work: a handful of games each say who they are played with', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findAllByRole('link', { name: 'Play' });
    expect(screen.queryByRole('button', { name: 'With friends' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Games' })).toBeNull();
  });

  /**
   * Deliberately changed. This page used to offer a signed-out visitor the solo
   * modes, but every game route on the server needs an account — the solo
   * rounds are scored against the player too — so the offer led to an error.
   * A guest is now told what is true: every game needs an account.
   */
  it('offers a signed-out visitor no game it cannot start', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    expect(await screen.findAllByText('Sign in to play')).toHaveLength(3);
    expect(screen.queryAllByRole('link', { name: /^play/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^play$/i })).toHaveLength(0);
    // and the way to make one
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/register');
  });

  it('still says what each game is, and gives the way to an account on each', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // knowing what is here once you sign up is the reason to sign up
    for (const name of ['Peyvok', 'Peyvên Hevserwa', 'Pêşbaziya Nivîsandinê']) expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Sign in to play' })) expect(link).toHaveAttribute('href', '/login');
  });

  /**
   * The catalogue holds keys, not text, and is built once when the module
   * loads. A label baked in there would keep whichever language the app started
   * in — so this checks the whole page in a language nobody defaulted to.
   */
  it('names the games in the chosen language', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // the games are Learn's second half: the page is Learn, and the switch says Games
    expect(await screen.findByRole('heading', { name: 'Lernen', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Spiele' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Lektionen' })).toHaveAttribute('href', '/app/learn');
    expect(screen.getByRole('heading', { name: 'Peyvok' })).toBeInTheDocument();
    // a game keeps its Kurmancî name in every language, and says what it means in the reader's under it
    const rhyme = screen.getByRole('heading', { name: 'Peyvên Hevserwa' }).closest('article')!;
    expect(within(rhyme).getByText('Reimwörter')).toBeInTheDocument();
    const race = screen.getByRole('heading', { name: 'Pêşbaziya Nivîsandinê' }).closest('article')!;
    expect(within(race).getByText('Schreibwettlauf')).toBeInTheDocument();
    // the way in a visitor is given
    expect(screen.getAllByText('Zum Spielen anmelden').length).toBeGreaterThan(0);
  });

  it('translates the ways in too', async () => {
    localStorage.setItem('hevalo_locale', 'tr');
    signIn();
    renderApp(<Games />, ['/app/games']);

    // the game's name is the same in every language, so wait for the Turkish around it
    const wordle = (await screen.findByRole('heading', { name: 'Peyvok' })).closest('article')!;
    expect(await within(wordle).findByRole('link', { name: 'Tek başına oyna' })).toHaveAttribute('href', '/app/games/peyvok');
    const race = screen.getByRole('heading', { name: 'Pêşbaziya Nivîsandinê' }).closest('article')!;
    expect(within(race).getByText('Yazma yarışı')).toBeInTheDocument();
    expect(within(race).getByRole('link', { name: 'Oyna' })).toHaveAttribute('href', '/app/games/race');
  });
});

describe('the game put forward', () => {
  const game = (id: GameEntry['id'], ready: boolean): GameEntry => ({ id, nameKey: 'games.title', lineKey: 'games.title', bodyKey: 'games.title', ways: [], company: ['solo'], ready });
  const DAY = 86_400_000;

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

describe('Join with a code, on the Games hub', () => {
  it('is a card at the top of the page that opens the code boxes', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const card = await screen.findByRole('button', { name: /^Join with a code/ });
    expect(card).toHaveTextContent('Got a code from a friend? Type it in and you’re in their game.');
    // ahead of the shelf of games, where somebody holding a code looks first
    const shelf = await screen.findByRole('heading', { name: 'Pêşbaziya Nivîsandinê' });
    expect(card.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the session lands before the sheet is opened, so it shows the boxes and not the gate
    await screen.findAllByRole('link', { name: 'Play' });
    await userEvent.click(card);
    const sheet = await screen.findByRole('dialog', { name: 'Join with a code' });
    expect(within(sheet).getByLabelText('Join with a code')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Join' })).toBeInTheDocument();
  });

  it('asks a visitor for an account the way every game does', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
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
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<TopNav links={[{ label: 'Stories', to: '/stories' }]} />, ['/']);
    expect(screen.getByRole('link', { name: /hevalo home/i })).toHaveAttribute('href', '/');
  });
});
