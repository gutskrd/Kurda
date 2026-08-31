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

function makeFetch(calls: Array<{ url: string; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/shop/purchase')) {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return jsonResponse(200, { purchased: true, duplicate: false, sku: 'bg-1', balance: 500 });
    }
    if (url.includes('/me/inventory')) {
      return jsonResponse(200, {
        items: [{ sku: 'ic-own', name: 'Owned Icon', category: 'icon', quantity: 1, premiumOnly: true, assetUrl: '/cosmetics/icons/o.png' }],
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
    await userEvent.click(within(sunset).getByRole('button', { name: /Buy · 500 Zêr/ }));
    expect(await screen.findByText(/Purchased Sunset/)).toBeInTheDocument();
    const buy = calls.find((c) => c.url.includes('/shop/purchase'));
    expect(buy?.body).toMatchObject({ sku: 'bg-1', expectedPrice: 500 });
    // after buying it flips to Owned
    expect(within(sunset).getByText('Owned')).toBeInTheDocument();
  });

  it('disables buying when the user cannot afford it', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    const pricey = (await screen.findByText('Pricey')).closest('figure')!;
    expect(within(pricey).getByRole('button', { name: /Not enough Zêr/ })).toBeDisabled();
  });
});
