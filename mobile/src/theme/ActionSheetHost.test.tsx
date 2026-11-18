// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { ActionSheetHost } from './ActionSheetHost';
import { orderActions, showActions } from './actionSheet';

// The system dialog this replaces on Android showed at most three buttons, so a friend's menu lost Block and Cancel.

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A friend's profile menu: five actions, the last two irreversible. */
function friendMenu() {
  const done: string[] = [];
  const act = (label: string, destructive = false) => ({ label, destructive, onPress: () => done.push(label) });
  return { done, actions: [act('Share'), act('Block', true), act('Report'), act('Remove friend', true), act('Send a letter')] };
}

describe('the app’s action sheet', () => {
  it('orders the actions that cannot be taken back after the others, each group as given', () => {
    expect(orderActions(friendMenu().actions).map((a) => a.label)).toEqual(['Share', 'Report', 'Send a letter', 'Block', 'Remove friend']);
  });

  it('lists every action, however many, the destructive ones last', async () => {
    renderWithProviders(<ActionSheetHost />);
    const menu = friendMenu();
    act(() => showActions({ title: 'Rojda', actions: menu.actions, cancel: 'Cancel' }));
    const sheet = await screen.findByTestId('action-sheet');
    const labels = [...sheet.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')).filter((l) => menu.actions.some((a) => a.label === l));
    expect(labels).toEqual(['Share', 'Report', 'Send a letter', 'Block', 'Remove friend']);
    expect(screen.getByText('Rojda')).toBeTruthy();
  });

  it('runs the chosen action once the sheet has gone, and only that one', async () => {
    vi.useFakeTimers();
    renderWithProviders(<ActionSheetHost />);
    const menu = friendMenu();
    act(() => showActions({ actions: menu.actions, cancel: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    // Not while the sheet is still leaving.
    expect(menu.done).toEqual([]);
    act(() => vi.advanceTimersByTime(400));
    expect(menu.done).toEqual(['Block']);
  });

  it('does nothing when it is put away without a choice', () => {
    vi.useFakeTimers();
    renderWithProviders(<ActionSheetHost />);
    const menu = friendMenu();
    act(() => showActions({ actions: menu.actions, cancel: 'Cancel' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    act(() => vi.advanceTimersByTime(1000));
    expect(menu.done).toEqual([]);
  });

  it('falls back to the system’s dialog, which can be put away, while no sheet is mounted', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const menu = friendMenu();
    showActions({ actions: menu.actions.slice(0, 2), cancel: 'Cancel' });
    expect(alert).toHaveBeenCalledTimes(1);
    const [, , buttons, options] = alert.mock.calls[0]!;
    expect(buttons?.map((b) => b.text)).toEqual(['Share', 'Block', 'Cancel']);
    expect(options).toEqual({ cancelable: true });
  });
});
