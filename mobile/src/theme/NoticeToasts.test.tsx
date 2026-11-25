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
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { showNotice } from './notice';
import { NOTICE_MS, NoticeToasts } from './NoticeToasts';
import { ARRIVAL_MS } from '../notifications/ArrivalToasts';
import { announceArrival, arrivalsShown, toastsInApp } from '../notifications/arrivals';
import { navigation } from '../play/testing/navigation';

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

describe('a notification that arrives while the app is open', () => {
  const PROMOTED = { kind: 'league_promotion', tier: 'gol' };
  const arrived = () => screen.queryAllByTestId('arrival-toast');

  it('shows as Hevalo’s own toast, with the league’s medal, over the app’s notices', () => {
    renderWithProviders(<NoticeToasts />);
    expect(arrivalsShown()).toBe(true);
    act(() => {
      showNotice('Not saved.');
      announceArrival({ id: 'p1', title: 'You moved up', body: 'Welcome to the Gol league.', data: PROMOTED });
    });
    const toast = screen.getByTestId('arrival-toast');
    expect(toast.textContent).toContain('You moved up');
    expect(screen.getByTestId('notice-picture-league')).toBeTruthy();
    // Above the notice, so neither covers the other.
    const order = screen.getAllByTestId(/^(arrival|notice)-toast$/).map((n) => n.getAttribute('data-testid'));
    expect(order).toEqual(['arrival-toast', 'notice-toast']);
  });

  it('opens what it is about when tapped, and goes', () => {
    navigation.navigate.mockClear();
    renderWithProviders(<NoticeToasts />);
    act(() => announceArrival({ id: 'p2', title: 'You moved up', body: '', data: PROMOTED }));
    fireEvent.click(screen.getByTestId('arrival-open'));
    expect(navigation.navigate).toHaveBeenCalledWith('Rankings', { board: 'xp', span: 'week' });
    expect(arrived()).toHaveLength(0);
  });

  it('draws the kind’s glyph where there is no picture, and closes when asked', () => {
    renderWithProviders(<NoticeToasts />);
    act(() => announceArrival({ id: 'p3', title: 'Berfîn chose to stay connected', body: '', data: { kind: 'parental_leave', state: 'kept', teenName: 'Berfîn' } }));
    expect(screen.getByTestId('arrival-toast').textContent).toContain('Berfîn chose to stay connected');
    expect(screen.queryByTestId(/^notice-picture-/)).toBeNull();
    fireEvent.click(screen.getByTestId('arrival-close'));
    expect(arrived()).toHaveLength(0);
  });

  it('goes by itself after a while, keeps at most three, and never shows one push twice', () => {
    vi.useFakeTimers();
    renderWithProviders(<NoticeToasts />);
    act(() => {
      for (const id of ['a', 'b', 'c', 'd', 'd']) announceArrival({ id, title: `Arrival ${id}`, body: '', data: { kind: 'league_safe' } });
    });
    expect(arrived().map((n) => n.textContent?.match(/Arrival \w/)?.[0])).toEqual(['Arrival b', 'Arrival c', 'Arrival d']);
    act(() => vi.advanceTimersByTime(ARRIVAL_MS));
    expect(arrived()).toHaveLength(0);
  });

  it('leaves to their own moments an invite, a gift and a badge', () => {
    expect(toastsInApp({ kind: 'play_invite' })).toBe(false);
    expect(toastsInApp({ kind: 'gift' })).toBe(false);
    expect(toastsInApp({ kind: 'badge' })).toBe(false);
    expect(toastsInApp({ kind: 'league_promotion' })).toBe(true);
    expect(toastsInApp({ kind: 'letter' })).toBe(true);
    expect(toastsInApp({})).toBe(true);
  });
});
