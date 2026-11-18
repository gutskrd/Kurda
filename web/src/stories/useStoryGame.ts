import { useCallback, useEffect, useRef, useState } from 'react';
import { ANSWER_GRACE_MS, type StoryDetail, type StoryGameStatus, type StoryGameView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiResult } from '../lib/types';

/** Waits between failed long-polls: quick at first, never hammering. */
export const POLL_BACKOFF_MS = [1_000, 2_000, 5_000] as const;

/**
 * The least time between two long-polls that brought nothing new. An overdue game answers at once with the same
 * version when settling changed nothing, so asking straight back would hit the route's rate limit.
 */
const POLL_FLOOR_MS = 1_000;

/** How an answer went, once the network has had its say. */
export type AnswerOutcome = 'ok' | 'late' | 'moved' | { error: string | undefined; status?: number };

export type GameLoad =
  | { state: 'loading' }
  | { state: 'ready'; view: StoryGameView }
  /** Not a member (never, removed, or no such game); all look the same. */
  | { state: 'gone' }
  | { state: 'error'; code?: string; status?: number };

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

const live = (s: StoryGameStatus): boolean => s !== 'finished' && s !== 'cancelled';

/**
 * One story game kept current. Duo and group games long-poll with the last version: the server answers when the game
 * moves, after 20 s or at its next deadline, and the next ask is immediate, or after a second when nothing came back
 * quickly; failures wait 1, 2, then 5 s. Solo games are never polled, since every action returns the new view; a timed
 * solo question is read once after its deadline for the reveal. `serverNow` in each view gives the clock offset for
 * countdowns.
 */
