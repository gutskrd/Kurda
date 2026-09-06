import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Shop } from './Shop';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function makeFetch(calls: Array<{ url: string; body: unknown }>, owned: string[] = []) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/shop/purchase')) {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return jsonResponse(200, { purchased: true, duplicate: false, sku: 'bg-1', balance: 500 });
    }
    if (url.includes('/me/inventory')) {
      return jsonResponse(200, {
        items: [
          { sku: 'ic-own', name: 'Owned Icon', category: 'icon', quantity: 1, premiumOnly: true, assetUrl: '/cosmetics/icons/o.png' },
          ...owned.map((sku) => ({ sku, name: sku, category: 'background', quantity: 1, premiumOnly: true, assetUrl: null })),
        ],
      });
    }
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 1000 } });
    if (url.includes('/shop')) {
      return jsonResponse(200, {
        items: [
          { sku: 'bg-1', name: 'Sunset', description: null, category: 'background', currency: 'zer', price: 500, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/bg-1.webp' },
          { sku: 'bg-2', name: 'Pricey', description: null, category: 'background', currency: 'zer', price: 5000, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/bg-2.webp' },
        ],
      });
    }
    return jsonResponse(200, {});
  });
}

describe('Shop', () => {
  it('lists backgrounds/icons with prices and buys an affordable one', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', makeFetch(calls));
    renderApp(<Shop />, ['/app/shop']);

    // affordable background shows its price and buys with the expected-price guard
    const sunset = (await screen.findByText('Sunset')).closest('figure')!;
    expect(within(sunset).getByText(/500 Zêr/)).toBeInTheDocument();
    await userEvent.click(within(sunset).getByRole('button', { name: 'Buy' }));
    expect(await screen.findByText(/Sunset is yours/)).toBeInTheDocument();
    const buy = calls.find((c) => c.url.includes('/shop/purchase'));
    expect(buy?.body).toMatchObject({ sku: 'bg-1', expectedPrice: 500 });
    // after buying it flips to Owned
    expect(within(sunset).getByText('Owned')).toBeInTheDocument();
  });

  it('still shows the price of something you cannot afford, and the shortfall', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    const pricey = (await screen.findByText('Pricey')).closest('figure')!;

    expect(within(pricey).getByRole('button', { name: 'Buy' })).toBeDisabled();
    // the number you are saving towards, and the gap — 5000 wanted, 1000 held
    expect(within(pricey).getByText(/5,000 Zêr/)).toBeInTheDocument();
    expect(within(pricey).getByText(/4,000 more/)).toBeInTheDocument();
  });

  it('narrows by name so a big catalogue does not have to be scrolled', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.type(screen.getByLabelText('Search the shop'), 'pric');

    expect(screen.getByText('Pricey')).toBeInTheDocument();
    expect(screen.queryByText('Sunset')).not.toBeInTheDocument();
  });

  it('narrows to one kind of thing', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByRole('button', { name: 'Icons' }));

    // the backgrounds section is gone entirely, not merely empty
    expect(screen.queryByText('Profile Backgrounds')).not.toBeInTheDocument();
    expect(screen.getByText('Premium Icons')).toBeInTheDocument();
  });

  it('hides what the wallet cannot reach', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByLabelText('Within my Zêr', { exact: false }));

    expect(screen.getByText('Sunset')).toBeInTheDocument(); // 500, held 1000
    expect(screen.queryByText('Pricey')).not.toBeInTheDocument(); // 5000
  });

  it('keeps something you already own, however dear it was', async () => {
    // 'Pricey' costs 5000 against a balance of 1000, but it is already owned —
    // telling someone they cannot afford what they own would be nonsense
    vi.stubGlobal('fetch', makeFetch([], ['bg-2']));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByLabelText('Within my Zêr', { exact: false }));

    const pricey = screen.getByText('Pricey').closest('figure')!;
    expect(within(pricey).getByText('Owned')).toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing empty shelves', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.type(screen.getByLabelText('Search the shop'), 'zzzz');

    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();
  });
});
