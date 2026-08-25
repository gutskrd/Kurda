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

/** Route fetch by URL so /friends, /friends/requests and /users/search each answer. */
function routedFetch(map: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    return jsonResponse(200, key ? map[key] : {});
  });
}

describe('Friends', () => {
  it('lists your friends and hides requests when there are none', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
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
        '/friends/requests': { requests: [] },
        '/friends': { friends: [{ userId: 'u2', username: 'zana', avatarUrl: 'https://cdn.test/a.png' }] },
      }),
    );
    renderApp(<Friends />);

    await screen.findByText('zana');
    const img = document.querySelector('.friend-avatar img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.test/a.png');
  });

  it('shows incoming requests with accept/decline', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
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

  it('shows people-you-may-know with mutual count and an Add button', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch({
        '/friends/suggestions': { suggestions: [{ userId: 'u5', username: 'baran', displayName: 'Baran', mutualCount: 2 }] },
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
