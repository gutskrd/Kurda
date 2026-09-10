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
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
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
    // wait for the session to land: a signed-out visitor also sees Play links
    // now, so querying too early answers about the wrong reader
    await screen.findAllByRole('button', { name: /^play$/i });

    const hrefs = screen.getAllByRole('link', { name: /^play/i }).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app/games/quiz');
    expect(hrefs).toContain('/app/games/race');
  });

  it('lets a signed-out visitor play the games you play alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    const hrefs = (await screen.findAllByRole('link', { name: /^play/i })).map((a) => a.getAttribute('href'));
    // solo is solo whether or not anyone knows who you are
    expect(hrefs).toContain('/app/games/wordle');
    expect(hrefs).toContain('/app/games/race');
    // but nothing that puts you in front of another person
    expect(hrefs).not.toContain('/app/games/wordle-battle');
    expect(hrefs).not.toContain('/app/games/rhyme-match');
    expect(hrefs).not.toContain('/app/games/quiz');
  });

  it('says which modes need an account rather than hiding them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    // knowing there is more here once you sign up is the reason to sign up
    expect((await screen.findAllByText(/needs an account/)).length).toBeGreaterThan(0);
    // a game with no solo mode at all is the only one marked closed
    expect(screen.getAllByText('Sign in to play')).toHaveLength(1);
  });

  /**
   * The catalogue holds keys, not text, and is built once when the module
   * loads. A label baked in there would keep whichever language the app started
   * in — so this checks the whole page in a language nobody defaulted to.
   */
  it('names the games in the chosen language', async () => {
    localStorage.setItem('mykurda_locale', 'de');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);

    expect(await screen.findByRole('heading', { name: 'Spiele', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kurdisches Wordle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reimwörter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schreibwettlauf' })).toBeInTheDocument();
    // the mode hints under each box, and the badge
    expect(screen.getAllByText('Allein spielen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spielbar').length).toBeGreaterThan(0);
  });

  it('translates the mode chooser too', async () => {
    localStorage.setItem('mykurda_locale', 'tr');
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
    const brand = await screen.findByRole('link', { name: /mykurda home/i });
    expect(brand).toHaveAttribute('href', '/app');
  });

  it('sends a signed-out visitor to the landing page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<TopNav links={[{ label: 'Stories', to: '/stories' }]} />, ['/']);
    expect(screen.getByRole('link', { name: /mykurda home/i })).toHaveAttribute('href', '/');
  });
});
