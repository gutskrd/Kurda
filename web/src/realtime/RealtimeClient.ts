import {
  CLOSE_CONNECTED_ELSEWHERE,
  CLOSE_NORMAL,
  type ClientMessage,
  type HelloInfo,
  type RealtimeCloseInfo,
  type RealtimeEvent,
  type RealtimeEventEnvelope,
  type RealtimeProtocolError,
  type RealtimeState,
} from './events';

/** WebSocket.OPEN, the numeric readyState for an open socket. */
const WS_OPEN = 1;

/**
 * Framework-agnostic client for the realtime gateway (api/src/realtime/gateway.ts). It fetches a single-use ticket
 * over the authenticated API, opens `wss://…/realtime?ticket=…` (never with the JWT), receives `hello` with a resume
 * token, then `{type:'event',room,event}` frames. The server pings at the protocol level, so there is no app
 * heartbeat. One socket per instance, reconnecting with exponential backoff and jitter.
 *
 * Security: the ticket and resume token live in memory only and are never logged, stored or exposed; diagnostics
 * carry safe metadata only.
 */

/** Result of fetching a realtime ticket. */
type TicketResult = { ok: true; ticket: string } | { ok: false };

/** A credential-free diagnostic signal, for dev logging and tests. */
export type RealtimeDiagnostic =
  | { category: 'state'; state: RealtimeState }
  | { category: 'reconnect-scheduled'; attempt: number; delayMs: number }
  | { category: 'reconnect-suppressed'; reason: 'offline' | 'destroyed' | 'intentional' }
  | { category: 'ticket-failed' }
  | { category: 'takeover' }
  | { category: 'bad-message' }
  | { category: 'socket-error' }
  | { category: 'close'; code: number | undefined; intentional: boolean };

/** Minimal WebSocket surface, so tests can inject a mock. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}
interface WebSocketCtor {
  new (url: string): WebSocketLike;
}

export interface RealtimeClientOptions {
  /** HTTP(S) base URL of the API (from web/src/lib/config.ts); converted to ws(s). */
  url: string;
  /** Fetches a fresh single-use ticket with the API client's auth. */
  fetchTicket: () => Promise<TicketResult>;
  /** Injectable WebSocket constructor; defaults to the global one. */
  WebSocketImpl?: WebSocketCtor;
  /** First reconnect delay (ms). Default 1000. */
  initialBackoffMs?: number;
  /** Reconnect delay cap (ms). Default 30000. */
  maxBackoffMs?: number;
  /** A connection is "stable" (resets backoff) after this long open. Default 10000. */
  stableAfterMs?: number;
  /** Minimum delay after a 4001 takeover, to avoid two-instance wars. Default 30000. */
  takeoverCooldownMs?: number;
  /** Jitter source in [0,1). Injectable for deterministic tests. Default Math.random. */
  random?: () => number;
  /** Optional credential-free diagnostics sink, for dev logging and tests. */
  onDiagnostic?: (info: RealtimeDiagnostic) => void;
}

