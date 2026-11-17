import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { MultiGame, MultiMoveAnswer, MultiView } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiResult } from '../api/types';
import { useRealtimeReconnect, useRealtimeState } from '../realtime/RealtimeProvider';
import { useUserEvents } from '../realtime/useUserEvents';
import { joined } from './joining';

/** Waits between failed long-polls: quick at first, never hammering. */
const VIEW_BACKOFF_MS = [1_000, 2_000, 5_000] as const;
/** The least time between two long-polls that brought nothing new. */
const VIEW_POLL_FLOOR_MS = 1_000;
/** The least time between any two long-polls, so a server answering instantly is never asked in a tight loop. */
const VIEW_POLL_MIN_GAP_MS = 250;
/** How long the connection may be down before the long-poll takes over. */
const LONG_POLL_GRACE_MS = 1_500;
/** A safety read after this long without any event, while connected and in front. */
const VIEW_SAFETY_MS = 20_000;
/** How long after a deadline the game is read, so the server has settled it. */
const DEADLINE_SLACK_MS = 600;

type GameViewLoad<Board> =
  | { state: 'loading' }
  | { state: 'ready'; view: MultiView<Board> }
  | { state: 'gone'; why: 'gone' | 'started' }
  | { state: 'error'; code?: string };

export interface GameViewHandle<Board, Outcome = unknown> {
  load: GameViewLoad<Board>;
  /** Milliseconds to add to Date.now() for the server's time. */
  skew: number;
  refresh: () => void;
  act: (path: string, body?: unknown) => Promise<ApiResult<MultiView<Board>>>;
  move: (body: unknown) => Promise<ApiResult<MultiMoveAnswer<Board, Outcome>>>;
}

/** A long-poll that timed out answers with an empty object. */
type NoView = { [key: string]: never };

const live = (status: string): boolean => status === 'lobby' || status === 'active';
const wait = (ms: number, stopped: () => boolean): Promise<void> =>
  new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      if (stopped() || Date.now() - started >= ms) resolve();
      else setTimeout(tick, Math.min(250, ms));
    };
    setTimeout(tick, Math.min(250, ms));
  });

/**
 * One multiplayer learning game, kept current with the same rules as web/src/play/useGameView.ts:
 *
 * - With the realtime connection up, `play_changed` triggers a single-flight read, and an older version never
 *   replaces a newer one. A safety read every 20 s covers a lost event; returning to the app or reconnecting reads
 *   at once.
 * - With the connection down for more than a moment, the versioned long-poll (`?v=`) takes over: the server answers
 *   when the game moves on, after 20 s, or just after its next deadline. Never in the background.
 * - Just after a turn's deadline (`deadlineOf`) the game is read once with its version, so the server settles it.
 * - `serverNow` gives the server-clock offset for every countdown.
 */
export function useGameView<Board, Outcome = unknown>(
  game: MultiGame,
  id: string,
  opts: { deadlineOf?: (view: MultiView<Board>) => string | null } = {},
): GameViewHandle<Board, Outcome> {
  const { client } = useAuth();
  const connection = useRealtimeState();
  const [load, setLoad] = useState<GameViewLoad<Board>>({ state: 'loading' });
  const [skew, setSkew] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
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
    async (path: string): Promise<boolean> => {
      // An invite accepted a moment ago must land first; until then this is nobody's game (play/joining.ts).
      await joined(id);
      const res = await client.get<MultiView<Board> | NoView>(path);
      if (!alive.current) return false;
      if (res.ok) {
        if (res.data && 'id' in res.data) apply(res.data as MultiView<Board>);
        return true;
      }
      fail(res.error.status, res.error.code);
      return res.error.status !== 404;
    },
    [client, apply, fail, id],
  );

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

  useEffect(() => {
    viewRef.current = null;
    setLoad({ state: 'loading' });
    refresh();
  }, [refresh]);

  useUserEvents(
    useCallback(
      (ev) => {
        if (ev.type === 'play_changed' && ev.game === game && ev.lobbyId === id) refresh();
      },
      [game, id, refresh],
    ),
  );
  useRealtimeReconnect(refresh);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setForeground(s !== 'background');
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const view = load.state === 'ready' ? load.view : null;
  const following = view !== null && live(view.status) && foreground;
  const connected = connection === 'open';

  useEffect(() => {
    if (!following || !connected) return;
    const timer = setInterval(refresh, VIEW_SAFETY_MS);
    return () => clearInterval(timer);
  }, [following, connected, refresh]);

  useEffect(() => {
    if (!following || connected) return;
    let stopped = false;
    const isStopped = () => stopped || !alive.current;
    void (async () => {
      let failures = 0;
      await wait(LONG_POLL_GRACE_MS, isStopped);
      while (!isStopped()) {
        const current = viewRef.current;
        if (!current || !live(current.status)) return;
        const asked = Date.now();
        const ok = await read(`${base}?v=${current.version}`);
        if (isStopped()) return;
        if (!ok) {
          if (viewRef.current === null) return;
          await wait(VIEW_BACKOFF_MS[Math.min(failures, VIEW_BACKOFF_MS.length - 1)]!, isStopped);
          failures += 1;
          continue;
        }
        failures = 0;
        const fresh = viewRef.current;
        const moved = fresh !== null && fresh.version > current.version;
        const gap = (moved ? VIEW_POLL_MIN_GAP_MS : VIEW_POLL_FLOOR_MS) - (Date.now() - asked);
        if (gap > 0) await wait(gap, isStopped);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [following, connected, read, base]);

  const deadline = view && live(view.status) && deadlineOf.current ? deadlineOf.current(view) : null;
  const version = view?.version ?? null;
  useEffect(() => {
    if (!deadline || version === null) return;
    const delay = Date.parse(deadline) + DEADLINE_SLACK_MS - (Date.now() + skew);
    const timer = setTimeout(() => void read(`${base}?v=${version}`), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [deadline, version, skew, read, base]);

  const act = useCallback(
    async (path: string, body?: unknown): Promise<ApiResult<MultiView<Board>>> => {
      const res = await client.post<MultiView<Board>>(`${base}/${path}`, body ?? {});
      if (res.ok && res.data && 'id' in res.data) apply(res.data);
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
