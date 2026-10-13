import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { RealtimeClient, type RealtimeListener, type RealtimeState } from './RealtimeClient';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/**
 * The app's one realtime connection, for everything that listens: your own
 * channel (invites, gifts, direct messages), and any room a screen is looking
 * at (a group chat). Mounted once, above the signed-in screens.
 *
 * It follows the app: closed when the app goes to the background — iOS
 * freezes a background socket without closing it, and a frozen socket that
 * looks open is how the old listener went deaf — and opened again, with the
 * same rooms, as soon as the app is back in front.
 *
 * Every hook below works without it too (they do nothing), so a screen can be
 * rendered on its own in a test or before sign-in finishes.
 */
export function RealtimeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, baseUrl, status } = useAuth();
  const [realtime, setRealtime] = useState<RealtimeClient | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const rt = new RealtimeClient({
      baseUrl,
      fetchTicket: async () => {
        const res = await client.post<{ ticket: string }>('/realtime/ticket');
        return res.ok ? res.data.ticket : null;
      },
    });
    rt.start();
    setRealtime(rt);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') rt.resume();
      else if (next === 'background') rt.pause();
    });
    return () => {
      sub.remove();
      rt.stop();
      setRealtime(null);
    };
  }, [client, baseUrl, status]);

  return <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;
}

/** The connection itself, or null outside the provider / before sign-in. */
export function useRealtime(): RealtimeClient | null {
  return useContext(RealtimeContext);
}

/**
 * Every event the connection receives, with the room it came from.
 *
 * The handler is held in a ref, so a screen may pass a fresh closure on each
 * render without unsubscribing and resubscribing (and missing what arrived in
 * between).
 */
export function useRealtimeListener(onEvent: RealtimeListener): void {
  const realtime = useRealtime();
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event, room) => handler.current(event, room));
  }, [realtime]);
}

/**
 * Called each time the connection is ready, including the first time. Events
 * sent while the phone was offline or in the background were not delivered;
 * a screen showing live state refetches it here.
 */
export function useRealtimeReconnect(onOpen: () => void): void {
  const realtime = useRealtime();
  const handler = useRef(onOpen);
  handler.current = onOpen;
  useEffect(() => {
    if (!realtime) return;
    return realtime.onOpen(() => handler.current());
  }, [realtime]);
}

/** Watch a room while mounted (null watches nothing). Shared and counted, so two screens can watch one room. */
export function useRealtimeRoom(room: string | null): void {
  const realtime = useRealtime();
  useEffect(() => {
    if (!realtime || !room) return;
    return realtime.joinRoom(room);
  }, [realtime, room]);
}

/** Where the connection is, for a screen that wants to say "reconnecting". */
export function useRealtimeState(): RealtimeState {
  const realtime = useRealtime();
  const [state, setState] = useState<RealtimeState>(realtime?.state ?? 'idle');
  useEffect(() => {
    if (!realtime) return;
    setState(realtime.state);
    return realtime.onState(setState);
  }, [realtime]);
  return state;
}
