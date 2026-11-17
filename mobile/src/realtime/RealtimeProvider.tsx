import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { RealtimeClient, type RealtimeListener, type RealtimeState } from './RealtimeClient';

const RealtimeContext = createContext<RealtimeClient | null>(null);

/**
 * The app's single realtime connection: your own channel (invites, gifts, direct messages) and any room a screen
 * is showing (a group chat). Mounted once above the signed-in screens. It closes when the app goes to the
 * background, because iOS freezes background sockets without closing them, and reopens with the same rooms in the
 * foreground.
 *
 * The hooks below do nothing without it, so a screen renders alone in a test or before sign-in. Guests get no
 * connection: nobody can message, invite or gift them, and the ticket route refuses guests.
 */
export function RealtimeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, baseUrl, status, isGuest } = useAuth();
  const [realtime, setRealtime] = useState<RealtimeClient | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || isGuest) return;
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
  }, [client, baseUrl, status, isGuest]);

  return <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;
}

/** The connection itself, or null outside the provider / before sign-in. */
export function useRealtime(): RealtimeClient | null {
  return useContext(RealtimeContext);
}

/**
 * Every event the connection receives, with its room. The handler is kept in a ref, so a fresh closure each
 * render does not resubscribe and miss events.
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
 * Called each time the connection is ready, including the first. Events sent while offline or in the background
 * were not delivered, so screens with live state refetch here.
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

/** Watch a room while mounted (null watches nothing); reference-counted, so two screens can watch one room. */
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
