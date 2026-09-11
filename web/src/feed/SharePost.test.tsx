import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SharePost } from './SharePost';
import { renderApp, jsonResponse } from '../test/utils';
import type { FeedItem } from '../lib/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const item: FeedItem = {
  key: 'library:p1',
  targetType: 'library',
  id: 'p1',
  kind: 'poem',
  author: { id: 'a1', username: 'rojîn', avatarUrl: null },
  title: 'Helbesta çiya',
  excerpt: 'Çiya bilind in.',
  imageUrl: null,
  href: '/app/library/p1',
  viewCount: 0,
  commentCount: 0,
  engagement: { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false },
  at: '2026-09-01T10:00:00.000Z',
};

/** A signed-in session, since sending to a friend needs one. */
function signedIn(): void {
  localStorage.setItem('mykurda_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
}

describe('sharing a post', () => {
  it('offers a share button that says what it does', () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);
    // a share glyph alone announces as nothing; the label carries the meaning
    expect(screen.getByRole('button', { name: 'Share this post' })).toBeInTheDocument();
  });

  it('shows the absolute link, because a share target is somewhere else', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    const field = await screen.findByLabelText('Link to this post');
    // a relative href is useless the moment it leaves the page
    expect((field as HTMLInputElement).value).toBe(`${window.location.origin}/app/library/p1`);
    expect(field).toHaveAttribute('readonly');
  });

  it('hands the link to the system sheet where there is one', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: navigator.clipboard });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    await userEvent.click(await screen.findByRole('button', { name: /Share…/ }));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${window.location.origin}/app/library/p1`, title: 'Helbesta çiya' }),
    );
  });

  it('does not offer a system sheet that is not there', async () => {
    // most desktops: the honest primary action is copying the link
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    await screen.findByLabelText('Link to this post');
    expect(screen.queryByRole('button', { name: /Share…/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeInTheDocument();
  });

  it('copies the link, and says it did', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    await userEvent.click(await screen.findByRole('button', { name: /Copy link/ }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/app/library/p1`);
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('leaves the link there to select by hand when the clipboard refuses', async () => {
    // a browser may refuse the clipboard outright; that is not worth a dialog,
    // and the field beside the button is still the link
    const writeText = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { friends: [] })));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    await userEvent.click(await screen.findByRole('button', { name: /Copy link/ }));

    expect(screen.queryByRole('button', { name: /Copied/ })).not.toBeInTheDocument();
    expect((screen.getByLabelText('Link to this post') as HTMLInputElement).value).toContain('/app/library/p1');
  });

  it('sends it to a friend as a message they can reply to', async () => {
    signedIn();
    // the second arg is unused here but gives the mock a 2-tuple, so the
    // assertion below can read the request body off fetch.mock.calls
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/friends')) {
        return jsonResponse(200, { friends: [{ userId: 'f1', username: 'zana', avatarUrl: null }] });
      }
      if (url.includes('/me')) return jsonResponse(200, { user: { id: 'u1', username: 'me' } });
      return jsonResponse(201, { id: 'm1' });
    });
    vi.stubGlobal('fetch', fetch);
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    await userEvent.click(await screen.findByRole('button', { name: /zana/ }));

    await waitFor(() => {
      const sent = fetch.mock.calls.find(([u]) => String(u).includes('/chat/f1/messages'));
      expect(sent, 'the message should go to that friend').toBeTruthy();
      // the title gives the message something to read; the link is what it is for
      const body = JSON.parse(String(sent![1]?.body)).body as string;
      expect(body).toContain('Helbesta çiya');
      expect(body).toContain('/app/library/p1');
    });
    expect(await screen.findByText(/Sent to zana/)).toBeInTheDocument();
  });

  it('asks a signed-out reader to sign in rather than listing nobody', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {})));
    renderApp(<SharePost item={item} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share this post' }));
    expect(await screen.findByText(/Sign in to send this to a friend/)).toBeInTheDocument();
    // …but the link itself is still theirs to copy
    expect(screen.getByLabelText('Link to this post')).toBeInTheDocument();
  });
});
