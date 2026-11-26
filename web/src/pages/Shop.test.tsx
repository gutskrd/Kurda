import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { Shop } from './Shop';
import { renderApp, jsonResponse } from '../test/utils';
import type { ShopItem } from '../lib/types';
import { DEFAULT_PAPER, TREE_KINDS, TREE_SPECIES, treeView, type LettersHome, type TreeRecord } from '@kurda/shared';
import type { MyTree } from '../tree/useTree';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** What `GET /shop` sends: two backgrounds, an icon with a Kurdish name, and the Kurdish tag, which has no art. */
const CATALOGUE: ShopItem[] = [
  { sku: 'bg-1', name: 'Sunset', description: 'Evening sky', category: 'background', currency: 'zer', price: 500, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/bg-1.webp' },
  { sku: 'bg-2', name: 'Pricey', description: null, category: 'background', currency: 'zer', price: 5000, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/bg-2.webp' },
  { sku: 'icon-made-caydan', name: 'Îstîkan', description: 'Tea glass', category: 'icon', currency: 'zer', price: 900, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/icons/made-08-caydan.png' },
  { sku: 'tag_kurdish', name: 'Kurdish Tag', description: 'A Kurdish identity tag for your profile.', category: 'tag', currency: 'zer', price: 500, isUnique: true, premiumOnly: false, assetUrl: null },
];

function makeFetch(
  calls: Array<{ url: string; body: unknown }>,
  owned: string[] = [],
  { items = CATALOGUE, balances = { zer: 1000 } }: { items?: ShopItem[]; balances?: { zer: number } } = {},
) {
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
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances });
    if (url.includes('/shop')) return jsonResponse(200, { items });
    return jsonResponse(200, {});
  });
}

/** Where the router is, so a test can read the address the Shop keeps its view in. */
function Where(): React.JSX.Element {
  const loc = useLocation();
  return <span data-testid="where">{loc.pathname + loc.search}</span>;
}

/** The names on the tiles, in the order they are drawn. */
const tileNames = (root: HTMLElement = document.body): string[] =>
  [...root.querySelectorAll('.shop-tile .shop-name')].map((el) => el.textContent ?? '');

