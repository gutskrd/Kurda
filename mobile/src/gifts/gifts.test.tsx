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
// A screen's focus as a stack tells it: 'focus' and 'blur' listeners, and whether it is in front now.
const focus = vi.hoisted(() => ({ listeners: new Map<string, Set<() => void>>(), focused: true }));
const nav = { navigate, goBack: vi.fn(), isFocused: () => focus.focused, addListener: (type: string, cb: () => void) => {
  const set = focus.listeners.get(type) ?? new Set();
  set.add(cb);
  focus.listeners.set(type, set);
  return () => set.delete(cb);
} };
vi.mock('@react-navigation/native', () => ({ useNavigation: () => nav }));
// The gift banner listens on the user's channel; here the test is the channel.
const userEvents: { handler: ((e: unknown) => void) | null } = { handler: null };
vi.mock('../realtime/useUserEvents', () => ({
  useUserEvents: (h: (e: unknown) => void) => {
    userEvents.handler = h;
  },
}));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import { GIFT_BOX_COLOURS, GIFT_BOX_EXIT_MS, GIFT_BOX_SHUT, GIFT_UNWRAP_MS, type GiftCard, type GiftCatalogItem, type GiftChatRef, type GiftUserEvent } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GiftBubble } from './GiftBubble';
import { GiftPickerSheet } from './GiftPickerSheet';
import { GiftUnwrap } from './GiftUnwrap';
import { GiftArrivals } from './GiftArrivals';
import { GiftBox } from './art';
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
  from: null,
  myGiftId: null,
  myOpened: false,
  equippable: 'background',
  ...over,
});

const AZAD = { userId: 'u-azad', username: 'azad', displayName: 'Azad', avatarUrl: null };
const POST = { type: 'library' as const, id: 'p1' };
const forMe = [{ name: null, avatarUrl: null, isMe: true, opened: false }];

