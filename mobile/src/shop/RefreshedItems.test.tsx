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
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { RefreshedNotice } from './RefreshedItems';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const owned = (sku: string, name: string) => ({ sku, name, category: 'cosmetic', quantity: 1, premiumOnly: false, assetUrl: null });

const INVENTORY = 'GET /me/inventory';
const SEEN = 'POST /me/inventory/refreshed/seen';

describe('the one-time notice', () => {
  it('tells an owner once that the items are still theirs, and offers no way to hand them back', async () => {
    const client = fakeClient({
      [INVENTORY]: ok({ items: [owned('bg-background-01', 'Şev')], refreshedItems: ['bg-background-01'] }),
      [SEEN]: ok({ seen: true }),
    });
    testAuth.client = client;
    renderWithProviders(<RefreshedNotice />);
    expect(await screen.findByText('We refreshed some backgrounds and icons — yours have new art. They’re still yours.')).toBeTruthy();

    // one button, and all it does is close the notice
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Got it']);
    expect(screen.queryByRole('button', { name: /return|shop/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toContain(SEEN);
    expect(client.calls.some((c) => c.path.endsWith('/return'))).toBe(false);
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
