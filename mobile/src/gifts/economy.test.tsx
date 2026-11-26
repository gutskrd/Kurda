// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), isFocused: () => true, addListener: () => () => undefined }) }));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo, Animated } from 'react-native';
import { GIFT_MOMENT_LOOK, GIFT_REDUCED_MOTION_MS, type GiftCard } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { GiftBubble } from './GiftBubble';
import { GiftUnwrap, PostGiftOpen } from './GiftUnwrap';
import { GiftSendAnimation } from './GiftSendAnimation';
import { BagNews } from './BagNews';
import { GiftLimitPage } from './GiftLimitPage';
import { isKnownAdult, plusPitchAllowed } from './nudges';
import { DailyZer } from '../daily/DailyZer';

patchReactNativeWeb();
afterEach(cleanup);

const moon = (over: Partial<GiftCard> = {}): GiftCard => ({
  batchId: 'b1',
  sku: 'gift-heyv',
  name: 'Heyv',
  category: 'gift',
  assetUrl: '/cosmetics/gifts/made-07-heyv.png',
  tier: 'grand',
  recipients: [{ name: null, avatarUrl: null, isMe: true, opened: false }],
  from: { userId: 'u-azad', username: 'azad', displayName: 'Azad', avatarUrl: null },
  myGiftId: 'g1',
  myOpened: false,
  equippable: null,
  ...over,
});

describe('a grand gift on the phone', () => {
  // React-native-web has no native driver, so the unwrap's timing is held open for the test to skip.
  beforeEach(() => {
    vi.spyOn(Animated, 'timing').mockImplementation(
      () => ({ start: () => undefined, stop: () => undefined, reset: () => undefined }) as unknown as Animated.CompositeAnimation,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens in its own light on the night sky, the rays behind it and sparkles round it', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ myOpened: true }), equippable: null }) });
    renderWithProviders(<GiftUnwrap target={{ giftId: 'g1', card: moon(), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />);
    expect(screen.getByTestId('gift-moment-grand')).toBeTruthy();
    expect(screen.getByTestId('night-sky')).toBeTruthy();
    expect(screen.getByTestId('gift-rays')).toBeTruthy();
    expect(screen.getAllByTestId('gift-sparkle')).toHaveLength(GIFT_MOMENT_LOOK.grand.sparkles);
    expect(screen.getByRole('heading', { name: 'Gift from Azad' })).toBeTruthy();
    const client = testAuth.client as unknown as { calls: Array<{ method: string; path: string }> };
    await waitFor(() => expect(client.calls.some((c) => c.method === 'POST' && c.path === '/gifts/g1/open')).toBe(true));
  });

  it('holds its light still under Reduce Motion, and goes straight to the gift', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ myOpened: true }), equippable: null }) });
    const loop = vi.spyOn(Animated, 'loop');
    renderWithProviders(<GiftUnwrap target={{ giftId: 'g1', card: moon(), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />);
    // the sparkles stand where they are, lit, once the setting is known
    await waitFor(() => expect(screen.getAllByTestId('gift-sparkle')[0]!.style.opacity).toBe('0.8'));
    loop.mockClear();
    await act(async () => {
      await new Promise((r) => setTimeout(r, GIFT_REDUCED_MOTION_MS + 50));
    });
    expect(await screen.findByText(/The full moon/)).toBeTruthy();
    expect(loop).not.toHaveBeenCalled();
  });

  it('gives a common gift a gentle light, without the sky or sparkles', () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ tier: 'common', myOpened: true }), equippable: null }) });
    renderWithProviders(<GiftUnwrap target={{ giftId: 'g1', card: moon({ tier: 'common' }), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />);
    expect(screen.getByTestId('gift-moment-common')).toBeTruthy();
    expect(screen.queryByTestId('night-sky')).toBeNull();
    expect(screen.queryAllByTestId('gift-sparkle')).toHaveLength(0);
  });

  it('opens with its meaning under the Kurmancî name, and offers Send one back', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ myOpened: true }), equippable: null }) });
    const onSendBack = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<GiftUnwrap target={{ giftId: 'g1', card: moon(), fromName: 'Azad' }} onClose={onClose} onOpened={() => undefined} onThanks={async () => null} onSendBack={onSendBack} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    expect(await screen.findByText(/The full moon/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send one back' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSendBack).toHaveBeenCalled();
  });

  it('offers no Send one back where there is nobody to send it to', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ myOpened: true }), equippable: null }) });
    renderWithProviders(<GiftUnwrap target={{ giftId: 'g1', card: moon(), fromName: 'Azad' }} onClose={() => undefined} onOpened={() => undefined} onThanks={async () => null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await screen.findByText(/The full moon/);
    expect(screen.queryByRole('button', { name: 'Send one back' })).toBeNull();
  });

  it('stays on show in the chat once opened, for everyone in it', () => {
    renderWithProviders(
      <GiftBubble card={moon({ myGiftId: null, recipients: [{ name: 'Rojda', avatarUrl: null, isMe: false, opened: true }] })} mine={false} senderName="azad" onOpen={() => undefined} />,
    );
    expect(screen.getByTestId('gift-showpiece')).toBeTruthy();
    expect(screen.getByText('Heyv')).toBeTruthy();
  });
});

