import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { CarriedRouter, forgetCarried } from '../lib/viewTransition';
import type { FeedItem } from '../lib/types';
import { DimenPost } from '../pages/DimenPost';
import { LibraryPostPage } from '../pages/LibraryPostPage';
import { ProfileModalProvider } from '../profile/ProfileModal';
import { jsonResponse } from '../test/utils';
import { FeedCard } from './FeedCard';

/**
 * A post on a wall and the post's own page are the two ends of one journey
 * (lib/viewTransition.tsx): the card takes the travelling name as the wall is
 * left, and whatever draws the post on its page takes it over — the same card
 * again for a picture, the written post's own article for a saying. Each end
 * names the journey by itself, from the post, so this is where it is checked
 * that they name it the same.
 */

const AUTHOR = { id: 'a1', username: 'dilan', avatarUrl: null };
const NOBODY = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

const picture: FeedItem = {
  key: 'image:i1',
  targetType: 'image',
  id: 'i1',
  kind: 'image',
  author: AUTHOR,
  title: null,
  excerpt: 'Çiyayên welêt',
  imageUrl: 'https://cdn.test/a.webp',
  images: [{ url: 'https://cdn.test/a.webp', alt: null, width: 800, height: 600 }],
  href: '/app/dimen/i1',
  viewCount: 40,
  commentCount: 2,
  engagement: NOBODY,
  at: '2026-10-01T10:00:00Z',
};

const saying: FeedItem = {
  key: 'library:p1',
  targetType: 'library',
  id: 'p1',
  kind: 'gotin',
  author: AUTHOR,
  title: null,
  excerpt: 'Dar bi berê xwe tê naskirin.',
  imageUrl: null,
  images: [],
  href: '/app/library/p1',
  viewCount: 12,
  commentCount: 0,
  engagement: NOBODY,
  at: '2026-10-01T10:00:00Z',
};

/** The two posts as their own pages are given them. */
const PICTURE_POST = {
  id: 'i1',
  authorId: AUTHOR.id,
  author: AUTHOR,
  imageMediaId: 'm1',
  imageUrl: 'https://cdn.test/a.webp',
  caption: 'Çiyayên welêt',
  category: 'image',
  language: 'ku',
  viewCount: 40,
  commentCount: 2,
  createdAt: '2026-10-01T10:00:00Z',
};
const WRITTEN_POST = {
  id: 'p1',
  authorId: AUTHOR.id,
  author: AUTHOR,
  type: 'gotin',
  title: null,
  body: 'Dar bi berê xwe tê naskirin.',
  media: [],
  meme: false,
  sourceCredit: null,
  status: 'published',
  audioUrl: null,
  viewCount: 12,
  commentCount: 0,
  createdAt: '2026-10-01T10:00:00Z',
  publishedAt: '2026-10-01T10:00:00Z',
};

/** What wears a travelling name right now: each element by its classes. */
function wearing(): string[] {
  return [...document.querySelectorAll<HTMLElement>('article')]
    .filter((el) => el.style.viewTransitionName)
    .map((el) => `${el.className.split(' ').slice(0, 2).join('.')}=${el.style.viewTransitionName}`);
}

/** The browser's side of a view transition: it calls back for the next page, and tells when that page was handed over. */
function withTransitions(): Array<{ before: string[]; updated: Promise<void> }> {
  const asked: Array<{ before: string[]; updated: Promise<void> }> = [];
  const start = (update: () => Promise<void>): ViewTransition => {
    const one = { before: wearing(), updated: Promise.resolve() };
    one.updated = Promise.resolve().then(() => update());
    asked.push(one);
    // the movement itself is never over here: these tests look at the page as it is handed to the browser
    const finished = new Promise<void>(() => undefined);
    const stood = { finished, ready: one.updated, updateCallbackDone: one.updated, skipTransition: () => undefined, types: new Set<string>() };
    return stood as unknown as ViewTransition;
  };
  document.startViewTransition = start as unknown as Document['startViewTransition'];
  return asked;
}

function Wall(): React.JSX.Element {
  return (
    <div className="feed">
      <FeedCard item={picture} />
      <FeedCard item={saying} />
    </div>
  );
}

function show(): void {
  render(
    <AuthProvider>
      <I18nProvider>
        <CarriedRouter>
          <ProfileModalProvider>
            <Routes>
              <Route path="/app" element={<Wall />} />
              <Route path="/app/dimen/:id" element={<DimenPost />} />
              <Route path="/app/library/:id" element={<LibraryPostPage />} />
            </Routes>
          </ProfileModalProvider>
        </CarriedRouter>
      </I18nProvider>
    </AuthProvider>,
  );
}

/** The page is drawn, its post arrives, and the browser is handed the result. */
async function pictured(one: { updated: Promise<void> }): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  await act(async () => one.updated);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/app');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  // a browser without layout draws everything at nowhere: here everything is on the screen
  const onScreen = { left: 10, top: 10, right: 310, bottom: 210, width: 300, height: 200, x: 10, y: 10, toJSON: () => ({}) };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(onScreen as DOMRect);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/me')) return jsonResponse(401, {});
      if (url.includes('/comments')) return jsonResponse(200, { comments: [] });
      if (url.includes('/engagement')) return jsonResponse(200, { engagement: NOBODY });
      if (url.includes('/images/i1')) return jsonResponse(200, PICTURE_POST);
      if (url.includes('/library/posts/p1')) return jsonResponse(200, WRITTEN_POST);
      return jsonResponse(200, {});
    }),
  );
});

afterEach(() => {
  forgetCarried();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  document.documentElement.className = '';
});

describe('a post opened from a wall', () => {
  it('is carried to its own page when it is a picture: the card on the wall, then the same post drawn in full', async () => {
    const asked = withTransitions();
    show();
    fireEvent.click(screen.getByText('Çiyayên welêt'));
    // only the post that was pressed is named, not the one beside it
    expect(asked[0]!.before).toEqual(['fcard.fcard-image=carried-card']);
    await pictured(asked[0]!);
    expect(window.location.pathname).toBe('/app/dimen/i1');
    expect(screen.getByRole('article')).toHaveClass('is-page');
    expect(screen.getByRole('article').style.viewTransitionName).toBe('carried-card');
  });

  it('is carried to its own page when it is written: the card on the wall, then the post’s article', async () => {
    const asked = withTransitions();
    show();
    fireEvent.click(screen.getByText('Dar bi berê xwe tê naskirin.'));
    expect(asked[0]!.before).toEqual(['fcard.fcard-gotin=carried-card']);
    await pictured(asked[0]!);
    expect(window.location.pathname).toBe('/app/library/p1');
    expect(screen.getByRole('article')).toHaveClass('post-full');
    expect(screen.getByRole('article').style.viewTransitionName).toBe('carried-card');
  });

  it('is carried from its comments button as well, which leads to the same page', async () => {
    const asked = withTransitions();
    show();
    fireEvent.click(screen.getAllByRole('link', { name: /comment/i })[1]!);
    expect(asked[0]!.before).toEqual(['fcard.fcard-gotin=carried-card']);
    await pictured(asked[0]!);
    expect(screen.getByRole('article').style.viewTransitionName).toBe('carried-card');
  });

  it('is not carried by anything else on the card: liking it, or opening its author, goes nowhere', async () => {
    const asked = withTransitions();
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'dilan' })[0]!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(asked).toHaveLength(0);
    expect(wearing()).toEqual([]);
  });
});