describe('GiftBubble', () => {
  it('is a wrapped present to its recipient that says who it is from, and opens on a tap', () => {
    const onOpen = vi.fn();
    renderWithProviders(<GiftBubble card={card({ myGiftId: 'g1', from: AZAD, recipients: forMe })} mine={false} senderName="azad" onOpen={onOpen} />);
    expect(screen.getByText('Gift from Azad')).toBeTruthy();
    expect(screen.getByText('Tap to open')).toBeTruthy();
    // What is inside stays a surprise until it is opened.
    expect(screen.queryByText('Newroz fire')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A gift from Azad. Tap to open.' }));
    expect(onOpen).toHaveBeenCalledWith('g1');
  });

  it('shows its recipient what it was, and from whom, once opened', () => {
    renderWithProviders(
      <GiftBubble
        card={card({ myGiftId: 'g1', myOpened: true, from: AZAD, recipients: [{ name: null, avatarUrl: null, isMe: true, opened: true }] })}
        mine={false}
        senderName="azad"
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText('Newroz fire')).toBeTruthy();
    expect(screen.getByText('Gift from Azad')).toBeTruthy();
    expect(screen.queryByText('Tap to open')).toBeNull();
  });

  it('says a Hevalo member sent it when the server does not name the sender to this reader', () => {
    renderWithProviders(<GiftBubble card={card({ myGiftId: 'g1', from: null, recipients: forMe })} mine={false} senderName="azad" onOpen={() => undefined} />);
    expect(screen.getByText('Gift from a Hevalo member')).toBeTruthy();
    expect(screen.queryByText(/azad/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'A gift from a Hevalo member. Tap to open.' })).toBeTruthy();
  });

  it('names the giver to the rest of a group too', () => {
    const recipients = [{ name: 'Rojda', avatarUrl: null, isMe: false, opened: false }];
    renderWithProviders(<GiftBubble card={card({ from: AZAD, recipients })} mine={false} senderName="azad" onOpen={() => undefined} />);
    expect(screen.getByText('For Rojda')).toBeTruthy();
    expect(screen.getByText('Gift from Azad')).toBeTruthy();
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

/** A gift as the catalogue lists it. */
const gift = (id: string, name: string, price: number, over: Partial<GiftCatalogItem> = {}): GiftCatalogItem => ({
  sku: `gift-${id}`,
  name,
  category: 'gift',
  assetUrl: `/cosmetics/gifts/${id}.png`,
  price,
  tier: price >= 20_000 ? 'grand' : 'common',
  alreadyOwnedBy: [],
  freeGiftEligible: price <= 150,
  ...over,
});
const CAY = gift('cay', 'Çay', 1);
const GUL = gift('gul', 'Gul', 25);
const PISIK = gift('pisik', 'Pisîk', 150);
const BELEM = gift('belem', 'Belem', 2_000);
const HEYV = gift('heyv', 'Heyv', 20_000);
const SHELF = [CAY, GUL, PISIK, BELEM, HEYV];

/** The catalogue as GET /gifts/catalog answers it, with the bag and what the send may cost. */
const shelfOf = (
  items: GiftCatalogItem[] = SHELF,
  zer = 30_000,
  more: {
    bag?: Array<{ sku: string; name: string; assetUrl: string | null; count: number }>;
    freeGifts?: number;
    hold?: 'new_friend' | 'friends_only' | null;
    limits?: { maxPrice: number | null; left: number | null; confirmFrom: number };
    dayLeft?: Array<{ userId: string; left: number; moreAt: string | null }>;
    nudges?: boolean;
  } = {},
) =>
  ok({
    items,
    bag: more.bag ?? [],
    balance: { zer },
    freeGifts: more.freeGifts ?? 0,
    hold: more.hold ?? null,
    limits: more.limits ?? { maxPrice: null, left: null, confirmFrom: 2_000 },
    dayLeft: more.dayLeft ?? [],
    nudges: more.nudges ?? true,
  });

const SENT = ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer: 700 }, freeGifts: 0, message: null });
const dmSheet = (onSent = vi.fn(), onClose = vi.fn()) =>
  renderWithProviders(<GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={onClose} onSent={onSent} />);

describe('GiftBox', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws the shut box in its parts, the same drawing as the website, each tier in its own wrapping', () => {
    renderWithProviders(
      <>
        <GiftBox size={64} tier="common" testID="kraft" />
        <GiftBox size={64} tier="rare" testID="teal" />
      </>,
    );
    for (const part of GIFT_BOX_SHUT) expect(screen.getByTestId(`teal-${part}`)).toBeTruthy();
    // the open box's light and the sparks are not drawn on a box standing still
    expect(screen.queryByTestId('teal-light')).toBeNull();
    expect(screen.queryByTestId('teal-sparks')).toBeNull();
    const body = (id: string): string => screen.getByTestId(`${id}-body`).querySelector('svg')!.getAttribute('data-markup')!;
    expect(body('teal')).toContain(GIFT_BOX_COLOURS.teal.face);
    expect(body('kraft')).toContain(GIFT_BOX_COLOURS.kraft.face);
  });

  it('hops while it waits and plays the unwrap, and stands still under Reduce Motion', async () => {
    const { unmount } = renderWithProviders(
      <>
        <GiftBox size={64} tier="grand" motion="idle" seed="b1" testID="waiting" />
        <GiftBox size={140} tier="grand" motion="unwrap" testID="opening" />
      </>,
    );
    expect(screen.getByTestId('waiting-idle')).toBeTruthy();
    expect(screen.getByTestId('opening-unwrap')).toBeTruthy();
    expect(screen.getByTestId('opening-light')).toBeTruthy();
    unmount();
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    renderWithProviders(<GiftBox size={140} tier="grand" motion="unwrap" testID="still" />);
    await waitFor(() => expect(screen.queryByTestId('still-unwrap')).toBeNull());
    expect(screen.getByTestId('still-body')).toBeTruthy();
  });
});

