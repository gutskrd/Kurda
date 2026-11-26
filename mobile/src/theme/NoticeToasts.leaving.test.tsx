// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../net/useNetworkStatus', () => ({ useIsOnline: () => true }));
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { showNotice } from './notice';
import { NoticeToasts } from './NoticeToasts';
import { duration } from './motion';

patchReactNativeWeb({ reduceMotion: false });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a notice leaving, with motion', () => {
  it('fades back up the way it came before it is gone, and takes no touches meanwhile', () => {
    vi.useFakeTimers();
    renderWithProviders(<NoticeToasts />);
    act(() => showNotice('Not saved.'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Still drawn as it leaves, but no longer something to press.
    const card = screen.getByTestId('notice-toast');
    expect(card.style.pointerEvents === 'none' || getComputedStyle(card).pointerEvents === 'none').toBe(true);
    act(() => vi.advanceTimersByTime(duration.base));
    expect(screen.queryAllByTestId('notice-toast')).toEqual([]);
  });
});
