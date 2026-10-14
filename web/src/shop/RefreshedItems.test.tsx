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

interface Setup {
  refreshedItems?: string[];
  refund?: { amount: number; currency: 'zer' | 'gems' } | null;
  returnAnswer?: () => Response;
}

/** A shop whose inventory has one bought, replaced background and one given icon. */
function serve({ refreshedItems = ['bg-old', 'ic-old'], refund = { amount: 450, currency: 'zer' }, returnAnswer }: Setup = {}) {
  const posts: string[] = [];
  let returned = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (init?.method === 'POST') posts.push(path);
      if (path === '/me') return jsonResponse(200, { user: { id: 'me', username: 'me' } });
      if (path.startsWith('/shop/items/bg-old/return')) {
        if (returnAnswer) return returnAnswer();
        returned = true;
        return jsonResponse(200, { returned: true, duplicate: false, sku: 'bg-old', refund, balance: 1450 });
      }
      if (path === '/me/inventory/refreshed/seen') return jsonResponse(200, { seen: 2 });
      if (path === '/me/inventory') {
        return jsonResponse(200, {
          items: [...(returned ? [] : [{ ...OLD_BG, refund }]), { ...GIFTED, refund: null }],
          refreshedItems: returned ? ['ic-old'] : refreshedItems,
        });
      }
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
  it('tells the owner once, and only dismissing it tells the server', async () => {
    const { posts } = serve();
    renderApp(<Shop />, ['/app/shop']);

    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });
    expect(within(notice).getByText(/you can return them in the Shop/)).toBeInTheDocument();
    expect(posts).not.toContain('/me/inventory/refreshed/seen');

    await userEvent.click(within(notice).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'Your backgrounds and icons have new art' })).toBeNull();
    await waitFor(() => expect(posts).toContain('/me/inventory/refreshed/seen'));
  });

  it('shows no notice when there is nothing new to tell', async () => {
    serve({ refreshedItems: [] });
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByRole('heading', { name: 'Items with new art' });
    expect(screen.queryByRole('region', { name: 'Your backgrounds and icons have new art' })).toBeNull();
  });

  it('offers Return only for what the owner bought, and asks first with the amount', async () => {
    const { posts } = serve();
    renderApp(<Shop />, ['/app/shop']);

    const section = await screen.findByRole('region', { name: 'Items with new art' });
    expect(within(section).getByText('Red kilim')).toBeInTheDocument();
    // a present is an item, never currency: nothing to give back, so no button
    expect(within(section).queryByText('Sun')).toBeNull();

    await userEvent.click(within(section).getByRole('button', { name: 'Return Red kilim for 450 Zêr' }));
    const dialog = await screen.findByRole('dialog', { name: 'Return Red kilim?' });
    expect(within(dialog).getByText('You get 450 Zêr back.')).toBeInTheDocument();
    expect(posts.some((p) => p.includes('/return'))).toBe(false);

    // keeping it changes nothing
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts.some((p) => p.includes('/return'))).toBe(false);
  });

  it('returns the item, shows the refund and the new balance, and takes it off the list', async () => {
    serve();
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'Return Red kilim for 450 Zêr' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Return it' }));

    expect(await screen.findByText('Red kilim is returned. 450 Zêr is back in your wallet.')).toBeInTheDocument();
    expect(screen.getByText('1,450 Zêr')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Return Red kilim/ })).toBeNull());
  });

  it('says why a return was refused, and leaves the dialog open to try again', async () => {
    serve({
      returnAnswer: () => jsonResponse(409, { code: 'RETURN_CONFLICT', message: 'conflict' }),
    });
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'Return Red kilim for 450 Zêr' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Return it' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The return didn’t go through, and nothing changed. Try again.');
    expect(within(dialog).getByRole('button', { name: 'Return it' })).toBeEnabled();
  });

  it('tells an owner who was only given items that they keep them', async () => {
    serve({ refund: null });
    renderApp(<Shop />, ['/app/shop']);
    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });
    expect(within(notice).getByText(/They’re still yours/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Items with new art' })).toBeNull();
  });
});

describe('the notice on Edit Profile', () => {
  it('links to where returning happens', async () => {
    serve();
    renderApp(<RefreshedNoticeLoader />, ['/app/profile/edit']);
    const notice = await screen.findByRole('region', { name: 'Your backgrounds and icons have new art' });
    expect(within(notice).getByRole('link', { name: 'Go to the Shop' })).toHaveAttribute('href', '/app/shop#returns');
  });
});
