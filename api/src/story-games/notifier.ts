import type { RoomBus, RoomEvent } from '../realtime/bus.js';

/** Bus rooms for story games: never `user:` (the gateway's per-user channel). */
export const STORY_GAME_ROOM_PREFIX = 'story-game:';
export const STORY_GAME_CHANGED = 'story_game_changed';

/** Why a waiter stopped waiting. */
export type WakeReason = 'changed' | 'timeout' | 'superseded' | 'closed' | 'closing';

export interface NotifierOptions {
  /** wakes for one game are coalesced to at most one per this many ms (trailing) */
  coalesceMs?: number;
  /** waiting requests per user and game; the newest wins */
  maxPerUserGame?: number;
  /** waiting requests per user across all games; the newest wins */
  maxPerUser?: number;
  /** how long a game's last version is remembered after its last waiter */
  forgetAfterMs?: number;
  /**
   * The bus room prefix (never `user:`). Story games keep the default; the multiplayer games (api/src/mp) use their own
   * prefix.
   */
  roomPrefix?: string;
}

interface Waiter {
  gameId: string;
  userId: string;
  version: number;
  seq: number;
  timer: NodeJS.Timeout | null;
  resolve: (reason: WakeReason) => void;
  settled: boolean;
}

export interface WaitHandle {
  /** resolves once: woken by a newer version, the timeout, a newer request, or shutdown */
  readonly done: Promise<WakeReason>;
  /** start the clock; until then only a change or a newer request ends the wait */
  arm(timeoutMs: number): void;
  /** stop waiting now (the client went away, or the handler has its answer) */
  cancel(reason?: WakeReason): void;
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/**
 * Tracks who is waiting on which story game and wakes them on change.
 *
 * A long-poll registers BEFORE reading the game's version, and the notifier remembers the last version heard per game,
 * so a change committed between that read and the wait still wakes it (no lost wakeups). A waiter registering with an
 * older version than the last heard is woken at once.
 *
 * Nothing here holds a database connection: a waiting request is a promise and a timer.
 *
 * `notify` is called by whatever committed the change on this instance and wakes local waiters directly (not through
 * Redis, so a Redis blip freezes nothing), then publishes `{version}` on the room bus for other instances without
 * awaiting it (a failed publish after commit must not fail the request). One bus listener is registered at boot; our
 * own echo is a no-op because waiters only wake for a newer version.
 *
 * Limits: two waiting requests per user per game and four overall. A new request answers the oldest at once instead of
 * being refused, since the old one is usually a tab or connection the client already dropped.
 */
export class StoryGameNotifier {
  private readonly waiters = new Map<string, Set<Waiter>>();
  private readonly byUser = new Map<string, Waiter[]>();
  private readonly lastVersion = new Map<string, number>();
  private readonly lastWakeAt = new Map<string, number>();
  private readonly pendingWake = new Map<string, NodeJS.Timeout>();
  private readonly forgetTimers = new Map<string, NodeJS.Timeout>();
  private readonly listeners: Array<(gameId: string, version: number) => void> = [];
  private readonly coalesceMs: number;
  private readonly maxPerUserGame: number;
  private readonly maxPerUser: number;
  private readonly forgetAfterMs: number;
  private readonly roomPrefix: string;
  private seq = 0;
  private closing = false;

  constructor(
    private readonly bus: RoomBus | null,
    private readonly log: Log,
    opts: NotifierOptions = {},
  ) {
    this.coalesceMs = opts.coalesceMs ?? 300;
    this.maxPerUserGame = opts.maxPerUserGame ?? 2;
    this.maxPerUser = opts.maxPerUser ?? 4;
    this.forgetAfterMs = opts.forgetAfterMs ?? 60_000;
    this.roomPrefix = opts.roomPrefix ?? STORY_GAME_ROOM_PREFIX;
    this.bus?.onEvent((roomId, event) => this.fromBus(roomId, event));
  }

  /** True once the server is shutting down: polls answer at once from then on. */
  get isClosing(): boolean {
    return this.closing;
  }

  /** The newest version this instance has heard of for a game, if any. */
  versionOf(gameId: string): number | undefined {
    return this.lastVersion.get(gameId);
  }

  /** How many requests are waiting, in total or for one game (tests, metrics). */
  waiting(gameId?: string): number {
    if (gameId) return this.waiters.get(gameId)?.size ?? 0;
    let n = 0;
    for (const set of this.waiters.values()) n += set.size;
    return n;
  }

