// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
const navigate = vi.fn();
// a screen's focus, as a stack tells it: 'focus' and 'blur' listeners, and whether it is in front now
const focus = vi.hoisted(() => ({ listeners: new Map<string, Set<() => void>>(), focused: true }));
const nav = { navigate, goBack: vi.fn(), isFocused: () => focus.focused, addListener: (type: string, cb: () => void) => {
  const set = focus.listeners.get(type) ?? new Set();
  set.add(cb);
  focus.listeners.set(type, set);
  return () => set.delete(cb);
} };
vi.mock('@react-navigation/native', () => ({ useNavigation: () => nav }));
// the gift banner listens on the user's channel; here the test is the channel
const userEvents: { handler: ((e: unknown) => void) | null } = { handler: null };
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (h: (e: unknown) => void) => {
    userEvents.handler = h;
  },
}));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Animated, Vibration } from 'react-native';
import type { GiftCard, GiftCatalogItem, GiftChatRef, GiftUserEvent } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GiftBubble } from './GiftBubble';
import { GiftPickerSheet } from './GiftPickerSheet';
import { GiftUnwrap } from './GiftUnwrap';
import { GiftArrivals } from './GiftArrivals';
import { useOpenChat } from './events';

patchReactNativeWeb();

beforeEach(() => {
  navigate.mockReset();
  focus.listeners.clear();
  focus.focused = true;
});
afterEach(cleanup);

const card = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'bg_newroz',
  name: 'Newroz fire',
  category: 'background',
  assetUrl: null,
  tier: 'common',
  recipients: [{ name: 'Rojda', avatarUrl: null, isMe: false, opened: false }],
  myGiftId: null,
  myOpened: false,
  equippable: 'background',
  ...over,
});

const item = (over: Partial<GiftCatalogItem> = {}): GiftCatalogItem => ({
  sku: 'bg_mountain',
  name: 'Mountain dawn',
  category: 'background',
  assetUrl: null,
  currency: 'zer',
  price: 300,
  tier: 'common',
  alreadyOwnedBy: [],
  ...over,
});

describe('GiftBubble', () => {
  it('is a wrapped present to its recipient, and opens on a tap', () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <GiftBubble card={card({ myGiftId: 'g1', recipients: [{ name: null, avatarUrl: null, isMe: true, opened: false }] })} mine={false} senderName="Azad" onOpen={onOpen} />,
    );
    expect(screen.getByText('A gift for you')).toBeTruthy();
    expect(screen.getByText('Tap to open')).toBeTruthy();
    // what is inside stays a surprise until it is opened
    expect(screen.queryByText('Newroz fire')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A gift from Azad. Tap to open.' }));
    expect(onOpen).toHaveBeenCalledWith('g1');
  });

  it('shows its recipient what it was, and from whom, once opened', () => {
    renderWithProviders(
      <GiftBubble card={card({ myGiftId: 'g1', myOpened: true, recipients: [{ name: null, avatarUrl: null, isMe: true, opened: true }] })} mine={false} senderName="Azad" onOpen={() => undefined} />,
    );
    expect(screen.getByText('Newroz fire')).toBeTruthy();
    expect(screen.getByText('From Azad')).toBeTruthy();
    expect(screen.queryByText('Tap to open')).toBeNull();
  });

  it('tells the sender whether it has been opened, and never the price', () => {
    const { rerender } = renderWithProviders(<GiftBubble card={card()} mine senderName="me" onOpen={() => undefined} />);
    expect(screen.getByText('Newroz fire')).toBeTruthy();
    expect(screen.getByText('For Rojda')).toBeTruthy();
    expect(screen.getByText('Not opened yet')).toBeTruthy();
    rerender(<GiftBubble card={card({ recipients: [{ name: 'Rojda', avatarUrl: null, isMe: false, opened: true }] })} mine senderName="me" onOpen={() => undefined} />);
    expect(screen.getByText('Opened')).toBeTruthy();
    expect(screen.queryByText(/300/)).toBeNull();
  });

  it('counts the opened ones in a group, and names only who may be named', () => {
    const recipients = [
      { name: 'Rojda', avatarUrl: null, isMe: false, opened: true },
      { name: null, avatarUrl: null, isMe: false, opened: false },
      { name: 'Azad', avatarUrl: null, isMe: false, opened: false },
    ];
    renderWithProviders(<GiftBubble card={card({ recipients })} mine senderName="me" onOpen={() => undefined} />);
    expect(screen.getByText('1 of 3 opened')).toBeTruthy();
    expect(screen.getByText('For Rojda, a group member and 1 more')).toBeTruthy();
  });
});

