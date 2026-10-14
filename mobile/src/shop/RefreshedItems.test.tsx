// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { RefreshedItems, RefreshedNotice } from './RefreshedItems';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const owned = (sku: string, name: string, refund: { amount: number; currency: 'zer' | 'gems' } | null) => ({
  sku,
  name,
  category: 'cosmetic',
  quantity: 1,
  premiumOnly: false,
  assetUrl: null,
  refund,
});

const INVENTORY = 'GET /me/inventory';
const SEEN = 'POST /me/inventory/refreshed/seen';

describe('the one-time notice', () => {
  it('tells an owner once, and takes them to the Shop', async () => {
    const client = fakeClient({
      [INVENTORY]: ok({ items: [owned('bg-background-01', 'Şev', { amount: 500, currency: 'zer' })], refreshedItems: ['bg-background-01'] }),
      [SEEN]: ok({ seen: true }),
    });
    testAuth.client = client;
    renderWithProviders(<RefreshedNotice />);
    expect(
      await screen.findByText(
        'We refreshed some backgrounds and icons — yours have new art. If you’d rather have your Zêr back, you can return them in the Shop.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the Shop' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Shop');
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toContain(SEEN);
    expect(screen.queryByText('New art for your items')).toBeNull();
  });

  it('says nothing to someone who has already been told', async () => {
    const client = fakeClient({ [INVENTORY]: ok({ items: [], refreshedItems: [] }) });
    testAuth.client = client;
    renderWithProviders(<RefreshedNotice />);
    await waitFor(() => expect(client.calls).toHaveLength(1));
    expect(screen.queryByText('New art for your items')).toBeNull();
  });
});

describe('returning a refreshed item in the Shop', () => {
  it('lists what can be returned, asks first, and gives the Zêr back', async () => {
    const client = fakeClient({
      [INVENTORY]: ok({
        items: [owned('bg-background-01', 'Şeva Zozanan', { amount: 500, currency: 'zer' }), owned('icon-made-01', 'Hinar', null)],
        refreshedItems: [],
      }),
      'POST /shop/items/bg-background-01/return': ok({
        returned: true,
        duplicate: false,
        sku: 'bg-background-01',
        refund: { amount: 500, currency: 'zer' },
        balance: 1700,
      }),
    });
    testAuth.client = client;
    const onReturned = vi.fn();
    renderWithProviders(<RefreshedItems onReturned={onReturned} />);

    expect(await screen.findByText('Refreshed items')).toBeTruthy();
    expect(screen.getByText('Refund: 500 Zêr')).toBeTruthy();
    // an item that was never replaced has nothing to return
    expect(screen.queryByText('Hinar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return Şeva Zozanan for 500 Zêr' }));
    expect(screen.getByText('Return Şeva Zozanan?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Return it' }));
    expect(await screen.findByText('Returned. 500 Zêr are back in your balance.')).toBeTruthy();
    expect(onReturned).toHaveBeenCalledWith('zer', 1700);
    expect(screen.queryByRole('button', { name: 'Return Şeva Zozanan for 500 Zêr' })).toBeNull();
  });

  it('keeps the item when it was a present, and says so', async () => {
    const client = fakeClient({
      [INVENTORY]: ok({ items: [owned('bg-background-02', 'Kilîma Sor', { amount: 400, currency: 'zer' })], refreshedItems: [] }),
      'POST /shop/items/bg-background-02/return': fail({ code: 'NOTHING_TO_REFUND', status: 409 }),
    });
    testAuth.client = client;
    renderWithProviders(<RefreshedItems />);
    fireEvent.click(await screen.findByRole('button', { name: 'Return Kilîma Sor for 400 Zêr' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return it' }));
    expect(await screen.findByText('You were given this one, so there’s nothing to give back. It stays yours.')).toBeTruthy();
  });

  it('is not there when nothing can be returned', async () => {
    const client = fakeClient({ [INVENTORY]: ok({ items: [owned('icon-made-01', 'Hinar', null)], refreshedItems: [] }) });
    testAuth.client = client;
    renderWithProviders(<RefreshedItems />);
    await waitFor(() => expect(client.calls).toHaveLength(1));
    expect(screen.queryByText('Refreshed items')).toBeNull();
  });
});
