import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
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
    // Ranked Quiz has one mode, so it is a direct link rather than a chooser
    const quizLink = await screen.findByRole('link', { name: /^play$/i });
    expect(quizLink).toHaveAttribute('href', '/app/games/quiz');
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
