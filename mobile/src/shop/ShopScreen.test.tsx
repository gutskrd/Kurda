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
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import type { ShopItem } from './format';
import { ShopScreen } from './ShopScreen';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => vi.spyOn(Alert, 'alert').mockImplementation(() => undefined));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const item = (over: Partial<ShopItem> & Pick<ShopItem, 'sku' | 'name' | 'category'>): ShopItem => ({
  description: null,
  currency: 'zer',
  price: 500,
  isUnique: true,
  inStock: true,
  assetUrl: null,
  premiumOnly: true,
  ...over,
});

/**
 * A slice of the real catalogue (api/content/cosmetics.json), in the order
 * GET /shop sends it, plus what it does not have yet: something priced in
 * gems, and an item filed under a category of an admin's own.
 */
const CATALOGUE: ShopItem[] = [
  item({ sku: 'bg-made-hevalo', name: 'Hevalo', description: 'Hevalo violet', category: 'background', price: 0, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/made-01-hevalo.webp' }),
  item({ sku: 'bg-made-seva-zozanan', name: 'Şeva Zozanan', description: 'Night on the high pastures', category: 'background', assetUrl: '/cosmetics/backgrounds/made-02-seva-zozanan.webp' }),
  item({ sku: 'bg-made-gola-sin', name: 'Gola Şîn', description: 'Blue lake', category: 'background', price: 400, assetUrl: '/cosmetics/backgrounds/made-06-gola-sin.webp' }),
  item({ sku: 'bg-gem-dawn', name: 'Berbang', description: 'Daybreak', category: 'background', currency: 'gems', price: 10, assetUrl: '/cosmetics/backgrounds/made-09-berbang.webp' }),
  item({ sku: 'icon-made-roj', name: 'Roj', description: 'Sun', category: 'icon', price: 600, assetUrl: '/cosmetics/icons/made-02-roj.png' }),
  item({ sku: 'icon-made-caydan', name: 'Îstîkan', description: 'Tea glass', category: 'icon', price: 900, assetUrl: '/cosmetics/icons/made-08-caydan.png' }),
  item({ sku: 'icon-gem-sterk', name: 'Mohra Rojê', description: 'Sun seal', category: 'icon', currency: 'gems', price: 20, assetUrl: '/cosmetics/icons/made-07-sterk.png' }),
  item({ sku: 'tag_kurdish', name: 'Kurdish Tag', description: 'A Kurdish identity tag for your profile.', category: 'tag', premiumOnly: false }),
  item({ sku: 'streak_freeze', name: 'Streak freeze', category: 'freeze', price: 50, premiumOnly: false }),
];

function open(items: ShopItem[] = CATALOGUE, balances = { zer: 550, gems: 12 }) {
  const client = fakeClient({
    'GET /shop': ok({ items }),
    'GET /me/wallet': ok({ balances }),
    'GET /me/inventory': ok({ items: [], refreshedItems: [] }),
    'GET /me/gifts': ok({ gifts: [], unseen: 0 }),
    'POST /shop/purchase': ok({ purchased: true, balance: 150 }),
  });
  testAuth.client = client;
  renderWithProviders(<ShopScreen onExit={() => undefined} onEarnMore={() => undefined} />);
  return client;
}

/** The names of the rows on screen, in order. */
const rowNames = (): string[] =>
  screen
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '')
    .filter((label) => CATALOGUE.some((i) => label.startsWith(`${i.name},`) || label === i.name))
    .map((label) => label.split(',')[0]!);

const search = (text: string) => fireEvent.change(screen.getByLabelText('Search the shop'), { target: { value: text } });

describe('the Shop, by kind', () => {
  it('files every item under its kind, in the shared order, with a translated title and a count', async () => {
    open();
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    // the screen's own title first, then a heading for each kind
    const headings = screen.getAllByRole('heading').map((h) => h.getAttribute('aria-label') ?? h.textContent);
    expect(headings).toEqual(['Shop', 'Backgrounds, 4 items', 'Icons, 3 items', 'Tags, 1 item', 'More, 1 item']);
    // the server's own words never reach the screen
    for (const raw of ['BACKGROUND', 'background', 'ICON', 'TAG', 'freeze', 'SHOP.CATEGORY.MISC']) {
      expect(screen.queryByText(raw)).toBeNull();
    }
    expect(screen.getByText('9 items')).toBeTruthy();
  });

  it('shows each item’s picture, shaped by its kind, and a glyph for the tag that has none', async () => {
    open();
    const glass = await screen.findByRole('button', { name: /^Îstîkan, Tea glass, 900 Zêr$/ });
    // the picture is drawn once it starts loading, an effect after the row
    await waitFor(() => expect(glass.querySelector('img')?.getAttribute('src')).toBe('https://hevalo.app/cosmetics/icons/made-08-caydan.png'));
    const lake = screen.getByRole('button', { name: /^Gola Şîn/ });
    await waitFor(() => expect(lake.querySelector('img')?.getAttribute('src')).toBe('https://hevalo.app/cosmetics/backgrounds/made-06-gola-sin.webp'));
    const tag = screen.getByRole('button', { name: /^Kurdish Tag/ });
    expect(tag.querySelector('img')).toBeNull();
    expect(tag.querySelector('svg')).not.toBeNull();
    // a free item says so, in words
    expect(screen.getByRole('button', { name: 'Hevalo, Hevalo violet, Free' })).toBeTruthy();
  });

  it('narrows to one kind with the kind control, which says how many of each there are', async () => {
    open();
    const kinds = await screen.findByRole('radiogroup', { name: 'Kinds of item' });
    const options = within(kinds).getAllByRole('radio').map((r) => r.getAttribute('aria-label'));
    expect(options).toEqual(['All, 9 items', 'Backgrounds, 4 items', 'Icons, 3 items', 'Tags, 1 item', 'More, 1 item']);

    fireEvent.click(within(kinds).getByRole('radio', { name: 'Icons, 3 items' }));
    expect(within(kinds).getByRole('radio', { name: 'Icons, 3 items' }).getAttribute('aria-checked')).toBe('true');
    expect(rowNames()).toEqual(['Roj', 'Îstîkan', 'Mohra Rojê']);
    expect(screen.getByText('3 items')).toBeTruthy();
  });

  it('finds an item by its name with the Kurdish letters left out, and by what it means', async () => {
    open();
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    search('istikan');
    expect(rowNames()).toEqual(['Îstîkan']);
    expect(screen.getByText('1 item')).toBeTruthy();
    // the counts on the kinds follow the search
    expect(screen.getByRole('radio', { name: 'Backgrounds, 0 items' })).toBeTruthy();

    search('tea');
    expect(rowNames()).toEqual(['Îstîkan']);
    search('BLUE');
    expect(rowNames()).toEqual(['Gola Şîn']);
    search('sin');
    expect(rowNames()).toEqual(['Gola Şîn']);
  });

  it('puts each kind in price order (low to high: Zêr, then gems), either way, or by name', async () => {
    open();
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Featured' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Price: low to high' }));
    expect(screen.getByRole('button', { name: 'Sort: Price: low to high' })).toBeTruthy();
    expect(rowNames()).toEqual(['Hevalo', 'Gola Şîn', 'Şeva Zozanan', 'Berbang', 'Roj', 'Îstîkan', 'Mohra Rojê', 'Kurdish Tag', 'Streak freeze']);

    fireEvent.click(screen.getByRole('button', { name: 'Sort: Price: low to high' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Price: high to low' }));
    expect(rowNames().slice(0, 4)).toEqual(['Berbang', 'Şeva Zozanan', 'Gola Şîn', 'Hevalo']);

    fireEvent.click(screen.getByRole('button', { name: 'Sort: Price: high to low' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Name A–Z' }));
    expect(rowNames().slice(0, 4)).toEqual(['Berbang', 'Gola Şîn', 'Hevalo', 'Şeva Zozanan']);
  });

  it('keeps what the balance covers, each item against its own currency', async () => {
    open(CATALOGUE, { zer: 550, gems: 12 });
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    // gems are on sale here, so it is the balance, not only the Zêr
    fireEvent.click(screen.getByRole('checkbox', { name: 'Within my balance' }));
    expect(screen.getByRole('checkbox', { name: 'Within my balance' }).getAttribute('aria-checked')).toBe('true');
    const names = rowNames();
    // 10 gems is within 12 gems, though nothing compares it with the 550 Zêr
    expect(names).toContain('Berbang');
    // 20 gems is not, however much Zêr there is
    expect(names).not.toContain('Mohra Rojê');
    expect(names).toEqual(['Hevalo', 'Şeva Zozanan', 'Gola Şîn', 'Berbang', 'Kurdish Tag', 'Streak freeze']);
  });

  it('says "Within my Zêr" while everything is priced in Zêr', async () => {
    open(CATALOGUE.filter((i) => i.currency === 'zer'));
    expect(await screen.findByRole('checkbox', { name: 'Within my Zêr' })).toBeTruthy();
  });

  it('offers no gift for something free, and keeps Buy and the gift for the rest', async () => {
    const client = open();
    fireEvent.click(await screen.findByRole('button', { name: /^Hevalo,/ }));
    expect(screen.getByRole('button', { name: 'Get it free' })).toBeTruthy();
    expect(screen.queryByText('Send as a gift')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /^Gola Şîn,/ }));
    expect(screen.getByText('Send as a gift')).toBeTruthy();
    expect(screen.getByText('400 Zêr')).toBeTruthy();
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/shop/purchase')).toBe(true));
    expect(client.calls.find((c) => c.path === '/shop/purchase')?.body).toMatchObject({ sku: 'bg-made-gola-sin', expectedPrice: 400 });
    // bought: felt as it lands, as a purchase that failed would be
    await waitFor(() => expect(felt).toEqual(['tap']));
    stop();
  });

  it('still asks first before a dear purchase', async () => {
    const client = open(CATALOGUE, { zer: 2000, gems: 0 });
    fireEvent.click(await screen.findByRole('button', { name: /^Îstîkan,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(Alert.alert).toHaveBeenCalledWith('Confirm purchase', 'Spend 900 Zêr on Îstîkan?', expect.any(Array));
    expect(client.calls.some((c) => c.path === '/shop/purchase')).toBe(false);
  });

  it('clears every filter at once, and offers it when nothing matches', async () => {
    open();
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Icons, 3 items' }));
    search('glass');
    expect(rowNames()).toEqual(['Îstîkan']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rowNames()).toHaveLength(CATALOGUE.length);
    expect((screen.getByLabelText('Search the shop') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('radio', { name: 'All, 9 items' }).getAttribute('aria-checked')).toBe('true');

    search('xyzzy');
    expect(screen.getByText('Nothing matches that')).toBeTruthy();
    expect(rowNames()).toEqual([]);
    // one way back, in the empty state
    const clears = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(clears).toHaveLength(1);
    fireEvent.click(clears[0]!);
    expect(rowNames()).toHaveLength(CATALOGUE.length);
  });

  it('says the shop is empty when there is nothing on sale, with no filters for nothing', async () => {
    open([]);
    expect(await screen.findByText('The shop is empty right now — check back soon.')).toBeTruthy();
    expect(screen.queryByLabelText('Search the shop')).toBeNull();
  });
});
