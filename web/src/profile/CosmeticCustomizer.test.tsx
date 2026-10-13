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

    // buyable icon shows its Zêr price and purchases with the expected price guard
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

  it('shows empty states when the catalog is not seeded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);
    expect(await screen.findByText('No backgrounds available yet.')).toBeInTheDocument();
    expect(screen.getByText('No icons available yet.')).toBeInTheDocument();
  });

  it('toggles premium-icon visibility when an icon is equipped', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(makeFetch(calls)));
    const withIcon: MeProfile = { ...me, premium: true, equippedIconSku: 'ic-buy', premiumIconEnabled: true };
    renderApp(<CosmeticCustomizer me={withIcon} onChanged={() => {}} />, ['/app/profile']);

    const toggle = await screen.findByRole('checkbox', { name: /show premium icon/i });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    const call = calls.find((c) => c.url.includes('/me/cosmetics/icon/visibility'));
    expect(call?.body).toEqual({ enabled: false });
    expect(toggle).not.toBeChecked();
  });

  it('hides the visibility toggle when no icon is equipped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);
    await screen.findByText('No icons available yet.');
    expect(screen.queryByRole('checkbox', { name: /show premium icon/i })).not.toBeInTheDocument();
  });
});
