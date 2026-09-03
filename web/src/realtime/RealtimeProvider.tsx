import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { API_URL } from '../lib/config';
import { RealtimeClient } from './RealtimeClient';
import type { RealtimeEventEnvelope, RealtimeState } from './events';

/**
 * App-wide realtime context. Connects the RealtimeClient once the user is signed
 * in and tears it down on logout. Cross-tab safe: only the tab holding the
 * `mykurda-realtime` Web Lock opens the socket (one connection per browser); it
 * fans events out to the other tabs over a BroadcastChannel, so every tab's
 * subscribers receive events regardless of which one owns the socket. Falls back
 * to a per-tab connection where Web Locks are unavailable (the client's 4001
 * cooldown keeps two instances from warring).
 *
 * Rooms (beyond the auto-joined `user:<id>`) are joined through the leader's one
 * socket. Each tab announces the set of rooms it wants; the leader joins the
 * union and leaves rooms no tab wants any more. Tabs re-announce on a `hello`, so
 * a newly-elected leader (or a fresh tab) reconciles to the correct union.
 */
interface RealtimeContextValue {
  state: RealtimeState;
  /** Subscribe to a specific event type; returns an unsubscribe function. */
  onEvent: (type: string, handler: (envelope: RealtimeEventEnvelope) => void) => () => void;
  /** Ref-counted room join for this tab; returns a matching leave. */
  joinRoom: (room: string) => () => void;
  /** Send a client message out the leader's socket (routed cross-tab if needed). */
  send: (message: Record<string, unknown>) => void;
}

const RealtimeCtx = createContext<RealtimeContextValue | null>(null);

type EventHandler = (envelope: RealtimeEventEnvelope) => void;

/** BroadcastChannel message shapes for cross-tab coordination. */
type BcMessage =
  | { k: 'event'; env: RealtimeEventEnvelope }
  | { k: 'state'; s: RealtimeState }
  | { k: 'rooms'; tabId: string; rooms: string[] }
  | { k: 'send'; msg: Record<string, unknown> }
  | { k: 'hello' };