describe('GiftPickerSheet', () => {
  it('gives a friend in a DM something, showing price, balance and what they own', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': ok({
        items: [item(), item({ sku: 'icon_star', name: 'Star', alreadyOwnedBy: ['u2'] }), item({ sku: 'bg_gold', name: 'Gold', price: 5000 })],
        balance: { zer: 1000, gems: 2 },
      }),
      'POST /gifts': ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer: 700, gems: 2 }, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />,
    );
    expect(screen.getByText('A gift for Rojda')).toBeTruthy();
    expect(await screen.findByText('1000')).toBeTruthy();
    expect(screen.getByText('Already has it')).toBeTruthy();
    expect(screen.getByText('Not enough to give this')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Star/ }).getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const body = client.calls.find((c) => c.path === '/gifts')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: 'bg_mountain', toUserIds: ['u2'], chat: { kind: 'dm', userId: 'u2' }, expectedPrice: 300 });
    expect(String(body.idempotencyKey)).toMatch(/^gift-/);
  });

  it('chooses friends in a group first, all at once if you like', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2,u3': ok({ items: [item()], balance: { zer: 1000, gems: 0 } }),
      'POST /gifts': ok({ batchId: 'b9', sent: [], skipped: [{ userId: 'u3', reason: 'daily_limit' }, { userId: 'u2', reason: 'not_allowed' }], balance: { zer: 1000, gems: 0 }, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet
        visible
        chat={{ kind: 'group', groupId: 'g1' }}
        friends={[{ userId: 'u2', name: 'Rojda' }, { userId: 'u3', name: 'Azad' }]}
        onClose={() => undefined}
        onSent={onSent}
      />,
    );
    expect(screen.getByText('Who is it for?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'All my friends here' }));
    expect(screen.getByRole('checkbox', { name: 'Rojda' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send · 600 Zêr' }));
    // nobody could be given it: the sheet says why, by name, and nothing flies
    expect(await screen.findByText(/That’s today’s limit for Azad\.\s+A gift to Rojda isn’t possible yet\./)).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says so when friends cannot be given anything here', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<GiftPickerSheet visible chat={{ kind: 'group', groupId: 'g1' }} friends={[]} onClose={() => undefined} onSent={() => undefined} />);
    expect(screen.getByText('None of your friends are in this group yet.')).toBeTruthy();
  });

  it('says what a chat mute stops, with the way to Account standing', async () => {
    testAuth.client = fakeClient({
      'GET /gifts/catalog?to=u2': ok({ items: [item()], balance: { zer: 1000, gems: 0 } }),
      'POST /gifts': fail({ code: 'MUTED', details: { scope: 'chat', until: null } }),
    });
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />,
    );
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your account standing' })).toBeTruthy();
  });
});

describe('GiftUnwrap', () => {
  /*
   * react-native-web has no native driver: a native-driven animation ends the
   * moment it starts. Hold the unwrap's timings open instead, so the test can
   * see the moment playing, skip it, or let it finish.
   */
  const finish: Array<(r: { finished: boolean }) => void> = [];
  beforeEach(() => {
    finish.length = 0;
    vi.spyOn(Animated, 'timing').mockImplementation(
      () =>
        ({
          start: (cb?: (r: { finished: boolean }) => void) => cb && finish.push(cb),
          stop: () => undefined,
          reset: () => undefined,
        }) as unknown as Animated.CompositeAnimation,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens the gift on the server, can be skipped, and then offers Wear it and Say thanks', async () => {
    const opened = card({ myGiftId: 'g1', myOpened: true, recipients: [{ name: null, avatarUrl: null, isMe: true, opened: true }] });
    const client = fakeClient({
      'POST /gifts/g1/open': ok({ card: opened, equippable: 'background' }),
      'PUT /me/cosmetics/background': ok({ backgroundSku: 'bg_newroz' }),
    });
    testAuth.client = client;
    const onOpened = vi.fn();
    const onThanks = vi.fn(async () => true);
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={onOpened} onThanks={onThanks} />,
    );
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(opened));
    // skip the moment
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('From Azad')).toBeTruthy();
    expect(screen.getByText('Newroz fire')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Wear it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'You’re wearing it' })).toBeTruthy());
    expect(client.calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/me/cosmetics/background', body: { sku: 'bg_newroz' } });

    fireEvent.click(screen.getByRole('button', { name: 'Say thanks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thanks sent' })).toBeTruthy());
    expect(onThanks).toHaveBeenCalledTimes(1);
  });

  it('gives a light tick as the lid comes off, and none when skipped first', async () => {
    vi.useFakeTimers();
    const vibrate = vi.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    const first = renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => true} />,
    );
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(vibrate).toHaveBeenCalledWith(15);
    first.unmount();

    vibrate.mockClear();
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(vibrate).not.toHaveBeenCalled();
    vi.useRealTimers();
    vibrate.mockRestore();
  });

  it('reveals the item by itself when the moment has played out', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => true} />,
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    act(() => finish[0]?.({ finished: true }));
    expect(await screen.findByText('From Azad')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('shows no Wear it for something that is not worn, and says when opening failed', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': fail({ code: 'GIFT_NOT_FOUND', status: 404, message: 'no such gift' }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1', equippable: null }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('no such gift')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wear it' })).toBeNull();
  });

  it('leaves out "From" when the sender is not known here, rather than "From " and nothing', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: '' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Newroz fire')).toBeTruthy();
    expect(screen.queryByText(/^From/)).toBeNull();
  });
});

