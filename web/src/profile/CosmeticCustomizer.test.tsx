import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CosmeticCustomizer } from './CosmeticCustomizer';
import { renderApp, jsonResponse } from '../test/utils';
import type { MeProfile } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const me: MeProfile = {
  id: '1',
  email: 'a@b.com',
  username: 'ada',
  displayName: 'Ada',
  emailVerified: true,
  bio: null,
  xp: 0,
  streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null },
  profileVisibility: 'everyone',
  profilePhotoUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  premium: false,
  equippedBackgroundSku: null,
  equippedIconSku: null,
};

/** Ordered route matcher: specific paths before the generic /me. */
function makeFetch(calls: Array<{ url: string; body: unknown }>) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    if (url.includes('/me/cosmetics/background')) {
      calls.push({ url, body });
      return jsonResponse(200, { backgroundSku: body?.sku ?? null });
    }
    if (url.includes('/me/cosmetics/icon/visibility')) {
      calls.push({ url, body });
      return jsonResponse(200, { premiumIconEnabled: body?.enabled });
    }
    if (url.includes('/shop/purchase')) {
      calls.push({ url, body });
      return jsonResponse(200, { purchased: true, duplicate: false, sku: 'ic-buy', balance: 200 });
    }
    if (url.includes('/me/inventory')) {
      return jsonResponse(200, {
        items: [{ sku: 'bg-own', name: 'Owned BG', category: 'background', quantity: 1, premiumOnly: false, assetUrl: 'https://cdn/own.png' }],
      });
    }
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 1000 } });
    if (url.includes('/shop')) {
      return jsonResponse(200, {
        items: [
          { sku: 'ic-buy', name: 'Star', description: null, category: 'icon', currency: 'zer', price: 800, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/icons/s.png' },
        ],
      });
    }
    return jsonResponse(200, {});
  };
}

/**
 * A fuller inventory: two backgrounds owned (one worn), two on sale, a free
 * one; two icons on sale (one Kurdish, with a description); a season frame;
 * and, when asked, the Kurdish tag.
 */
