import { useCallback, useEffect, useRef, useState } from 'react';
import type { MultiGame, MultiMoveAnswer, MultiView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import type { ApiResult } from '../lib/types';

/** Waits between failed long-polls: quick at first, never hammering. */
export const VIEW_BACKOFF_MS = [1_000, 2_000, 5_000] as const;
/** The least time between two long-polls that brought nothing new. */
export const VIEW_POLL_FLOOR_MS = 1_000;
/** A read when nothing has said anything for this long, while connected: a safety net, not how news arrives. */
export const VIEW_SAFETY_MS = 20_000;
/** How long after a deadline the game is asked about, so the server has settled it. */
export const DEADLINE_SLACK_MS = 600;

export type GameViewLoad<Board> =
  | { state: 'loading' }
  | { state: 'ready'; view: MultiView<Board> }
  /** not a member and may not be (never, removed, no such game), or a game that started without them */
  | { state: 'gone'; why: 'gone' | 'started' }
  | { state: 'error'; code?: string };

export interface GameViewHandle<Board, Outcome = unknown> {
  load: GameViewLoad<Board>;
  /** milliseconds to add to Date.now() for the server's time */
  skew: number;
  /** read it again now (the same one read, however many ask at once) */
  refresh: () => void;
  /** a control (`join`, `start`, `leave`, `remove`…): its answer is the new view, applied before the caller hears it */
  act: (path: string, body?: unknown) => Promise<ApiResult<MultiView<Board>>>;
  /** a move: the new view is applied, and the mover's own outcome handed back */
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<Board, Outcome>>>;
}

const live = (status: string): boolean => status === 'lobby' || status === 'active';

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * One multiplayer learning game, kept current (api/src/mp), the same way for
 * every game the engine runs.
 *
 * - With the realtime connection up, the server says `play_changed` whenever
 *   the game moves (coalesced on the server to one per 300 ms and a trailing
 *   one), and the view is read then. Reads are single-flight: one in the air
 *   at a time, and a burst of events while it is out is one more read after.
 *   A version older than the one in hand is dropped, so a slow answer never
 *   undoes a newer one. A slow read every 20 s, only while the tab is in
 *   front, covers an event that was lost.
 * - With the connection down, the long-poll takes over: ask with the version
 *   last seen, the server answers when it moves on (or after 20 s, or just
 *   after its next deadline), ask again — after a second if nothing came,
 *   after 1, 2, then 5 s if the request failed.
 * - Just after a deadline (a turn running out, `deadlineOf`), the game is
 *   asked once with its version: the server settles what is due before it
 *   answers, so the next turn shows on time without waiting for the push.
 * - The server's clock is the one that counts: `serverNow` in every view
 *   gives the offset to this browser's, and every countdown is drawn with it.
 */
export function useGameView<Board, Outcome = unknown>(
  game: MultiGame,
  id: string,
  opts: { deadlineOf?: (view: MultiView<Board>) => string | null } = {},
): GameViewHandle<Board, Outcome> {
  const { client } = useAuth();
  const { state: connection } = useRealtime();
  const [load, setLoad] = useState<GameViewLoad<Board>>({ state: 'loading' });
  const [skew, setSkew] = useState(0);
  const viewRef = useRef<MultiView<Board> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);
  const deadlineOf = useRef(opts.deadlineOf);
  deadlineOf.current = opts.deadlineOf;
  const base = `/mp/${game}/${encodeURIComponent(id)}`;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** Takes a view unless a newer one is already in hand. */
  const apply = useCallback((view: MultiView<Board>) => {
    const have = viewRef.current;
    if (have && have.id === view.id && view.version < have.version) return;
    viewRef.current = view;
    const offset = Date.parse(view.serverNow) - Date.now();
    if (Number.isFinite(offset)) setSkew(offset);
    setLoad({ state: 'ready', view });
  }, []);

  const fail = useCallback((status: number | undefined, code: string | undefined) => {
    if (status === 404) {
      viewRef.current = null;
      setLoad({ state: 'gone', why: 'gone' });
    } else if (code === 'GAME_STARTED') {
      setLoad({ state: 'gone', why: 'started' });
    } else if (!viewRef.current) {
      setLoad({ state: 'error', code });
    }
  }, []);

  const read = useCallback(
    async (path: string, signal?: AbortSignal): Promise<boolean> => {
      const res = await client.get<MultiView<Board> | Record<string, never>>(path, signal ? { signal } : undefined);
      if (!alive.current || signal?.aborted) return false;
      if (res.ok) {
        if (res.data && 'id' in res.data) apply(res.data as MultiView<Board>);
        return true;
      }
      fail(res.error.status, res.error.code);
      return res.error.status !== 404;
    },
    [client, apply, fail],
  );

  /** One read at a time; asking while one is out reads once more after it. */
  const refresh = useCallback(() => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    void (async () => {
      do {
        again.current = false;
        await read(base);
      } while (again.current && alive.current);
      inflight.current = false;
    })();
  }, [read, base]);

  // the first read
  useEffect(() => {
    viewRef.current = null;
    setLoad({ state: 'loading' });
    refresh();
  }, [refresh]);

  // the push: this game moved
  const onChanged = useCallback(
    (env: RealtimeEventEnvelope) => {
      const e = env.event as { game?: unknown; lobbyId?: unknown };
      if (e.game === game && e.lobbyId === id) refresh();
    },
    [game, id, refresh],
  );
  useRealtimeEvent('play_changed', onChanged);

  const view = load.state === 'ready' ? load.view : null;
  const following = view !== null && live(view.status);
  const connected = connection === 'open';

  // connected: a slow safety read, only in front; a tab coming back reads at once
  useEffect(() => {
    if (!following || !connected) return;
    const timer = setInterval(() => {
      if (visible()) refresh();
    }, VIEW_SAFETY_MS);
    const onVisible = (): void => {
      if (visible()) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [following, connected, refresh]);

  // not connected: the long-poll, for as long as the game is on
  useEffect(() => {
    if (!following || connected) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let failures = 0;
      while (!signal.aborted) {
        const current = viewRef.current;
        if (!current || !live(current.status)) return;
        const asked = Date.now();
        const ok = await read(`${base}?v=${current.version}`, signal);
        if (signal.aborted) return;
        if (!ok) {
          if (viewRef.current === null) return;
          await sleep(VIEW_BACKOFF_MS[Math.min(failures, VIEW_BACKOFF_MS.length - 1)]!, signal);
          failures += 1;
          continue;
        }
        failures = 0;
        const fresh = viewRef.current;
        const gap = VIEW_POLL_FLOOR_MS - (Date.now() - asked);
        if ((!fresh || fresh.version <= current.version) && gap > 0) await sleep(gap, signal);
      }
    })();
    return () => controller.abort();
  }, [following, connected, read, base]);

  // just after a deadline: ask with the version, so the server settles it first
  const deadline = view && live(view.status) && deadlineOf.current ? deadlineOf.current(view) : null;
  const version = view?.version ?? null;
  useEffect(() => {
    if (!deadline || version === null) return;
    const wait = Date.parse(deadline) + DEADLINE_SLACK_MS - (Date.now() + skew);
    const timer = setTimeout(() => void read(`${base}?v=${version}`), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [deadline, version, skew, read, base]);

  const act = useCallback(
    async (path: string, body?: unknown): Promise<ApiResult<MultiView<Board>>> => {
      const res = await client.post<MultiView<Board>>(`${base}/${path}`, body ?? {});
      if (res.ok && res.data && 'id' in res.data) apply(res.data);
      // a refusal the page words itself (full, started, not the host); only a game that is gone changes what is shown
      else if (!res.ok && res.error.status === 404) fail(404, res.error.code);
      return res;
    },
    [client, base, apply, fail],
  );

  const move = useCallback(
    async (body: unknown): Promise<ApiResult<MultiMoveAnswer<Board, Outcome>>> => {
      const res = await client.post<MultiMoveAnswer<Board, Outcome>>(`${base}/moves`, body);
      if (res.ok && res.data?.view) apply(res.data.view);
      else if (!res.ok && res.error.status === 404) fail(404, res.error.code);
      return res;
    },
    [client, base, apply, fail],
  );

  return { load, skew, refresh, act, move };
}
