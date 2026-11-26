import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BundleView, BundlesView } from '@kurda/shared';
import { Shop } from '../pages/Shop';
import { renderApp, jsonResponse } from '../test/utils';
import type { ShopItem } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** The tea house as `GET /shop/bundles` sends it to someone who owns none of it. */
function teaHouse(over: Partial<BundleView> = {}): BundleView {
  return {
    id: 'cayxane',
    name: 'Çayxane',
    listPrice: 500,
    parts: [
      { sku: 'bg-made-kilima-sor', name: 'Kilîma Sor', description: 'Red kilim', category: 'background', price: 200, assetUrl: '/cosmetics/backgrounds/made-21-kilima-sor.webp', owned: false },
      { sku: 'frame-made-kilim', name: 'Xeleka Kilîmê', description: 'Kilim band', category: 'frame', price: 350, assetUrl: '/cosmetics/frames/made-03-kilim.png', owned: false },
      { sku: 'icon-made-caydan', name: 'Piyan', description: 'Tea glass', category: 'icon', price: 250, assetUrl: '/cosmetics/icons/made-08-caydan.png', owned: false },
      { sku: 'tag-mevanperwer', name: 'Mêvanperwer', description: 'Hospitable', category: 'tag', price: 150, assetUrl: null, owned: false },
    ],
    gifts: [
      { sku: 'gift-cay', name: 'Çay', count: 5, price: 1, assetUrl: '/cosmetics/gifts/cay.png' },
      { sku: 'gift-qehwe', name: 'Qehwe', count: 2, price: 2, assetUrl: '/cosmetics/gifts/qehwe.png' },
      { sku: 'gift-sev', name: 'Sêv', count: 1, price: 3, assetUrl: '/cosmetics/gifts/sev.png' },
    ],
    quote: { price: 500, worth: 962, saving: 462, savingPercent: 48, owned: 0, complete: false },
    onSale: true,
    bagFull: false,
    ...over,
  };
}

const village: BundleView = {
  ...teaHouse(),
  id: 'gund',
  name: 'Gund',
  listPrice: 375,
  quote: { price: 375, worth: 718, saving: 343, savingPercent: 47, owned: 0, complete: false },
};

const CATALOGUE: ShopItem[] = [
  { sku: 'bg-1', name: 'Sunset', description: 'Evening sky', category: 'background', currency: 'zer', price: 150, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/bg-1.webp' },
  { sku: 'frame-made-rojgirtin', name: 'Rojgirtin', description: 'Eclipse', category: 'frame', currency: 'zer', price: 600, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/frames/made-30-rojgirtin.png' },
  { sku: 'tag-heval', name: 'Heval', description: 'Friend', category: 'tag', currency: 'zer', price: 100, isUnique: true, premiumOnly: false, assetUrl: null },
];

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function shopFetch(calls: Call[], bundles: BundlesView, { zer = 1000, purchase = 200 as number | { code: string } } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, method: init?.method ?? 'GET', body });
    if (url.includes('/shop/bundles/purchase')) {
      if (typeof purchase !== 'number') return jsonResponse(409, { code: purchase.code, message: 'no' });
      return jsonResponse(200, {
        purchased: true,
        duplicate: false,
        bundle: 'cayxane',
        price: 500,
        balance: zer - 500,
        granted: teaHouse().parts.map((p) => p.sku),
        gifts: [{ sku: 'gift-cay', count: 5 }],
      });
    }
    if (url.includes('/shop/bundles')) return jsonResponse(200, bundles);
    if (url.includes('/me/cosmetics/')) return jsonResponse(200, {});
    if (url.includes('/me/inventory')) return jsonResponse(200, { items: [], refreshedItems: [] });
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer } });
    if (url.includes('/me/gifts')) return jsonResponse(200, { gifts: [], unseen: 0 });
    if (url.includes('/users/')) return jsonResponse(200, { userId: 'me', username: 'rojda', displayName: 'Rojda', friendStatus: 'self', private: false, tag: null });
    if (url.includes('/shop')) return jsonResponse(200, { items: CATALOGUE });
    return jsonResponse(200, {});
  });
}

