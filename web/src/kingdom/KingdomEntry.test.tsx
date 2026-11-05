import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Games } from '../pages/Games';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

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
        return jsonResponse(200, { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } });
      return jsonResponse(200, {});
    }),
  );
}

describe('Kurdish Kingdom among Learn’s games', () => {
  it('is always listed for a signed-in learner, with its one way in', async () => {
    signIn();
    renderApp(<Games />, ['/app/games']);
    const title = await screen.findByRole('heading', { name: en['kingdom.title'] });
    const tile = title.closest('article')!;
    expect(within(tile).getByText(en['kingdom.card'])).toBeInTheDocument();
    expect(within(tile).getByRole('link', { name: en['kingdom.open'] })).toHaveAttribute('href', '/app/games/kingdom');
  });

  it('is not offered to a visitor, who has no village', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<Games />, ['/app/games']);
    expect(await screen.findByText('Peyvok')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: en['kingdom.title'] })).not.toBeInTheDocument();
  });
});
