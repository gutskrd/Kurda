/**
 * The phone's one realtime connection.
 *
 * It used to be four. `useUserEvents`, `useChatSocket`, `useRoomEvents` and the
 * quiz's game socket each fetched a ticket and opened a socket of their own,
 * and none of them reconnected. The gateway allowed one connection per person
 * then, so opening a chat pushed the app-wide listener off with 4001 and it
 * stayed dead until the app restarted: invites and matches sent in the
 * meantime were simply lost. The gateway allows a few connections per person
 * now (a phone, a tablet, some browser tabs), but a phone still needs only
 * one, and it has to come back by itself — after a dropped network, after the
 * server restarts, and after the app has been in the background.
 *
 * Protocol (api/src/realtime/gateway.ts): POST /realtime/ticket for a
 * single-use 30 s ticket, open `ws(s)://…/realtime?ticket=…` (never the JWT),
 * receive `hello` with a resume token, then `{type:'event', room, event}`
 * frames. Reconnecting with `&resume=` rejoins the same rooms; any room the
 * resume did not bring back is joined again by name. The server pings at the
 * protocol level and React Native answers by itself, so there is no heartbeat
 * here.
 *
 * Plain TypeScript with nothing from React Native in it, so it can be driven
 * by a fake socket and fake timers in a test. The provider owns the instance.
 *
 * The ticket and the resume token are kept in memory only, never logged and
 * never stored.
 */

const WS_OPEN = 1;

/** The gateway's close codes (api/src/realtime/gateway.ts). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;

/** A join refused before the feature let us in is asked again this many times, this far apart (growing). */
const ROOM_JOIN_RETRIES = 3;
const ROOM_JOIN_RETRY_MS = 1_500;

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'waiting' | 'paused' | 'stopped';

/** One event off the wire: `type` names it, the rest is its payload. */
export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