describe('GiftPickerSheet', () => {
  it('opens on the bag with its counts, then the gifts by shelf, each named in Kurmancî with its meaning and its worth', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 30_000, { bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: null, count: 3 }] }) });
    dmSheet();
    expect(screen.getByText('A gift for Rojda')).toBeTruthy();
    expect(await screen.findByText('30,000')).toBeTruthy();
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings.slice(headings.indexOf('Your bag'))).toEqual(['Your bag', 'Tea and treats', 'Flowers', 'Animals', 'The sky', 'Boats']);
    expect(within(screen.getByTestId('gift-bag')).getByRole('radio', { name: 'Çay, A glass of tea, 3 in your bag, From your bag, free' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Gul, A red rose, 25 Zêr, ≈ €0.25' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Heyv, The full moon, 20,000 Zêr, ≈ €200/ })).toBeTruthy();
    expect(screen.getByText('Grand')).toBeTruthy();
  });

  it('says how many gifts are left for a friend today when few are, and holds the send once there are none', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 30_000, { dayLeft: [{ userId: 'u2', left: 2, moreAt: null }] }) });
    const first = dmSheet();
    expect(await screen.findByText('You can give Rojda 2 more today.')).toBeTruthy();
    first.unmount();

    const client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 30_000, { dayLeft: [{ userId: 'u2', left: 0, moreAt: null }] }) });
    testAuth.client = client;
    dmSheet();
    expect(await screen.findByText('Rojda can’t be given any more gifts today.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    expect(screen.getByRole('button', { name: 'Send gift' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(client.calls.some((c) => c.path === '/gifts')).toBe(false);
  });

  it('says what fills an empty bag', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf() });
    dmSheet();
    expect(await screen.findByText(/Your bag is empty\. Daily lessons, streaks, wins/)).toBeTruthy();
  });

  it('gives from the bag for free', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 0, { bag: [{ sku: CAY.sku, name: 'Çay', assetUrl: null, count: 2 }] }), 'POST /gifts': SENT });
    testAuth.client = client;
    const onSent = vi.fn();
    dmSheet(onSent);
    fireEvent.click(await screen.findByRole('radio', { name: /^Çay, A glass of tea, 2 in your bag/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send from your bag' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(client.calls.find((c) => c.path === '/gifts')?.body).toMatchObject({ sku: CAY.sku, fromBag: true, toUserIds: ['u2'] });
  });

  it('sends a paid gift with its price and a key a retry reuses', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(), 'POST /gifts': SENT });
    testAuth.client = client;
    const onSent = vi.fn();
    dmSheet(onSent);
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const body = client.calls.find((c) => c.path === '/gifts')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: GUL.sku, toUserIds: ['u2'], chat: { kind: 'dm', userId: 'u2' }, expectedPrice: 25 });
    expect(body.fromBag).toBeUndefined();
    expect(String(body.idempotencyKey)).toMatch(/^gift-/);
  });

  it('locks what the Zêr cannot cover, and offers no Zêr to buy while none is on sale', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 100) });
    dmSheet();
    fireEvent.click(await screen.findByRole('radio', { name: /^Pisîk, A kitten curled up, 150 Zêr, ≈ €1.50, Not enough Zêr/ }));
    expect(screen.getByRole('button', { name: 'Send gift' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Get Zêr' })).toBeNull();
  });

  it('locks what the safeguards rule out for these recipients, and says how far is left to spend', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 30_000, { limits: { maxPrice: 500, left: 120, confirmFrom: 2_000 }, nudges: false }) });
    dmSheet();
    const boat = await screen.findByRole('radio', { name: /^Belem, A rowing boat, 2,000 Zêr, ≈ €20, Up to 500 Zêr here/ });
    expect(boat.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('radio', { name: /^Pisîk.*Over your gift limit/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('You can spend 120 more Zêr on gifts for now.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Gul/ }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('asks a second time for a big gift, with the money amount, and sends it with the server’s token', async () => {
    let sends = 0;
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': shelfOf(),
      'POST /gifts': () => {
        sends += 1;
        return sends === 1
          ? fail({ code: 'GIFT_NEEDS_CONFIRM', status: 409, message: 'confirm', details: { confirmToken: 'tok-1', total: 20_000, recipients: 1, expiresAt: '2030-01-01T00:00:00Z' } })
          : SENT;
      },
    });
    testAuth.client = client;
    const onSent = vi.fn();
    dmSheet(onSent);
    fireEvent.click(await screen.findByRole('radio', { name: /^Heyv/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    const check = await screen.findByTestId('gift-confirm');
    expect(within(check).getByText('One more look before it goes')).toBeTruthy();
    expect(within(check).getByText('≈ €200')).toBeTruthy();
    expect(within(check).getByText('20,000 Zêr')).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
    fireEvent.click(within(check).getByRole('button', { name: 'Send it' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const [first, second] = client.calls.filter((c) => c.path === '/gifts').map((c) => c.body as Record<string, unknown>);
    expect(first!.confirmToken).toBeUndefined();
    expect(second).toMatchObject({ sku: HEYV.sku, confirmToken: 'tok-1', idempotencyKey: first!.idempotencyKey });
  });

  it('goes back from the second look without sending', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': shelfOf(),
      'POST /gifts': fail({ code: 'GIFT_NEEDS_CONFIRM', status: 409, message: 'confirm', details: { confirmToken: 'tok-2', total: 2_000, recipients: 1, expiresAt: '2030-01-01T00:00:00Z' } }),
    });
    testAuth.client = client;
    dmSheet();
    fireEvent.click(await screen.findByRole('radio', { name: /^Belem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    fireEvent.click(within(await screen.findByTestId('gift-confirm')).getByRole('button', { name: 'Go back' }));
    expect(screen.queryByTestId('gift-confirm')).toBeNull();
    expect(client.calls.filter((c) => c.path === '/gifts')).toHaveLength(1);
  });

  it('says calmly what a safeguard refused', async () => {
    testAuth.client = fakeClient({
      'GET /gifts/catalog?to=u2': shelfOf(),
      'POST /gifts': fail({ code: 'GIFT_SPEND_LIMIT', status: 409, message: 'no', details: { left: 40, by: 'own_limit' } }),
    });
    dmSheet();
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('That’s more than your gift spending limit leaves: 40 Zêr.')).toBeTruthy();
  });

  it('chooses friends in a group first, all at once if you like', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2,u3': shelfOf(),
      'POST /gifts': ok({ batchId: 'b9', sent: [], skipped: [{ userId: 'u3', reason: 'daily_limit' }, { userId: 'u2', reason: 'not_allowed' }], balance: { zer: 1000 }, freeGifts: 0, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'group', groupId: 'g1' }} friends={[{ userId: 'u2', name: 'Rojda' }, { userId: 'u3', name: 'Azad' }]} onClose={() => undefined} onSent={onSent} />,
    );
    expect(screen.getByText('Who is it for?')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'All my friends here' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send · 50 Zêr · ≈ €0.50' }));
    expect(await screen.findByText(/That’s today’s limit for Azad\.\s+A gift to Rojda isn’t possible yet\./)).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('opens on what to give when sending one back to a friend in a group', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u3': shelfOf() });
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'group', groupId: 'g1' }} friends={[{ userId: 'u2', name: 'Rojda' }, { userId: 'u3', name: 'Azad' }]} initialChosen={['u3']} onClose={() => undefined} onSent={() => undefined} />,
    );
    expect(await screen.findByRole('radio', { name: /^Gul/ })).toBeTruthy();
    expect(screen.queryByText('Who is it for?')).toBeNull();
  });

  it('says so when friends cannot be given anything here', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<GiftPickerSheet visible chat={{ kind: 'group', groupId: 'g1' }} friends={[]} onClose={() => undefined} onSent={() => undefined} />);
    expect(screen.getByText('None of your friends are in this group yet.')).toBeTruthy();
  });

  it('says what a chat mute stops, with the way to Account standing — closing itself first', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(), 'POST /gifts': fail({ code: 'MUTED', details: { scope: 'chat', until: null } }) });
    const onClose = vi.fn();
    dmSheet(vi.fn(), onClose);
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('asks for the catalog once, however often the chat behind it redraws', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf() });
    testAuth.client = client;
    const sheet = () => <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />;
    const { rerender } = renderWithProviders(sheet());
    await screen.findByRole('radio', { name: /^Gul/ });
    rerender(sheet());
    rerender(sheet());
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Gul/ })).toBeTruthy());
    expect(client.calls.filter((c) => c.path.startsWith('/gifts/catalog'))).toHaveLength(1);
  });

  it('says in the reader’s words why the catalog or a gift was refused, never the server’s English', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': fail({ code: 'NOT_FRIENDS', message: 'you can only send gifts to friends' }) });
    const first = dmSheet();
    expect(await screen.findByText('Gifts go to friends only.')).toBeTruthy();
    expect(screen.queryByText('you can only send gifts to friends')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    first.unmount();

    let catalogs = 0;
    testAuth.client = fakeClient({
      'GET /gifts/catalog?to=u2': () => {
        catalogs += 1;
        return shelfOf();
      },
      'POST /gifts': fail({ code: 'ITEM_UNAVAILABLE', status: 409, message: 'item is not available' }),
    });
    dmSheet();
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('That gift isn’t available any more. Pick another one.')).toBeTruthy();
    await waitFor(() => expect(catalogs).toBe(2));
    expect(screen.queryByText('item is not available')).toBeNull();
  });

  it('says in one calm line when a new friendship is too young for a gift, with nothing to pick', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 1000, { hold: 'new_friend' }) });
    dmSheet();
    expect(await screen.findByText('You can give Rojda a gift once you’ve been friends for a day.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /^Gul/ })).toBeNull();
  });

  it('lets a member pay for a small gift with a free one from their box', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?to=u2': shelfOf(SHELF, 100, { freeGifts: 2 }), 'POST /gifts': SENT });
    testAuth.client = client;
    const onSent = vi.fn();
    dmSheet(onSent);
    expect(await screen.findByText('2 free')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /^Pisîk/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use a free gift' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send as a free gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(client.calls.find((c) => c.path === '/gifts')?.body).toMatchObject({ sku: PISIK.sku, useFreeGift: true });
  });

  it('gives onto a post, asking for its catalogue by the post and sending to it', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?post=library%3Ap1': shelfOf(), 'POST /gifts': SENT });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(<GiftPickerSheet visible post={POST} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />);
    expect(screen.getByText('A gift on Rojda’s post')).toBeTruthy();
    fireEvent.click(await screen.findByRole('radio', { name: /^Gul/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const body = client.calls.find((c) => c.path === '/gifts')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: GUL.sku, post: { type: 'library', id: 'p1' } });
    expect(body.toUserIds).toBeUndefined();
  });

  it('says calmly that friends only may give onto this post', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?post=library%3Ap1': shelfOf(SHELF, 1000, { hold: 'friends_only' }) });
    renderWithProviders(<GiftPickerSheet visible post={POST} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />);
    expect(await screen.findByText('Gifts on this post come from Rojda’s friends.')).toBeTruthy();
  });
});

