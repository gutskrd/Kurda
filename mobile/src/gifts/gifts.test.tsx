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
  from: null,
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
  price: 300,
  tier: 'common',
  alreadyOwnedBy: [],
  freeGiftEligible: true,
  ...over,
});

/** The catalogue as GET /gifts/catalog answers it. */
const catalogOf = (items: GiftCatalogItem[], zer = 1000, more: { freeGifts?: number; hold?: 'new_friend' | 'friends_only' | null } = {}) =>
  ok({ items, balance: { zer }, freeGifts: more.freeGifts ?? 0, hold: more.hold ?? null });

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

describe('GiftPickerSheet', () => {
  it('gives a friend in a DM something, showing price, balance and what they own', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': catalogOf([
        item(),
        item({ sku: 'icon_star', name: 'Star', alreadyOwnedBy: ['u2'] }),
        item({ sku: 'bg_gold', name: 'Gold', price: 5000 }),
      ]),
      'POST /gifts': ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer: 700 }, freeGifts: 0, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />,
    );
    expect(screen.getByText('A gift for Rojda')).toBeTruthy();
    expect(await screen.findByText('1,000')).toBeTruthy();
    expect(screen.getByText('Already has it')).toBeTruthy();
    expect(screen.getByText('Not enough to give this')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Star/ }).getAttribute('aria-disabled')).toBe('true');
    // Each price says what it is worth in money as well.
    expect(screen.getByRole('radio', { name: 'Mountain dawn, 300 Zêr, ≈ €3' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const body = client.calls.find((c) => c.path === '/gifts')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: 'bg_mountain', toUserIds: ['u2'], chat: { kind: 'dm', userId: 'u2' }, expectedPrice: 300 });
    expect(String(body.idempotencyKey)).toMatch(/^gift-/);
  });

  it('chooses friends in a group first, all at once if you like', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2,u3': catalogOf([item()]),
      'POST /gifts': ok({
        batchId: 'b9',
        sent: [],
        skipped: [{ userId: 'u3', reason: 'daily_limit' }, { userId: 'u2', reason: 'not_allowed' }],
        balance: { zer: 1000 },
        freeGifts: 0,
        message: null,
      }),
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
    fireEvent.click(screen.getByRole('button', { name: 'Send · 600 Zêr · ≈ €6' }));
    // Nobody could be given it: the sheet says why, by name, and nothing flies.
    expect(await screen.findByText(/That’s today’s limit for Azad\.\s+A gift to Rojda isn’t possible yet\./)).toBeTruthy();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says so when friends cannot be given anything here', () => {
    testAuth.client = fakeClient();
    renderWithProviders(<GiftPickerSheet visible chat={{ kind: 'group', groupId: 'g1' }} friends={[]} onClose={() => undefined} onSent={() => undefined} />);
    expect(screen.getByText('None of your friends are in this group yet.')).toBeTruthy();
  });

  it('says what a chat mute stops, with the way to Account standing — closing itself first', async () => {
    testAuth.client = fakeClient({
      'GET /gifts/catalog?to=u2': catalogOf([item()]),
      'POST /gifts': fail({ code: 'MUTED', details: { scope: 'chat', until: null } }),
    });
    const onClose = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={onClose} onSent={() => undefined} />,
    );
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('You can’t send messages right now.')).toBeTruthy();
    // Account standing would open under the sheet: the sheet goes first.
    fireEvent.click(screen.getByRole('link', { name: 'See your account standing' }));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('AccountStanding');
  });

  it('asks for the catalog once, however often the chat behind it redraws', async () => {
    const client = fakeClient({ 'GET /gifts/catalog?to=u2': catalogOf([item()]) });
    testAuth.client = client;
    const sheet = () => (
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />
    );
    const { rerender } = renderWithProviders(sheet());
    await screen.findByRole('radio', { name: /^Mountain dawn/ });
    // A friend typing redraws the chat, with a fresh friends array each time.
    rerender(sheet());
    rerender(sheet());
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Mountain dawn/ })).toBeTruthy());
    expect(client.calls.filter((c) => c.path.startsWith('/gifts/catalog'))).toHaveLength(1);
  });

  it('says in the reader’s words why the catalog or a gift was refused, never the server’s English', async () => {
    testAuth.client = fakeClient({
      'GET /gifts/catalog?to=u2': fail({ code: 'NOT_FRIENDS', message: 'you can only send gifts to friends' }),
    });
    const first = renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />,
    );
    expect(await screen.findByText('Gifts go to friends only.')).toBeTruthy();
    expect(screen.queryByText('you can only send gifts to friends')).toBeNull();
    // A rule, not a failure: no retry that would only be refused again.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    first.unmount();

    // A Newroz item that ended while the sheet was open: said so, and the catalogue asked for again.
    let catalogs = 0;
    let sends = 0;
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': () => {
        catalogs += 1;
        return catalogOf([item()]);
      },
      'POST /gifts': () => {
        sends += 1;
        return sends === 1
          ? fail({ code: 'ITEM_UNAVAILABLE', status: 409, message: 'item is not available' })
          : fail({ code: 'BAD_RECIPIENTS', status: 400, message: 'a gift goes to 1–20 friends' });
      },
    });
    testAuth.client = client;
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />,
    );
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('That gift isn’t available any more. Pick another one.')).toBeTruthy();
    await waitFor(() => expect(catalogs).toBe(2));
    expect(screen.queryByText('item is not available')).toBeNull();

    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    expect(await screen.findByText('The gift didn’t go. Please try again.')).toBeTruthy();
    expect(screen.queryByText('a gift goes to 1–20 friends')).toBeNull();
  });

  it('says in one calm line when a new friendship is too young for a gift, with nothing to pick', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?to=u2': catalogOf([item()], 1000, { hold: 'new_friend' }) });
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />,
    );
    expect(await screen.findByText('You can give Rojda a gift once you’ve been friends for a day.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /^Mountain dawn/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pick a gift' })).toBeNull();
  });

  it('lets a member pay for a small gift with a free one from their box', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': catalogOf([item(), item({ sku: 'bg_gold', name: 'Gold', price: 5000, freeGiftEligible: false })], 100, { freeGifts: 2 }),
      'POST /gifts': ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer: 100 }, freeGifts: 1, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />,
    );
    expect(await screen.findByText('2 free')).toBeTruthy();
    // 300 Zêr against 100: a free gift still pays for it, but not for the dear one.
    expect(screen.getByRole('radio', { name: /^Mountain dawn/ }).getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByRole('radio', { name: /^Gold/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use a free gift' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send as a free gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(client.calls.find((c) => c.path === '/gifts')?.body).toMatchObject({ sku: 'bg_mountain', useFreeGift: true });
  });

  it('gives onto a post, asking for its catalogue by the post and sending to it', async () => {
    const client = fakeClient({
      'GET /gifts/catalog?post=library%3Ap1': catalogOf([item()]),
      'POST /gifts': ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer: 700 }, freeGifts: 0, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible post={POST} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />,
    );
    expect(screen.getByText('A gift on Rojda’s post')).toBeTruthy();
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    const body = client.calls.find((c) => c.path === '/gifts')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ sku: 'bg_mountain', post: { type: 'library', id: 'p1' } });
    expect(body.toUserIds).toBeUndefined();
  });

  it('says calmly that friends only may give onto this post', async () => {
    testAuth.client = fakeClient({ 'GET /gifts/catalog?post=library%3Ap1': catalogOf([item()], 1000, { hold: 'friends_only' }) });
    renderWithProviders(
      <GiftPickerSheet visible post={POST} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={() => undefined} />,
    );
    expect(await screen.findByText('Gifts on this post come from Rojda’s friends.')).toBeTruthy();
  });
});