describe('bundles in the shop', () => {
  it('lead the shop, telling an adult what a bundle saves and which saves most', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [teaHouse(), village], nudges: true }));
    renderApp(<Shop />, ['/app/shop']);
    const row = (await screen.findByRole('heading', { name: 'Bundles' })).closest('section')!;
    const tea = within(row).getByRole('article', { name: 'Çayxane' });
    expect(within(tea).getByText('The tea house')).toBeInTheDocument();
    expect(within(tea).getByText('962 Zêr')).toBeInTheDocument();
    expect(within(tea).getByText(/500 Zêr/)).toBeInTheDocument();
    expect(within(tea).getByText(/You save 462 Zêr/)).toBeInTheDocument();
    // the larger share saved, worked out: the tea house's 48 against the village's 47
    expect(within(tea).getByText('Best value')).toBeInTheDocument();
    expect(within(row).getByRole('article', { name: 'Gund' })).not.toHaveTextContent('Best value');
    // the row comes before the catalogue
    const catalogue = await screen.findByText('Sunset');
    expect(row.compareDocumentPosition(catalogue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows someone under eighteen the same bundles and prices, with no saving and no best value', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [teaHouse(), village], nudges: false }));
    renderApp(<Shop />, ['/app/shop']);
    const tea = await screen.findByRole('article', { name: 'Çayxane' });
    expect(within(tea).getByText(/500 Zêr/)).toBeInTheDocument();
    expect(within(tea).queryByText('962 Zêr')).toBeNull();
    expect(within(tea).queryByText(/You save/)).toBeNull();
    expect(screen.queryByText('Best value')).toBeNull();
  });

  it('says what is owned already, and that only the rest is paid for', async () => {
    const owned = teaHouse({
      parts: teaHouse().parts.map((p) => (p.category === 'frame' ? { ...p, owned: true } : p)),
      quote: { price: 320, worth: 612, saving: 292, savingPercent: 47, owned: 1, complete: false },
    });
    vi.stubGlobal('fetch', shopFetch([], { bundles: [owned], nudges: true }));
    renderApp(<Shop />, ['/app/shop']);
    const tea = await screen.findByRole('article', { name: 'Çayxane' });
    expect(within(tea).getByText('You already own 1 of the 4, so you only pay for the rest.')).toBeInTheDocument();
    expect(within(tea).getByText(/320 Zêr/)).toBeInTheDocument();
  });

  it('opens a bundle, buys it at the price shown, unwraps it, and wears the whole set', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', shopFetch(calls, { bundles: [teaHouse()], nudges: true }));
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'See what’s inside Çayxane' }));
    const sheet = await screen.findByRole('dialog', { name: 'Çayxane' });
    expect(within(sheet).getByText('Kilim band')).toBeInTheDocument();
    expect(within(sheet).getByText('350 Zêr alone')).toBeInTheDocument();
    expect(within(sheet).getByText('5 × Çay')).toBeInTheDocument();
    expect(within(sheet).getByText(/Every purchase is final/)).toBeInTheDocument();
    // rarity from the ladder: the 350 frame and the 150 tag are fine, the 200 background and the 250 icon rare
    expect(within(sheet).getAllByText('Fine')).toHaveLength(2);
    expect(within(sheet).getAllByText('Rare')).toHaveLength(2);

    await userEvent.click(within(sheet).getByRole('button', { name: /Buy for 500 Zêr/ }));
    const moment = await screen.findByRole('dialog', { name: 'Çayxane is yours!' });
    expect(calls.find((c) => c.url.includes('/shop/bundles/purchase'))?.body).toMatchObject({ bundle: 'cayxane', expectedPrice: 500 });
    expect(within(moment).getByText('The gifts are waiting in your bag.')).toBeInTheDocument();

    await userEvent.click(within(moment).getByRole('button', { name: 'Wear the set' }));
    await within(moment).findByText('You’re wearing it');
    const worn = calls.filter((c) => c.method === 'PUT' && c.url.includes('/me/cosmetics/'));
    expect(worn.map((c) => [c.url.split('/').pop(), (c.body as { sku: string }).sku]).sort()).toEqual([
      ['background', 'bg-made-kilima-sor'],
      ['frame', 'frame-made-kilim'],
      ['icon', 'icon-made-caydan'],
      ['tag', 'tag-mevanperwer'],
    ]);
  });

  it('says why a purchase did not go through, without leaving the bundle', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [teaHouse()], nudges: true }, { purchase: { code: 'BAG_FULL' } }));
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'See what’s inside Çayxane' }));
    const sheet = await screen.findByRole('dialog', { name: 'Çayxane' });
    await userEvent.click(within(sheet).getByRole('button', { name: /Buy for 500 Zêr/ }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Your bag has no room for this bundle’s gifts.');
  });

  it('does not offer to buy what you cannot pay for, and says how much is missing', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [teaHouse()], nudges: true }, { zer: 300 }));
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'See what’s inside Çayxane' }));
    const sheet = await screen.findByRole('dialog', { name: 'Çayxane' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: /Buy for 500 Zêr/ })).toBeDisabled());
    expect(within(sheet).getByText(/200 more/)).toBeInTheDocument();
  });
});

describe('trying a look on', () => {
  it('lays an item over your own profile card, which only you see', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [], nudges: true }));
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'Try Heval on your profile' }));
    const preview = await screen.findByRole('dialog', { name: 'On your profile' });
    expect(within(preview).getByText('Heval')).toBeInTheDocument();
    expect(within(preview).getByText('Only you can see this. Nothing changes until you buy it and put it on.')).toBeInTheDocument();
  });

  it('shows a word tag as the pill it is worn as, with its rarity', async () => {
    vi.stubGlobal('fetch', shopFetch([], { bundles: [], nudges: true }));
    renderApp(<Shop />, ['/app/shop']);
    const tile = (await screen.findAllByText('Heval')).map((el) => el.closest('figure')).find(Boolean)!;
    expect(tile.querySelector('.tag-pill')).not.toBeNull();
    expect(within(tile).getByText('Classic')).toBeInTheDocument();
    // the showpiece frame is a masterwork
    const eclipse = (await screen.findByText('Rojgirtin')).closest('figure')!;
    expect(within(eclipse).getByText('Masterwork')).toBeInTheDocument();
  });
});
