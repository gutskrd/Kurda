import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Games } from './Games';
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
    expect(await screen.findByText('Kurdish Wordle')).toBeInTheDocument();
    expect(screen.getByText('Rhyming Words')).toBeInTheDocument();
    expect(screen.getByText('Ranked Quiz')).toBeInTheDocument();
    // the separate per-mode cards are gone
    expect(screen.queryByText('Wordle Battle')).not.toBeInTheDocument();
    expect(screen.queryByText('Rhyme Match')).not.toBeInTheDocument();
  });

  it('asks how you want to play, then links to the chosen mode', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);

    // Wordle has two modes → clicking Play opens the chooser
    const playButtons = await screen.findAllByRole('button', { name: /^play$/i });
    await userEvent.click(playButtons[0]!);

    expect(await screen.findByText(/how do you want to play/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /play solo/i })).toHaveAttribute('href', '/app/games/wordle');
    expect(screen.getByRole('link', { name: /play online/i })).toHaveAttribute('href', '/app/games/wordle-battle');
  });

  it('links a single-mode game straight to its page', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    // wait for the session to land: until it does, the page is drawn for a
    // signed-out visitor, who has no Play links at all
    await screen.findAllByRole('button', { name: /^play$/i });

    const hrefs = screen.getAllByRole('link', { name: /^play/i }).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app/games/quiz');
    expect(hrefs).toContain('/app/games/race');
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

    expect(await screen.findAllByText('Sign in to play')).toHaveLength(4);
    expect(screen.queryAllByRole('link', { name: /^play/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /^play$/i })).toHaveLength(0);
    // and the way to make one
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/register');
  });

  it('still says what each game has, and that it needs an account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // knowing there is more here once you sign up is the reason to sign up
    expect(await screen.findAllByText(/needs an account/)).toHaveLength(6);
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

    expect(await screen.findByRole('heading', { name: 'Spiele', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kurdisches Wordle' })).toBeInTheDocument();
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

    const wordle = (await screen.findByRole('heading', { name: 'Kürtçe Wordle' })).closest('article')!;
    await userEvent.click(within(wordle).getByRole('button', { name: 'Oyna' }));

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
