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

  it('shows empty states when the catalog is not seeded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<CosmeticCustomizer me={me} onChanged={() => {}} />, ['/app/profile']);
    expect(await screen.findByText('No backgrounds available yet.')).toBeInTheDocument();
    expect(screen.getByText('No icons available yet.')).toBeInTheDocument();
  });
});
