// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { DiscoverGrid } from './DiscoverGrid';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => navigation.navigate.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const author = { id: 'u2', username: 'azad', displayName: 'Azad', avatarUrl: null };
const picture = (n: number, extra: Record<string, unknown> = {}) => ({
  key: `image:i${n}`,
  id: `i${n}`,
  targetType: 'image',
  kind: 'image',
  title: null,
  excerpt: null,
  at: '2026-10-21T10:00:00Z',
  author,
  commentCount: 0,
  engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: false },
  images: [{ url: `https://cdn.test/${n}.webp`, alt: `Picture ${n}`, width: 1, height: 1 }],
  ...extra,
});

function open(items: unknown[]) {
  const onCount = vi.fn();
  testAuth.client = fakeClient({ 'GET /feed?section=dimen&limit=18&offset=0': ok({ items }) });
  renderWithProviders(<DiscoverGrid width={390} onCount={onCount} />);
  return onCount;
}

describe('the pictures under Search', () => {
  it('shows whole rows of three, each opening its post', async () => {
    const onCount = open([1, 2, 3, 4].map((n) => picture(n)));
    // four is a row and one over: the one over waits for a fuller row
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(3));
    expect(screen.queryByRole('button', { name: 'Picture 4' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Picture 2' }));
    expect(navigation.navigate).toHaveBeenCalledWith('MemeDetail', { postId: 'i2' });
  });

  it('leaves out a post with no picture, and opens a written one with pictures as a post', async () => {
    const onCount = open([
      picture(1, { images: [], imageUrl: null }),
      picture(2, { targetType: 'library', kind: 'gotin', key: 'library:i2' }),
    ]);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(1));
    fireEvent.click(screen.getByRole('button', { name: 'Picture 2' }));
    expect(navigation.navigate).toHaveBeenCalledWith('LibraryPost', { postId: 'i2' });
  });

  it('shows nothing at all when nobody has posted a picture', async () => {
    const onCount = open([]);
    await waitFor(() => expect(onCount).toHaveBeenCalledWith(0));
    expect(screen.queryByText('From the community')).toBeNull();
  });
});
