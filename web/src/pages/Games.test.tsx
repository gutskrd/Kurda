import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Games } from './Games';
import { TopNav } from '../components/TopNav';
import { renderApp, jsonResponse } from '../test/utils';
import { resetStoriesAvailable } from '../stories/catalogue';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetStoriesAvailable();
});

function signIn(stories: unknown[] = [{ id: 's1' }]): void {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/me'))
        return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@b.com', emailVerified: true } });
      if (url.endsWith('/stories')) return jsonResponse(200, { stories });
      return jsonResponse(200, {});
    }),
  );
}

describe('Games hub', () => {
  it('shows one box per game (not one per mode)', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByText('Peyvok')).toBeInTheDocument();
    expect(screen.getByText('Rhyming Words')).toBeInTheDocument();
    // Stories took the ranked quiz's place
    expect(screen.getByText('Stories')).toBeInTheDocument();
    expect(screen.queryByText('Ranked Quiz')).not.toBeInTheDocument();
    // the separate per-mode cards are gone
    expect(screen.queryByText('Peyvok Battle')).not.toBeInTheDocument();
    expect(screen.queryByText('Rhyme Match')).not.toBeInTheDocument();
  });

  it('asks how you want to play, then links to the chosen mode', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);

    // Peyvok has two modes → clicking Play opens the chooser
    const playButtons = await screen.findAllByRole('button', { name: /^play$/i });
    await userEvent.click(playButtons[0]!);

    expect(await screen.findByText(/how do you want to play/i)).toBeInTheDocument();
    const chooser = screen.getByRole('dialog');
    expect(within(chooser).getByRole('link', { name: /play solo/i })).toHaveAttribute('href', '/app/games/peyvok');
    expect(within(chooser).getByRole('link', { name: /play online/i })).toHaveAttribute('href', '/app/games/peyvok-battle');
  });

  it('lets each mode be chosen on the card itself, without the chooser', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const wordle = (await screen.findByRole('heading', { name: 'Peyvok' })).closest('article')!;
    await within(wordle).findByRole('button', { name: /^play$/i });
    expect(within(wordle).getByRole('link', { name: 'Play solo' })).toHaveAttribute('href', '/app/games/peyvok');
    expect(within(wordle).getByRole('link', { name: 'Play online' })).toHaveAttribute('href', '/app/games/peyvok-battle');
    // Stories chooses its mode on its own page, so its modes stay words
    const stories = screen.getByRole('heading', { name: 'Stories' }).closest('article')!;
    expect(within(stories).queryByRole('link', { name: 'Quiz yourself' })).toBeNull();
  });

  it('marks a card only when the mark says something a signed-in player needs', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    await screen.findAllByRole('button', { name: /^play$/i });
    expect(screen.queryByText('Playable')).toBeNull();
  });

  it('links a single-mode game straight to its page', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    // wait for the session to land: until it does, the page is drawn for a
    // signed-out visitor, who has no Play links at all
    await screen.findAllByRole('button', { name: /^play$/i });

    const hrefs = screen.getAllByRole('link', { name: /^play/i }).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app/games/stories');
    expect(hrefs).toContain('/app/games/race');
  });

  it('says "Coming soon" on Stories, and opens nothing, while no story is published', async () => {
    signIn([]);
    renderApp(<Games />, ['/app/games']);
    const tile = (await screen.findByRole('heading', { name: 'Stories' })).closest('article')!;
    expect(await within(tile).findByText('Coming soon')).toBeInTheDocument();
    expect(within(tile).queryByRole('link')).toBeNull();
    expect(within(tile).queryByRole('button')).toBeNull();
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
    // reading a story is the one thing open without an account; its quiz is not
    const stories = screen.getByRole('heading', { name: 'Stories' }).closest('article')!;
    expect(within(stories).getByText('Free to read')).toBeInTheDocument();
    expect(within(stories).getByRole('link', { name: 'Read a story' })).toHaveAttribute('href', '/app/games/stories');
    // and the way to make one
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/register');
  });

  it('still says what each game has, and that it needs an account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // knowing there is more here once you sign up is the reason to sign up
    // two modes each for Peyvok and Rhyme, one for the race, two of the three for Stories
    expect(await screen.findAllByText(/needs an account/)).toHaveLength(7);
    expect(screen.getAllByText('Play solo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Play online').length).toBeGreaterThan(0);
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
    expect(screen.getByRole('heading', { name: 'Reimwörter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schreibwettlauf' })).toBeInTheDocument();
    // the mode hints under each box, and the badge
    expect(screen.getAllByText('Allein spielen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Zum Spielen anmelden').length).toBeGreaterThan(0);
  });

  it('translates the mode chooser too', async () => {
    localStorage.setItem('hevalo_locale', 'tr');
    signIn();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // the game's name is the same in every language, so wait for the Turkish around it
    const wordle = (await screen.findByRole('heading', { name: 'Peyvok' })).closest('article')!;
    await userEvent.click(await within(wordle).findByRole('button', { name: 'Oyna' }));

    expect(await screen.findByText('Nasıl oynamak istersin?')).toBeInTheDocument();
    expect(screen.getByText('Günün bulmacası ve üç zorlukta sınırsız alıştırma turu.')).toBeInTheDocument();
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