export function useStoryGame(id: string): {
  load: GameLoad;
  /** Milliseconds to add to Date.now() for the server's time. */
  skew: number;
  /** An action's answer is the new view, applied before the caller hears it. */
  act: (path: string, body?: unknown) => Promise<ApiResult<StoryGameView>>;
  answer: (index: number, choice: number) => Promise<AnswerOutcome>;
  refresh: () => void;
} {
  const { client } = useAuth();
  const [load, setLoad] = useState<GameLoad>({ state: 'loading' });
  const [skew, setSkew] = useState(0);
  const viewRef = useRef<StoryGameView | null>(null);
  const skewRef = useRef(0);
  const [kick, setKick] = useState(0);

  /** Takes a view unless a newer one is already in hand (a slow poll after an action's reply). */
  const apply = useCallback((view: StoryGameView) => {
    const have = viewRef.current;
    if (have && have.id === view.id && view.version < have.version) return;
    viewRef.current = view;
    const offset = Date.parse(view.serverNow) - Date.now();
    if (Number.isFinite(offset)) {
      skewRef.current = offset;
      setSkew(offset);
    }
    setLoad({ state: 'ready', view });
  }, []);

  const fail = useCallback((status: number | undefined, code: string | undefined) => {
    if (status === 404) {
      viewRef.current = null;
      setLoad({ state: 'gone' });
    } else if (!viewRef.current) setLoad({ state: 'error', code, status });
  }, []);

  const refresh = useCallback(() => setKick((k) => k + 1), []);

  // The first read, and reads on demand.
  useEffect(() => {
    const controller = new AbortController();
    void client.get<StoryGameView>(`/story-games/${encodeURIComponent(id)}`, { signal: controller.signal }).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && res.data && 'id' in res.data) apply(res.data);
      else if (!res.ok) fail(res.error.status, res.error.code);
    });
    return () => controller.abort();
  }, [client, id, kick, apply, fail]);

  const view = load.state === 'ready' ? load.view : null;
  const following = view !== null && view.mode !== 'solo' && live(view.status);

  // Duo and group games: the long-poll while the game is on.
  useEffect(() => {
    if (!following) return;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      let failures = 0;
      while (!signal.aborted) {
        const current = viewRef.current;
        if (!current || !live(current.status)) return;
        const asked = Date.now();
        const res = await client.get<StoryGameView>(`/story-games/${encodeURIComponent(id)}?v=${current.version}`, { signal });
        if (signal.aborted) return;
        if (res.ok) {
          failures = 0;
          // An empty answer means the server let the wait go; ask again.
          const fresh = res.data && 'id' in res.data ? res.data : null;
          if (fresh) apply(fresh);
          // A new version is followed up at once; the same one, back quickly, waits out the floor.
          const gap = POLL_FLOOR_MS - (Date.now() - asked);
          if ((!fresh || fresh.version <= current.version) && gap > 0) await sleep(gap, signal);
          continue;
        }
        if (res.error.status === 404) return fail(404, res.error.code);
        await sleep(POLL_BACKOFF_MS[Math.min(failures, POLL_BACKOFF_MS.length - 1)]!, signal);
        failures += 1;
      }
    })();
    return () => controller.abort();
  }, [following, client, id, apply, fail]);

  // A timed solo question: read once just after it closes, for the reveal.
  const soloDeadline = view && view.mode === 'solo' && view.status === 'question' ? view.phaseEndsAt : null;
  useEffect(() => {
    if (!soloDeadline) return;
    const at = Date.parse(soloDeadline) + ANSWER_GRACE_MS + 250 - (Date.now() + skewRef.current);
    const timer = setTimeout(refresh, Math.max(0, at));
    return () => clearTimeout(timer);
  }, [soloDeadline, refresh]);

  const act = useCallback(
    async (path: string, body?: unknown): Promise<ApiResult<StoryGameView>> => {
      const res = await client.post<StoryGameView>(`/story-games/${encodeURIComponent(id)}${path}`, body ?? {});
      if (res.ok && res.data && 'id' in res.data) apply(res.data);
      else if (!res.ok && res.error.status === 404) fail(404, res.error.code);
      return res;
    },
    [client, id, apply, fail],
  );

  /**
   * Sends an answer until it is known to have arrived, retrying the same choice after network failures until the
   * deadline plus the server's grace. ALREADY_ANSWERED means an earlier try got through; NOT_CURRENT that the game moved
   * on (re-read quietly); TOO_LATE that it missed the deadline.
   */
  const answer = useCallback(
    async (index: number, choice: number): Promise<AnswerOutcome> => {
      const ends = viewRef.current?.phaseEndsAt ?? null;
      const deadline = ends ? Date.parse(ends) + ANSWER_GRACE_MS : null;
      for (let attempt = 0; ; attempt++) {
        const res = await client.post<StoryGameView>(`/story-games/${encodeURIComponent(id)}/answers`, { index, choice });
        if (res.ok) {
          if (res.data && 'id' in res.data) apply(res.data);
          return 'ok';
        }
        const { code, status, kind } = res.error;
        if (code === 'ALREADY_ANSWERED') {
          refresh();
          return 'ok';
        }
        if (code === 'NOT_CURRENT') {
          refresh();
          return 'moved';
        }
        if (code === 'TOO_LATE') {
          refresh();
          return 'late';
        }
        if (status === 404) {
          fail(404, code);
          return { error: code, status };
        }
        // Refusals that will not change on a second try.
        const transient = kind === 'network' || kind === 'server' || kind === 'rate_limited';
        if (!transient) return { error: code, status };
        const serverNow = Date.now() + skewRef.current;
        if (deadline !== null && serverNow > deadline) {
          refresh();
          return 'late';
        }
        // An untimed solo question has no deadline: a few tries, then the reader decides.
        if (deadline === null && attempt >= 6) return { error: code, status };
        const wait = Math.min(400 * 2 ** attempt, 3_000);
        await new Promise((r) => setTimeout(r, deadline === null ? wait : Math.min(wait, Math.max(200, deadline - serverNow))));
      }
    },
    [client, id, apply, fail, refresh],
  );

  return { load, skew, act, answer, refresh };
}

/** The text a game is played on (`GET /story-games/:id/story`), the game's own copy; fetched once past the lobby. */
export function useGameStory(id: string, wanted: boolean): StoryDetail | null {
  const { client } = useAuth();
  const [story, setStory] = useState<StoryDetail | null>(null);
  useEffect(() => {
    if (!wanted || story) return;
    let alive = true;
    void client.get<StoryDetail>(`/story-games/${encodeURIComponent(id)}/story`).then((res) => {
      if (alive && res.ok && Array.isArray(res.data?.paragraphs)) setStory(res.data);
    });
    return () => {
      alive = false;
    };
  }, [client, id, wanted, story]);
  return story;
}

/** The server's time, ticking each second while `on` (countdowns, reading caps). */
export function useServerClock(skew: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    setNow(Date.now() + skew);
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now() + skew), 1_000);
    return () => clearInterval(timer);
  }, [skew, on]);
  return now;
}