describe('the line when a gift lands in the bag', () => {
  it('says what landed, and marks it told when closed', async () => {
    const client = fakeClient({
      'GET /gifts/bag': ok({
        items: [{ sku: 'gift-qehwe', name: 'Qehwe', assetUrl: null, count: 1 }],
        arrivals: [{ id: 'a1', sku: 'gift-qehwe', name: 'Qehwe', assetUrl: null, source: 'streak', at: '2030-01-01T00:00:00Z' }],
        earnsZer: false,
      }),
      'POST /gifts/bag/seen': ok({ seen: 1 }),
    });
    testAuth.client = client;
    renderWithProviders(<BagNews />);
    expect(await screen.findByText('Qehwe (Kurdish coffee) is in your gift bag, ready to give.')).toBeTruthy();
    // Hevalo+ is not on sale yet, so nothing is said about it
    expect(screen.queryByText('Members also earn Zêr here.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(client.calls.some((c) => c.path === '/gifts/bag/seen')).toBe(true));
    expect(screen.queryByTestId('bag-news')).toBeNull();
  });
});

describe('the gift spending limit page', () => {
  it('starts with nothing set, and saves a new limit at once', async () => {
    const client = fakeClient({
      'GET /me/gift-limit': ok({ limit: null, pending: null, spent: 300, left: null, minor: false }),
      'PUT /me/gift-limit': ok({ limit: { period: 'week', zer: 2_000 }, pending: null, spent: 300, left: 1_700, minor: false, delayed: false }),
    });
    testAuth.client = client;
    renderWithProviders(<GiftLimitPage />);
    expect(await screen.findByText('No limit')).toBeTruthy();
    expect(screen.getByTestId('gift-limit-save').getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Most Zêr'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Per week (7 days)' }));
    expect(screen.getByText('≈ €20')).toBeTruthy();
    fireEvent.click(screen.getByTestId('gift-limit-save'));
    expect(await screen.findByText('Saved. It applies now.')).toBeTruthy();
    expect(client.calls.find((c) => c.method === 'PUT')?.body).toEqual({ limit: { period: 'week', zer: 2_000 } });
    expect(screen.getByText('2,000 Zêr a week')).toBeTruthy();
  });

  it('says from when a raise applies, since it waits a day', async () => {
    const set = { limit: { period: 'day', zer: 500 }, pending: null, spent: 0, left: 500, minor: false };
    testAuth.client = fakeClient({
      'GET /me/gift-limit': ok(set),
      'PUT /me/gift-limit': ok({ ...set, pending: { limit: { period: 'day', zer: 5_000 }, from: '2030-01-02T10:00:00.000Z' }, delayed: true }),
    });
    renderWithProviders(<GiftLimitPage />);
    fireEvent.change(await screen.findByLabelText('Most Zêr'), { target: { value: '5000' } });
    fireEvent.click(screen.getByTestId('gift-limit-save'));
    expect(await screen.findByText(/A higher limit, or none, takes 24 hours, so this applies from/)).toBeTruthy();
    expect(screen.getByTestId('gift-limit-pending').textContent).toMatch(/Your new limit, 5,000 Zêr a day, applies from/);
  });

  it('shows the fixed limits under 18, with nothing to change', async () => {
    testAuth.client = fakeClient({ 'GET /me/gift-limit': ok({ limit: null, pending: null, spent: 450, left: null, minor: true }) });
    renderWithProviders(<GiftLimitPage />);
    expect((await screen.findByTestId('gift-limit-minor')).textContent).toMatch(/Under 18, a gift can be up to 500 Zêr/);
    expect(screen.queryByTestId('gift-limit-save')).toBeNull();
  });
});

