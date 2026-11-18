/**
 * Script and link payloads in everything a stranger writes on a post page (title, words, source, picture descriptions,
 * names, comments) reach the reader as text: no element, handler or link of their making appears.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { XSS_PAYLOADS } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { LibraryPostPage } from '../pages/LibraryPostPage';

const PAYLOADS = [...XSS_PAYLOADS, 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x'];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Nothing the payloads could have made: no active element, no handler attribute, no link or source off the page. */
function expectInert(root: HTMLElement): void {
  expect(root.querySelector('script, iframe, object, embed, base, form, details, marquee, input[autofocus], style')).toBeNull();
  for (const el of root.querySelectorAll('*')) {
    for (const { name, value } of Array.from(el.attributes)) {
      expect(name.startsWith('on'), `${el.tagName} ${name}`).toBe(false);
      if (name === 'href' || name === 'src' || name === 'xlink:href') expect(value, `${el.tagName} ${name}`).not.toMatch(/^\s*(javascript|data|vbscript):|^\/\/|evil/i);
    }
  }
}

describe('a post page full of what a stranger wrote', () => {
  it('shows every payload as words and makes nothing of it', async () => {
    for (const p of PAYLOADS) {
      const author = { id: 'a1', username: 'dilan', displayName: p, avatarUrl: null };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.endsWith('/me')) return jsonResponse(401, {});
          if (url.includes('/replies')) return jsonResponse(200, { comments: [] });
          if (url.includes('/comments')) {
            return jsonResponse(200, {
              comments: [{ id: 'c1', postId: 'p1', author, parentCommentId: null, depth: 0, body: p, status: 'visible', replyCount: 0, createdAt: '2026-10-01T10:00:00Z' }],
            });
          }
          if (url.includes('/engagement')) return jsonResponse(200, { engagement: { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false } });
          if (url.includes('/library/posts/p1')) {
            return jsonResponse(200, {
              id: 'p1',
              authorId: 'a1',
              author,
              type: 'story',
              title: p,
              body: `${p}\n\n${p}`,
              media: [{ mediaKey: 'k1', url: 'https://cdn.test/1.webp', altText: p, width: 800, height: 600 }],
              meme: false,
              sourceCredit: p,
              status: 'published',
              audioUrl: null,
              viewCount: 1,
              commentCount: 1,
              createdAt: '2026-10-01T10:00:00Z',
              publishedAt: '2026-10-01T10:00:00Z',
            });
          }
          return jsonResponse(200, {});
        }),
      );
      const view = renderApp(
        <Routes>
          <Route path="/app/library/:id" element={<LibraryPostPage />} />
        </Routes>,
        ['/app/library/p1'],
      );
      expect(await screen.findByRole('heading', { level: 1, name: p })).toBeInTheDocument();
      // As words in the title, both paragraphs, the source line and the comment.
      await waitFor(() => expect(view.container.textContent!.split(p).length - 1, p).toBeGreaterThanOrEqual(5));
      expectInert(view.container);
      view.unmount();
    }
  }, 30_000);
});
