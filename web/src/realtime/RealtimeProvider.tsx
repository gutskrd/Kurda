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
 */
interface RealtimeContextValue {
  state: RealtimeState;
  /** Subscribe to a specific event type; returns an unsubscribe function. */
  onEvent: (type: string, handler: (envelope: RealtimeEventEnvelope) => void) => () => void;
}

const RealtimeCtx = createContext<RealtimeContextValue | null>(null);

type EventHandler = (envelope: RealtimeEventEnvelope) => void;

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
  // one Set of handlers per event type, stable across renders
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

    const bc = 'BroadcastChannel' in globalThis ? new BroadcastChannel('mykurda-realtime') : null;

    // leader: our socket's events → local subscribers + other tabs
    const offEvent = rc.on('event', (env) => {
      deliver(env);
      bc?.postMessage({ k: 'event', env });
    });
    const offState = rc.on('state', (s) => {
      setState(s);
      bc?.postMessage({ k: 'state', s });
    });
    // follower: receive from whichever tab owns the socket
    if (bc) {
      bc.onmessage = (m: MessageEvent) => {
        const d = m.data as { k?: string; env?: RealtimeEventEnvelope; s?: RealtimeState };
        if (d?.k === 'event' && d.env) deliver(d.env);
        else if (d?.k === 'state' && d.s) setState(d.s);
      };
    }

    // tab leadership: only the Web Lock holder connects the socket
    let cancelled = false;
    let releaseLock: (() => void) | undefined;
    const locks = (navigator as { locks?: LockManager }).locks;
    if (locks?.request) {
      const held = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      void locks.request('mykurda-realtime', { mode: 'exclusive' }, async () => {
        if (cancelled) return;
        rc.connect();
        await held; // hold the lock (stay leader) until cleanup
      });
    } else {
      rc.connect();
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
      if (!injectedClient) rc.destroy();
      setState('idle');
    };
  }, [status, api, injectedClient, deliver]);

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
    }),
    [state],
  );

  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

function useRealtimeCtx(): RealtimeContextValue {
  const ctx = useContext(RealtimeCtx);
  if (!ctx) throw new Error('useRealtime must be used within a RealtimeProvider');
  return ctx;
}

/** Current realtime connection state (for a subtle indicator, if wanted). */
export function useRealtime(): { state: RealtimeState } {
  const { state } = useRealtimeCtx();
  return { state };
}

/**
 * Subscribe to realtime events of one type (e.g. 'dm', 'challenge_invite').
 * The handler must be stable or wrapped in useCallback by the caller if it
 * closes over changing values; here we re-subscribe whenever it changes.
 */
export function useRealtimeEvent(type: string, handler: (envelope: RealtimeEventEnvelope) => void): void {
  const { onEvent } = useRealtimeCtx();
  useEffect(() => onEvent(type, handler), [onEvent, type, handler]);
}