interface ListenerMap {
  state: (state: RealtimeState) => void;
  event: (envelope: RealtimeEventEnvelope) => void;
  hello: (info: HelloInfo) => void;
  error: (error: RealtimeProtocolError) => void;
  close: (info: RealtimeCloseInfo) => void;
}
type EventName = keyof ListenerMap;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class RealtimeClient {
  private readonly opts: Required<Omit<RealtimeClientOptions, 'onDiagnostic'>> & {
    onDiagnostic?: (info: RealtimeDiagnostic) => void;
  };

  private socket: WebSocketLike | null = null;
  private _state: RealtimeState = 'idle';
  /** In memory only. A true private field (#), so it is never serialized, even by an accidental JSON.stringify. */
  #resumeToken?: string;
  private _resumedRooms: string[] = [];

  /**
   * Rooms the app wants joined beyond the automatic `user:<id>`, re-sent on every open so a reconnect lands back in
   * them. The server authorises each join against its per-room grant.
   */
  private readonly desiredRooms = new Set<string>();

  private shouldReconnect = false;
  private destroyed = false;
  private online = true;
  private attempt = 0;
  private pendingTakeover = false;
  /** Invalidates in-flight ticket fetches when their socket is abandoned. */
  private generation = 0;

  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stableTimer?: ReturnType<typeof setTimeout>;

  private readonly listeners: { [K in EventName]: Set<ListenerMap[K]> } = {
    state: new Set(),
    event: new Set(),
    hello: new Set(),
    error: new Set(),
    close: new Set(),
  };

  constructor(options: RealtimeClientOptions) {
    this.opts = {
      url: options.url,
      fetchTicket: options.fetchTicket,
      WebSocketImpl:
        options.WebSocketImpl ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket!,
      initialBackoffMs: options.initialBackoffMs ?? 1000,
      maxBackoffMs: options.maxBackoffMs ?? 30_000,
      stableAfterMs: options.stableAfterMs ?? 10_000,
      takeoverCooldownMs: options.takeoverCooldownMs ?? 30_000,
      random: options.random ?? Math.random,
      onDiagnostic: options.onDiagnostic,
    };
    this.online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  // ---- Public API ----

  get state(): RealtimeState {
    return this._state;
  }

  /** Rooms the server rejoined on the last resume (from `hello`). */
  get resumedRooms(): readonly string[] {
    return this._resumedRooms;
  }

  /** Begins connecting; idempotent while already active. */
  connect(): void {
    if (this.destroyed) return;
    if (this._state !== 'idle' && this._state !== 'closed') return;
    this.shouldReconnect = true;
    this.attempt = 0;
    this.pendingTakeover = false;
    void this.openSocket(true);
  }

  /** Closes intentionally, without reconnecting. Safe to call repeatedly. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    this.generation++; // Abandon any in-flight ticket fetch.
    if (this.socket) {
      try {
        this.socket.close(CLOSE_NORMAL, 'client disconnect');
      } catch {
        /* Already closing. */
      }
      // onclose settles the state to 'closed'.
    } else if (this._state !== 'idle') {
      this.setState('closed');
    }
  }

  /** Tears down for good: disconnects and removes listeners. Safe to call repeatedly. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    for (const key of Object.keys(this.listeners) as EventName[]) {
      this.listeners[key].clear();
    }
  }

  /**
   * Joins a room, such as `group:<id>`, and rejoins it on every open. The caller must have been granted access
   * server-side first; for group chat, fetching the channel history refreshes the grant.
   */
  join(room: string): void {
    if (this.destroyed) return;
    this.desiredRooms.add(room);
    this.trySend({ type: 'join', room });
  }

  /** Leaves a room and stops rejoining it on reconnect. */
  leave(room: string): void {
    this.desiredRooms.delete(room);
    this.trySend({ type: 'leave', room });
  }

  /** Sends a protocol control message (join or leave) if the socket is open; otherwise it is dropped. */
  private trySend(msg: ClientMessage): void {
    if (this.destroyed || !this.socket || this.socket.readyState !== WS_OPEN) return;
    try {
      this.socket.send(JSON.stringify(msg));
    } catch {
      // A failed send is like one made while closed: the next open rejoins every room.
    }
  }

  /** Subscribes to an event; returns an unsubscribe function. */
  on<K extends EventName>(type: K, handler: ListenerMap[K]): () => void {
    this.listeners[type].add(handler);
    return () => {
      this.listeners[type].delete(handler);
    };
  }

  // ---- Connection lifecycle ----

  private async openSocket(isFirst: boolean): Promise<void> {
    if (this.destroyed || !this.shouldReconnect) return;
    if (this.socket) return; // One socket at a time.
    if (!this.online) {
      this.setState('reconnecting');
      this.diag({ category: 'reconnect-suppressed', reason: 'offline' });
      return;
    }
    this.setState(isFirst ? 'connecting' : 'reconnecting');

    const gen = ++this.generation;
    let ticket: TicketResult;
    try {
      ticket = await this.opts.fetchTicket();
    } catch {
      ticket = { ok: false };
    }
    // Abandoned (disconnected or destroyed) or superseded while awaiting.
    if (this.destroyed || !this.shouldReconnect || gen !== this.generation || this.socket) return;
    if (!ticket.ok) {
      this.diag({ category: 'ticket-failed' });
      this.scheduleReconnect();
      return;
    }

    let ws: WebSocketLike;
    try {
      ws = new this.opts.WebSocketImpl(this.buildUrl(ticket.ticket));
    } catch {
      this.diag({ category: 'socket-error' });
      this.scheduleReconnect();
      return;
    }
    this.socket = ws;

    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.onOpen();
    };
    ws.onmessage = (ev) => {
      if (this.socket !== ws) return;
      this.onMessage(typeof ev.data === 'string' ? ev.data : String(ev.data));
    };
    ws.onclose = (ev) => {
      if (this.socket !== ws) return;
      this.onClose(ev?.code);
    };
    ws.onerror = () => {
      if (this.socket !== ws) return;
      this.diag({ category: 'socket-error' });
      // A close event follows, which handles reconnection.
    };
  }

  private onOpen(): void {
    this.setState('open');
    this.pendingTakeover = false;
    // Rejoin every desired room: a fresh socket starts only in `user:<id>`, and re-sending after a resume is harmless.
    for (const room of this.desiredRooms) this.trySend({ type: 'join', room });
    this.clearStableTimer();
    // Reset backoff only once the connection proves stable, to avoid fast flapping loops.
    this.stableTimer = setTimeout(() => {
      this.attempt = 0;
    }, this.opts.stableAfterMs);
  }

  private onClose(code: number | undefined): void {
    this.clearStableTimer();
    this.socket = null;
    const intentional = !this.shouldReconnect;
    this.emit('close', { code, intentional });
    this.diag({ category: 'close', code, intentional });

    if (intentional || this.destroyed) {
      this.setState('closed');
      return;
    }
    if (code === CLOSE_CONNECTED_ELSEWHERE) {
      // The newest connection wins, so back off hard to keep two instances from fighting.
      this.pendingTakeover = true;
      this.diag({ category: 'takeover' });
    }
    // A bad or used ticket (4003) needs no special case, since every attempt fetches a new ticket.
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.shouldReconnect) {
      this.diag({ category: 'reconnect-suppressed', reason: this.destroyed ? 'destroyed' : 'intentional' });
      return;
    }
    this.setState('reconnecting');
    if (!this.online) {
      // The 'online' handler resumes, so no attempts are spent while offline.
      this.diag({ category: 'reconnect-suppressed', reason: 'offline' });
      return;
    }
    const delay = this.backoffDelay();
    this.attempt++;
    this.diag({ category: 'reconnect-scheduled', attempt: this.attempt, delayMs: delay });
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openSocket(false);
    }, delay);
  }

  /** Exponential backoff (initial·2^attempt, capped) with 50–100% jitter. */
  private backoffDelay(): number {
    const base = Math.min(this.opts.maxBackoffMs, this.opts.initialBackoffMs * 2 ** this.attempt);
    const jittered = base / 2 + this.opts.random() * (base / 2);
    const floor = this.pendingTakeover ? this.opts.takeoverCooldownMs : 0;
    return Math.max(floor, Math.round(jittered));
  }

  private buildUrl(ticket: string): string {
    const wsBase = this.opts.url.replace(/^http/, 'ws').replace(/\/+$/, '');
    let url = `${wsBase}/realtime?ticket=${encodeURIComponent(ticket)}`;
    if (this.#resumeToken) url += `&resume=${encodeURIComponent(this.#resumeToken)}`;
    return url;
  }

  // ---- Message handling ----

  private onMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.diag({ category: 'bad-message' });
      this.emit('error', { code: 'BAD_MESSAGE' });
      return;
    }
    if (!isObject(msg) || typeof msg.type !== 'string') {
      this.diag({ category: 'bad-message' });
      return;
    }

    switch (msg.type) {
      case 'hello': {
        // Kept in memory only; never logged, stored or exposed.
        this.#resumeToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : undefined;
        this._resumedRooms = Array.isArray(msg.resumedRooms)
          ? msg.resumedRooms.filter((r): r is string => typeof r === 'string')
          : [];
        this.emit('hello', { resumedRooms: this._resumedRooms });
        return;
      }
      case 'event': {
        if (typeof msg.room === 'string' && isObject(msg.event) && typeof msg.event.type === 'string') {
          this.emit('event', { room: msg.room, event: msg.event as RealtimeEvent });
        } else {
          this.diag({ category: 'bad-message' });
        }
        return;
      }
      case 'error': {
        this.emit('error', {
          code: typeof msg.code === 'string' ? msg.code : 'UNKNOWN',
          room: typeof msg.room === 'string' ? msg.room : undefined,
        });
        return;
      }
      // pong, joined and left are transport plumbing; unknown types are ignored.
      default:
        return;
    }
  }

  // ---- Browser lifecycle ----

  private readonly handleOnline = (): void => {
    this.online = true;
    if (this.destroyed || !this.shouldReconnect) return;
    if (this.socket) return; // Already connected or connecting.
    this.clearReconnectTimer();
    void this.openSocket(false);
  };

  private readonly handleOffline = (): void => {
    this.online = false;
    // Stop trying while offline; a live socket drops on its own and onClose then waits for 'online'.
    this.clearReconnectTimer();
  };

  private readonly handleVisibility = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (this.destroyed || !this.shouldReconnect || !this.online) return;
    if (this.socket) return;
    this.clearReconnectTimer();
    void this.openSocket(false);
  };

  // ---- Emitter ----

  private emit<K extends EventName>(type: K, payload: Parameters<ListenerMap[K]>[0]): void {
    if (this.destroyed) return;
    // Snapshot, so a handler that subscribes or unsubscribes mid-emit is safe.
    for (const handler of [...this.listeners[type]]) {
      try {
        (handler as (arg: typeof payload) => void)(payload);
      } catch {
        // A throwing consumer must never break the client or other handlers.
      }
    }
  }

  private setState(state: RealtimeState): void {
    if (this._state === state) return;
    this._state = state;
    this.diag({ category: 'state', state });
    this.emit('state', state);
  }

  private diag(info: RealtimeDiagnostic): void {
    this.opts.onDiagnostic?.(info);
  }

  // ---- Timers ----

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private clearStableTimer(): void {
    if (this.stableTimer !== undefined) {
      clearTimeout(this.stableTimer);
      this.stableTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.clearReconnectTimer();
    this.clearStableTimer();
  }
}