function inventoryFetch(
  calls: Array<{ url: string; method: string; body: unknown }>,
  { tag = false, frameWorn = null as string | null } = {},
) {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, method: init?.method ?? 'GET', body });
    if (url.includes('/me/cosmetics/')) return jsonResponse(200, {});
    if (url.includes('/me/inventory')) {
      return jsonResponse(200, {
        items: [
          { sku: 'bg-gola', name: 'Gola Şîn', category: 'background', quantity: 1, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/gola.webp' },
          { sku: 'bg-hevalo', name: 'Hevalo', category: 'background', quantity: 1, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/hevalo.webp' },
          { sku: 'frame_rank_gir', name: 'Gir frame', category: 'frame', quantity: 1, premiumOnly: false, assetUrl: null },
          ...(tag ? [{ sku: 'tag_kurdish', name: 'Kurdish Tag', category: 'tag', quantity: 1, premiumOnly: false, assetUrl: null }] : []),
        ],
      });
    }
    if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 1000, gems: 5 } });
    if (url.includes('/users/1')) return jsonResponse(200, { userId: '1', username: 'ada', frameSku: frameWorn });
    if (url.includes('/shop')) {
      return jsonResponse(200, {
        items: [
          { sku: 'bg-kilim', name: 'Kilîma Sor', description: 'Red kilim', category: 'background', currency: 'zer', price: 600, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/kilim.webp' },
          { sku: 'bg-free', name: 'Berbang', description: 'Daybreak', category: 'background', currency: 'zer', price: 0, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/berbang.webp' },
          { sku: 'bg-mij', name: 'Mij', description: 'Mist', category: 'background', currency: 'zer', price: 400, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/mij.webp' },
          { sku: 'icon-caydan', name: 'Îstîkan', description: 'Tea glass', category: 'icon', currency: 'zer', price: 900, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/icons/caydan.png' },
          { sku: 'icon-roj', name: 'Roj', description: 'Sun', category: 'icon', currency: 'zer', price: 600, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/icons/roj.png' },
          // the tag is on sale in the Shop; the inventory only lists one that is owned
          ...(tag ? [] : [{ sku: 'tag_kurdish', name: 'Kurdish Tag', description: 'A Kurdish identity tag for your profile.', category: 'tag', currency: 'zer', price: 500, isUnique: true, premiumOnly: false, assetUrl: null }]),
        ],
      });
    }
    return jsonResponse(200, {});
  });
}

const names = (): string[] => [...document.querySelectorAll('.cosmetic-tile .cosmetic-name')].map((el) => el.textContent ?? '');

describe('CosmeticCustomizer', () => {
  it('equips an owned background and buys an icon (server-authoritative)', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(makeFetch(calls)));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);

    // owned background is equippable
    const ownedName = await screen.findByText('Owned BG');
    const ownedTile = ownedName.closest('figure')!;
    await userEvent.click(within(ownedTile).getByRole('button', { name: 'Equip' }));
    expect(await within(ownedTile).findByText('Equipped')).toBeInTheDocument();
    const equip = calls.find((c) => c.url.includes('/me/cosmetics/background'));
    expect(equip?.body).toEqual({ sku: 'bg-own' });

    // buyable icon, on the Icons tab, shows its Zêr price and purchases with the expected price guard
    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));
    const starTile = screen.getByText('Star').closest('figure')!;
    await userEvent.click(within(starTile).getByRole('button', { name: /Buy · 800 Zêr/ }));
    expect(await screen.findByText('Purchased Star.')).toBeInTheDocument();
    const buy = calls.find((c) => c.url.includes('/shop/purchase'));
    expect(buy?.body).toMatchObject({ sku: 'ic-buy', expectedPrice: 800 });
    expect((buy?.body as { idempotencyKey: string }).idempotencyKey.length).toBeGreaterThanOrEqual(8);
  });

  it('offers a free item to everyone, even with no Zêr, rather than marking it Premium', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        if (url.includes('/shop/purchase')) {
          calls.push({ url, body });
          return jsonResponse(200, { purchased: true, duplicate: false, sku: 'bg-free', balance: 0 });
        }
        if (url.includes('/me/inventory')) return jsonResponse(200, { items: [] });
        if (url.includes('/me/wallet')) return jsonResponse(200, { balances: { zer: 0 } });
        if (url.includes('/shop')) {
          return jsonResponse(200, {
            items: [
              { sku: 'bg-free', name: 'Daybreak', description: null, category: 'background', currency: 'zer', price: 0, isUnique: true, premiumOnly: false, assetUrl: '/cosmetics/backgrounds/d.webp' },
              { sku: 'bg-paid', name: 'Red kilim', description: null, category: 'background', currency: 'zer', price: 600, isUnique: true, premiumOnly: true, assetUrl: '/cosmetics/backgrounds/k.webp' },
            ],
          });
        }
        return jsonResponse(200, {});
      }),
    );
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);

    const freeTile = (await screen.findByText('Daybreak')).closest('figure')!;
    expect(within(freeTile).queryByText('Premium')).not.toBeInTheDocument();
    const get = within(freeTile).getByRole('button', { name: 'Get it free' });
    expect(get).toBeEnabled();
    // a priced one still needs the Zêr
    const paidTile = screen.getByText('Red kilim').closest('figure')!;
    expect(within(paidTile).getByRole('button', { name: 'Not enough Zêr' })).toBeDisabled();

    await userEvent.click(get);
    expect(await screen.findByText('Daybreak is yours.')).toBeInTheDocument();
    expect(calls[0]?.body).toMatchObject({ sku: 'bg-free', expectedPrice: 0 });
  });

  it('shows empty states when the catalog is not seeded — each on its own tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);
    expect(await screen.findByText('No backgrounds available yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));
    expect(screen.getByText('No icons available yet.')).toBeInTheDocument();
    // and where a frame comes from, since none can be bought
    await userEvent.click(screen.getByRole('tab', { name: /Frames/ }));
    expect(screen.getByText(/No frames yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See this season' })).toHaveAttribute('href', '/app/season');
  });

  it('toggles premium-icon visibility, on the Icons tab, when an icon is equipped', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(makeFetch(calls)));
    const withIcon: MeProfile = { ...me, premium: true, equippedIconSku: 'ic-buy', premiumIconEnabled: true };
    renderApp(<CosmeticCustomizer me={withIcon} onChanged={() => {}} />, ['/app/profile']);

    await userEvent.click(await screen.findByRole('tab', { name: /Icons/ }));
    const toggle = screen.getByRole('checkbox', { name: /show premium icon/i });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    const call = calls.find((c) => c.url.includes('/me/cosmetics/icon/visibility'));
    expect(call?.body).toEqual({ enabled: false });
    expect(toggle).not.toBeChecked();
  });

  it('hides the visibility toggle when no icon is equipped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);
    await userEvent.click(await screen.findByRole('tab', { name: /Icons/ }));
    await screen.findByText('No icons available yet.');
    expect(screen.queryByRole('checkbox', { name: /show premium icon/i })).not.toBeInTheDocument();
  });

  it('files your cosmetics under tabs with counts, what you own first and badged', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', inventoryFetch(calls));
    renderApp(<CosmeticCustomizer me={{ ...me, equippedBackgroundSku: 'bg-gola' }} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');

    // backgrounds, icons and frames; no Tags tab while no tag is owned
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Backgrounds5', 'Icons2', 'Frames1']);
    expect(screen.getByRole('tab', { name: /Backgrounds/ })).toHaveAttribute('aria-selected', 'true');

    // owned first: the one worn, then the other owned, then what is on sale
    expect(names()).toEqual(['Gola Şîn', 'Hevalo', 'Kilîma Sor', 'Berbang', 'Mij']);
    const worn = screen.getByText('Gola Şîn').closest('figure')!;
    expect(within(worn).getByText('Equipped')).toBeInTheDocument();
    expect(within(worn).getByRole('button', { name: 'Take Gola Şîn off your profile' })).toHaveTextContent('Take off');
    const owned = screen.getByText('Hevalo').closest('figure')!;
    expect(within(owned).getByText('Owned')).toBeInTheDocument();
    expect(within(owned).getByRole('button', { name: 'Equip' })).toBeInTheDocument();
    // on sale: no badge, its price on the button, what it is under its name
    const kilim = screen.getByText('Kilîma Sor').closest('figure')!;
    expect(within(kilim).queryByText('Owned')).not.toBeInTheDocument();
    expect(within(kilim).getByRole('button', { name: 'Buy · 600 Zêr' })).toBeEnabled();
    expect(within(kilim).getByText('Red kilim')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('5 items');
  });

  it('takes the worn background off', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', inventoryFetch(calls));
    renderApp(<CosmeticCustomizer me={{ ...me, equippedBackgroundSku: 'bg-gola' }} onChanged={() => {}} />, ['/app/profile/edit']);
    const worn = (await screen.findByText('Gola Şîn')).closest('figure')!;
    await userEvent.click(within(worn).getByRole('button', { name: /Take Gola Şîn off/ }));
    expect(await screen.findByText('Removed.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('/me/cosmetics/background'))).toMatchObject({ method: 'PUT', body: { sku: null } });
    expect(within(worn).queryByText('Equipped')).not.toBeInTheDocument();
  });

  it('wears and takes off a season frame from the Frames tab', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal('fetch', inventoryFetch(calls));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');

    await userEvent.click(screen.getByRole('tab', { name: /Frames/ }));
    // named for its tier in the reader's language, and drawn round your face
    const frame = screen.getByText('Gir season frame', { selector: '.cosmetic-name' }).closest('figure')!;
    expect(within(frame).getByText('Owned')).toBeInTheDocument();
    expect(frame.querySelector('.art-frame')).not.toBeNull();

    await userEvent.click(within(frame).getByRole('button', { name: 'Equip' }));
    expect(await within(frame).findByText('Equipped')).toBeInTheDocument();
    expect(calls.find((c) => c.url.includes('/me/cosmetics/frame'))).toMatchObject({ method: 'PUT', body: { sku: 'frame_rank_gir' } });

    await userEvent.click(within(frame).getByRole('button', { name: /Take Gir season frame off/ }));
    expect(await within(frame).findByText('Owned')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes('/me/cosmetics/frame')).map((c) => c.body)).toEqual([{ sku: 'frame_rank_gir' }, { sku: null }]);
  });

  it('knows which frame is worn, from your own profile', async () => {
    vi.stubGlobal('fetch', inventoryFetch([], { frameWorn: 'frame_rank_gir' }));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');
    await userEvent.click(screen.getByRole('tab', { name: /Frames/ }));
    const frame = screen.getByText('Gir season frame', { selector: '.cosmetic-name' }).closest('figure')!;
    expect(await within(frame).findByText('Equipped')).toBeInTheDocument();
  });

  it('lists an owned tag on a Tags tab, with the way to where tags are managed', async () => {
    vi.stubGlobal('fetch', inventoryFetch([], { tag: true }));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');

    await userEvent.click(screen.getByRole('tab', { name: /Tags/ }));
    const tag = screen.getByText('Kurdish Tag').closest('figure')!;
    expect(within(tag).getByText('Owned')).toBeInTheDocument();
    // not equipped here: Tags & badges, further down the same page (TagsCard's #tags)
    expect(within(tag).queryByRole('button', { name: 'Equip' })).not.toBeInTheDocument();
    expect(within(tag).getByRole('link', { name: 'Manage tags' })).toHaveAttribute('href', '#tags');
    expect(tag.querySelector('.item-glyph svg')).not.toBeNull();
  });

  it('narrows to owned or not owned, searches without the Kurdish letters, sorts, and clears', async () => {
    vi.stubGlobal('fetch', inventoryFetch([]));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');

    await userEvent.click(screen.getByRole('radio', { name: 'Owned' }));
    expect(names()).toEqual(['Gola Şîn', 'Hevalo']);
    // the counts follow: the Icons tab has nothing owned
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveTextContent('0');
    await userEvent.click(screen.getByRole('radio', { name: 'Not owned' }));
    expect(names()).toEqual(['Kilîma Sor', 'Berbang', 'Mij']);

    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'price-asc');
    expect(names()).toEqual(['Berbang', 'Mij', 'Kilîma Sor']);
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'name');
    expect(names()).toEqual(['Berbang', 'Kilîma Sor', 'Mij']);

    await userEvent.click(screen.getByRole('tab', { name: /Icons/ }));
    await userEvent.type(screen.getByLabelText('Search your cosmetics'), 'istikan');
    expect(names()).toEqual(['Îstîkan']);

    // clearing keeps you on the tab you chose
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('tab', { name: /Icons/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByLabelText('Search your cosmetics')).toHaveValue('');
    expect(names()).toEqual(['Îstîkan', 'Roj']);
  });

  it('says so when nothing matches, with the way back', async () => {
    vi.stubGlobal('fetch', inventoryFetch([]));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile/edit']);
    await screen.findByText('Gola Şîn');
    await userEvent.type(screen.getByLabelText('Search your cosmetics'), 'zzzz');
    expect(screen.getByText(/Nothing matches that/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(names()).toHaveLength(5);
  });
});
