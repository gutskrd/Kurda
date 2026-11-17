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
// the pull to refresh as a button: the web's control has nothing to pull
vi.mock('../net/usePullRefresh', () => import('../net/testing/pullRefresh'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Alert } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, fail, ok, testAuth } from '../reports/testing/auth';
import { DEFAULT_PAPER, TREE_KINDS, TREE_SPECIES, treeView, type LettersHome, type TreeRecord, type TreeView } from '@kurda/shared';
import type { MyTree } from '../tree/api';
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
  // the purse after something is bought: what the purchase says is left, and what the wallet then says too
  let spent = false;
  const client = fakeClient({
    'GET /shop': ok({ items }),
    'GET /me/wallet': () => ok({ balances: spent ? { ...balances, zer: 150 } : balances }),
    'GET /me/inventory': ok({ items: [], refreshedItems: [] }),
    'GET /me/gifts': ok({ gifts: [], unseen: 0 }),
    'POST /shop/purchase': () => {
      spent = true;
      return ok({ purchased: true, balance: 150 });
    },
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
  it('reads the catalogue and the purse again when pulled down', async () => {
    const client = open();
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    const count = (path: string) => client.calls.filter((c) => c.method === 'GET' && c.path === path).length;
    const before = [count('/shop'), count('/me/wallet')];
    fireEvent.click(screen.getByTestId('pull-to-refresh'));
    await waitFor(() => expect([count('/shop'), count('/me/wallet')]).toEqual([before[0]! + 1, before[1]! + 1]));
  });

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

  /*
   * Green is kept for a right answer, so "Free" is a price like any other;
   * and a row's name and meaning may take a second line rather than leave
   * "Ronahiy…" on a narrow phone.
   */
  it('prints Free as a price, not in green, and lets a name and its meaning take a second line', async () => {
    open();
    const free = await screen.findByRole('button', { name: 'Hevalo, Hevalo violet, Free' });
    const price = within(free).getByText('Free');
    const name = within(free).getByText('Hevalo');
    // in the ink the name is in, as an affordable price is
    expect(getComputedStyle(price).color).toBe(getComputedStyle(name).color);
    expect(getComputedStyle(name).whiteSpace).not.toBe('nowrap');
    expect(getComputedStyle(within(free).getByText('Hevalo violet')).whiteSpace).not.toBe('nowrap');
  });

  it('shows a frame the way it will be worn: round your own picture, in its row and in its sheet', async () => {
    open([...CATALOGUE, item({ sku: 'frame-made-lale', name: 'Xeleka Laleyan', description: 'Tulip wreath', category: 'frame', price: 1400, premiumOnly: false, assetUrl: '/cosmetics/frames/made-01-lale.png' })], { zer: 2000, gems: 0 });
    const row = await screen.findByRole('button', { name: /^Xeleka Laleyan, Tulip wreath, 1.?400 Zêr$/ });
    await waitFor(() => expect(row.querySelector('img')?.getAttribute('src')).toBe('https://hevalo.app/cosmetics/frames/made-01-lale.png'));
    // your own picture inside it (here, with no photo, the letters of your name on their disc)
    expect(row.querySelector('[role="img"][aria-label*="rojda"]')).not.toBeNull();
    // and again, larger, in the sheet the row opens: the frame and your picture are each on screen twice
    fireEvent.click(row);
    expect(await screen.findByRole('button', { name: 'Buy' })).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll('img[src="https://hevalo.app/cosmetics/frames/made-01-lale.png"]')).toHaveLength(2));
    expect(document.querySelectorAll('[role="img"][aria-label*="rojda"]')).toHaveLength(2);
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
    // the sheet's ✕, after the dimmed page behind it
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);

    fireEvent.click(screen.getByRole('button', { name: /^Gola Şîn,/ }));
    expect(screen.getByText('Send as a gift')).toBeTruthy();
    expect(screen.getByText('400 Zêr')).toBeTruthy();
    // beside Buy, before anything is spent: a purchase is final
    expect(screen.getByText('Every purchase is final: once it’s yours, it stays yours and can’t be returned. Take your time if you’re not sure.')).toBeTruthy();
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/shop/purchase')).toBe(true));
    expect(client.calls.find((c) => c.path === '/shop/purchase')?.body).toMatchObject({ sku: 'bg-made-gola-sin', expectedPrice: 400 });
    // bought: felt as it lands, as a purchase that failed would be
    await waitFor(() => expect(felt).toEqual(['tap']));
    stop();
    // said in the sheet it was bought from, with what is left in the purse — and no system box to dismiss
    expect(await screen.findByTestId('shop-bought')).toBeTruthy();
    expect(screen.getByText('Gola Şîn is yours!')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    // the server's new balance, in the purse at the top and in the sheet
    expect(screen.getAllByText('150').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: 'Buy' })).toBeNull();
    // one button, which closes the sheet
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('shop-bought')).toBeNull());
  });

  it('says why in a clear message when a purchase fails, and leaves the item to be tried again', async () => {
    const client = open();
    (client.post as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(async (path: string) =>
      path === '/shop/purchase' ? { ok: false, error: { kind: 'client', message: 'Not enough Zêr.', status: 402, code: 'INSUFFICIENT_FUNDS' } } : { ok: true, data: {} },
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Gola Şîn,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Purchase failed', expect.any(String)));
    expect(screen.queryByTestId('shop-bought')).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeTruthy();
  });

  it('still asks first before a dear purchase', async () => {
    const client = open(CATALOGUE, { zer: 2000, gems: 0 });
    fireEvent.click(await screen.findByRole('button', { name: /^Îstîkan,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Confirm purchase',
      'Spend 900 Zêr on Îstîkan?\n\nEvery purchase is final: once it’s yours, it stays yours and can’t be returned. Take your time if you’re not sure.',
      expect.any(Array),
    );
    expect(client.calls.some((c) => c.path === '/shop/purchase')).toBe(false);
  });

  it('asks first before spending gems, however few', async () => {
    const client = open();
    fireEvent.click(await screen.findByRole('button', { name: /^Berbang,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(Alert.alert).toHaveBeenCalledWith('Confirm purchase', expect.stringContaining('Every purchase is final'), expect.any(Array));
    expect(client.calls.some((c) => c.path === '/shop/purchase')).toBe(false);
  });

  it('says nothing about finality for a free item, which costs nothing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: /^Hevalo,/ }));
    expect(screen.getByRole('button', { name: 'Get it free' })).toBeTruthy();
    expect(screen.queryByText(/Every purchase is final/)).toBeNull();
  });

  it('has no Return control: not for refreshed items, not for anything', async () => {
    const client = fakeClient({
      'GET /shop': ok({ items: CATALOGUE }),
      'GET /me/wallet': ok({ balances: { zer: 550, gems: 12 } }),
      'GET /me/inventory': ok({
        items: [{ sku: 'bg-background-01', name: 'Şev', category: 'background', quantity: 1, premiumOnly: false, assetUrl: null }],
        refreshedItems: ['bg-background-01'],
      }),
      'GET /me/gifts': ok({ gifts: [], unseen: 0 }),
    });
    testAuth.client = client;
    renderWithProviders(<ShopScreen onExit={() => undefined} onEarnMore={() => undefined} />);
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    expect(screen.queryByRole('button', { name: /^Return/ })).toBeNull();
    expect(screen.queryByText('Return')).toBeNull();
    expect(screen.queryByText(/return them/)).toBeNull();
    expect(client.calls.some((c) => c.path.endsWith('/return'))).toBe(false);
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

/**
 * What of yours the Shop can change, over the search: your pen pal bird and
 * your tree, a row each that opens every choice there is.
 */
describe('your bird and your tree, in the Shop', () => {
  /** GET /letters: a pen pal page with this bird, chosen or not, and this much Zêr. */
  const letters = (over: Partial<LettersHome> = {}): LettersHome => ({
    refusal: null,
    bird: 2,
    birdChosen: true,
    zer: 550,
    out: null,
    visitor: null,
    birdsOut: 0,
    sky: [],
    callsLeft: 5,
    homecoming: null,
    arrival: null,
    penPals: [],
    roomForMore: true,
    paper: DEFAULT_PAPER,
    ...over,
  });
  const TODAY = '2026-11-13';
  const growing = (over: Partial<TreeRecord> = {}): TreeView =>
    treeView({ species: 'hinar', plantedOn: '2026-11-01', lastWateredOn: TODAY, waterings: 9, water: 2, harvests: 0, ...over }, TODAY);
  /** GET /me/tree: this tree (or none), every kind, these bought, this much Zêr. */
  const mine = (tree: TreeView | null, over: { owned?: string[]; zer?: number } = {}): MyTree => ({
    tree,
    planted: tree ? 1 : 0,
    kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: TREE_KINDS[species].starter || (over.owned ?? []).includes(species) })),
    zer: over.zer ?? 550,
  });
  const missing = fail({ kind: 'client', status: 404, code: 'NOT_FOUND', message: 'no route' });
  /** One answer per call, the last one again after that. */
  const inTurn = (...answers: unknown[]) => {
    let n = 0;
    return () => answers[Math.min(n++, answers.length - 1)] as ReturnType<typeof ok>;
  };

  /** The Shop, with these answers for the bird and the tree (a server without either, unless given). */
  function openOwn(routes: Parameters<typeof fakeClient>[0], balances = { zer: 550, gems: 12 }) {
    const client = fakeClient({
      'GET /shop': ok({ items: CATALOGUE }),
      'GET /me/wallet': ok({ balances }),
      'GET /me/inventory': ok({ items: [], refreshedItems: [] }),
      'GET /me/gifts': ok({ gifts: [], unseen: 0 }),
      'GET /letters?landings=1': missing,
      'GET /me/tree': missing,
      ...routes,
    });
    testAuth.client = client;
    renderWithProviders(<ShopScreen onExit={() => undefined} onEarnMore={() => undefined} />);
    return client;
  }
  const disabled = (testID: string): boolean => screen.getByTestId(testID).getAttribute('aria-disabled') === 'true';

  describe('the bird', () => {
    it('shows yours in a row, and in its sheet the eight birds as one group, yours ticked and said to be yours', async () => {
      openOwn({ 'GET /letters?landings=1': ok(letters()) });
      fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Pink bird' }));
      const group = await screen.findByRole('radiogroup', { name: 'Choose a new bird' });
      expect(within(group).getAllByRole('radio')).toHaveLength(8);
      expect(within(group).getByRole('radio', { name: 'Pink bird, your bird now' }).getAttribute('aria-checked')).toBe('true');
      expect(within(group).getByRole('radio', { name: 'Brown bird' }).getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('A new bird costs 500 Zêr. You have 550 Zêr.')).toBeTruthy();
      // the bird that is yours already cannot be bought again
      expect(disabled('shop-bird-get')).toBe(true);
    });

    it('takes the first bird for free, with no question, and posts the bird picked', async () => {
      const client = openOwn({ 'GET /letters?landings=1': ok(letters({ birdChosen: false, bird: 1 })), 'POST /letters/bird': ok(letters({ bird: 4 })) });
      fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Choose your bird' }));
      expect(screen.getByText('Your bird carries your letters. Your first one is free; a new one later costs 500 Zêr.')).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: 'Brown bird' }));
      fireEvent.click(screen.getByRole('button', { name: 'This is my bird' }));
      await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path === '/letters/bird')?.body).toEqual({ bird: 4 }));
      // free, so nothing was asked
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(await screen.findByText('Brown bird, your bird now')).toBeTruthy();
      fireEvent.click(screen.getByTestId('shop-bird-done'));
      expect(await screen.findByRole('button', { name: 'Your pen pal bird, Brown bird' })).toBeTruthy();
    });

    it('asks first before a new bird, as the Shop asks before a purchase, with its price and the balance', async () => {
      const client = openOwn({ 'GET /letters?landings=1': ok(letters()), 'POST /letters/bird': ok(letters({ bird: 4, zer: 50 })) });
      fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Pink bird' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Brown bird' }));
      expect(disabled('shop-bird-get')).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Get this bird · 500 Zêr' }));
      expect(Alert.alert).toHaveBeenCalledWith(
        'Confirm purchase',
        'Spend 500 Zêr on Brown bird?\nYou have 550 Zêr.\n\nEvery purchase is final: once it’s yours, it stays yours and can’t be returned. Take your time if you’re not sure.',
        expect.any(Array),
      );
      expect(client.calls.some((c) => c.path === '/letters/bird')).toBe(false);
      // yes: it is bought, and the purse at the top is what is left
      const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
      expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Buy']);
      buttons[1]!.onPress!();
      await waitFor(() => expect(client.calls.find((c) => c.method === 'POST' && c.path === '/letters/bird')?.body).toEqual({ bird: 4 }));
      expect(await screen.findByText('Brown bird, your bird now')).toBeTruthy();
      expect(screen.getAllByText('50').length).toBeGreaterThanOrEqual(1);
    });

    it('says how many Zêr are missing when the balance is short, and does not offer the buy', async () => {
      const client = openOwn({ 'GET /letters?landings=1': ok(letters({ zer: 300 })) }, { zer: 300, gems: 0 });
      fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Pink bird' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Brown bird' }));
      expect(screen.getByText('You need 200 more Zêr.')).toBeTruthy();
      expect(disabled('shop-bird-get')).toBe(true);
      fireEvent.click(screen.getByTestId('shop-bird-get'));
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(client.calls.some((c) => c.path === '/letters/bird')).toBe(false);
    });

    it('reads the balance again when the Zêr were spent meanwhile, and says what is now missing', async () => {
      // spent on something else, in another place, between the Shop opening and the bird being bought
      let spent = false;
      openOwn({
        'GET /letters?landings=1': () => ok(letters(spent ? { zer: 100 } : {})),
        'POST /letters/bird': () => {
          spent = true;
          return fail({ kind: 'client', status: 402, code: 'INSUFFICIENT_FUNDS', message: 'not enough' });
        },
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Pink bird' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Brown bird' }));
      fireEvent.click(screen.getByRole('button', { name: 'Get this bird · 500 Zêr' }));
      (vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{ onPress?: () => void }>)[1]!.onPress!();
      expect(await screen.findByText('You need 400 more Zêr.')).toBeTruthy();
      expect(disabled('shop-bird-get')).toBe(true);
    });
  });

  describe('the tree', () => {
    /** A kind's row in the nursery. */
    const kind = (species: string): HTMLElement => screen.getByTestId(`shop-tree-${species}`);

    it('shows the tree that stands in a row, and in the nursery every kind: growing, free, bought, and the price of the rest', async () => {
      openOwn({ 'GET /me/tree': ok(mine(growing(), { owned: ['tu'] })) });
      fireEvent.click(await screen.findByRole('button', { name: 'Your tree, Hinar · Growing now' }));
      expect(await screen.findByText('The nursery')).toBeTruthy();
      expect(screen.getByText('Planting another tree replaces the one you have. It starts again from a seed.')).toBeTruthy();
      for (const species of TREE_SPECIES) expect(kind(species)).toBeTruthy();
      // the one that stands cannot be planted over itself
      expect(within(kind('hinar')).getByText('Growing now')).toBeTruthy();
      expect(within(kind('hinar')).queryByRole('button')).toBeNull();
      expect(within(kind('beru')).getByText('Free')).toBeTruthy();
      expect(within(kind('beru')).getByRole('button', { name: 'Plant: Berû (Oak)' })).toBeTruthy();
      expect(within(kind('tu')).getByText('Yours')).toBeTruthy();
      expect(within(kind('kaj')).getByText('1,000')).toBeTruthy();
      expect(within(kind('kaj')).getByRole('button', { name: 'Buy: Kaj (Pine)' })).toBeTruthy();
      expect(within(kind('sev')).getByText('You need 1,650 more Zêr.')).toBeTruthy();
    });

    it('buys a kind once it has said what it costs, which plants nothing', async () => {
      const client = openOwn(
        { 'GET /me/tree': ok(mine(growing(), { zer: 2000 })), 'POST /me/tree/kinds/kaj/buy': ok(mine(growing(), { owned: ['kaj'], zer: 1000 })) },
        { zer: 2000, gems: 0 },
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Your tree, Hinar · Growing now' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Buy: Kaj (Pine)' }));
      expect(await screen.findByText('Buy Kaj?')).toBeTruthy();
      expect(screen.getByText('It costs 1,000 Zêr, once. After that you can plant it whenever you like.')).toBeTruthy();
      expect(screen.getByText('You have 2,000 Zêr.')).toBeTruthy();
      expect(client.calls.some((c) => c.path === '/me/tree/kinds/kaj/buy')).toBe(false);
      fireEvent.click(screen.getByTestId('shop-tree-confirm'));
      await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/me/tree/kinds/kaj/buy')).toBe(true));
      // back at the kinds, where it is theirs to plant; nothing was planted
      expect(await within(await screen.findByTestId('shop-tree-kaj')).findByRole('button', { name: 'Plant: Kaj (Pine)' })).toBeTruthy();
      expect(within(kind('kaj')).getByText('Yours')).toBeTruthy();
      expect(client.calls.some((c) => c.path === '/me/tree/plant')).toBe(false);
    });

    it('asks before planting another kind, saying the tree that stands will be gone, and keeps it when told to', async () => {
      const client = openOwn({
        'GET /me/tree': ok(mine(growing())),
        'POST /me/tree/plant': ok(mine(growing({ species: 'beru', waterings: 0, plantedOn: TODAY }))),
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Your tree, Hinar · Growing now' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Plant: Berû (Oak)' }));
      expect(await screen.findByText('Plant Berû?')).toBeTruthy();
      expect(screen.getByText('Your Hinar will be gone, with everything it has grown. The water you hold stays with you.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Keep my tree' }));
      expect(await screen.findByText('The nursery')).toBeTruthy();
      expect(client.calls.some((c) => c.path === '/me/tree/plant')).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'Plant: Berû (Oak)' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Plant it' }));
      await waitFor(() => expect(client.calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'beru' }));
      // the sheet closes on the Shop, whose row shows the new tree
      expect(await screen.findByRole('button', { name: 'Your tree, Berû · Growing now' })).toBeTruthy();
    });
  });

  it('shows neither row on a server that has no letters or trees', async () => {
    openOwn({});
    await screen.findByRole('heading', { name: 'Backgrounds, 4 items' });
    expect(screen.queryByRole('button', { name: /^Your pen pal bird/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Your tree/ })).toBeNull();
  });

  it('offers to read the bird again, calmly, when it could not be read', async () => {
    const client = openOwn({ 'GET /letters?landings=1': inTurn(fail({ kind: 'server', status: 500, message: 'down' }), ok(letters())) });
    fireEvent.click(await screen.findByRole('button', { name: 'Your pen pal bird, Try again' }));
    expect(await screen.findByRole('button', { name: 'Your pen pal bird, Pink bird' })).toBeTruthy();
    expect(client.calls.filter((c) => c.path === '/letters?landings=1')).toHaveLength(2);
  });
});
