// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { UnreadProvider } from '../messages/unread';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TabBar } from './TabBar';
import { TABS } from './tabs';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open({ index = 0, chats = [] as number[], groups = [] as number[], requests = 0, gifts = 0 } = {}) {
  testAuth.client = fakeClient({
    'GET /chat/conversations': ok({ conversations: chats.map((unread, i) => ({ userId: `u${i}`, username: `u${i}`, lastMessage: '', lastFromMe: false, unread })) }),
    'GET /me/groups/unread': ok({ unread: groups.map((unread, i) => ({ groupId: `g${i}`, unread })) }),
    'GET /friends/requests': ok({ requests: Array.from({ length: requests }, (_, i) => ({ userId: `r${i}`, username: `r${i}` })) }),
    'GET /me/notifications/unread-count': ok({ count: 0 }),
    'GET /me/social': ok({ unread: { gifts } }),
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
  it('shows the five tabs in order, as icons, each named for a screen reader', async () => {
    open();
    const bar = await screen.findByRole('tablist');
    const tabs = within(bar).getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Home', 'Learn', 'Messages', 'Search', 'Profile']);
    // no words under the icons: the bar is the glyphs alone
    for (const word of ['Home', 'Learn', 'Messages', 'Search', 'Profile']) expect(within(bar).queryByText(word)).toBeNull();
  });

  /*
   * With no words under the icons, holding a tab says which it is, for as
   * long as it is held, and letting go takes the name away without moving.
   */
  it('shows a tab’s name while it is held, and goes nowhere when it is let go', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { navigation, emitted } = open({ index: 0 });
      const learn = await screen.findByRole('tab', { name: 'Learn' });
      fireEvent.touchStart(learn, { touches: [{ identifier: 1, clientX: 0, clientY: 0 }], changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }] });
      await vi.advanceTimersByTimeAsync(600);
      expect(screen.getByText('Learn')).toBeTruthy();
      expect(emitted).toContainEqual(expect.objectContaining({ type: 'tabLongPress', target: 'Learn-key' }));
      fireEvent.touchEnd(learn, { touches: [], changedTouches: [{ identifier: 1, clientX: 0, clientY: 0 }] });
      await vi.advanceTimersByTimeAsync(50);
      expect(screen.queryByText('Learn')).toBeNull();
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

  /*
   * Unread direct and group messages, and friend requests waiting, are all
   * waiting in Messages — and are said in words, since a number in a circle
   * is nothing to a screen reader.
   */
  it('counts what is waiting in Messages on its tab, and says so', async () => {
    open({ chats: [2], groups: [0], requests: 1 });
    const tab = await screen.findByRole('tab', { name: 'Messages, 3 unread' });
    expect(within(tab).getByText('3')).toBeTruthy();
  });

  it('stops counting at nine', async () => {
    open({ chats: [7, 4] });
    const tab = await screen.findByRole('tab', { name: 'Messages, 11 unread' });
    expect(within(tab).getByText('9+')).toBeTruthy();
  });

  it('badges nothing when nothing is waiting', async () => {
    open();
    await screen.findByRole('tablist');
    expect(screen.getByRole('tab', { name: 'Messages' })).toBeTruthy();
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

  /*
   * Tapping the tab you are on goes nowhere — it sends the press, which the
   * tab's own list hears and scrolls back to the top on.
   */
  it('scrolls the current tab to the top instead of navigating when it is tapped again', async () => {
    const { navigation, emitted } = open({ index: 1 });
    fireEvent.click(await screen.findByRole('tab', { name: 'Learn' }));
    expect(emitted).toContainEqual(expect.objectContaining({ type: 'tabPress', target: 'Learn-key' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
