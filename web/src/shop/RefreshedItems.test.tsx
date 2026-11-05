import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shop } from '../pages/Shop';
import { jsonResponse, renderApp } from '../test/utils';
import { RefreshedNoticeLoader } from './RefreshedItems';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const OLD_BG = { sku: 'bg-old', name: 'Red kilim', category: 'background', quantity: 1, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/made-1.webp' };
const GIFTED = { sku: 'ic-old', name: 'Sun', category: 'icon', quantity: 1, premiumOnly: false, assetUrl: '/cosmetics/icons/made-2.png' };

/** A shop whose inventory has one bought, replaced background and one given icon. */
function serve({ refreshedItems = ['bg-old', 'ic-old'] }: { refreshedItems?: string[] } = {}) {
  const posts: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (init?.method === 'POST') posts.push(path);
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      if (path === '/me/inventory/refreshed/seen') return jsonResponse(200, { seen: 2 });
      if (path === '/me/inventory') return jsonResponse(200, { items: [OLD_BG, GIFTED], refreshedItems });
      if (path === '/me/wallet') return jsonResponse(200, { balances: { zer: 1000 } });
      if (path === '/me/gifts') return jsonResponse(200, { gifts: [], unseen: 0 });
      if (path === '/shop') return jsonResponse(200, { items: [] });
      return jsonResponse(200, {});
    }),
  );
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  return { posts };
}

describe('refreshed items in the Shop', () => {
  it('tells the owner once that the items are still theirs, and only dismissing it tells the server', async () => {
    const { posts } = serve();
    renderApp(<Shop />, ['/app/shop']);

    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });
    expect(within(notice).getByText(/They’re still yours/)).toBeInTheDocument();
    expect(posts).not.toContain('/me/inventory/refreshed/seen');

    await userEvent.click(within(notice).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'Your backgrounds and icons have new art' })).toBeNull();
    await waitFor(() => expect(posts).toContain('/me/inventory/refreshed/seen'));
  });

  it('shows no notice when there is nothing new to tell', async () => {
    serve({ refreshedItems: [] });
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Nothing here yet — check back soon.');
    expect(screen.queryByRole('region', { name: 'Your backgrounds and icons have new art' })).toBeNull();
  });

  it('offers no way to return a refreshed item: it is information, and the item stays', async () => {
    const { posts } = serve();
    renderApp(<Shop />, ['/app/shop']);
    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });

    // the notice holds one button, and it only closes the notice
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Got it']);
    expect(screen.queryByRole('button', { name: /return/i })).toBeNull();
    expect(screen.queryByText(/return/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Items with new art' })).toBeNull();
    expect(posts.some((p) => p.includes('/return'))).toBe(false);
  });
});

describe('the notice on Edit Profile', () => {
  it('says the items are still theirs, with nowhere to send them to give them back', async () => {
    serve();
    renderApp(<RefreshedNoticeLoader />, ['/app/profile/edit']);
    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });
    expect(within(notice).getByText(/They’re still yours/)).toBeInTheDocument();
    expect(within(notice).queryByRole('link')).toBeNull();
  });
});