  /** Called after every local notify — the play module's `play_changed` fan-out hangs off this. */
  onChange(listener: (gameId: string, version: number) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Register a waiter for `gameId` that has seen `version`. Wakes at once if a newer version is known or the server is
   * closing.
   */
  register(gameId: string, userId: string, version: number): WaitHandle {
    let resolve!: (reason: WakeReason) => void;
    const done = new Promise<WakeReason>((r) => (resolve = r));
    const waiter: Waiter = { gameId, userId, version, seq: ++this.seq, timer: null, resolve, settled: false };

    const handle: WaitHandle = {
      done,
      arm: (timeoutMs) => {
        if (waiter.settled) return;
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.timer = setTimeout(() => this.settle(waiter, 'timeout'), Math.max(0, timeoutMs));
      },
      cancel: (reason = 'closed') => this.settle(waiter, reason),
    };

    if (this.closing) {
      waiter.settled = true;
      resolve('closing');
      return handle;
    }
    const known = this.lastVersion.get(gameId);
    if (known !== undefined && known > version) {
      waiter.settled = true;
      resolve('changed');
      return handle;
    }

    let set = this.waiters.get(gameId);
    if (!set) this.waiters.set(gameId, (set = new Set()));
    set.add(waiter);
    const forget = this.forgetTimers.get(gameId);
    if (forget) {
      clearTimeout(forget);
      this.forgetTimers.delete(gameId);
    }
    const mine = this.byUser.get(userId) ?? [];
    mine.push(waiter);
    this.byUser.set(userId, mine);

    // newest wins: answer the oldest beyond either limit
    const sameGame = mine.filter((w) => w.gameId === gameId);
    if (sameGame.length > this.maxPerUserGame) this.settle(sameGame[0]!, 'superseded');
    const live = this.byUser.get(userId) ?? [];
    if (live.length > this.maxPerUser) this.settle(live[0]!, 'superseded');
    return handle;
  }

  /**
   * A change to `gameId` committed at `version`. Call only after COMMIT, or a woken waiter reads the old row and sleeps
   * again.
   */
  notify(gameId: string, version: number): void {
    this.heard(gameId, version);
    for (const listener of this.listeners) {
      try {
        listener(gameId, version);
      } catch (err) {
        this.log.warn({ err, gameId }, 'story game change listener failed');
      }
    }
    if (this.bus) {
      void this.bus
        .publish(`${this.roomPrefix}${gameId}`, { type: STORY_GAME_CHANGED, version })
        .catch((err) => this.log.warn({ err, gameId }, 'story game change publish failed'));
    }
  }

  /** Shutdown: answer every waiter now, and every later poll at once. */
  close(): void {
    this.closing = true;
    for (const set of [...this.waiters.values()]) for (const w of [...set]) this.settle(w, 'closing');
    for (const t of this.pendingWake.values()) clearTimeout(t);
    for (const t of this.forgetTimers.values()) clearTimeout(t);
    this.pendingWake.clear();
    this.forgetTimers.clear();
  }

  private fromBus(roomId: string, event: RoomEvent): void {
    if (!roomId.startsWith(this.roomPrefix) || event.type !== STORY_GAME_CHANGED) return;
    const version = event.version;
    if (typeof version !== 'number' || !Number.isInteger(version)) return;
    this.heard(roomId.slice(this.roomPrefix.length), version);
  }

  private heard(gameId: string, version: number): void {
    const known = this.lastVersion.get(gameId);
    if (known !== undefined && known >= version) return;
    this.lastVersion.set(gameId, version);
    if (!this.waiters.get(gameId)?.size) {
      this.scheduleForget(gameId);
      return;
    }
    // at most one wake per game per coalesceMs, trailing: a burst of answers
    // in a group wakes every waiter once, with the last version
    const now = Date.now();
    const last = this.lastWakeAt.get(gameId) ?? 0;
    if (now - last >= this.coalesceMs) {
      this.wake(gameId);
    } else if (!this.pendingWake.has(gameId)) {
      this.pendingWake.set(
        gameId,
        setTimeout(() => {
          this.pendingWake.delete(gameId);
          this.wake(gameId);
        }, this.coalesceMs - (now - last)),
      );
    }
  }

  private wake(gameId: string): void {
    this.lastWakeAt.set(gameId, Date.now());
    const version = this.lastVersion.get(gameId) ?? -1;
    const set = this.waiters.get(gameId);
    if (!set) return;
    for (const w of [...set]) if (w.version < version) this.settle(w, 'changed');
  }

  private settle(waiter: Waiter, reason: WakeReason): void {
    if (waiter.settled) return;
    waiter.settled = true;
    if (waiter.timer) clearTimeout(waiter.timer);
    const set = this.waiters.get(waiter.gameId);
    if (set) {
      set.delete(waiter);
      if (set.size === 0) {
        this.waiters.delete(waiter.gameId);
        this.scheduleForget(waiter.gameId);
      }
    }
    const mine = this.byUser.get(waiter.userId);
    if (mine) {
      const rest = mine.filter((w) => w !== waiter);
      if (rest.length) this.byUser.set(waiter.userId, rest);
      else this.byUser.delete(waiter.userId);
    }
    waiter.resolve(reason);
  }

  // a game nobody waits on is forgotten after a while, so the maps stay the
  // size of the games being played rather than every game ever seen
  private scheduleForget(gameId: string): void {
    if (this.closing || this.forgetTimers.has(gameId)) return;
    const t = setTimeout(() => {
      this.forgetTimers.delete(gameId);
      if (this.waiters.get(gameId)?.size) return;
      this.lastVersion.delete(gameId);
      this.lastWakeAt.delete(gameId);
    }, this.forgetAfterMs);
    t.unref?.();
    this.forgetTimers.set(gameId, t);
  }
}
