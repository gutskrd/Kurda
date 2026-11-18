// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { refocus } from '../play/testing/navigation';
import { LibraryScreen } from './LibraryScreen';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);
// The list queues cell updates for idle time; drain the queue while the page still exists, so an update queued by
// the last test never runs after the environment is torn down (it would fail on a missing window).
afterAll(() => new Promise<void>((resolve) => setTimeout(resolve, 500)));

const story = (n: number, over: Record<string, unknown> = {}) => ({
  id: `s${n}`,
  authorId: 'u1',
  authorRole: 'user',
  type: 'story',
  title: `Çîrok ${n}`,
  body: 'Hebû tune bû…',
  audioMediaId: null,
  audioUrl: null,
  language: 'ku',
  status: 'published',
  viewCount: 0,
  commentCount: 0,
  createdAt: '2026-10-19T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
  publishedAt: '2026-10-19T10:00:00Z',
  ...over,
});
const FIRST = '/library/posts?type=story&sort=newest&limit=20&offset=0';

/* Returning to the list keeps every loaded page and the reader's place, rather than replacing it with the first page. */
describe('the library, come back to from a post', () => {
  it('keeps what was loaded, in its place, and takes what the new read says of it', async () => {
    const page = Array.from({ length: 20 }, (_, i) => story(i + 1));
    // Read again: twenty stories written since, and the first of the old ones with a new count.
    const again = [...Array.from({ length: 19 }, (_, i) => story(101 + i)), story(1, { commentCount: 7 })];
    let reads = 0;
    const client = fakeClient({ [`GET ${FIRST}`]: () => ok({ posts: reads++ === 0 ? page : again }) });
    testAuth.client = client;
    renderWithProviders(<LibraryScreen onExit={() => undefined} />);
    expect(await screen.findByText('Çîrok 1')).toBeTruthy();
    // Some way down the list, as somebody who opened a post from it is.
    const list = screen.getByTestId('library-list');
    Object.defineProperty(list, 'scrollTop', { value: 240, configurable: true });
    fireEvent.scroll(list);

    act(() => refocus());
    await waitFor(() => expect(reads).toBe(2));
    // The posts that were there stay, updated from the read; new ones wait at the top of the list.
    expect(await screen.findByText('7')).toBeTruthy();
    expect(screen.getByText('Çîrok 1')).toBeTruthy();
    expect(screen.getByText('Çîrok 2')).toBeTruthy();
    expect(screen.queryByText('Çîrok 101')).toBeNull();
    // Back at the top, they are on it.
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    fireEvent.scroll(list);
    expect(await screen.findByText('Çîrok 101')).toBeTruthy();
  });

  it('says nothing when the quiet read fails', async () => {
    let reads = 0;
    testAuth.client = fakeClient({
      [`GET ${FIRST}`]: () => (reads++ === 0 ? ok({ posts: [story(1)] }) : { ok: false, error: { kind: 'network', message: 'offline' } }),
    } as never);
    renderWithProviders(<LibraryScreen onExit={() => undefined} />);
    expect(await screen.findByText('Çîrok 1')).toBeTruthy();
    act(() => refocus());
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByText('Çîrok 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
