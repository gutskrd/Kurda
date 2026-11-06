import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { I18nProvider } from '../i18n/I18nProvider';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { jsonResponse } from '../test/utils';
import { fakeRealtime } from './testing';
import { useGameView } from './useGameView';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

const me = { user: { id: 'me', username: 'ada', displayName: 'Ada', email: 'a@example.com', emailVerified: true } };

function view(version: number, over: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    game: 'last-letter',
    mode: 'group',
    status: 'active',
    version,
    serverNow: new Date(Date.now() + 5_000).toISOString(),
    dialect: 'kmr',
    settings: {},
    players: [],
    me: { seat: 1, team: null },
    board: null,
    ...over,
  };
}

/** A connection that says it is open, as the provider hears it from a real client. */
function openRealtime(): ReturnType<typeof fakeRealtime> {
  const realtime = fakeRealtime();
  const base = realtime.client as unknown as { on: (type: string, h: (arg: unknown) => void) => () => void };
  const on = base.on.bind(base);
  base.on = (type, handler) => {
    if (type === 'state') {
      queueMicrotask(() => handler('open'));
      return () => undefined;
    }
    return on(type, handler);
  };
  return realtime;
}

function wrap(realtime = openRealtime()) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <I18nProvider>
        <MemoryRouter>
          <RealtimeProvider client={realtime.client}>{children}</RealtimeProvider>
        </MemoryRouter>
      </I18nProvider>
    </AuthProvider>
  );
}

describe('useGameView', () => {
  it('reads the game, and the offset to the server’s clock', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('/mp/last-letter/g1') ? jsonResponse(200, view(3)) : jsonResponse(200, me))),
    );
    const { result } = renderHook(() => useGameView('last-letter', 'g1'), { wrapper: wrap() });
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
    expect(result.current.skew).toBeGreaterThan(4_000);
  });

  it('reads again on play_changed for this game only, and never takes an older version over a newer one', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const versions = [5, 7, 6];
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/mp/last-letter/g1')) return jsonResponse(200, view(versions[Math.min(reads++, versions.length - 1)]!));
        return jsonResponse(200, me);
      }),
    );
    const realtime = openRealtime();
    const { result } = renderHook(() => useGameView('last-letter', 'g1'), { wrapper: wrap(realtime) });
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
    act(() => realtime.emit({ type: 'play_changed', game: 'stories', lobbyId: 'g1' }));
    act(() => realtime.emit({ type: 'play_changed', game: 'last-letter', lobbyId: 'other' }));
    expect(reads).toBe(1);
    act(() => realtime.emit({ type: 'play_changed', game: 'last-letter', lobbyId: 'g1' }));
    await waitFor(() => expect(reads).toBe(2));
    act(() => realtime.emit({ type: 'play_changed', game: 'last-letter', lobbyId: 'g1' }));
    await waitFor(() => expect(reads).toBe(3));
    const v = result.current.load.state === 'ready' ? result.current.load.view : null;
    expect(v?.version).toBe(7);
  });

  it('says a game the viewer may not see is gone, and one that started without them started', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/mp/last-letter/gone')) return jsonResponse(404, { code: 'GAME_NOT_FOUND', message: 'no such game' });
        if (url.includes('/mp/last-letter/late')) return jsonResponse(409, { code: 'GAME_STARTED', message: 'started' });
        return jsonResponse(200, me);
      }),
    );
    const gone = renderHook(() => useGameView('last-letter', 'gone'), { wrapper: wrap() });
    await waitFor(() => expect(gone.result.current.load).toEqual({ state: 'gone', why: 'gone' }));
    const late = renderHook(() => useGameView('last-letter', 'late'), { wrapper: wrap() });
    await waitFor(() => expect(late.result.current.load).toEqual({ state: 'gone', why: 'started' }));
  });

  it('long-polls with the version while the realtime connection is down', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/mp/last-letter/g1')) {
          asked.push(url);
          return jsonResponse(200, view(asked.length + 1));
        }
        return jsonResponse(200, me);
      }),
    );
    // this connection never opens: the hook follows the game with the long-poll
    const { result, unmount } = renderHook(() => useGameView('last-letter', 'g1'), { wrapper: wrap(fakeRealtime()) });
    await waitFor(() => expect(asked.some((u) => u.includes('?v=2'))).toBe(true), { timeout: 4_000 });
    expect(result.current.load.state).toBe('ready');
    unmount();
  });

  it('applies the view a move answers with, and hands the mover their outcome', async () => {
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/mp/last-letter/g1/moves') && init?.method === 'POST') {
          return jsonResponse(200, { view: view(9), outcome: { accepted: true } });
        }
        if (url.includes('/mp/last-letter/g1')) return jsonResponse(200, view(2));
        return jsonResponse(200, me);
      }),
    );
    const { result } = renderHook(() => useGameView('last-letter', 'g1'), { wrapper: wrap() });
    await waitFor(() => expect(result.current.load.state).toBe('ready'));
    let outcome: unknown = null;
    await act(async () => {
      const res = await result.current.move({ word: 'mal' });
      outcome = res.ok ? res.data.outcome : null;
    });
    expect(outcome).toEqual({ accepted: true });
    expect(result.current.load.state === 'ready' && result.current.load.view.version).toBe(9);
  });
});