/** Which room an event came from — `user:<id>` for your own channel. */
export type RealtimeListener = (event: RealtimeEvent, room: string) => void;

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface RealtimeClientOptions {
  /** the API's http(s) origin; turned into ws(s) */
  baseUrl: string;
  /** a fresh single-use ticket, or null when it could not be had (offline, signed out) */
  fetchTicket: () => Promise<string | null>;
  WebSocketImpl?: WebSocketCtor;
  /** first reconnect delay; doubles each failed attempt */
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** open this long before a drop counts as a new run of failures */
  stableAfterMs?: number;
  /**
   * After a 4001 (a sixth connection somewhere pushed this one off): wait at
   * least this long, or two clients of the same person take turns pushing each
   * other off for ever. The browser waits the same 30 s.
   */
  takeoverCooldownMs?: number;
  /** jitter in [0, 1); injectable so tests are deterministic */
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

interface Frame {
  type?: unknown;
  code?: unknown;
  room?: unknown;
  event?: unknown;
  resumeToken?: unknown;
  resumedRooms?: unknown;
}

export function realtimeUrl(baseUrl: string, ticket: string, resumeToken?: string): string {
  const base = baseUrl.replace(/\/+$/, '').replace(/^http/, 'ws');
  const resume = resumeToken ? `&resume=${encodeURIComponent(resumeToken)}` : '';
  return `${base}/realtime?ticket=${encodeURIComponent(ticket)}${resume}`;
}

/**
 * How long to wait before reconnect attempt `attempt` (1-based): 1 s, 2 s,
 * 4 s … up to the cap, each with up to a third added at random so a server
 * restart is not answered by every phone in the same instant.
 */
export function backoffDelay(attempt: number, initialMs: number, maxMs: number, random: () => number): number {
  const base = Math.min(maxMs, initialMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(base + base * 0.33 * random());
}

export class RealtimeClient {
  private readonly baseUrl: string;
  private readonly fetchTicket: () => Promise<string | null>;
  private readonly WebSocketImpl: WebSocketCtor | undefined;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly stableAfterMs: number;
  private readonly takeoverCooldownMs: number;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly now: () => number;

  private socket: WebSocketLike | null = null;
  private _state: RealtimeState = 'idle';
  #resumeToken: string | undefined;
  /** rooms someone on screen is watching, with how many are watching each */
  private readonly rooms = new Map<string, number>();
  /** rooms the server has us in on the current socket */
  private readonly joined = new Set<string>();
  private readonly listeners = new Set<RealtimeListener>();
  private readonly openListeners = new Set<() => void>();
  private readonly stateListeners = new Set<(state: RealtimeState) => void>();
  private attempt = 0;
  /** when the current connection said hello; null while there is none */
  private openedAt: number | null = null;
  private retryTimer: unknown = null;
  /** bumped whenever the socket being built is abandoned, so a late ticket is dropped */
  private generation = 0;
  private wanted = false;
  private paused = false;
  private takenOver = false;
  /** NOT_INVITED answers per room on this connection, so a refused join is retried a few times and then left */
  private readonly refusals = new Map<string, number>();

  constructor(opts: RealtimeClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.fetchTicket = opts.fetchTicket;
    this.WebSocketImpl = opts.WebSocketImpl ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    this.initialBackoffMs = opts.initialBackoffMs ?? 1_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.stableAfterMs = opts.stableAfterMs ?? 10_000;
    this.takeoverCooldownMs = opts.takeoverCooldownMs ?? 30_000;
    this.random = opts.random ?? Math.random;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.now = opts.now ?? Date.now;
  }

  get state(): RealtimeState {
    return this._state;
  }

  /** Connect, and keep connecting until `stop()`. */
  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.paused = false;
    void this.connect();
  }

  /** Close for good (signed out, provider unmounted). */
  stop(): void {
    this.wanted = false;
    this.teardown();
    this.#resumeToken = undefined;
    this.setState('stopped');
  }

  /**
   * The app went to the background. The socket is closed rather than left for
   * the operating system to kill quietly — a socket iOS froze looks open and
   * delivers nothing, which is the dying listener all over again. The resume
   * token is kept, so coming back rejoins the same rooms.
   */
  pause(): void {
    if (!this.wanted || this.paused) return;
    this.paused = true;
    this.teardown();
    this.setState('paused');
  }

  /** The app is in front again: connect now, without waiting out a backoff. */
  resume(): void {
    if (!this.wanted) return;
    const wasPaused = this.paused;
    this.paused = false;
    if (wasPaused || this._state === 'waiting') {
      this.clearRetry();
      this.attempt = 0;
      // a takeover cooldown still stands: the other connection is still there
      if (this.takenOver && this._state === 'waiting') return;
      void this.connect();
    }
  }

  /** Every event, from every room this connection is in. */
  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Each time a connection is ready (after `hello`), including the first.
   * Whatever happened while the phone was disconnected was not delivered, so a
   * screen that shows live state refetches it here.
   */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onState(listener: (state: RealtimeState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Watch a room for as long as the returned function is not called; counted, so two screens can share one. */
  joinRoom(room: string): () => void {
    const n = this.rooms.get(room) ?? 0;
    this.rooms.set(room, n + 1);
    if (n === 0 && !this.joined.has(room)) this.send({ type: 'join', room });
    let left = false;
    return () => {
      if (left) return;
      left = true;
      const count = (this.rooms.get(room) ?? 1) - 1;
      if (count !== 0) {
        this.rooms.set(room, count);
        return;
      }
      this.rooms.delete(room);
      if (this.joined.delete(room)) this.send({ type: 'leave', room });
    };
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === WS_OPEN && this._state === 'open') {
      try {
        this.socket.send(JSON.stringify(message));
      } catch {
        /* a socket closing under us; the reconnect re-sends what matters */
      }
    }
  }

  private setState(state: RealtimeState): void {
    if (this._state === state) return;
    this._state = state;
    for (const l of [...this.stateListeners]) l(state);
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Drop the current socket (and any being built) without scheduling anything. */
  private teardown(): void {
    this.clearRetry();
    this.generation += 1;
    const socket = this.socket;
    this.socket = null;
    this.joined.clear();
    this.refusals.clear();
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close(1000, 'client closing');
      } catch {
        /* already closed */
      }
    }
  }

  private async connect(): Promise<void> {
    if (!this.wanted || this.paused) return;
    const Ctor = this.WebSocketImpl;
    if (!Ctor) return;
    this.teardown();
    const generation = this.generation;
    this.setState('connecting');
    let ticket: string | null = null;
    try {
      ticket = await this.fetchTicket();
    } catch {
      ticket = null;
    }
    if (generation !== this.generation || !this.wanted || this.paused) return;
    if (!ticket) {
      this.scheduleReconnect();
      return;
    }
    let socket: WebSocketLike;
    try {
      socket = new Ctor(realtimeUrl(this.baseUrl, ticket, this.#resumeToken));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onmessage = (ev) => this.onFrame(ev.data);
    socket.onerror = () => {
      /* the close that follows decides what happens */
    };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.joined.clear();
      if (ev?.code === CLOSE_CONNECTED_ELSEWHERE) this.takenOver = true;
      // a ticket refused is a ticket expired on the way, not a reason to give up
      if (ev?.code === CLOSE_BAD_TICKET) this.#resumeToken = undefined;
      if (this.openedAt !== null && this.now() - this.openedAt >= this.stableAfterMs) this.attempt = 0;
      this.openedAt = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.wanted || this.paused) return;
    this.clearRetry();
    this.attempt += 1;
    let delay = backoffDelay(this.attempt, this.initialBackoffMs, this.maxBackoffMs, this.random);
    if (this.takenOver) delay = Math.max(delay, this.takeoverCooldownMs);
    this.setState('waiting');
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.takenOver = false;
      void this.connect();
    }, delay);
  }

  private onFrame(data: unknown): void {
    let frame: Frame;
    try {
      frame = JSON.parse(String(data)) as Frame;
    } catch {
      return;
    }
    if (!frame || typeof frame !== 'object') return;
    if (frame.type === 'hello') {
      this.#resumeToken = typeof frame.resumeToken === 'string' ? frame.resumeToken : undefined;
      this.openedAt = this.now();
      this.takenOver = false;
      this.setState('open');
      const resumed = Array.isArray(frame.resumedRooms) ? frame.resumedRooms.filter((r): r is string => typeof r === 'string') : [];
      for (const room of resumed) {
        if (this.rooms.has(room)) this.joined.add(room);
        // a room nobody watches any more came back with the resume: leave it
        else this.send({ type: 'leave', room });
      }
      for (const room of this.rooms.keys()) {
        if (!this.joined.has(room)) this.send({ type: 'join', room });
      }
      for (const l of [...this.openListeners]) l();
      return;
    }
    if (frame.type === 'joined' && typeof frame.room === 'string') {
      if (this.rooms.has(frame.room)) this.joined.add(frame.room);
      return;
    }
    /*
     * A room is joined only after the feature has let us in, and the group
     * chat lets you in when it hands you the history — which a screen asks
     * for at the same moment it asks to watch the room. So the first join can
     * arrive before the permission; it is asked again a little later, a few
     * times, and then left alone (somebody removed from a group stays out).
     */
    if (frame.type === 'error' && frame.code === 'NOT_INVITED' && typeof frame.room === 'string') {
      const room = frame.room;
      const refused = (this.refusals.get(room) ?? 0) + 1;
      this.refusals.set(room, refused);
      if (refused > ROOM_JOIN_RETRIES || !this.rooms.has(room)) return;
      const generation = this.generation;
      this.setTimer(() => {
        if (generation === this.generation && this.rooms.has(room) && !this.joined.has(room)) this.send({ type: 'join', room });
      }, ROOM_JOIN_RETRY_MS * refused);
      return;
    }
    if (frame.type === 'event' && frame.event && typeof frame.event === 'object') {
      const event = frame.event as RealtimeEvent;
      if (typeof event.type !== 'string') return;
      const room = typeof frame.room === 'string' ? frame.room : '';
      for (const l of [...this.listeners]) {
        try {
          l(event, room);
        } catch {
          /* one screen's bug must not stop the others hearing it */
        }
      }
    }
  }
}
