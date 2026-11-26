// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import type { BundleView, BundlesView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import type { ShopItem } from './format';
import { ShopScreen } from './ShopScreen';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => vi.spyOn(Alert, 'alert').mockImplementation(() => undefined));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    ],
    quote: { price: 500, worth: 962, saving: 462, savingPercent: 48, owned: 0, complete: false },
    onSale: true,
    bagFull: false,
    ...over,
  };
}
const village: BundleView = { ...teaHouse(), id: 'gund', name: 'Gund', listPrice: 375, quote: { price: 375, worth: 718, saving: 343, savingPercent: 47, owned: 0, complete: false } };

const CATALOGUE: ShopItem[] = [
  { sku: 'tag-heval', name: 'Heval', description: 'Friend', category: 'tag', currency: 'zer', price: 100, isUnique: true, inStock: true, assetUrl: null, premiumOnly: false },
  { sku: 'frame-made-rojgirtin', name: 'Rojgirtin', description: 'Eclipse', category: 'frame', currency: 'zer', price: 600, isUnique: true, inStock: true, assetUrl: '/cosmetics/frames/made-30-rojgirtin.png', premiumOnly: false },
];

function open(bundles: BundlesView, { zer = 1000, purchase = ok({ purchased: true, duplicate: false, bundle: 'cayxane', price: 500, balance: 500, granted: [], gifts: [] }) as unknown } = {}) {
  const client = fakeClient({
    'GET /shop': ok({ items: CATALOGUE }),
    'GET /shop/bundles': ok(bundles),
    'GET /me/wallet': ok({ balances: { zer } }),
    'GET /me/inventory': ok({ items: [], refreshedItems: [] }),
    'GET /me/gifts': ok({ gifts: [], unseen: 0 }),
    'POST /shop/bundles/purchase': purchase as never,
    'PUT /me/cosmetics/background': ok({}),
    'PUT /me/cosmetics/icon': ok({}),
    'PUT /me/cosmetics/frame': ok({}),
    'PUT /me/cosmetics/tag': ok({}),
  });
  testAuth.client = client;
  renderWithProviders(<ShopScreen onExit={() => undefined} onEarnMore={() => undefined} />);
  return client;
}

describe('bundles in the phone’s shop', () => {
  it('lead the shop, telling an adult what each saves and which saves most', async () => {
    open({ bundles: [teaHouse(), village], nudges: true });
    const row = await screen.findByTestId('bundle-row');
    expect(within(row).getByRole('heading', { name: 'Bundles' })).toBeTruthy();
    const tea = within(row).getByTestId('bundle-cayxane');
    expect(within(tea).getByText('The tea house')).toBeTruthy();
    expect(within(tea).getByText('962 Zêr')).toBeTruthy();
    expect(within(tea).getByText(/You save 462 Zêr/)).toBeTruthy();
    expect(within(tea).getByText('Best value')).toBeTruthy();
    expect(within(within(row).getByTestId('bundle-gund')).queryByText('Best value')).toBeNull();
  });

  it('shows someone under eighteen the same bundles and prices without a saving or a best value', async () => {
    open({ bundles: [teaHouse(), village], nudges: false });
    const tea = await screen.findByTestId('bundle-cayxane');
    expect(within(tea).getByText('500 Zêr')).toBeTruthy();
    expect(within(tea).queryByText('962 Zêr')).toBeNull();
    expect(within(tea).queryByText(/You save/)).toBeNull();
    expect(screen.queryByText('Best value')).toBeNull();
  });

  it('opens a bundle, buys it at the price shown, and puts the whole set on from its moment', async () => {
    const client = open({ bundles: [teaHouse()], nudges: true });
    fireEvent.click(await screen.findByTestId('bundle-cayxane'));
    expect(await screen.findByText('Kilim band')).toBeTruthy();
    expect(screen.getByText('350 Zêr alone')).toBeTruthy();
    expect(screen.getByText('5 × Çay')).toBeTruthy();
    expect(screen.getAllByText('Fine')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Buy for 500 Zêr' }));
    const moment = await screen.findByTestId('bundle-moment');
    expect(client.calls.find((c) => c.path === '/shop/bundles/purchase')?.body).toMatchObject({ bundle: 'cayxane', expectedPrice: 500 });
    expect(within(moment).getByText('The gifts are waiting in your bag.')).toBeTruthy();
    fireEvent.click(within(moment).getByRole('button', { name: 'Wear the set' }));
    await within(moment).findByText('You’re wearing it');
    const worn = client.calls.filter((c) => c.method === 'PUT').map((c) => [c.path, (c.body as { sku: string }).sku]);
    expect(worn.sort()).toEqual([
      ['/me/cosmetics/background', 'bg-made-kilima-sor'],
      ['/me/cosmetics/frame', 'frame-made-kilim'],
      ['/me/cosmetics/icon', 'icon-made-caydan'],
      ['/me/cosmetics/tag', 'tag-mevanperwer'],
    ]);
  });

  it('says why a purchase did not go through, in the bundle’s own sheet', async () => {
    open({ bundles: [teaHouse()], nudges: true }, { purchase: fail({ code: 'BAG_FULL', status: 409 }) });
    fireEvent.click(await screen.findByTestId('bundle-cayxane'));
    fireEvent.click(await screen.findByRole('button', { name: 'Buy for 500 Zêr' }));
    expect(await screen.findByText('Your bag has no room for this bundle’s gifts. Give a few away first.')).toBeTruthy();
  });

  it('offers a way to earn more instead of Buy when the purse is short', async () => {
    open({ bundles: [teaHouse()], nudges: true }, { zer: 300 });
    fireEvent.click(await screen.findByTestId('bundle-cayxane'));
    await screen.findByText('Kilim band');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Buy for 500 Zêr' })).toBeNull());
  });

  it('lets a bundle be tried on your own profile first', async () => {
    open({ bundles: [teaHouse()], nudges: true });
    fireEvent.click(await screen.findByTestId('bundle-cayxane'));
    fireEvent.click(await screen.findByRole('button', { name: 'Try it on your profile' }));
    const preview = await screen.findByTestId('profile-preview');
    expect(within(preview).getByText('Only you can see this. Nothing changes until you buy it and put it on.')).toBeTruthy();
    expect(within(preview).getByLabelText('Mêvanperwer: Hospitable')).toBeTruthy();
  });
});

describe('a word tag in the phone’s shop', () => {
  it('is shown as the pill it is worn as, with its rarity, and can be tried on', async () => {
    open({ bundles: [], nudges: true });
    const card = await screen.findByRole('button', { name: /^Heval, Friend/ });
    expect(within(card).getByText('Classic')).toBeTruthy();
    expect(within(card).getByLabelText('Heval')).toBeTruthy();
    const eclipse = screen.getByRole('button', { name: /^Rojgirtin, Eclipse/ });
    expect(within(eclipse).getByText('Masterwork')).toBeTruthy();
    fireEvent.click(card);
    fireEvent.click(await screen.findByRole('button', { name: 'Try it on your profile' }));
    expect(await screen.findByTestId('profile-preview')).toBeTruthy();
  });
});
