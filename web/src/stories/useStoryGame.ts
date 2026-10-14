import { useCallback, useEffect, useRef, useState } from 'react';
import { ANSWER_GRACE_MS, type StoryDetail, type StoryGameStatus, type StoryGameView } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiResult } from '../lib/types';

/** Waits between failed long-polls: quick at first, never hammering. */
export const POLL_BACKOFF_MS = [1_000, 2_000, 5_000] as const;

/**
 * The least time between two long-polls that brought nothing new. The server
 * answers at once when something is overdue, and if settling it did not move
 * the game (another request got there first, an expiry changed nothing) the
 * answer is the version just sent: asking straight back would spin into the
 * route's limit, and the 429s would then delay the real next phase.
 */
export const POLL_FLOOR_MS = 1_000;

/** How an answer went, once the network has had its say. */
export type AnswerOutcome = 'ok' | 'late' | 'moved' | { error: string | undefined; status?: number };

export type GameLoad =
  | { state: 'loading' }
  | { state: 'ready'; view: StoryGameView }
  /** not a member (never, removed, or no such game): all look the same */
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
 * One story game, kept current (contract §A3).
 *
 * A duo or group game is followed with the long-poll: ask with the version
 * last seen, the server answers when it moves on (or after 20 s, or at its
 * next deadline), ask again at once — or, when the answer brought nothing new
 * and came back quickly, after a second. A failed request waits 1, 2, then 5
 * seconds before the next. Nothing waits while the game is over.
 *
 * A solo game is never polled: every action answers with the new view, and a
 * timed solo question is read once more just after its deadline, so the
 * reveal comes on time without a tap.
 *
 * The server's clock is the one that counts: `serverNow` in every view gives
 * the offset to the browser's, and every countdown is drawn from it.
 */
export function useStoryGame(id: string): {
  load: GameLoad;
  /** milliseconds to add to Date.now() for the server's time */
  skew: number;
  /** an action's answer is the new view; it is applied before the caller hears it */
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

  /** Takes a view unless a newer one is already in hand (a slow poll arriving after an action's reply). */
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

  // the first read, and a read on demand
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

  // a duo or group game: the long-poll, for as long as the game is on
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
          // an empty answer means the server let the wait go; just ask again
          const fresh = res.data && 'id' in res.data ? res.data : null;
          if (fresh) apply(fresh);
          // a new version is asked after at once; the same one, back quickly, waits out the floor
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

  // a timed solo question: read once just after it closes, for the reveal
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
   * An answer, sent until it is known to have arrived (contract §A1): the
   * same choice again after a network failure, until the question's deadline
   * plus the grace the server allows. ALREADY_ANSWERED means an earlier try
   * got through; NOT_CURRENT that the game moved on (read it again, quietly);
   * TOO_LATE that it arrived after the deadline.
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
        // a refusal that will not change on a second try
        const transient = kind === 'network' || kind === 'server' || kind === 'rate_limited';
        if (!transient) return { error: code, status };
        const serverNow = Date.now() + skewRef.current;
        if (deadline !== null && serverNow > deadline) {
          refresh();
          return 'late';
        }
        // an untimed solo question has no deadline: a few tries, then the reader decides
        if (deadline === null && attempt >= 6) return { error: code, status };
        const wait = Math.min(400 * 2 ** attempt, 3_000);
        await new Promise((r) => setTimeout(r, deadline === null ? wait : Math.min(wait, Math.max(200, deadline - serverNow))));
      }
    },
    [client, id, apply, fail, refresh],
  );

  return { load, skew, act, answer, refresh };
}

/**
 * The text a game is played on (`GET /story-games/:id/story`): the game's own
 * copy, whatever has happened to the story since. Asked for once the game is
 * past its lobby, where the host may still change the story.
 */
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

/** The server's time, ticking once a second while `on` (countdowns, the reading caps). */
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
