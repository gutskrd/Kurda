// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate, goBack: vi.fn() }) }));
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

  it('closes itself before Account standing opens, so the link is not hidden under it', async () => {
    navigate.mockReset();
    testAuth.client = fakeClient({
      'GET /friends?limit=50': friends,
      'POST /shop/gift': fail({ code: 'MUTED', details: { scope: 'chat', until: null } }),
    });
    const onClose = vi.fn();
    renderWithProviders(<GiftSheet item={item} onClose={onClose} onSent={() => undefined} />);
    fireEvent.click(await screen.findByText('Şîlan'));
    fireEvent.click(await screen.findByRole('link', { name: 'See your account standing' }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('says this route’s own refusals in the reader’s words, naming the friend', async () => {
    const answers = [
      fail({ code: 'ALREADY_OWNED', status: 409, message: 'they already own this item' }),
      fail({ code: 'GIFT_NOT_ALLOWED', message: 'a gift to a new friend can be sent once you have been friends for a day' }),
      fail({ code: 'GIFT_DAILY_LIMIT', status: 429, kind: 'rate_limited', message: 'that is all the gifts for today' }),
    ];
    testAuth.client = fakeClient({ 'GET /friends?limit=50': friends, 'POST /shop/gift': () => answers.shift()! });
    renderWithProviders(<GiftSheet item={item} onClose={() => undefined} onSent={() => undefined} />);
    fireEvent.click(await screen.findByText('Şîlan'));
    expect(await screen.findByText('Şîlan already has it.')).toBeTruthy();
    fireEvent.click(screen.getByText('Şîlan'));
    expect(await screen.findByText('A gift to Şîlan isn’t possible yet.')).toBeTruthy();
    fireEvent.click(screen.getByText('Şîlan'));
    expect(await screen.findByText('That’s today’s limit for Şîlan.')).toBeTruthy();
  });

  it('tries again with the same key after a dropped connection, and a new one after a refusal', async () => {
    const answers = [
      { ok: false as const, error: { kind: 'network' as const, message: 'offline' } },
      fail({ code: 'PRICE_CHANGED', status: 409 }),
      ok({ balance: 4100 }),
    ];
    const client = fakeClient({ 'GET /friends?limit=50': friends, 'POST /shop/gift': () => answers.shift()! });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(<GiftSheet item={item} onClose={() => undefined} onSent={onSent} />);
    fireEvent.click(await screen.findByText('Şîlan'));
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/shop/gift')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
    fireEvent.click(screen.getByText('Şîlan'));
    await waitFor(() => expect(client.calls.filter((c) => c.path === '/shop/gift')).toHaveLength(2));
    await screen.findByText(/price/i);
    fireEvent.click(screen.getByText('Şîlan'));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const keys = client.calls.filter((c) => c.path === '/shop/gift').map((c) => (c.body as { idempotencyKey: string }).idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
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
