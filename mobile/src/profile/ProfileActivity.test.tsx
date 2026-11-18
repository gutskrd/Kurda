// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { ProfileActivity } from './ProfileActivity';

/*
 * The strip of five over somebody's activity: the chosen one marked as where you are, a section hidden from others
 * still there for its owner and said to be hidden, and the strip read from the right in right-to-left languages.
 */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

const empty = ok({ entries: [], items: [] });

function open(props: Partial<Parameters<typeof ProfileActivity>[0]> = {}) {
  testAuth.client = fakeClient({
    'GET /users/u1/activity?kind=posts&limit=12': empty,
    'GET /users/u1/activity?kind=likes&limit=12': empty,
    'GET /users/u1/activity?kind=saved&limit=12': empty,
  });
  renderWithProviders(<ProfileActivity userId="u1" {...props} />);
}

describe('the activity strip', () => {
  it('marks the chosen section as the one you are in, and loads another when it is tapped', async () => {
    open({ own: true });
    await act(async () => undefined);
    const posts = screen.getByRole('tab', { name: 'Posts' });
    expect(posts.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Likes' }));
    await act(async () => undefined);
    expect(screen.getByRole('tab', { name: 'Likes' }).getAttribute('aria-selected')).toBe('true');
    expect(testAuth.client.get).toHaveBeenCalledWith('/users/u1/activity?kind=likes&limit=12');
  });

  it('keeps a section you hid from others on your own profile, and says it is hidden', async () => {
    open({ own: true, sections: { posts: true, games: true, likes: true, reposts: true, saved: false } });
    await act(async () => undefined);
    expect(screen.getByRole('tab', { name: 'Saved, Hidden' })).toBeTruthy();
    // Not a lone dot after the word.
    expect(screen.queryByText(/ ·$/)).toBeNull();
  });

  it('does not offer a hidden section to anybody else', async () => {
    open({ sections: { posts: true, games: true, likes: true, reposts: true, saved: false } });
    await act(async () => undefined);
    expect(screen.queryByRole('tab', { name: /Saved/ })).toBeNull();
  });

  it('keeps every word whole, letting the strip take a second row, and starts it on the right in Soranî', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    open({ own: true });
    await act(async () => undefined);
    const strip = screen.getByRole('tablist');
    expect(getComputedStyle(strip).flexWrap).toBe('wrap');
    expect(getComputedStyle(strip).flexDirection).toBe('row-reverse');
    for (const tab of screen.getAllByRole('tab')) {
      const label = tab.querySelector('div[dir]') as HTMLElement;
      expect(getComputedStyle(label).whiteSpace).not.toBe('nowrap');
    }
  });
});
