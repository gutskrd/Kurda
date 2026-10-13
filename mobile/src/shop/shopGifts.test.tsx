// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }) }));
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GiftSheet } from './GiftSheet';
import { GiftSentNote } from '../gifts/GiftSentNote';
import { refreshGiftBadge, useUnseenGifts } from './useUnseenGifts';

patchReactNativeWeb();
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const item = { sku: 'bg_mountain', name: 'Mountain dawn', price: 500, currency: 'Zêr' };
const friends = ok({ friends: [{ userId: 'u2', username: 'shilan', displayName: 'Şîlan' }] });

describe('GiftSheet (the Shop)', () => {
  it('gives the item and names the friend as the list showed them', async () => {
    testAuth.client = fakeClient({ 'GET /friends?limit=50': friends, 'POST /shop/gift': ok({ balance: 4100 }) });
    const onSent = vi.fn();
    renderWithProviders(<GiftSheet item={item} onClose={() => undefined} onSent={onSent} />);
    fireEvent.click(await screen.findByText('Şîlan'));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(4100, { userId: 'u2', username: 'shilan', name: 'Şîlan' }));
  });

  it('says what a limit on the account stops, instead of the server’s English', async () => {
    testAuth.client = fakeClient({
      'GET /friends?limit=50': friends,
      'POST /shop/gift': fail({ code: 'MUTED', message: "you can't send messages right now", details: { scope: 'chat', until: null } }),
    });
    const onSent = vi.fn();
    renderWithProviders(<GiftSheet item={item} onClose={() => undefined} onSent={onSent} />);
    fireEvent.click(await screen.findByText('Şîlan'));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });
});

describe('GiftSentNote', () => {
  it('says where the gift went, with the way there', () => {
    const onOpenChat = vi.fn();
    renderWithProviders(<GiftSentNote itemName="Mountain dawn" to="Şîlan" onOpenChat={onOpenChat} onDismiss={() => undefined} />);
    expect(screen.getByText('Gift sent to Şîlan')).toBeTruthy();
    expect(screen.getByText('Mountain dawn · It’s waiting in your chat with Şîlan.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the chat' }));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });
});

describe('useUnseenGifts', () => {
  it('reads the count from /me/social, again when a gift arrives, and never on a timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let unseen = 1;
    const client = fakeClient({ 'GET /me/social': () => ok({ unread: { gifts: unseen } }) });
    testAuth.client = client;
    const { result } = renderHook(() => useUnseenGifts());
    await waitFor(() => expect(result.current).toBe(1));

    // a minute passes: nothing is asked (the old poll asked every 60 s)
    const asked = client.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(client.calls.length).toBe(asked);
    expect(client.calls.some((c) => c.path === '/me/gifts/unseen')).toBe(false);

    // a gift arrives (GiftArrivals calls this): counted again
    unseen = 2;
    act(() => refreshGiftBadge());
    await waitFor(() => expect(result.current).toBe(2));
  });
});