describe('GiftArrivals', () => {
  const received = (chat: GiftChatRef): GiftUserEvent => ({
    type: 'gift_received',
    giftId: 'g7',
    batchId: 'b7',
    from: { name: 'Rojda', avatarUrl: null },
    card: card({ myGiftId: 'g7' }),
    chat,
  });

  it('shows a banner for a gift that arrives elsewhere, and opens it in its chat', () => {
    testAuth.client = fakeClient({ 'GET /me/social': ok({ unread: { gifts: 1 } }) });
    renderWithProviders(<GiftArrivals />);
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(screen.getByText('Rojda sent you a gift')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open: Rojda sent you a gift' }));
    expect(navigate).toHaveBeenCalledWith('Chat', { userId: 'u2', username: 'Rojda', openGift: 'g7' });
    expect(screen.queryByText('Rojda sent you a gift')).toBeNull();
  });

  it('stays quiet when the gift lands in the chat already on screen', () => {
    testAuth.client = fakeClient();
    function OpenChat() {
      useOpenChat({ kind: 'group', groupId: 'g1' });
      return null;
    }
    renderWithProviders(
      <>
        <OpenChat />
        <GiftArrivals />
      </>,
    );
    act(() => userEvents.handler?.(received({ kind: 'group', groupId: 'g1' })));
    expect(screen.queryByText('Rojda sent you a gift')).toBeNull();
  });

  it('shows the banner for a chat that is open but behind another screen', () => {
    testAuth.client = fakeClient({ 'GET /me/social': ok({ unread: { gifts: 1 } }) });
    function OpenChat() {
      useOpenChat({ kind: 'dm', userId: 'u2' });
      return null;
    }
    renderWithProviders(
      <>
        <OpenChat />
        <GiftArrivals />
      </>,
    );
    // their profile is pushed over the chat: the chat is still mounted, but not in front
    act(() => focus.listeners.get('blur')?.forEach((cb) => cb()));
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(screen.getByText('Rojda sent you a gift')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    // back in the chat: the gift appearing in the thread is the announcement
    act(() => focus.listeners.get('focus')?.forEach((cb) => cb()));
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(screen.queryByText('Rojda sent you a gift')).toBeNull();
  });

  it('tells VoiceOver in words, where a live region says nothing', () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    testAuth.client = fakeClient({ 'GET /me/social': ok({ unread: { gifts: 1 } }) });
    renderWithProviders(<GiftArrivals />);
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(announce).toHaveBeenCalledWith('Rojda sent you a gift');
    announce.mockRestore();
  });
});