describe('GiftUnwrap', () => {
  /*
   * React-native-web has no native driver, so a native-driven animation ends as it starts; the moment's timings are held
   * open instead, so the light's loops and the words' fade never run here.
   */
  beforeEach(() => {
    vi.spyOn(Animated, 'timing').mockImplementation(
      () =>
        ({
          start: () => undefined,
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
    const onThanks = vi.fn(async () => null);
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={onOpened} onThanks={onThanks} />,
    );
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith(opened));
    // Skip the moment.
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Gift from Azad')).toBeTruthy();
    expect(screen.getByText('Newroz fire')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Wear it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'You’re wearing it' })).toBeTruthy());
    expect(client.calls.find((c) => c.method === 'PUT')).toMatchObject({ path: '/me/cosmetics/background', body: { sku: 'bg_newroz' } });

    fireEvent.click(screen.getByRole('button', { name: 'Say thanks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thanks sent' })).toBeTruthy());
    expect(onThanks).toHaveBeenCalledTimes(1);
  });

  it('wears the gift before the server answers, and takes it off again with the reason when refused', async () => {
    let answer: (r: unknown) => void = () => undefined;
    const opened = card({ myGiftId: 'g1', myOpened: true, recipients: [{ name: null, avatarUrl: null, isMe: true, opened: true }] });
    testAuth.client = fakeClient({
      'POST /gifts/g1/open': ok({ card: opened, equippable: 'background' }),
      'PUT /me/cosmetics/background': () => new Promise((resolve) => (answer = resolve)),
    } as never);
    renderWithProviders(
      <GiftUnwrap
        target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }}
        onClose={() => undefined}
        onOpened={() => undefined}
        onThanks={async () => null}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Wear it' }));
    expect(screen.getByRole('button', { name: 'You’re wearing it' })).toBeTruthy();
    await act(async () => answer({ ok: false, error: { kind: 'network', message: 'network request failed' } }));
    expect(screen.getByRole('button', { name: 'Wear it' })).toBeTruthy();
    expect(screen.getByText('Can’t reach Hevalo right now. Check your connection and try again.')).toBeTruthy();
  });

  it('is felt once, as the gift lands, whether the box waited its time or was skipped', async () => {
    vi.useFakeTimers();
    resetHaptics();
    const felt: string[] = [];
    const off = onHaptic((e) => felt.push(e));
    try {
      testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
      const first = renderWithProviders(
        <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
      );
      // still in its box
      act(() => {
        vi.advanceTimersByTime(GIFT_UNWRAP_MS.common - 100);
      });
      expect(felt).toEqual([]);
      // out of the box, then landing
      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(felt).toEqual(['celebrate']);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // Once for the gift, not again as it finishes.
      expect(felt).toEqual(['celebrate']);
      first.unmount();

      felt.length = 0;
      resetHaptics();
      renderWithProviders(
        <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(felt).toEqual(['celebrate']);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(felt).toEqual(['celebrate']);
    } finally {
      off();
      vi.useRealTimers();
    }
  });

  it('shows the gift by itself once the box has waited its time', () => {
    vi.useFakeTimers();
    try {
      testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
      renderWithProviders(
        <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
      );
      expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(GIFT_UNWRAP_MS.common);
      });
      expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
      expect(screen.getByText('Newroz fire')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unwraps the box in its tier’s time, and lets the open box give way as the gift springs out', () => {
    vi.useFakeTimers();
    try {
      testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true, tier: 'grand' }), equippable: null }) });
      renderWithProviders(
        <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1', tier: 'grand' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
      );
      expect(screen.getByTestId('gift-box-unwrap')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(GIFT_UNWRAP_MS.grand);
      });
      expect(screen.getByText('Newroz fire')).toBeTruthy();
      expect(screen.getByTestId('gift-box-exit')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(GIFT_BOX_EXIT_MS);
      });
      expect(screen.queryByTestId('gift-box')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no Wear it for something that is not worn, and says when opening failed', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': fail({ code: 'GIFT_NOT_FOUND', status: 404, message: 'no such gift' }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1', equippable: null }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('no such gift')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wear it' })).toBeNull();
  });

  it('says in the unwrap why a thank-you was refused, and closes itself for Account standing', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    const onClose = vi.fn();
    const onThanks = vi.fn(async () => ({ kind: 'client' as const, status: 403, code: 'MUTED', message: 'muted', details: { scope: 'chat', until: null } }));
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={onClose} onOpened={() => undefined} onThanks={onThanks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Say thanks' }));
    // The chat's own notice is behind this sheet, so the reason is said here.
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Say thanks' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('keeps the unseen buttons from a screen reader until the reveal, and drops the nameless stage after', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
    );
    // While it plays, only Skip is there to reach.
    expect(screen.queryByRole('button', { name: 'Say thanks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('button', { name: 'Say thanks' })).toBeTruthy();
    // Afterwards no button without a name is left.
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label') ?? button.textContent).toBeTruthy();
    }
  });

  it('says a Hevalo member sent it when the sender may not be named here, rather than a blank name', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: '' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Newroz fire')).toBeTruthy();
    expect(screen.getByText('Gift from a Hevalo member')).toBeTruthy();
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
    testAuth.client = fakeClient({ 'GET /me/gifts/unseen': ok({ unseen: 1 }) });
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
    testAuth.client = fakeClient({ 'GET /me/gifts/unseen': ok({ unseen: 1 }) });
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
    // Their profile is pushed over the chat: the chat is still mounted, but not in front.
    act(() => focus.listeners.get('blur')?.forEach((cb) => cb()));
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(screen.getByText('Rojda sent you a gift')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    // Back in the chat: the gift appearing in the thread is the announcement.
    act(() => focus.listeners.get('focus')?.forEach((cb) => cb()));
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(screen.queryByText('Rojda sent you a gift')).toBeNull();
  });

  it('tells VoiceOver in words, where a live region says nothing', () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    testAuth.client = fakeClient({ 'GET /me/gifts/unseen': ok({ unseen: 1 }) });
    renderWithProviders(<GiftArrivals />);
    act(() => userEvents.handler?.(received({ kind: 'dm', userId: 'u2' })));
    expect(announce).toHaveBeenCalledWith('Rojda sent you a gift');
    announce.mockRestore();
  });
});
