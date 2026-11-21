// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('../theme/Pressable', () => import('../testing/reach'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { forgetReach, reachOf } from '../testing/reach';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { UnreadProvider } from '../messages/unread';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TabBar } from './TabBar';
import { TABS } from './tabs';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  forgetReach();
  localStorage.removeItem('kurda_locale_v1');
  vi.restoreAllMocks();
});

function open({ index = 0, chats = [] as number[], groups = [] as number[], requests = 0, gifts = 0 } = {}) {
  testAuth.client = fakeClient({
    'GET /chat/unread': ok({ direct: chats.map((unread, i) => ({ userId: `u${i}`, unread })), groups: groups.map((unread, i) => ({ groupId: `g${i}`, unread })) }),
    'GET /friends/requests': ok({ requests: Array.from({ length: requests }, (_, i) => ({ userId: `r${i}`, username: `r${i}` })) }),
    'GET /me/notifications/unread-count': ok({ count: 0 }),
    'GET /me/gifts/unseen': ok({ unseen: gifts }),
  });
  const emitted: { type: string; target?: string }[] = [];
  const navigation = {
    emit: vi.fn((event: { type: string; target?: string }) => {
      emitted.push(event);
      return { defaultPrevented: false };
    }),
    navigate: vi.fn(),
  };
  const state = { index, routes: TABS.map((t) => ({ key: `${t.name}-key`, name: t.name })) };
  renderWithProviders(
    <UnreadProvider>
      <TabBar {...({ state, navigation, descriptors: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 } } as unknown as BottomTabBarProps)} />
    </UnreadProvider>,
  );
  return { navigation, emitted };
}

describe('the tab bar', () => {
  it('shows the four tabs in order, each an icon alone and named for a screen reader', async () => {
    open();
    const bar = await screen.findByRole('tablist');
    const tabs = within(bar).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Messages', 'Profile']);
    // No word is drawn under a glyph.
    for (const word of ['Home', 'Learn', 'Messages', 'Profile']) expect(within(bar).queryByText(word)).toBeNull();
  });

  /* Search opens from the magnifier at the top of every tab, so the bar holds only the four places. */
  it('has no tab for search', async () => {
    open();
    const bar = await screen.findByRole('tablist');
    expect(within(bar).queryByRole('tab', { name: 'Search' })).toBeNull();
  });

  /* A held tab tells whatever listens for it, and goes nowhere. */
  it('sends a long press on, and goes nowhere when it is let go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { navigation, emitted } = open({ index: 0 });
      const learn = await screen.findByRole('tab', { name: 'Learn' });
      fireEvent.touchStart(learn, { touches: [{ identifier: 1, clientX: 0, clientY: 0 }], changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }] });
      await vi.advanceTimersByTimeAsync(600);
      expect(emitted).toContainEqual(expect.objectContaining({ type: 'tabLongPress', target: 'Learn-key' }));
      fireEvent.touchEnd(learn, { touches: [], changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }] });
      await vi.advanceTimersByTimeAsync(50);
      expect(navigation.navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the tab you are on as selected', async () => {
    open({ index: 2 });
    const messages = await screen.findByRole('tab', { name: 'Messages' });
    expect(messages.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Home' }).getAttribute('aria-selected')).toBe('false');
  });

  /* Unread direct and group messages and waiting friend requests all count on Messages, and are said in words. */
  it('puts a dot on Messages while something is unread, and says how much', async () => {
    open({ chats: [2], groups: [0], requests: 1 });
    const tab = await screen.findByRole('tab', { name: 'Messages, 3 unread' });
    expect(within(tab).getByTestId('tab-Messages-dot')).toBeTruthy();
    expect(within(tab).queryByText('3')).toBeNull();
  });

  it('says the whole count to a screen reader however many there are', async () => {
    open({ chats: [7, 4] });
    const tab = await screen.findByRole('tab', { name: 'Messages, 11 unread' });
    expect(within(tab).getByTestId('tab-Messages-dot')).toBeTruthy();
  });

  it('badges nothing when nothing is waiting', async () => {
    open();
    await screen.findByRole('tablist');
    expect(screen.getByRole('tab', { name: 'Messages' })).toBeTruthy();
    expect(screen.queryByTestId('tab-Messages-dot')).toBeNull();
    expect(screen.queryByTestId('tab-Profile-dot')).toBeNull();
  });

  it('puts a dot on Profile while a gift waits to be unwrapped', async () => {
    open({ gifts: 1 });
    expect(await screen.findByRole('tab', { name: 'Profile, something new' })).toBeTruthy();
    expect(screen.getByTestId('tab-Profile-dot')).toBeTruthy();
  });

  it('moves to another tab when it is tapped', async () => {
    const { navigation } = open({ index: 0 });
    fireEvent.click(await screen.findByRole('tab', { name: 'Learn' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Learn', undefined);
  });

  /* Tapping the tab you are on sends the press, which the tab's own list hears and scrolls to the top on. */
  it('scrolls the current tab to the top instead of navigating when it is tapped again', async () => {
    const { navigation, emitted } = open({ index: 1 });
    fireEvent.click(await screen.findByRole('tab', { name: 'Learn' }));
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'tabPress', target: 'Learn-key' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  /* Moving to another tab ticks; tapping the one you are on does not. */
  it('ticks as you move to another tab, and is quiet when you tap the one you are on', async () => {
    resetHaptics();
    const felt: HapticEvent[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      open({ index: 0 });
      fireEvent.click(await screen.findByRole('tab', { name: 'Home' }));
      expect(felt).toEqual([]);
      fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
      expect(felt).toEqual(['select']);
    } finally {
      stop();
    }
  });

  /* Every tab answers across the bar's padding to its top and bottom edge, and the end tabs to its rounded ends. */
  it('answers a thumb on the bar’s own edge, not only on the tabs inside it', async () => {
    open();
    await screen.findByRole('tablist');
    expect(reachOf('tab-Home')).toEqual({ top: 5, bottom: 5, left: 5, right: 0 });
    expect(reachOf('tab-Learn')).toEqual({ top: 5, bottom: 5, left: 0, right: 0 });
    expect(reachOf('tab-Messages')).toEqual({ top: 5, bottom: 5, left: 0, right: 0 });
    expect(reachOf('tab-Profile')).toEqual({ top: 5, bottom: 5, left: 0, right: 5 });
  });

  it('gives the bar’s ends to whichever tabs stand there in a mirrored bar', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    open();
    await screen.findByRole('tablist');
    // Home is on the right in Soranî, and Profile on the left.
    await waitFor(() => expect(reachOf('tab-Home')).toEqual({ top: 5, bottom: 5, left: 0, right: 5 }));
    expect(reachOf('tab-Profile')).toEqual({ top: 5, bottom: 5, left: 5, right: 0 });
    expect(reachOf('tab-Learn')).toEqual({ top: 5, bottom: 5, left: 0, right: 0 });
  });
});
