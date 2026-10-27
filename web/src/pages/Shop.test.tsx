import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { Shop } from './Shop';
import { renderApp, jsonResponse } from '../test/utils';
import type { ShopItem } from '../lib/types';

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
  { items = CATALOGUE, balances = { zer: 1000 } }: { items?: ShopItem[]; balances?: { zer: number; gems?: number } } = {},
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

  it('files everything on sale under its kind — the Kurdish tag too — with a count on each tab', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    const tabs = screen.getAllByRole('tab');
    // All, then only the kinds on sale, in the shared order; no empty "Frames" or "More"
    expect(tabs.map((tab) => tab.textContent)).toEqual(['All4', 'Backgrounds2', 'Icons1', 'Tags1']);
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');

    // under All, a titled section per kind, each with its own count
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Backgrounds2', 'Icons1', 'Tags1']);

    // the tag the Tags card sends people here to buy is on sale, priced, and drawn as a tag
    const tag = screen.getByText('Kurdish Tag').closest('figure')!;
    expect(within(tag).getByText(/500 Zêr/)).toBeInTheDocument();
    expect(within(tag).getByRole('button', { name: 'Buy' })).toBeEnabled();
    expect(tag.querySelector('.item-glyph svg')).not.toBeNull();
    // and every item says what it is under its Kurdish name
    expect(within(screen.getByText('Îstîkan').closest('figure')!).getByText('Tea glass')).toBeInTheDocument();
  });

  /** Pictures can be uploaded for every kind of item now, not only backgrounds and icons. */
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

  it('narrows to one kind of thing', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));

    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/Icons/);
    // just that kind's grid: no section headings, and nothing of another kind
    expect(screen.queryByRole('heading', { name: /Backgrounds/ })).not.toBeInTheDocument();
    expect(tileNames()).toEqual(['Îstîkan']);
  });

  it('moves between the kinds with the arrow keys, as tabs do', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    // one stop in the Tab order: the chosen tab
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('tabindex', '-1');

    screen.getByRole('tab', { name: /All/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Tags/ })).toHaveAttribute('aria-selected', 'true');
    expect(tileNames()).toEqual(['Kurdish Tag']);
    // past the end wraps round to the start
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
    // the tabs count what the search lets through
    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveTextContent('0');

    await userEvent.clear(search);
    await userEvent.type(search, 'tea glass');
    expect(tileNames()).toEqual(['Îstîkan']);
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
    // a reload of a narrowed Shop: the address is all there is
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

    // and what is chosen goes back into it
    await userEvent.click(screen.getByRole('tab', { name: /Tags/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/app/shop?kind=tag&q=tea&sort=price-desc&afford=1');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    // a plain Shop has a plain address
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

    expect(screen.getByText('Sunset')).toBeInTheDocument(); // 500, held 1000
    expect(screen.queryByText('Pricey')).not.toBeInTheDocument(); // 5000
  });

  it('holds a gem-priced item against the gems, not the Zêr', async () => {
    // plenty of Zêr, few gems: "Within my Zêr" used to let a 40-gem item through on 1,000 Zêr
    const night: ShopItem = { sku: 'bg-gem', name: 'Night sky', description: null, category: 'background', currency: 'gems', price: 40, isUnique: true, premiumOnly: false, assetUrl: null };
    vi.stubGlobal('fetch', makeFetch([], [], { items: [...CATALOGUE, night], balances: { zer: 1000, gems: 10 } }));
    renderApp(<Shop />, ['/app/shop']);

    const tile = (await screen.findByText('Night sky')).closest('figure')!;
    expect(within(tile).getByText(/40 Gems/)).toBeInTheDocument();
    expect(within(tile).getByRole('button', { name: 'Buy' })).toBeDisabled();
    expect(within(tile).getByText(/30 more/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Within my balance'));
    expect(screen.queryByText('Night sky')).not.toBeInTheDocument();
    expect(screen.getByText('Sunset')).toBeInTheDocument();
  });

  it('keeps something you already own, however dear it was', async () => {
    // 'Pricey' costs 5000 against a balance of 1000, but it is already owned —
    // telling someone they cannot afford what they own would be nonsense
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
    // what the filter calls it, rather than "0 Zêr"
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
    // nothing is narrowed yet, so there is nothing to clear
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Backgrounds/ }));
    await userEvent.type(screen.getByLabelText('Search the shop'), 'sun');
    expect(count).toHaveTextContent('1 item');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(count).toHaveTextContent('4 items');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search the shop')).toHaveValue('');
  });

  /**
   * The picker read `friend.id`, which `GET /friends` never sends (it is
   * `userId`), so every gift from the web posted no recipient and was refused.
   */
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
    expect(await screen.findByText('Kurdish Tag is yours. You’ll find it under Tags & badges in Edit profile.')).toBeInTheDocument();
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
    // a free item is had, not bought, and says so with no coin beside it
    expect(within(plain).getByRole('button', { name: 'Get it free' })).toBeInTheDocument();
    expect(within(plain).getByText('Free')).toBeInTheDocument();
    expect(within(plain).queryByRole('button', { name: 'Gift Plain to a friend' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gift Sunset to a friend' })).toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing empty shelves — and offers the way back', async () => {
    vi.stubGlobal('fetch', makeFetch([]));
    renderApp(<Shop />, ['/app/shop']);
    await screen.findByText('Sunset');

    await userEvent.type(screen.getByLabelText('Search the shop'), 'zzzz');

    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 items');
    // one way out, in the empty state itself
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    expect(clear).toHaveLength(1);
    await userEvent.click(clear[0]!);
    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matches that/)).not.toBeInTheDocument();
  });
});