describe('GiftPickerSheet, finding the gift', () => {
  // The catalogue as GET /gifts/catalog sends it: every kind with a price, and who owns what already.
  const CATALOG = [
    item({ sku: 'bg_mountain', name: 'Mountain dawn', price: 300 }),
    item({ sku: 'bg-made-gola-sin', name: 'Gola Şîn', price: 400, alreadyOwnedBy: ['u2'] }),
    item({ sku: 'bg_gold', name: 'Gold', price: 5000 }),
    item({ sku: 'icon-made-caydan', name: 'Îstîkan', category: 'icon', price: 900, assetUrl: '/cosmetics/icons/made-08-caydan.png' }),
    item({ sku: 'icon_star', name: 'Star', category: 'icon', price: 50, alreadyOwnedBy: ['u2'] }),
    item({ sku: 'tag_kurdish', name: 'Kurdish Tag', category: 'tag', price: 500 }),
  ];

  const sheet = (zer = 1000) => {
    const client = fakeClient({
      'GET /gifts/catalog?to=u2': catalogOf(CATALOG, zer),
      'POST /gifts': ok({ batchId: 'b9', sent: ['u2'], skipped: [], balance: { zer }, freeGifts: 0, message: null }),
    });
    testAuth.client = client;
    const onSent = vi.fn();
    renderWithProviders(
      <GiftPickerSheet visible chat={{ kind: 'dm', userId: 'u2' }} friends={[{ userId: 'u2', name: 'Rojda' }]} onClose={() => undefined} onSent={onSent} />,
    );
    return { client, onSent };
  };

  /** The gifts on show, by name, in order. */
  const gifts = (): string[] =>
    screen
      .getAllByRole('radio')
      .map((r) => r.getAttribute('aria-label') ?? '')
      .filter((label) => CATALOG.some((i) => label.startsWith(`${i.name},`)))
      .map((label) => label.split(',')[0]!);

  it('files the gifts under their kinds, each with a heading and a count', async () => {
    sheet();
    expect(await screen.findByRole('heading', { name: 'Backgrounds, 3 items' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Icons, 2 items' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tags, 1 item' })).toBeTruthy();
    const kinds = screen.getByRole('radiogroup', { name: 'Kinds of item' });
    expect(within(kinds).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual([
      'All, 6 items',
      'Backgrounds, 3 items',
      'Icons, 2 items',
      'Tags, 1 item',
    ]);

    // One kind: only its gifts, and no heading to say what the chip already says.
    fireEvent.click(within(kinds).getByRole('radio', { name: 'Icons, 2 items' }));
    expect(gifts()).toEqual(['Îstîkan', 'Star']);
    expect(screen.queryByRole('heading', { name: /^Icons/ })).toBeNull();
  });

  it('finds a gift by its name with the Kurdish letters left out, and puts them in price order', async () => {
    sheet();
    const field = await screen.findByLabelText('Search gifts');
    fireEvent.change(field, { target: { value: 'istikan' } });
    expect(gifts()).toEqual(['Îstîkan']);
    expect(screen.getByText('1 item')).toBeTruthy();
    fireEvent.change(field, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Sort: Featured' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Price: high to low' }));
    // Within each kind the dearest first.
    expect(gifts()).toEqual(['Gold', 'Gola Şîn', 'Mountain dawn', 'Îstîkan', 'Star', 'Kurdish Tag']);
  });

  it('hides what they already have, and what the balance cannot cover', async () => {
    sheet(1000);
    await screen.findByRole('heading', { name: 'Backgrounds, 3 items' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide ones they already have' }));
    expect(gifts()).toEqual(['Mountain dawn', 'Gold', 'Îstîkan', 'Kurdish Tag']);
    expect(screen.getByRole('radio', { name: 'Icons, 1 item' })).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Within my Zêr' }));
    // Gold is 5000 Zêr against 1000.
    expect(gifts()).toEqual(['Mountain dawn', 'Îstîkan', 'Kurdish Tag']);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(gifts()).toHaveLength(CATALOG.length);
  });

  it('keeps a choice the filters hide, says what it is by Send, and sends it', async () => {
    const { client, onSent } = sheet();
    fireEvent.click(await screen.findByRole('radio', { name: /^Mountain dawn/ }));
    expect(screen.queryByText('Selected: Mountain dawn')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search gifts'), { target: { value: 'kurdish' } });
    expect(gifts()).toEqual(['Kurdish Tag']);
    expect(screen.getByText('Selected: Mountain dawn')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(client.calls.find((c) => c.path === '/gifts')?.body).toMatchObject({ sku: 'bg_mountain', expectedPrice: 300 });
  });

  it('says so when nothing matches, with the way back', async () => {
    sheet();
    fireEvent.change(await screen.findByLabelText('Search gifts'), { target: { value: 'xyzzy' } });
    expect(screen.getByText('Nothing matches that')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(gifts()).toHaveLength(CATALOG.length);
  });
});

describe('GiftUnwrap', () => {
  /*
   * React-native-web has no native driver, so a native-driven animation ends as it starts; the unwrap's timings are
   * held open instead, so the test can see it playing, skip it, or let it finish.
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

  it('is felt once, as the lid comes off — or at the tap that skips to it', async () => {
    vi.useFakeTimers();
    resetHaptics();
    const felt: string[] = [];
    const off = onHaptic((e) => felt.push(e));
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    const first = renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
    );
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
    expect(felt).toEqual(['celebrate']);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(felt).toEqual(['celebrate']);
    off();
    vi.useRealTimers();
  });

  it('reveals the item by itself when the moment has played out', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: card({ myGiftId: 'g1', myOpened: true }), equippable: null }) });
    renderWithProviders(
      <GiftUnwrap target={{ giftId: 'g1', card: card({ myGiftId: 'g1' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />,
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    act(() => finish[0]?.({ finished: true }));
    expect(await screen.findByText('Gift from Azad')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
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
