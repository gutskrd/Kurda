// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { FeedImage } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { feedImages, type FeedItem } from '../feed/types';
import { FeedCard } from '../feed/FeedCard';
import { PostPictures, singleRatio } from './PostPictures';
import { PostMenuButton, SourceCredit, postImages } from './PostExtras';

patchReactNativeWeb({ reduceMotion: true });
afterEach(cleanup);

/** What a screen reader calls each picture (react-native-web draws an unnamed <img> inside each named one). */
const named = () => screen.getAllByRole('img').map((e) => e.getAttribute('aria-label')).filter(Boolean);

const img = (n: number, alt: string | null = null): FeedImage => ({ url: `https://cdn.test/${n}.webp`, alt, width: 800, height: 600 });

describe('PostPictures', () => {
  it('names each picture by its description, or by its place', () => {
    renderWithProviders(<PostPictures images={[img(1, 'Çiyayên Zagrosê'), img(2), img(3)]} />);
    expect(named()).toEqual(['Çiyayên Zagrosê', 'Picture 2 of 3', 'Picture 3 of 3']);
  });

  it('shows four at most, in the order they were posted', () => {
    renderWithProviders(<PostPictures images={[img(1), img(2), img(3), img(4), img(5)]} />);
    expect(named()).toEqual([
      'Picture 1 of 4',
      'Picture 2 of 4',
      'Picture 3 of 4',
      'Picture 4 of 4',
    ]);
  });

  it('keeps one picture’s own shape within limits', () => {
    expect(singleRatio({ width: 1000, height: 500 })).toBe(1.91);
    expect(singleRatio({ width: 300, height: 1000 })).toBe(0.8);
    expect(singleRatio({ width: 800, height: 600 })).toBeCloseTo(4 / 3);
    expect(singleRatio({ width: null, height: null })).toBeCloseTo(4 / 3);
  });

  it('on the wall, shows several one at a time, the width of the phone, and says how many', () => {
    // a phone 390 wide
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    renderWithProviders(<PostPictures images={[img(1, 'Çiyayên Zagrosê'), img(2), img(3)]} bleed />);
    // each whole, in the order posted, side by side in a strip that is swiped
    expect(named()).toEqual(['Çiyayên Zagrosê', 'Picture 2 of 3', 'Picture 3 of 3']);
    expect(screen.getByText('1/3')).toBeTruthy();
    // swiped on by one picture's width, the corner says so
    const strip = screen.getByLabelText('Çiyayên Zagrosê').closest('[class*="overflowX"]') as HTMLElement;
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: 390 });
    fireEvent.scroll(strip);
    expect(screen.getByText('2/3')).toBeTruthy();
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
  });

  it('draws nothing for a post without pictures', () => {
    const { container } = renderWithProviders(<PostPictures images={[]} />);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('pictures on the wall and on a post', () => {
  const item = (over: Partial<FeedItem> = {}): FeedItem => ({
    key: 'library:1',
    targetType: 'library',
    id: '1',
    kind: 'gotin',
    author: { id: 'u1', username: 'azad', displayName: null, avatarUrl: null },
    title: null,
    excerpt: 'Li gund',
    imageUrl: 'https://cdn.test/1.webp',
    href: '/app/library/1',
    viewCount: 0,
    commentCount: 0,
    engagement: { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false },
    at: '2026-10-14T10:00:00.000Z',
    ...over,
  });

  it('takes the list of pictures, or the one picture an older wall sends', () => {
    expect(feedImages(item({ images: [img(1), img(2)] }))).toHaveLength(2);
    expect(feedImages(item({ imageAlt: 'gund' }))).toEqual([{ url: 'https://cdn.test/1.webp', alt: 'gund', width: null, height: null }]);
    expect(feedImages(item({ imageUrl: null }))).toEqual([]);
  });

  it('puts every picture on the card, each one a way into the post', async () => {
    renderWithProviders(<FeedCard item={item({ images: [img(1, 'Mal'), img(2)] })} />);
    // a button named by what it shows, not an image: tapping it opens the post (once it is not a double tap)
    fireEvent.click(screen.getByRole('button', { name: 'Mal' }));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('LibraryPost', { postId: '1' }));
    expect(screen.getByRole('button', { name: 'Picture 2 of 2' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Mal' })).toBeNull();
  });

  it('reads a post’s pictures, leaving out one with no address', () => {
    expect(
      postImages({
        media: [
          { mediaKey: 'a', url: 'https://cdn.test/a.webp', altText: 'a', width: 1, height: 2 },
          { mediaKey: 'b', url: null, altText: null, width: null, height: null },
        ],
      }),
    ).toEqual([{ url: 'https://cdn.test/a.webp', alt: 'a', width: 1, height: 2 }]);
  });

  it('credits the source under a post', () => {
    renderWithProviders(<SourceCredit text="Cegerxwîn" />);
    expect(screen.getByText('Source: Cegerxwîn')).toBeTruthy();
  });

  it('lets only the author edit, from the post’s menu', () => {
    testAuth.user = { ...testAuth.user, id: 'me' };
    const { unmount } = renderWithProviders(<PostMenuButton post={{ targetType: 'library', id: 'p1', authorId: 'someone' }} />);
    expect(screen.queryByRole('button', { name: 'Post options' })).toBeNull();
    unmount();
    renderWithProviders(<PostMenuButton post={{ targetType: 'library', id: 'p1', authorId: 'me' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Post options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Compose', { postId: 'p1' });
  });
});
