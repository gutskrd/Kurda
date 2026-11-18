// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../net/useNetworkStatus', () => ({ useIsOnline: () => true }));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { showNotice } from './notice';
import { NOTICE_MS, NoticeToasts } from './NoticeToasts';

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const shown = () => screen.queryAllByTestId('notice-toast').map((n) => n.textContent);

describe('the app’s short notices', () => {
  it('shows a notice once, however often it is raised while showing, and reads it out', () => {
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    renderWithProviders(<NoticeToasts />);
    act(() => {
      showNotice('Can’t reach Hevalo right now.');
      showNotice('Can’t reach Hevalo right now.');
    });
    expect(shown()).toEqual(['Can’t reach Hevalo right now.']);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('closes when asked', () => {
    renderWithProviders(<NoticeToasts />);
    act(() => showNotice('Not saved.'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(shown()).toEqual([]);
  });

  it('goes by itself after a while, and keeps at most three', () => {
    vi.useFakeTimers();
    renderWithProviders(<NoticeToasts />);
    act(() => {
      for (const text of ['one', 'two', 'three', 'four']) showNotice(text);
    });
    expect(shown()).toEqual(['two', 'three', 'four']);
    act(() => vi.advanceTimersByTime(NOTICE_MS));
    expect(shown()).toEqual([]);
  });
});
