import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { InvitePage } from './InvitePage';
import { jsonResponse, renderApp } from '../test/utils';

const HOST = '0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f';

beforeEach(() => {
  // the emblem is one still picture under reduced motion, which is all a test needs of it
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** Where the page went, and what it carried there. */
function Where(): React.JSX.Element {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}|${JSON.stringify(location.state ?? null)}`}</p>;
}

function page(path: string): void {
  renderApp(
    <Routes>
      <Route path="/join/:game/:code" element={<InvitePage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    [path],
  );
}

/** A server for someone signed in: who they are, who the host is to them, and what a join answers. */
function signedIn(opts: { friendStatus?: string; join?: () => Response } = {}): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/me')) return jsonResponse(200, { user: { id: 'me', username: 'azad', displayName: 'Azad', email: 'azad@example.com', emailVerified: true } });
    if (url.endsWith(`/users/${HOST}`)) return jsonResponse(200, { userId: HOST, username: 'hamo', displayName: 'Hamo', friendStatus: opts.friendStatus ?? 'friends', private: false });
    if (url.endsWith('/play/join') && init?.method === 'POST') return opts.join ? opts.join() : jsonResponse(200, { game: 'impostor', lobbyId: 'lobby-1' });
    if (url.endsWith('/friends/requests') && init?.method === 'POST') return jsonResponse(200, { ok: true });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function signedOut(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith(`/users/${HOST}`)) return jsonResponse(200, { userId: HOST, username: 'hamo', displayName: 'Hamo', friendStatus: 'none', private: false });
    return jsonResponse(401, { code: 'UNAUTHORIZED', message: 'no' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('a game’s invite link', () => {
  it('says which game it is, who is waiting, and the code, to someone with no account, and leads them to one and back', async () => {
    signedOut();
    page(`/join/impostor/KVXV5E?from=${HOST}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kurdish Impostor' })).toBeInTheDocument();
    expect(screen.getByText('You’re invited to play')).toBeInTheDocument();
    expect(await screen.findByText('Hamo is waiting for you at the table.')).toBeInTheDocument();
    expect(screen.getByLabelText('The code: K V X V 5 E')).toBeInTheDocument();
    expect(screen.getByText('Or open Games → Join with a code and type KVX V5E.')).toBeInTheDocument();
    // no Join for someone the server does not know yet
    expect(screen.queryByRole('button', { name: 'Join the game' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Create an account and join' }));
    // the whole address goes with them, so making an account lands them back on this invitation
    expect(screen.getByTestId('where')).toHaveTextContent(`/register|{"from":"/join/impostor/KVXV5E?from=${HOST}"}`);
  });

  it('joins with one tap for someone signed in, by the same join as typing the code', async () => {
    const fetchMock = signedIn();
    page(`/join/impostor/KVXV5E?from=${HOST}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join the game' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/games/impostor?id=lobby-1'));
    const join = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/play/join'))!;
    expect(JSON.parse(String((join[1] as RequestInit).body))).toEqual({ code: 'KVXV5E' });
  });

  it('opens no door of its own: a friends game refused is answered with a friend request to the host', async () => {
    const fetchMock = signedIn({ friendStatus: 'none', join: () => jsonResponse(404, { code: 'NOT_FOUND', message: 'no open game has this code' }) });
    page(`/join/impostor/KVXV5E?from=${HOST}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join the game' }));
    expect(await screen.findByText('You and Hamo aren’t friends on Hevalo yet. Send a friend request, and join when they say yes.')).toBeInTheDocument();
    // the way forward stands in for "no such code", which beside it would read as a broken link
    expect(screen.queryByText('No open game has this code. Check it, or ask your friend for a new one.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send Hamo a friend request' }));
    expect(await screen.findByText('Your friend request is on its way to Hamo. When they accept, tap Join again.')).toBeInTheDocument();
    const asked = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/friends/requests'))!;
    expect(JSON.parse(String((asked[1] as RequestInit).body))).toEqual({ userId: HOST });
    // still on the invitation, with Join there to press again
    expect(screen.getByRole('button', { name: 'Join the game' })).toBeEnabled();
  });

  it('tells a friend plainly when the game is gone, and offers no friend request', async () => {
    signedIn({ friendStatus: 'friends', join: () => jsonResponse(404, { code: 'NOT_FOUND', message: 'no open game has this code' }) });
    page(`/join/impostor/KVXV5E?from=${HOST}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Join the game' }));
    expect(await screen.findByText('No open game has this code. Check it, or ask your friend for a new one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send Hamo a friend request' })).not.toBeInTheDocument();
  });

  it('names nobody the link does not name, and nothing the address made up', async () => {
    signedOut();
    page('/join/who-am-i/ABC234?from=%3Cscript%3E');
    expect(await screen.findByRole('heading', { level: 1, name: 'Who Am I?' })).toBeInTheDocument();
    expect(screen.getByText('A friend is waiting for you at the table.')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('script>');
  });

  it('says so when the link is not whole, and points at the games', async () => {
    signedOut();
    page('/join/impostor/KVX');
    expect(await screen.findByRole('heading', { level: 1, name: 'This invitation is not complete' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Games' })).toHaveAttribute('href', '/app/games');
  });
});
