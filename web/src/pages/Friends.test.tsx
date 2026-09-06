import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Friends } from './Friends';
import { renderApp, jsonResponse } from '../test/utils';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/**
 * Route fetch by URL so /friends, its two request lists and /users/search each
 * answer. Longest key first: '/friends/requests/outgoing' contains
 * '/friends/requests', so a plain find() would hand the sent list the incoming
 * fixture and quietly show every pending request twice.
 */
function routedFetch(map: Record<string, unknown>) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  // `init` is unused here but kept in the signature so tests can assert on the
  // method a control actually sent, not merely on the URL it touched
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const key = keys.find((k) => url.includes(k));
    return jsonResponse(200, key ? map[key] : {});
  });
}

describe('Friends', () => {
  it('lists your friends and hides requests when there are none', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [{ userId: 'u2', username: 'zana' }] },
      }),
    );
    renderApp(<Friends />);

    expect(await screen.findByText('zana')).toBeInTheDocument();
    expect(screen.getByText('@zana')).toBeInTheDocument();
    expect(screen.queryByText('Requests')).not.toBeInTheDocument();
  });

  it('renders a friend’s resolved avatar image when present', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [{ userId: 'u2', username: 'zana', avatarUrl: 'https://cdn.test/a.png' }] },
      }),
    );
    renderApp(<Friends />);

    await screen.findByText('zana');
    const img = document.querySelector('.friend-avatar img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.test/a.png');
  });

  it('shows an online presence dot for online friends only', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [] },
        '/friends': {
          friends: [
            { userId: 'u2', username: 'online1', online: true },
            { userId: 'u3', username: 'offline1', online: false },
          ],
        },
      }),
    );
    renderApp(<Friends />);

    await screen.findByText('online1');
    // exactly one presence dot (the online friend)
    expect(document.querySelectorAll('.presence-dot')).toHaveLength(1);
  });

  it('shows incoming requests with accept/decline', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [{ userId: 'u3', username: 'rojda' }] },
        '/friends': { friends: [] },
      }),
    );
    renderApp(<Friends />);

    expect(await screen.findByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('rojda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });

  it('shows requests you sent, so a misfire is visible', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [{ userId: 'u7', username: 'hevi' }] },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [] },
      }),
    );
    renderApp(<Friends />);

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('hevi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel your request to hevi/i })).toBeInTheDocument();
  });

  it('does not mistake an incoming request for one you sent', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [{ userId: 'u3', username: 'rojda' }] },
        '/friends': { friends: [] },
      }),
    );
    renderApp(<Friends />);

    await screen.findByText('Requests');
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    // one row, in the incoming section — not two
    expect(screen.getAllByText('rojda')).toHaveLength(1);
  });

  it('takes a sent request back on the second press', async () => {
    const fetchMock = routedFetch({
      '/friends/requests/outgoing': { requests: [{ userId: 'u7', username: 'hevi' }] },
      '/friends/requests': { requests: [] },
      '/friends': { friends: [] },
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Friends />);

    const cancel = await screen.findByRole('button', { name: /cancel your request to hevi/i });
    await userEvent.click(cancel);
    // armed, not fired: one press must not undo something silently
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/friends/requests/u7'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /press again to confirm/i }));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).includes('/friends/requests/u7') && init?.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('shows people-you-may-know with mutual count and an Add button', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/suggestions': { suggestions: [{ userId: 'u5', username: 'baran', displayName: 'Baran', mutualCount: 2 }] },
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [] },
      }),
    );
    renderApp(<Friends />);

    expect(await screen.findByText('People you may know')).toBeInTheDocument();
    expect(screen.getByText('Baran')).toBeInTheDocument();
    expect(screen.getByText('2 mutual friends')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: /^add$/i });
    await userEvent.click(add);
    expect(await screen.findByRole('button', { name: /requested/i })).toBeInTheDocument();
  });

  it('searches for users and renders results', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/requests/outgoing': { requests: [] },
        '/friends/requests': { requests: [] },
        '/friends': { friends: [] },
        '/users/search': { results: [{ userId: 'u9', username: 'newro', displayName: 'Newroz' }] },
      }),
    );
    renderApp(<Friends />);

    await userEvent.type(screen.getByLabelText(/search users/i), 'new');
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText('Search results')).toBeInTheDocument();
    expect(screen.getByText('Newroz')).toBeInTheDocument();
    expect(screen.getByText('@newro')).toBeInTheDocument();
  });
});
