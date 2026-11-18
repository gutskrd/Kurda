/**
 * The phone's single realtime connection, which reconnects by itself after a dropped network, a server restart or
 * time in the background.
 *
 * Protocol (api/src/realtime/gateway.ts): POST /realtime/ticket for a single-use 30 s ticket, open
 * `ws(s)://…/realtime?ticket=…` (never the JWT), receive `hello` with a resume token, then `{type:'event', room,
 * event}` frames. Reconnecting with `&resume=` rejoins the same rooms; any room the resume did not restore is
 * joined again by name. The server pings at the protocol level and React Native answers, so there is no heartbeat
 * here.
 *
 * Plain TypeScript, so tests drive it with a fake socket and timers; the provider owns the instance. The ticket
 * and resume token stay in memory only and are never logged.
 */

const WS_OPEN = 1;

/** The gateway's close codes (api/src/realtime/gateway.ts). */
export const CLOSE_CONNECTED_ELSEWHERE = 4001;
export const CLOSE_BAD_TICKET = 4003;

/** A join refused before the feature admitted us is retried this many times, at growing intervals. */
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
  /** The API's http(s) origin; turned into ws(s). */
  baseUrl: string;
  /** A fresh single-use ticket, or null when it could not be had (offline, signed out). */
  fetchTicket: () => Promise<string | null>;
  WebSocketImpl?: WebSocketCtor;
  /** First reconnect delay; doubles each failed attempt. */
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /** Open this long before a drop counts as a new run of failures. */
  stableAfterMs?: number;
  /**
   * After a 4001 (another connection pushed this one off), wait at least this long, or two clients of the same
   * person take turns pushing each other off. The web app waits the same 30 s.
   */
  takeoverCooldownMs?: number;
  /** Jitter in [0, 1); injectable so tests are deterministic. */
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
 * The delay before reconnect attempt `attempt` (1-based): 1 s, 2 s, 4 s… up to the cap, plus up to a third at
 * random so phones do not all reconnect at once after a restart.
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
  /** Rooms someone on screen is watching, with how many are watching each. */
  private readonly rooms = new Map<string, number>();
  /** Rooms the server has us in on the current socket. */
  private readonly joined = new Set<string>();
  private readonly listeners = new Set<RealtimeListener>();
  private readonly openListeners = new Set<() => void>();
  private readonly stateListeners = new Set<(state: RealtimeState) => void>();
  private attempt = 0;
  /** When the current connection said hello; null while there is none. */
  private openedAt: number | null = null;
  private retryTimer: unknown = null;
  /** Bumped whenever the socket being built is abandoned, so a late ticket is dropped. */
  private generation = 0;
  private wanted = false;
  private paused = false;
  private takenOver = false;
  /** When a takeover cooldown ends; only meaningful while `takenOver`. */
  private cooldownUntil = 0;
  /** NOT_INVITED answers per room on this connection, so a refused join is retried a few times and then dropped. */
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
   * The app went to the background. Close the socket rather than leave it for the OS: a socket iOS froze looks
   * open and delivers nothing. The resume token is kept, so returning rejoins the same rooms.
   */
  pause(): void {
    if (!this.wanted || this.paused) return;
    this.paused = true;
    this.teardown();
    this.setState('paused');
  }

  /**
   * The app is in the foreground again: connect now without waiting out a backoff, unless a takeover cooldown
   * still applies, in which case its timer is kept (or re-armed for what is left after the background). iOS calls
   * this after every Control Centre swipe or Face ID prompt, so it must never leave the client with nothing
   * scheduled.
   */
  resume(): void {
    if (!this.wanted) return;
    const wasPaused = this.paused;
    this.paused = false;
    if (!wasPaused && this._state !== 'waiting') return;
    const cooldownLeft = this.takenOver ? this.cooldownUntil - this.now() : 0;
    if (cooldownLeft > 0) {
      if (this.retryTimer !== null) return;
      this.attempt = 0;
      this.setState('waiting');
      this.retryTimer = this.setTimer(() => this.retryNow(), cooldownLeft);
      return;
    }
    this.clearRetry();
    this.attempt = 0;
    this.takenOver = false;
    void this.connect();
  }

  /** Every event, from every room this connection is in. */
  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Called each time a connection is ready (after `hello`), including the first. Nothing is delivered while
   * disconnected, so screens with live state refetch here.
   */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onState(listener: (state: RealtimeState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Watch a room until the returned function is called; reference-counted, so two screens can share one. */
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
        /* A socket closing under us; the reconnect re-sends what matters. */
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
      /* The close that follows decides what happens. */
    };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.joined.clear();
      if (ev?.code === CLOSE_CONNECTED_ELSEWHERE) this.takenOver = true;
      // A ticket refused is a ticket expired on the way, not a reason to give up.
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
    if (this.takenOver) {
      delay = Math.max(delay, this.takeoverCooldownMs);
      this.cooldownUntil = this.now() + delay;
    }
    this.setState('waiting');
    this.retryTimer = this.setTimer(() => this.retryNow(), delay);
  }

  private retryNow(): void {
    this.retryTimer = null;
    this.takenOver = false;
    void this.connect();
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
        // A room nobody watches any more came back with the resume: leave it.
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
     * A room is joined only once the feature admits us, and the group chat admits you when it returns the
     * history, which a screen requests at the same moment it watches the room. So the first join can arrive
     * before the permission; it is retried a few times and then dropped (someone removed from a group stays out).
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
          /* One screen's bug must not stop the others hearing it. */
        }
      }
    }
  }
}