describe('the day’s gift for an account that does not earn Zêr', () => {
  it('is claimed like the Zêr, and says what landed in the bag', async () => {
    testAuth.client = fakeClient({
      'POST /rewards/daily/claim': ok({ claimed: true, cycleDay: 1, reward: 0, balance: 0, member: false, bagGift: { sku: 'gift-cay', name: 'Çay', assetUrl: null } }),
    });
    const daily = { canClaim: true, claimableDay: 1, reward: 5, schedule: [5, 10, 10, 15, 15, 20, 50], alreadyClaimedToday: false, cycleDay: 0, learnedToday: true, member: false };
    renderWithProviders(<DailyZer daily={daily} onClaimed={() => undefined} />);
    expect(screen.getByText('Today’s gift')).toBeTruthy();
    expect(screen.getByText('A small gift for your gift bag, to give a friend.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('daily-claim'));
    expect(await screen.findByText('Çay (A glass of tea) is in your gift bag.')).toBeTruthy();
  });
});

describe('suggestions to buy or join', () => {
  it('go only to whom the server says is a known adult, and only while there is something to buy', () => {
    expect(isKnownAdult({ knownAdult: true })).toBe(true);
    expect(isKnownAdult({ knownAdult: false })).toBe(false);
    // a guest, an unknown age or an older server: the flag is not there, and nobody is taken for an adult
    expect(isKnownAdult({})).toBe(false);
    expect(isKnownAdult(null)).toBe(false);
    expect(plusPitchAllowed(true, true)).toBe(true);
    expect(plusPitchAllowed(false, true)).toBe(false);
    expect(plusPitchAllowed(undefined, true)).toBe(false);
    expect(plusPitchAllowed(true)).toBe(false);
  });
});

describe('the sender’s moment on the phone', () => {
  it('shows the gift it sent in the same light, smaller, with who it went to', () => {
    renderWithProviders(
      <GiftSendAnimation tier="common" item={{ sku: 'gift-cay', assetUrl: '/cosmetics/gifts/made-01-cay.png' }} announce="Gift sent to Rojda" onDone={() => undefined} />,
    );
    expect(screen.getByText('Gift sent to Rojda')).toBeTruthy();
    expect(screen.getByTestId('gift-rays')).toBeTruthy();
    expect(screen.queryAllByTestId('gift-sparkle')).toHaveLength(0);
    // then it is wrapped in its box, tied and sent off
    expect(screen.getByTestId('gift-send-box-send')).toBeTruthy();
  });

  it('simply shows the gift under Reduce Motion, with no box flying', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    renderWithProviders(
      <GiftSendAnimation tier="common" item={{ sku: 'gift-cay', assetUrl: '/cosmetics/gifts/made-01-cay.png' }} announce="Gift sent to Rojda" onDone={() => undefined} />,
    );
    await waitFor(() => expect(screen.queryByTestId('gift-send-box')).toBeNull());
    expect(screen.getByText('Gift sent to Rojda')).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('a gift given onto your post, from its notice', () => {
  beforeEach(() => {
    vi.spyOn(Animated, 'timing').mockImplementation(
      () => ({ start: () => undefined, stop: () => undefined, reset: () => undefined }) as unknown as Animated.CompositeAnimation,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens on the server, then plays its moment with Close alone, since a post has no chat', async () => {
    testAuth.client = fakeClient({ 'POST /gifts/g1/open': ok({ card: moon({ tier: 'common', myOpened: true }), equippable: null }) });
    const onDone = vi.fn();
    renderWithProviders(<PostGiftOpen giftId="g1" onDone={onDone} />);
    expect(await screen.findByRole('heading', { name: 'Gift from Azad' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText(/The full moon/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Say thanks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
