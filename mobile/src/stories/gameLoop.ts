import { ANSWER_GRACE_MS, type StoryGameView } from '@kurda/shared';
import type { ApiError, ApiResult } from '../api/types';

/**
 * Keeping one story game on screen up to date (contract §A3).
 *
 * The API holds every game in Postgres and answers `GET /story-games/:id?v=`
 * as a long-poll: at once when the game has moved past version v, otherwise
 * when it does, or after about 20 s with the same version. So a duo or group
 * game asks, shows what came back, and asks again with the new version — one
 * request in flight at a time, never a timer firing every second. A failed
 * request waits 1 s, then 2 s, then 5 s at most before asking again.
 *
 * A solo game never waits on anybody: every action answers with the new view.
 * The one exception is a timed solo question, which closes on its own — one
 * GET just after its deadline (plus the grace an answer still has) brings the
 * reveal.
 *
 * A finished game stops asking. Its results do not change; what might (the
 * host opening another round) is announced on your own channel as
 * `play_changed`, and the screen calls `refresh()` for that.
 *
 * No React here, so the whole thing runs in a test with a fake server and fake
 * timers.
 */

export const POLL_BACKOFF_MS = [1_000, 2_000, 5_000] as const;

export type LoopFailure = { kind: 'not-found' } | { kind: 'error'; error: ApiError };

export interface GameLoopDeps {
  fetch: (since: number | undefined) => Promise<ApiResult<StoryGameView | Record<string, never>>>;
  onView: (view: StoryGameView) => void;
  /** the game is not there for this person (never was, removed, or the id is wrong) — stops the loop */
  onFailure: (failure: LoopFailure) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

const isView = (v: unknown): v is StoryGameView =>
  !!v && typeof (v as StoryGameView).id === 'string' && typeof (v as StoryGameView).version === 'number';

export class StoryGameLoop {
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;
  private view: StoryGameView | null = null;
  private inFlight = false;
  /** a refresh was asked for while a request was out: ask again when it lands */
  private again = false;
  private timer: unknown = null;
  private failures = 0;
  private stopped = false;
  private paused = false;
  /** server clock minus ours, from the newest view */
  private offsetMs = 0;

  constructor(private readonly deps: GameLoopDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = deps.now ?? Date.now;
  }

  /** The newest view held. */
  get current(): StoryGameView | null {
    return this.view;
  }

  /** Server time now, by our clock corrected with the last view's `serverNow`. */
  serverNow(): number {
    return this.now() + this.offsetMs;
  }

  /** Start: from a view already in hand (an action's answer), or by asking for one. */
  start(initial?: StoryGameView): void {
    this.stopped = false;
    if (initial) this.accept(initial);
    else this.request();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  /** The app went to the background: no requests until `resume()`. */
  pause(): void {
    this.paused = true;
    this.clear();
  }

  /** In front again: whatever happened meanwhile is fetched now. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.failures = 0;
    this.request();
  }

  /** Ask now (an event said this game changed, or a refetch is wanted after an action failed). */
  refresh(): void {
    this.failures = 0;
    this.request(true);
  }

  /**
   * A view from anywhere — the long-poll, or an action's answer. An older one
   * than we hold (a poll that left before the action did) is dropped.
   */
  accept(view: StoryGameView): void {
    this.take(view, true);
  }

  private take(view: StoryGameView, schedule: boolean): void {
    if (this.stopped) return;
    const serverNow = Date.parse(view.serverNow);
    if (!Number.isNaN(serverNow)) this.offsetMs = serverNow - this.now();
    const newer = !this.view || view.id !== this.view.id || view.version > this.view.version;
    if (newer) {
      this.view = view;
      this.deps.onView(view);
    }
    if (schedule) this.next();
  }

  private clear(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** What to do after a view: wait on the server, wait for a deadline, or nothing. */
  private next(): void {
    if (this.stopped || this.paused) return;
    const view = this.view;
    if (!view) return;
    if (view.status === 'finished' || view.status === 'cancelled') {
      this.clear();
      return;
    }
    if (view.mode === 'solo') {
      this.clear();
      if (view.status === 'question' && view.phaseEndsAt) {
        const due = Date.parse(view.phaseEndsAt) + ANSWER_GRACE_MS - this.serverNow();
        // already past (a slow phone clock, a server still closing it): ask again in a moment
        const wait = due > 0 ? due + 250 : 1_500;
        this.timer = this.setTimer(() => {
          this.timer = null;
          this.request(true);
        }, wait);
      }
      return;
    }
    this.request();
  }

  /** One request at a time; `fresh` asks for the view now rather than waiting on the version. */
  private request(fresh = false): void {
    if (this.stopped || this.paused) return;
    if (this.inFlight) {
      if (fresh) this.again = true;
      return;
    }
    this.clear();
    this.inFlight = true;
    const since = fresh || !this.view ? undefined : this.view.version;
    void this.deps.fetch(since).then((res) => {
      this.inFlight = false;
      if (this.stopped || this.paused) return;
      if (res.ok) {
        this.failures = 0;
        if (isView(res.data)) {
          const again = this.again;
          this.again = false;
          this.take(res.data, !again);
          if (again) this.request(true);
        } else {
          // the server stopped waiting (it is restarting): ask again shortly
          this.retry();
        }
        return;
      }
      if (res.error.status === 404) {
        this.stopped = true;
        this.deps.onFailure({ kind: 'not-found' });
        return;
      }
      this.failures += 1;
      // a first failure is a blip and the screen says nothing; a run of them it can show
      if (this.failures >= 2) this.deps.onFailure({ kind: 'error', error: res.error });
      this.retry();
    });
  }

  private retry(): void {
    const delay = POLL_BACKOFF_MS[Math.min(this.failures, POLL_BACKOFF_MS.length) - 1] ?? POLL_BACKOFF_MS[0];
    this.clear();
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.request(!this.view);
    }, delay);
  }
}
