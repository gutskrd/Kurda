import {
  CLOSE_CONNECTED_ELSEWHERE,
  CLOSE_NORMAL,
  type HelloInfo,
  type RealtimeCloseInfo,
  type RealtimeEvent,
  type RealtimeEventEnvelope,
  type RealtimeProtocolError,
  type RealtimeState,
} from './events';

/**
 * Framework-agnostic realtime client for the MyKurda gateway.
 *
 * Protocol (see api/src/realtime/gateway.ts): fetch a single-use ticket over the
 * bearer-authed API, open `wss://…/realtime?ticket=…` (never the JWT), receive
 * `hello` with a resume token, then receive `{type:'event',room,event}` frames.
 * The server pings at the protocol level (the browser auto-pongs), so there is
 * no application heartbeat here. One socket per instance; production reconnect
 * with exponential backoff + jitter. Phase B only transports events — no feature
 * logic, no React.
 *
 * Security: the ticket and resume token are held in memory only, never logged,
 * never persisted, never exposed publicly. Diagnostics carry safe metadata only.
 */

/** Result of fetching a realtime ticket (reuses the bearer-authed API client). */
export type TicketResult = { ok: true; ticket: string } | { ok: false };

/** Safe, credential-free diagnostic signal (for dev logging / tests). */
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
export interface WebSocketCtor {
  new (url: string): WebSocketLike;
}

export interface RealtimeClientOptions {
  /** HTTP(S) base URL of the API (from web/src/lib/config.ts); converted to ws(s). */
  url: string;
  /** Fetches a fresh single-use ticket. Reuses the existing API client's auth. */
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
  /** Optional credential-free diagnostics sink (dev logging / tests). */
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
  /**
   * In-memory only — never persisted, never logged, never exposed. A true
   * ECMAScript private field (#) so it is non-enumerable and never serialized
   * (e.g. by an accidental JSON.stringify of the client).
   */
  #resumeToken?: string;
  private _resumedRooms: string[] = [];

  private shouldReconnect = false;
  private destroyed = false;
  private online = true;
  private attempt = 0;
  private pendingTakeover = false;
  /** invalidates in-flight ticket fetches when the target socket is abandoned */
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

  // ---- public API --------------------------------------------------------

  get state(): RealtimeState {
    return this._state;
  }

  /** Rooms the server rejoined on the last resume (from `hello`). */
  get resumedRooms(): readonly string[] {
    return this._resumedRooms;
  }

  /** Begin connecting (idempotent while already active). */
  connect(): void {
    if (this.destroyed) return;
    if (this._state !== 'idle' && this._state !== 'closed') return; // already active
    this.shouldReconnect = true;
    this.attempt = 0;
    this.pendingTakeover = false;
    void this.openSocket(true);
  }

  /** Intentional close; will not auto-reconnect. Safe to call repeatedly. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearTimers();
    this.generation++; // abandon any in-flight ticket fetch
    if (this.socket) {
      try {
        this.socket.close(CLOSE_NORMAL, 'client disconnect');
      } catch {
        /* already closing */
      }
      // onclose will settle the state to 'closed'
    } else if (this._state !== 'idle') {
      this.setState('closed');
    }
  }

  /** Permanently tear down: disconnect + remove listeners. Safe to call repeatedly. */
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

  /** Subscribe to an event; returns an unsubscribe function. */
  on<K extends EventName>(type: K, handler: ListenerMap[K]): () => void {
    this.listeners[type].add(handler);
    return () => {
      this.listeners[type].delete(handler);
    };
  }

  // ---- connection lifecycle ---------------------------------------------

  private async openSocket(isFirst: boolean): Promise<void> {
    if (this.destroyed || !this.shouldReconnect) return;
    if (this.socket) return; // single-socket invariant
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
    // abandoned (disconnected/destroyed) or superseded while awaiting
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
      // a close event follows; reconnection is handled there
    };
  }

  private onOpen(): void {
    this.setState('open');
    this.pendingTakeover = false;
    this.clearStableTimer();
    // reset backoff only after the connection proves stable (avoids 1s-flap loops)
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
      // newest-wins: back off hard so two instances don't war (Phase C: leadership)
      this.pendingTakeover = true;
      this.diag({ category: 'takeover' });
    }
    // code 4003 (bad/used ticket) needs no special handling: every attempt
    // fetches a brand-new ticket, so we simply reconnect.
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.shouldReconnect) {
      this.diag({ category: 'reconnect-suppressed', reason: this.destroyed ? 'destroyed' : 'intentional' });
      return;
    }
    this.setState('reconnecting');
    if (!this.online) {
      // the 'online' handler resumes; don't burn attempts while offline
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

  /** Exponential backoff (base = initial·2^attempt, capped) with 50–100% jitter. */
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

  // ---- message handling --------------------------------------------------

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
        // kept in memory only; never logged/persisted/exposed
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
      // pong / joined / left are transport plumbing; unknown types ignored safely
      default:
        return;
    }
  }

  // ---- browser lifecycle -------------------------------------------------

  private readonly handleOnline = (): void => {
    this.online = true;
    if (this.destroyed || !this.shouldReconnect) return;
    if (this.socket) return; // already connected/connecting
    this.clearReconnectTimer();
    void this.openSocket(false);
  };

  private readonly handleOffline = (): void => {
    this.online = false;
    // stop trying while offline; a live socket will drop on its own and be
    // handled by onClose (which then waits for 'online')
    this.clearReconnectTimer();
  };

  private readonly handleVisibility = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (this.destroyed || !this.shouldReconnect || !this.online) return;
    if (this.socket) return;
    this.clearReconnectTimer();
    void this.openSocket(false);
  };

  // ---- emitter -----------------------------------------------------------

  private emit<K extends EventName>(type: K, payload: Parameters<ListenerMap[K]>[0]): void {
    if (this.destroyed) return;
    // snapshot so a handler that (un)subscribes mid-emit is safe
    for (const handler of [...this.listeners[type]]) {
      try {
        (handler as (arg: typeof payload) => void)(payload);
      } catch {
        // a throwing consumer must never break the client or other handlers
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

  // ---- timers ------------------------------------------------------------

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