describe('Shop', () => {
  it('lists backgrounds/icons with prices and buys an affordable one', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', makeFetch(calls));
    renderApp(<Shop />, ['/app/shop']);

    // Affordable background shows its price and buys with the expected-price guard.
    const sunset = (await screen.findByText('Sunset')).closest('figure')!;
    expect(within(sunset).getByText(/500 Zêr/)).toBeInTheDocument();
    await userEvent.click(within(sunset).getByRole('button', { name: 'Buy' }));
    // It asks first, and says that the purchase is final.
    const confirm = await screen.findByRole('dialog', { name: 'Buy Sunset?' });
    expect(calls.some((c) => c.url.includes('/shop/purchase'))).toBe(false);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Buy' }));
    expect(await screen.findByText(/Sunset is yours/)).toBeInTheDocument();
    const buy = calls.find((c) => c.url.includes('/shop/purchase'));
    expect(buy?.body).toMatchObject({ sku: 'bg-1', expectedPrice: 500 });
    // After buying it flips to Owned.
    expect(within(sunset).getByText('Owned')).toBeInTheDocument();
  });

  it('says kindly that a purchase is final, and buys nothing when you step back', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', makeFetch(calls));
    renderApp(<Shop />, ['/app/shop']);
    const sunset = (await screen.findByText('Sunset')).closest('figure')!;
    await userEvent.click(within(sunset).getByRole('button', { name: 'Buy' }));

    const confirm = await screen.findByRole('dialog', { name: 'Buy Sunset?' });
    expect(within(confirm).getByText('500 Zêr')).toBeInTheDocument();
    expect(within(confirm).getByText(/Every purchase is final: once it’s yours, it stays yours and can’t be returned/)).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.url.includes('/shop/purchase'))).toBe(false);
    expect(within(sunset).queryByText('Owned')).toBeNull();
  });

  it('still shows the price of something you cannot afford, and the shortfall', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    const pricey = (await screen.findByText('Pricey')).closest('figure')!;

    expect(within(pricey).getByRole('button', { name: 'Buy' })).toBeDisabled();
    // The number you are saving towards, and the gap — 5000 wanted, 1000 held.
    expect(within(pricey).getByText(/5,000 Zêr/)).toBeInTheDocument();
    expect(within(pricey).getByText(/4,000 more/)).toBeInTheDocument();
  });

  it('files everything on sale under its kind — the Kurdish tag too — with a count on each tab', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    const tabs = screen.getAllByRole('tab');
    // All, then only the kinds on sale, in the shared order; no empty "Frames" or "More".
    expect(tabs.map((tab) => tab.textContent)).toEqual(['All4', 'Backgrounds2', 'Icons1', 'Tags1']);
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');

    // Under All, a titled section per kind, each with its own count.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Backgrounds2', 'Icons1', 'Tags1']);

    // The tag the Tags card sends people here to buy is on sale, priced, and drawn as a tag.
    const tag = screen.getByText('Kurdish Tag').closest('figure')!;
    expect(within(tag).getByText(/500 Zêr/)).toBeInTheDocument();
    expect(within(tag).getByRole('button', { name: 'Buy' })).toBeEnabled();
    expect(tag.querySelector('.item-glyph svg')).not.toBeNull();
    // And every item says what it is under its Kurdish name.
    expect(within(screen.getByText('Îstîkan').closest('figure')!).getByText('Tea glass')).toBeInTheDocument();
  });

  /** Pictures can be uploaded for every kind of item. */
  it('draws an item’s own picture whatever its kind, its glyph where it has none, and a video background as a video', async () => {
    const items: ShopItem[] = [
      { sku: 'freeze', name: 'Cemed', description: 'Streak freeze', category: 'streak_freeze', currency: 'zer', price: 200, isUnique: false, premiumOnly: false, assetUrl: 'https://cdn.test/art/freeze.png' },
      { sku: 'double', name: 'Du qat', description: 'Double XP', category: 'powerup', currency: 'zer', price: 300, isUnique: false, premiumOnly: false, assetUrl: null },
      { sku: 'tag_kurdish', name: 'Kurdish Tag', description: null, category: 'tag', currency: 'zer', price: 500, isUnique: true, premiumOnly: false, assetUrl: 'https://cdn.test/art/tag.png' },
      { sku: 'bg-night', name: 'Şev', description: null, category: 'background', currency: 'zer', price: 500, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/night.mp4' },
    ];
    vi.stubGlobal('fetch', makeFetch([], [], { items }));
    renderApp(<Shop />, ['/app/shop']);

    const freeze = (await screen.findByText('Cemed')).closest('figure')!;
    expect(freeze.querySelector('.shop-thumb-other img')).toHaveAttribute('src', 'https://cdn.test/art/freeze.png');
    expect(freeze.querySelector('.item-glyph')).toBeNull();
    const tag = screen.getByText('Kurdish Tag').closest('figure')!;
    expect(tag.querySelector('.shop-thumb-tag img')).toHaveAttribute('src', 'https://cdn.test/art/tag.png');
    const double = screen.getByText('Du qat').closest('figure')!;
    expect(double.querySelector('img')).toBeNull();
    expect(double.querySelector('.item-glyph svg')).not.toBeNull();
    const night = screen.getByText('Şev').closest('figure')!;
    expect(night.querySelector('.shop-thumb-background video')).toHaveAttribute('src', '/cosmetics/backgrounds/night.mp4');
    expect(night.querySelector('img')).toBeNull();
  });

  it('shows a frame the way it will be worn: round a face, at a frame’s own size', async () => {
    const items: ShopItem[] = [
      { sku: 'frame-made-lale', name: 'Xeleka Laleyan', description: 'Tulip wreath', category: 'frame', currency: 'zer', price: 1400, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/frames/made-01-lale.png' },
      { sku: 'ic-1', name: 'Roj', description: 'Sun', category: 'icon', currency: 'zer', price: 600, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/icons/made-02-roj.png' },
    ];
    vi.stubGlobal('fetch', makeFetch([], [], { items, balances: { zer: 2000 } }));
    renderApp(<Shop />, ['/app/shop']);

    const frame = (await screen.findByText('Xeleka Laleyan')).closest('figure')!;
    const worn = frame.querySelector('.shop-thumb-frame .art-frame.is-made') as HTMLElement;
    expect(worn.querySelector('img.art-frame-ring')).toHaveAttribute('src', '/cosmetics/frames/made-01-lale.png');
    // The face in the middle two thirds of it, whoever is looking.
    expect((worn.querySelector('.art-frame-face') as HTMLElement).style.width).toBe(`${Math.round((104 * 2) / 3)}px`);
    expect(within(frame).getByRole('button', { name: 'Buy' })).toBeEnabled();
    expect(frame).toHaveTextContent('1,400');
    // An icon is still its own picture, with nothing round it.
    const icon = screen.getByText('Roj').closest('figure')!;
    expect(icon.querySelector('.art-frame')).toBeNull();
    expect(icon.querySelector('.shop-thumb-icon img')).toHaveAttribute('src', '/cosmetics/icons/made-02-roj.png');
  });

  it('narrows to one kind of thing', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));

    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/Icons/);
    // Just that kind's grid: no section headings, and nothing of another kind.
    expect(screen.queryByRole('heading', { name: /Backgrounds/ })).not.toBeInTheDocument();
    expect(tileNames()).toEqual(['Îstîkan']);
  });

  it('moves between the kinds with the arrow keys, as tabs do', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    // One stop in the Tab order: the chosen tab.
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('tabindex', '-1');

    screen.getByRole('tab', { name: /All/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Tags/ })).toHaveAttribute('aria-selected', 'true');
    expect(tileNames()).toEqual(['Kurdish Tag']);
    // Past the end wraps round to the start.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('narrows by name so a big catalogue does not have to be scrolled', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.type(screen.getByLabelText('Search the shop'), 'pric');

    expect(screen.getByText('Pricey')).toBeInTheDocument();
    expect(screen.queryByText('Sunset')).not.toBeInTheDocument();
  });

  it('finds a Kurdish name typed without its Kurdish letters, and an item by what it is', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');
    const search = screen.getByLabelText('Search the shop');

    await userEvent.type(search, 'istikan');
    expect(tileNames()).toEqual(['Îstîkan']);
    // The tabs count what the search lets through.
    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveTextContent('0');

    await userEvent.clear(search);
    await userEvent.type(search, 'tea glass');
    expect(tileNames()).toEqual(['Îstîkan']);
  });

  it('describes what the shop ships with in the reader’s language, and finds it by those words', async () => {
    localStorage.setItem('hevalo_locale', 'de');
    const night: ShopItem = { ...CATALOGUE[0]!, sku: 'bg-made-seva-zozanan', name: 'Şeva Zozanan', description: 'Night on the high pastures' };
    const sun: ShopItem = { ...CATALOGUE[2]!, sku: 'icon-made-roj', name: 'Roj', description: 'Sun' };
    vi.stubGlobal('fetch', makeFetch([], [], { items: [night, sun] }));
    renderApp(<Shop />, ['/app/shop']);
    expect(await screen.findByText('Nacht auf den Hochweiden')).toBeInTheDocument();
    expect(screen.queryByText('Night on the high pastures')).toBeNull();

    await userEvent.type(screen.getByRole('searchbox'), 'sonne');
    // The search reaches the list through the address, a render behind the last key.
    await waitFor(() => expect(tileNames()).toEqual(['Roj']));
  });

  it('sorts by price, either way', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop?kind=background']);
    await screen.findByText('Sunset');
    expect(tileNames()).toEqual(['Sunset', 'Pricey']);

    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'price-desc');
    expect(tileNames()).toEqual(['Pricey', 'Sunset']);
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'price-asc');
    expect(tileNames()).toEqual(['Sunset', 'Pricey']);
  });

  it('keeps the view in the address, so it survives a reload and Back', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    // A reload of a narrowed Shop: the address is all there is.
    renderApp(
      <>
        <Shop />
        <Where />
      </>,
      ['/app/shop?kind=icon&q=tea&sort=price-desc&afford=1'],
    );
    await screen.findByText('Îstîkan');
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search the shop')).toHaveValue('tea');
    expect(screen.getByLabelText('Sort')).toHaveValue('price-desc');
    expect(screen.getByRole('checkbox', { name: 'Within my balance' })).toBeChecked();

    // And what is chosen goes back into it.
    await userEvent.click(screen.getByRole('tab', { name: /Tags/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/shop?kind=tag&q=tea&sort=price-desc&afford=1');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    // A plain Shop has a plain address.
    expect(screen.getByTestId('where').textContent).toBe('/app/shop');
  });

  it('writes the search into the address as it is typed', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(
      <>
        <Shop />
        <Where />
      </>,
      ['/app/shop'],
    );
    await screen.findByText('Sunset');
    await userEvent.type(screen.getByLabelText('Search the shop'), 'kurd');
    expect(screen.getByTestId('where')).toHaveTextContent('/app/shop?q=kurd');
    expect(screen.getByLabelText('Search the shop')).toHaveValue('kurd');
  });

  it('hides what the wallet cannot reach', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByLabelText('Within my balance'));

    expect(screen.getByText('Sunset')).toBeInTheDocument(); // 500, held 1000.
    expect(screen.queryByText('Pricey')).not.toBeInTheDocument(); // 5000
  });

  it('says what each price is worth in money, beside it', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    const tile = (await screen.findByText('Îstîkan')).closest('figure')!;
    expect(within(tile).getByText(/900 Zêr/)).toBeInTheDocument();
    expect(within(tile).getByText('≈ €9')).toBeInTheDocument();
    const pricey = screen.getByText('Pricey').closest('figure')!;
    expect(within(pricey).getByText('≈ €50')).toBeInTheDocument();
    expect(within(pricey).getByText(/4,000 more/)).toBeInTheDocument();
  });

  it('keeps something you already own, however dear it was', async () => {
    // 'Pricey' costs 5000 against 1000, but it is owned, and nobody is told they cannot afford what they have.
    vi.stubGlobal('fetch', makeFetch([], ['bg-2']));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByLabelText('Within my balance'));

    const pricey = screen.getByText('Pricey').closest('figure')!;
    expect(within(pricey).getByText('Owned')).toBeInTheDocument();
  });

  it('narrows to what is free', async () => {
    const plain: ShopItem = { sku: 'bg-free', name: 'Plain', description: null, category: 'background', currency: 'zer', price: 0, isUnique: true, premiumOnly: false, assetUrl: null };
    vi.stubGlobal('fetch', makeFetch([], [], { items: [plain, ...CATALOGUE] }));
    renderApp(<Shop />, ['/app/shop']);
    const tile = (await screen.findByText('Plain')).closest('figure')!;
    // What the filter calls it, rather than "0 Zêr".
    expect(within(tile).getByText('Free')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Free' }));
    expect(tileNames()).toEqual(['Plain']);
  });

  it('says how many it is showing, politely, and clears back to everything', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    const count = screen.getByRole('status');
    expect(count).toHaveAttribute('aria-live', 'polite');
    expect(count).toHaveTextContent('4 items');
    // Nothing is narrowed yet, so there is nothing to clear.
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Backgrounds/ }));
    await userEvent.type(screen.getByLabelText('Search the shop'), 'sun');
    expect(count).toHaveTextContent('1 item');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(count).toHaveTextContent('4 items');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search the shop')).toHaveValue('');
  });

  // `GET /friends` sends `userId`, not `id`, so the gift must post that.
  it('gifts to the friend picked — by their userId — and points to the chat it went to', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const shop = makeFetch(calls);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/friends')) {
          return jsonResponse(200, { total: 1, friends: [{ userId: 'u-rojda', username: 'rojda', avatarUrl: null, online: false }] });
        }
        if (url.includes('/shop/gift')) {
          calls.push({ url, body: JSON.parse(init!.body as string) });
          return jsonResponse(200, { gifted: true, duplicate: false, sku: 'bg-1', balance: 500 });
        }
        return shop(url, init);
      }),
    );
    renderApp(<Shop />, ['/app/shop']);

    await userEvent.click(await screen.findByRole('button', { name: 'Gift Sunset to a friend' }));
    await userEvent.click(await screen.findByRole('button', { name: /rojda/ }));

    expect(await screen.findByText(/Sunset is on its way to rojda/)).toBeInTheDocument();
    const sent = calls.find((c) => c.url.includes('/shop/gift'));
    expect(sent?.body).toMatchObject({ sku: 'bg-1', toUserId: 'u-rojda', expectedPrice: 500 });
    expect(screen.getByRole('link', { name: 'See it in your chat' })).toHaveAttribute('href', '/app/messages?to=u-rojda&name=rojda');
  });

  /** Stubs the Shop with one friend, and `/shop/gift` answering `status`/`body`. */
  function giftRefusedWith(status: number, body: unknown): void {
    const shop = makeFetch([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/friends')) {
          return jsonResponse(200, { total: 1, friends: [{ userId: 'u-rojda', username: 'rojda', avatarUrl: null, online: false }] });
        }
        if (url.includes('/shop/gift')) return jsonResponse(status, body);
        return shop(url, init);
      }),
    );
  }

  it('says a refused gift in the words the chat picker uses — today’s limit is not "too many requests"', async () => {
    giftRefusedWith(429, { code: 'GIFT_DAILY_LIMIT', message: 'that is all the gifts for today' });
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'Gift Sunset to a friend' }));
    await userEvent.click(await screen.findByRole('button', { name: /rojda/ }));
    expect(await screen.findByText('You’ve reached today’s gift limit for rojda.')).toBeInTheDocument();
  });

  it('says what a chat mute stops, and until when, with the way to Account standing', async () => {
    giftRefusedWith(403, { code: 'MUTED', message: 'no', details: { scope: 'chat', until: null } });
    renderApp(<Shop />, ['/app/shop']);
    await userEvent.click(await screen.findByRole('button', { name: 'Gift Sunset to a friend' }));
    await userEvent.click(await screen.findByRole('button', { name: /rojda/ }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toHaveAttribute('href', '/app/settings/standing');
  });

  it('says where a bought tag is to be found', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', makeFetch(calls));
    renderApp(<Shop />, ['/app/shop?kind=tag']);
    const tag = (await screen.findByText('Kurdish Tag')).closest('figure')!;
    await userEvent.click(within(tag).getByRole('button', { name: 'Buy' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Buy Kurdish Tag?' })).getByRole('button', { name: 'Buy' }));
    expect(await screen.findByText('Kurdish Tag is yours. You’ll find it under Tags in Edit profile.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('/shop/purchase'))?.body).toMatchObject({ sku: 'tag_kurdish', expectedPrice: 500 });
  });

  it('offers no gift for a free item, which cannot be given', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/me/inventory')) return jsonResponse(200, { items: [] });
        if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 1000 } });
        if (url.includes('/shop')) {
          return jsonResponse(200, {
            items: [
              { sku: 'bg-free', name: 'Plain', description: null, category: 'background', currency: 'zer', price: 0, isUnique: true, premiumOnly: false, assetUrl: null },
              { sku: 'bg-1', name: 'Sunset', description: null, category: 'background', currency: 'zer', price: 500, isUnique: true, premiumOnly: true, assetUrl: null },
            ],
          });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<Shop />, ['/app/shop']);
    const plain = (await screen.findByText('Plain')).closest('figure')!;
    // A free item is had, not bought, and says so with no coin beside it.
    expect(within(plain).getByRole('button', { name: 'Get it free' })).toBeInTheDocument();
    expect(within(plain).getByText('Free')).toBeInTheDocument();
    expect(within(plain).queryByRole('button', { name: 'Gift Plain to a friend' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gift Sunset to a friend' })).toBeInTheDocument();
    // Nothing is spent on it, so it is simply taken: no confirmation to get through.
    await userEvent.click(within(plain).getByRole('button', { name: 'Get it free' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no Return control anywhere: what is bought stays bought', async () => {
    vi.stubGlobal('fetch', makeFetch([], ['bg-old']));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');
    expect(screen.queryByRole('button', { name: /return/i })).toBeNull();
    expect(screen.queryByText(/return/i)).toBeNull();
  });

  it('says so when nothing matches, rather than showing empty shelves — and offers the way back', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.type(screen.getByLabelText('Search the shop'), 'zzzz');

    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 items');
    // One way out, in the empty state itself.
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(clear).toHaveLength(1);
    await userEvent.click(clear[0]!);
    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matches that/)).not.toBeInTheDocument();
  });
});

/** What of yours the Shop can change: your letters' bird and your tree, fetched only for someone signed in. */
describe('Shop: your bird and your tree', () => {
  /** GET /letters: a pen pal page with this bird, chosen or not, and this much Zêr. */
  const letters = (over: Partial<LettersHome> = {}): LettersHome => ({
    refusal: null,
    bird: 2,
    birdChosen: true,
    zer: 1200,
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
  const growing = (over: Partial<TreeRecord> = {}) =>
    treeView({ species: 'hinar', plantedOn: '2026-11-01', lastWateredOn: TODAY, waterings: 24, water: 2, harvests: 0, ...over }, TODAY);
  /** GET /me/tree: this tree (or none), every kind, these bought, this much Zêr. */
  const mine = (tree: ReturnType<typeof growing> | null, over: { owned?: string[]; zer?: number } = {}): MyTree => ({
    tree,
    planted: tree ? 1 : 0,
    kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: TREE_KINDS[species].starter || (over.owned ?? []).includes(species) })),
    zer: over.zer ?? 1200,
  });

  /**
   * A server for a signed-in Shop: the catalogue, plus routes by "METHOD /path" (a function gets the body, an array
   * answers one entry per call); anything else is a 404, as a server without that part answers.
   */
  function signedInShop(routes: Record<string, unknown>, { zer = 1200 }: { zer?: number } = {}) {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const calls: Array<{ method: string; path: string; search: string; body: unknown }> = [];
    const asked: Record<string, number> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const { pathname: path, search } = new URL(url, 'http://x');
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, path, search, body });
        const key = `${method} ${path}`;
        if (key === 'GET /me') return jsonResponse(200, { user: { id: 'u1', username: 'rojda', displayName: 'Rojda', locale: 'en' } });
        if (key === 'GET /shop') return jsonResponse(200, { items: CATALOGUE });
        if (key === 'GET /me/inventory') return jsonResponse(200, { items: [] });
        if (key === 'GET /me/wallet') return jsonResponse(200, { balances: { zer } });
        if (key === 'GET /me/gifts') return jsonResponse(200, { gifts: [], unseen: 0 });
        if (!(key in routes)) return jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
        let answer = routes[key];
        if (Array.isArray(answer)) {
          const n = asked[key] ?? 0;
          asked[key] = n + 1;
          answer = answer[Math.min(n, answer.length - 1)];
        }
        if (typeof answer === 'function') answer = (answer as (b: unknown) => unknown)(body);
        const { status = 200, json } = answer as { status?: number; json: unknown };
        return jsonResponse(status, json);
      }),
    );
    return calls;
  }
  const ok = (json: unknown) => ({ json });

  /** The Zêr the Shop says there are, at the top. */
  const balance = (): string => document.querySelector('.page-sub strong')?.textContent ?? '';

  describe('the bird', () => {
    it('shows the eight birds as one group of radio buttons, the one that is yours ticked and said to be yours', async () => {
      const calls = signedInShop({ 'GET /letters': ok(letters()) });
      renderApp(<Shop />, ['/app/shop']);
      expect(await screen.findByRole('heading', { name: 'Your pen pal bird' })).toBeInTheDocument();
      // Read as the window reads it, so looking at the shop never lands a letter the window has not shown.
      expect(calls.filter((c) => c.path === '/letters').map((c) => c.search)).toEqual(['?landings=1']);
      const group = screen.getByRole('radiogroup', { name: 'Choose a new bird' });
      expect(within(group).getAllByRole('radio')).toHaveLength(8);
      expect(within(group).getByRole('radio', { name: 'Pink bird, your bird now' })).toBeChecked();
      expect(within(group).getByRole('radio', { name: 'Brown bird' })).not.toBeChecked();
      // What a new one costs, against what there is, before anything is picked.
      expect(screen.getByText('A new bird costs 250 Zêr. You have 1,200 Zêr.')).toBeInTheDocument();
      expect(screen.getByText('Pink bird, your bird now', { selector: '.yours-picked span' })).toBeInTheDocument();
      // Nothing to buy until another bird is picked.
      expect(screen.queryByRole('button', { name: /Get this bird/ })).toBeNull();
      // And the way to the letters themselves.
      expect(screen.getByRole('link', { name: 'Letters' })).toHaveAttribute('href', '/app/letters');
    });

    it('takes the first bird for free, with no question, and posts the bird picked', async () => {
      const calls = signedInShop({
        'GET /letters': ok(letters({ birdChosen: false, bird: 1 })),
        'POST /letters/bird': ok(letters({ birdChosen: true, bird: 4 })),
      });
      renderApp(<Shop />, ['/app/shop']);
      const group = await screen.findByRole('radiogroup', { name: 'Choose your bird' });
      expect(screen.getByText('Your bird carries your letters. Your first one is free; a new one later costs 250 Zêr.')).toBeInTheDocument();
      await userEvent.click(within(group).getByRole('radio', { name: 'Brown bird' }));
      await userEvent.click(screen.getByRole('button', { name: 'This is my bird' }));
      // Free, so simply taken: no dialog, nothing spent.
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/letters/bird')?.body).toEqual({ bird: 4 }));
      expect(await screen.findByRole('radio', { name: 'Brown bird, your bird now' })).toBeChecked();
      expect(balance()).toBe('1,200 Zêr');
    });

    it('asks before a new bird, saying its price and the balance, and buys it only when told to', async () => {
      const calls = signedInShop({
        'GET /letters': ok(letters()),
        'POST /letters/bird': ok(letters({ bird: 4, zer: 950 })),
      });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('radio', { name: 'Brown bird' }));
      await userEvent.click(screen.getByRole('button', { name: 'Get this bird · 250 Zêr' }));

      const ask = await screen.findByRole('dialog', { name: 'Buy Brown bird?' });
      expect(within(ask).getByText('250 Zêr')).toBeInTheDocument();
      expect(within(ask).getByText('You have 1,200 Zêr.')).toBeInTheDocument();
      expect(within(ask).getByText(/Every purchase is final/)).toBeInTheDocument();
      expect(calls.some((c) => c.path === '/letters/bird')).toBe(false);

      // Keeping the bird asks nothing more and buys nothing.
      await userEvent.click(within(ask).getByRole('button', { name: 'Keep my bird' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.some((c) => c.path === '/letters/bird')).toBe(false);
      expect(screen.getByRole('radio', { name: 'Pink bird, your bird now' })).toBeChecked();

      await userEvent.click(screen.getByRole('radio', { name: 'Brown bird' }));
      await userEvent.click(screen.getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/letters/bird')?.body).toEqual({ bird: 4 }));
      expect(await screen.findByRole('radio', { name: 'Brown bird, your bird now' })).toBeChecked();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      // What is left, at the top of the Shop and under the birds.
      expect(balance()).toBe('950 Zêr');
      expect(screen.getByText('A new bird costs 250 Zêr. You have 950 Zêr.')).toBeInTheDocument();
    });

    it('says how many Zêr are missing when the balance is short, and does not offer the buy', async () => {
      const calls = signedInShop({ 'GET /letters': ok(letters({ zer: 100 })) }, { zer: 100 });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('radio', { name: 'Brown bird' }));
      expect(screen.getByText('You need 150 more Zêr.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Get this bird · 250 Zêr' })).toBeDisabled();
      expect(calls.some((c) => c.path === '/letters/bird')).toBe(false);
    });

    it('reads the balance again when the Zêr were spent meanwhile, and says what is now missing', async () => {
      signedInShop({
        'GET /letters': [ok(letters()), ok(letters({ zer: 100 }))],
        'POST /letters/bird': { status: 402, json: { code: 'INSUFFICIENT_FUNDS', message: 'not enough' } },
      });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('radio', { name: 'Brown bird' }));
      await userEvent.click(screen.getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      const ask = await screen.findByRole('dialog', { name: 'Buy Brown bird?' });
      await userEvent.click(within(ask).getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      // The dialog stays, with the balance as it now is and the gap to close.
      expect(await within(ask).findByText('You need 150 more Zêr.')).toBeInTheDocument();
      expect(within(ask).getByText('You have 100 Zêr.')).toBeInTheDocument();
      expect(within(ask).getByRole('button', { name: 'Get this bird · 250 Zêr' })).toBeDisabled();
      expect(balance()).toBe('100 Zêr');
    });

    it('has nothing to do when the bird asked for is already yours', async () => {
      signedInShop({
        'GET /letters': [ok(letters()), ok(letters({ bird: 4, zer: 700 }))],
        'POST /letters/bird': { status: 409, json: { code: 'LETTER_BIRD_SAME', message: 'this bird is already yours' } },
      });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('radio', { name: 'Brown bird' }));
      await userEvent.click(screen.getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Get this bird · 250 Zêr' }));
      // No error to read: the dialog goes, and the bird is the one the server says is yours.
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.queryByRole('alert')).toBeNull();
      expect(await screen.findByRole('radio', { name: 'Brown bird, your bird now' })).toBeChecked();
    });
  });

  describe('the tree', () => {
    /** A kind's tile, by its name and what it means. */
    const tile = (name: string): HTMLElement => screen.getByRole('article', { name });

    it('shows every kind: the one growing, the free ones, the ones bought, and the price of the rest', async () => {
      signedInShop({ 'GET /me/tree': ok(mine(growing(), { owned: ['tu'], zer: 600 })) }, { zer: 600 });
      renderApp(<Shop />, ['/app/shop']);
      expect(await screen.findByRole('heading', { name: 'Your tree' })).toBeInTheDocument();
      expect(screen.getByText('Planting another tree replaces the one you have. It starts again from a seed.')).toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(TREE_SPECIES.length);
      // The one that stands cannot be planted over itself.
      expect(within(tile('Hinar (Pomegranate)')).getByText('Growing now')).toBeInTheDocument();
      expect(within(tile('Hinar (Pomegranate)')).queryByRole('button')).toBeNull();
      expect(within(tile('Berû (Oak)')).getByText('Free')).toBeInTheDocument();
      expect(within(tile('Berû (Oak)')).getByRole('button', { name: 'Plant: Berû (Oak)' })).toBeEnabled();
      expect(within(tile('Tû (Mulberry)')).getByText('Yours')).toBeInTheDocument();
      expect(within(tile('Tû (Mulberry)')).getByRole('button', { name: 'Plant: Tû (Mulberry)' })).toBeEnabled();
      expect(within(tile('Kaj (Pine)')).getByText(/500 Zêr/)).toBeInTheDocument();
      expect(within(tile('Kaj (Pine)')).getByRole('button', { name: 'Buy: Kaj (Pine)' })).toBeEnabled();
      // Too dear: its price, the gap, and no buy.
      expect(within(tile('Dara Şevê (Night tree)')).getByText('500 more')).toBeInTheDocument();
      expect(within(tile('Dara Şevê (Night tree)')).getByRole('button', { name: 'Buy: Dara Şevê (Night tree)' })).toBeDisabled();
      expect(screen.getByRole('link', { name: 'My tree' })).toHaveAttribute('href', '/app/tree');
    });

    it('buys a kind once it has said what it costs, which plants nothing', async () => {
      const calls = signedInShop({
        'GET /me/tree': ok(mine(growing())),
        'POST /me/tree/kinds/kaj/buy': ok(mine(growing(), { owned: ['kaj'], zer: 700 })),
      });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('button', { name: 'Buy: Kaj (Pine)' }));
      const ask = await screen.findByRole('dialog', { name: 'Buy Kaj?' });
      expect(within(ask).getByText('500 Zêr')).toBeInTheDocument();
      expect(within(ask).getByText('You have 1,200 Zêr.')).toBeInTheDocument();
      expect(within(ask).getByText('It costs 500 Zêr, once. After that you can plant it whenever you like.')).toBeInTheDocument();
      expect(calls.some((c) => c.path === '/me/tree/kinds/kaj/buy')).toBe(false);
      await userEvent.click(within(ask).getByRole('button', { name: 'Buy' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/me/tree/kinds/kaj/buy')).toBe(true));
      expect(calls.some((c) => c.path === '/me/tree/plant')).toBe(false);
      // It is theirs to plant now; the pomegranate still stands, and the balance follows.
      expect(await within(tile('Kaj (Pine)')).findByRole('button', { name: 'Plant: Kaj (Pine)' })).toBeInTheDocument();
      expect(within(tile('Kaj (Pine)')).getByText('Yours')).toBeInTheDocument();
      expect(within(tile('Hinar (Pomegranate)')).getByText('Growing now')).toBeInTheDocument();
      expect(balance()).toBe('700 Zêr');
    });

    it('asks before planting another kind, saying the tree that stands will be gone, and keeps it when told to', async () => {
      const calls = signedInShop({
        'GET /me/tree': ok(mine(growing())),
        'POST /me/tree/plant': ok(mine(growing({ species: 'beru', waterings: 0, plantedOn: TODAY }))),
      });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('button', { name: 'Plant: Berû (Oak)' }));
      const ask = await screen.findByRole('dialog', { name: 'Plant Berû?' });
      expect(within(ask).getByText('Your Hinar will be gone, with everything it has grown. The water you hold stays with you.')).toBeInTheDocument();
      // Planting spends nothing: no price, and nothing said about purchases.
      expect(within(ask).queryByText(/Zêr/)).toBeNull();
      await userEvent.click(within(ask).getByRole('button', { name: 'Keep my tree' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(calls.some((c) => c.path === '/me/tree/plant')).toBe(false);

      await userEvent.click(screen.getByRole('button', { name: 'Plant: Berû (Oak)' }));
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Plant it' }));
      await waitFor(() => expect(calls.find((c) => c.path === '/me/tree/plant')?.body).toEqual({ species: 'beru' }));
      expect(await within(tile('Berû (Oak)')).findByText('Growing now')).toBeInTheDocument();
      expect(within(tile('Hinar (Pomegranate)')).getByRole('button', { name: 'Plant: Hinar (Pomegranate)' })).toBeInTheDocument();
    });

    it('plants a first tree with no word of one being lost, when none stands yet', async () => {
      signedInShop({ 'GET /me/tree': ok(mine(null)) });
      renderApp(<Shop />, ['/app/shop']);
      await userEvent.click(await screen.findByRole('button', { name: 'Plant: Bî (Willow)' }));
      const ask = await screen.findByRole('dialog', { name: 'Plant Bî?' });
      expect(within(ask).getByText('It starts as a seed under the ground.')).toBeInTheDocument();
      expect(within(ask).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  it('shows neither on a server that has no letters or trees, and the catalogue as ever', async () => {
    signedInShop({});
    renderApp(<Shop />, ['/app/shop']);
    expect(await screen.findByText('Sunset')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your pen pal bird' })).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Your tree' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says calmly when the bird could not be read, with the way to try again', async () => {
    const calls = signedInShop({ 'GET /letters': [{ status: 500, json: { code: 'INTERNAL', message: 'down' } }, ok(letters())] });
    renderApp(<Shop />, ['/app/shop']);
    expect(await screen.findByRole('heading', { name: 'Your pen pal bird' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radiogroup', { name: 'Choose a new bird' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/letters')).toHaveLength(2);
  });
});