export function RealtimeProvider({
  children,
  client: injectedClient,
}: {
  children: ReactNode;
  /** Injectable for tests. */
  client?: RealtimeClient;
}): React.JSX.Element {
  const { client: api, status } = useAuth();
  const [state, setState] = useState<RealtimeState>('idle');

  // --- event subscribers (stable across renders) ---
  const handlers = useRef<Map<string, Set<EventHandler>>>(new Map());
  const deliver = useRef((env: RealtimeEventEnvelope) => {
    const set = handlers.current.get(env.event.type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(env);
      } catch {
        /* a subscriber throwing must not break delivery */
      }
    }
  }).current;

  // --- room coordination state (survives effect re-runs) ---
  const tabId = useRef(Math.random().toString(36).slice(2)).current;
  const clientRef = useRef<RealtimeClient | null>(null);
  const isLeaderRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const myRoomCounts = useRef<Map<string, number>>(new Map()); // this tab's ref-counts
  const peerRooms = useRef<Map<string, Set<string>>>(new Map()); // tabId → rooms
  const leaderJoined = useRef<Set<string>>(new Set()); // what the socket is joined to

  // Union of every tab's desired rooms.
  const roomUnion = useRef(() => {
    const union = new Set<string>();
    for (const [room, n] of myRoomCounts.current) if (n > 0) union.add(room);
    for (const rooms of peerRooms.current.values()) for (const r of rooms) union.add(r);
    return union;
  }).current;

  // Leader-only: make the socket's joined rooms match the union.
  const reconcile = useRef(() => {
    if (!isLeaderRef.current) return;
    const rc = clientRef.current;
    if (!rc) return;
    const want = roomUnion();
    for (const room of want) if (!leaderJoined.current.has(room)) rc.join(room);
    for (const room of [...leaderJoined.current]) if (!want.has(room)) rc.leave(room);
    leaderJoined.current = want;
  }).current;

  const announce = useRef(() => {
    const mine = [...myRoomCounts.current.entries()].filter(([, n]) => n > 0).map(([r]) => r);
    bcRef.current?.postMessage({ k: 'rooms', tabId, rooms: mine } satisfies BcMessage);
  }).current;

  // send a client message out the one socket: directly if we're the leader,
  // otherwise ask the leader tab to send it on our behalf.
  const sendMessage = useRef((msg: Record<string, unknown>) => {
    if (isLeaderRef.current) clientRef.current?.send(msg);
    else bcRef.current?.postMessage({ k: 'send', msg } satisfies BcMessage);
  }).current;

  useEffect(() => {
    if (status !== 'signedIn') return;

    const rc =
      injectedClient ??
      new RealtimeClient({
        url: API_URL,
        fetchTicket: async () => {
          const r = await api.post<{ ticket: string }>('/realtime/ticket');
          return r.ok ? { ok: true as const, ticket: r.data.ticket } : { ok: false as const };
        },
        onDiagnostic: import.meta.env.DEV ? (d) => console.debug('[realtime]', d.category) : undefined,
      });
    clientRef.current = rc;

    const bc = 'BroadcastChannel' in globalThis ? new BroadcastChannel('mykurda-realtime') : null;
    bcRef.current = bc;

    // leader: our socket's events/state → local subscribers + other tabs.
    // Re-reconcile on every 'open' so rooms are (re)joined after a reconnect.
    const offEvent = rc.on('event', (env) => {
      deliver(env);
      bc?.postMessage({ k: 'event', env } satisfies BcMessage);
    });
    const offState = rc.on('state', (s) => {
      setState(s);
      bc?.postMessage({ k: 'state', s } satisfies BcMessage);
      if (s === 'open') {
        leaderJoined.current = new Set(); // a fresh socket starts in no rooms
        reconcile();
      }
    });
    if (bc) {
      bc.onmessage = (m: MessageEvent) => {
        const d = m.data as BcMessage;
        if (d?.k === 'event') deliver(d.env);
        else if (d?.k === 'state') setState(d.s);
        else if (d?.k === 'rooms') {
          if (d.tabId === tabId) return;
          peerRooms.current.set(d.tabId, new Set(d.rooms));
          reconcile();
        } else if (d?.k === 'send') {
          if (isLeaderRef.current) clientRef.current?.send(d.msg); // only the socket-owner sends
        } else if (d?.k === 'hello') {
          announce(); // a new/late tab appeared — re-assert our rooms so it reconciles
        }
      };
      bc.postMessage({ k: 'hello' } satisfies BcMessage); // ask peers to re-announce
    }

    // tab leadership: only the Web Lock holder connects the socket
    let cancelled = false;
    let releaseLock: (() => void) | undefined;
    const locks = (navigator as { locks?: LockManager }).locks;
    const becomeLeader = (): void => {
      isLeaderRef.current = true;
      leaderJoined.current = new Set();
      rc.connect();
      reconcile(); // join rooms wanted before we were elected (applied on 'open')
    };
    if (locks?.request) {
      const held = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      void locks.request('mykurda-realtime', { mode: 'exclusive' }, async () => {
        if (cancelled) return;
        becomeLeader();
        await held; // hold the lock (stay leader) until cleanup
      });
    } else {
      becomeLeader();
    }

    return () => {
      cancelled = true;
      offEvent();
      offState();
      releaseLock?.();
      if (bc) {
        bc.onmessage = null;
        bc.close();
      }
      bcRef.current = null;
      isLeaderRef.current = false;
      if (!injectedClient) rc.destroy();
      clientRef.current = null;
      leaderJoined.current = new Set();
      setState('idle');
    };
  }, [status, api, injectedClient, deliver, reconcile, announce, tabId]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      state,
      onEvent: (type, handler) => {
        let set = handlers.current.get(type);
        if (!set) {
          set = new Set();
          handlers.current.set(type, set);
        }
        set.add(handler);
        return () => {
          set?.delete(handler);
        };
      },
      joinRoom: (room) => {
        const counts = myRoomCounts.current;
        counts.set(room, (counts.get(room) ?? 0) + 1);
        if (counts.get(room) === 1) {
          reconcile();
          announce();
        }
        return () => {
          const n = (counts.get(room) ?? 0) - 1;
          if (n <= 0) {
            counts.delete(room);
            reconcile();
            announce();
          } else {
            counts.set(room, n);
          }
        };
      },
      send: sendMessage,
    }),
    [state, reconcile, announce, sendMessage],
  );

  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

/**
 * Current realtime connection state (for a subtle indicator, if wanted).
 * Degrades to 'idle' when no provider is mounted (e.g. in isolated unit tests),
 * so consumers never crash for lack of realtime.
 */
export function useRealtime(): { state: RealtimeState } {
  const ctx = useContext(RealtimeCtx);
  return { state: ctx?.state ?? 'idle' };
}

/**
 * Subscribe to realtime events of one type (e.g. 'dm', 'group_msg').
 * The handler must be stable or wrapped in useCallback by the caller if it
 * closes over changing values; here we re-subscribe whenever it changes.
 * A no-op when no provider is mounted, so features degrade gracefully.
 */
export function useRealtimeEvent(type: string, handler: (envelope: RealtimeEventEnvelope) => void): void {
  const ctx = useContext(RealtimeCtx);
  useEffect(() => {
    if (!ctx) return;
    return ctx.onEvent(type, handler);
  }, [ctx, type, handler]);
}

/**
 * Keep a room joined for as long as the calling component is mounted (e.g. a
 * group chat channel). Ref-counted and cross-tab safe. No-op without a provider.
 */
export function useRealtimeRoom(room: string | null | undefined): void {
  const ctx = useContext(RealtimeCtx);
  useEffect(() => {
    if (!ctx || !room) return;
    return ctx.joinRoom(room);
  }, [ctx, room]);
}

/**
 * Returns a function to send a client message out the realtime socket (e.g. a
 * game's `ready` / `answer`). Routed through the leader tab. No-op without a
 * provider, so callers stay unit-testable.
 */
export function useRealtimeSend(): (message: Record<string, unknown>) => void {
  const ctx = useContext(RealtimeCtx);
  return ctx?.send ?? (() => undefined);
}
