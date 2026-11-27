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
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { forgetReach } from '../testing/reach';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { UnreadProvider } from '../messages/unread';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TabBar } from './TabBar';
import { TABS } from './tabs';

// The lens a choice lifts into, and the magnified copy of the tabs inside it, which only the eye is meant to see.

const settings = AccessibilityInfo as unknown as { isReduceMotionEnabled: () => Promise<boolean>; isReduceTransparencyEnabled?: () => Promise<boolean> };

function accessibility({ reduceMotion = false, reduceTransparency = false } = {}): void {
  patchReactNativeWeb({ reduceMotion });
  settings.isReduceTransparencyEnabled = async () => reduceTransparency;
}

afterEach(() => {
  cleanup();
  forgetReach();
  vi.restoreAllMocks();
});

async function open(): Promise<HTMLElement> {
  testAuth.client = fakeClient({
    'GET /chat/unread': ok({ direct: [], groups: [] }),
    'GET /friends/requests': ok({ requests: [] }),
    'GET /me/notifications/unread-count': ok({ count: 0 }),
    'GET /me/gifts/unseen': ok({ unseen: 0 }),
  });
  const navigation = { emit: vi.fn(() => ({ defaultPrevented: false })), navigate: vi.fn() };
  const state = { index: 0, routes: TABS.map((t) => ({ key: `${t.name}-key`, name: t.name })) };
  renderWithProviders(
    <UnreadProvider>
      <TabBar {...({ state, navigation, descriptors: {}, insets: { top: 0, bottom: 0, left: 0, right: 0 } } as unknown as BottomTabBarProps)} />
    </UnreadProvider>,
  );
  // react-native-web reports layout only through a ResizeObserver, which the test page lacks, so the row's layout
  // handler is called as a phone would.
  const row = await screen.findByRole('tablist');
  const handler = (row as unknown as { __reactLayoutHandler?: (e: unknown) => void }).__reactLayoutHandler;
  act(() => handler?.({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 52 } } }));
  return row;
}

describe('the tab bar’s lens', () => {
  it('holds a copy of every tab to magnify, hidden from screen readers and out of reach', async () => {
    accessibility();
    const row = await open();
    const lens = await screen.findByTestId('tab-lens');
    expect(lens.getAttribute('aria-hidden')).toBe('true');
    const copy = within(lens).getByTestId('tab-lens-copy');
    for (const name of ['Home', 'Learn', 'Messages', 'Profile']) expect(within(copy).getAllByText(name).length).toBeGreaterThan(0);
    expect(within(lens).queryAllByRole('tab')).toEqual([]);
    // The tabs a screen reader hears are the four real ones.
    expect(within(row).getAllByRole('tab')).toHaveLength(4);
  });

  it('draws the copy the row’s size, moved with the lens', async () => {
    accessibility();
    await open();
    const copy = await screen.findByTestId('tab-lens-copy');
    expect(copy.style.width).toBe('320px');
    expect(copy.style.height).toBe('52px');
    expect(copy.style.transform).toMatch(/translateX\(.+\) translateY\(.+\) scaleX\(.+\) scaleY\(.+\)/);
  });

  it('is not there under Reduce Motion, where the capsule only fades in at its place', async () => {
    accessibility({ reduceMotion: true });
    await open();
    await screen.findByTestId('tab-pill');
    await waitFor(() => expect(screen.queryByTestId('tab-lens')).toBeNull());
    expect(screen.queryByTestId('tab-lens-copy')).toBeNull();
  });

  it('is not there when the reader asks for less transparency, where a solid capsule moves instead', async () => {
    accessibility({ reduceTransparency: true });
    await open();
    await screen.findByTestId('tab-pill');
    await waitFor(() => expect(screen.queryByTestId('tab-lens')).toBeNull());
    expect(screen.queryByTestId('tab-lens-copy')).toBeNull();
  });
});
