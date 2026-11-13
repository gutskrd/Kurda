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
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { refocus } from '../play/testing/navigation';
import { SavedScreen } from './SavedScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

const saved = (id: string) => ({
  key: `library:${id}`,
  targetType: 'library',
  id,
  kind: 'poem',
  title: `Helbest ${id}`,
  excerpt: 'Şev e…',
  imageUrl: null,
  images: [],
  href: `/library/${id}`,
  viewCount: 0,
  at: '2026-10-19T10:00:00Z',
  author: { id: 'u1', username: 'rojda', displayName: null, avatarUrl: null },
  commentCount: 0,
  engagement: { liked: false, likes: 0, reposted: false, reposts: 0, bookmarked: true, bookmarks: 1 },
});

describe('the saved posts, come back to from one of them', () => {
  it('keeps the list on the screen, and lets go of the post that was unsaved on its own page', async () => {
    let reads = 0;
    const client = fakeClient({
      // the whole list both times (shorter than a page): three, then the two still saved
      'GET /me/saved?limit=20&offset=0': () => ok({ items: reads++ === 0 ? [saved('a'), saved('b'), saved('c')] : [saved('a'), saved('c')] }),
    });
    testAuth.client = client;
    renderWithProviders(<SavedScreen onExit={() => undefined} />);
    expect(await screen.findByText('Helbest b')).toBeTruthy();

    act(() => refocus());
    // still there while the list is asked for again: no grey, no empty list
    expect(screen.getByText('Helbest a')).toBeTruthy();
    expect(screen.queryByTestId('skeleton')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Helbest b')).toBeNull());
    expect(screen.getByText('Helbest a')).toBeTruthy();
    expect(screen.getByText('Helbest c')).toBeTruthy();
  });
});
