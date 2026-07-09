import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { GameEvent } from './events';
import { initGameState, reduce } from './reducer';

/**
 * Realtime 1v1 game socket (KUR-054). Fetches a ticket, opens the WebSocket,
 * joins + readies the room, and feeds server events into the pure reducer.
 * Uses the platform WebSocket (present on RN and Expo web); the game logic
 * lives in the reducer, so this hook stays thin.
 */
interface SocketLike {
  send: (data: string) => void;
  close: () => void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}
type SocketCtor = new (url: string) => SocketLike;

function wsUrl(baseUrl: string, ticket: string): string {
  return `${baseUrl.replace(/^http/, 'ws')}/realtime?ticket=${encodeURIComponent(ticket)}`;
}

export function useGameSocket(roomId: string, selfId: string) {
  const { client, baseUrl } = useAuth();
  const [state, dispatch] = useReducer(reduce, selfId, initGameState);
  const socketRef = useRef<SocketLike | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    const Ctor = (globalThis as { WebSocket?: SocketCtor }).WebSocket;
    if (!Ctor) return;
    let closed = false;

    void (async () => {
      const ticketRes = await client.post<{ ticket: string }>('/realtime/ticket');
      if (closed || !ticketRes.ok) return;
      const ws = new Ctor(wsUrl(baseUrl, ticketRes.data.ticket));
      socketRef.current = ws;

      ws.onopen = () => {
        connectedRef.current = true;
        ws.send(JSON.stringify({ type: 'join', room: roomId }));
        ws.send(JSON.stringify({ type: 'ready', room: roomId }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type: string; event?: GameEvent };
          if (msg.type === 'event' && msg.event) dispatch({ type: 'server', event: msg.event });
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        connectedRef.current = false;
      };
    })();

    return () => {
      closed = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [client, baseUrl, roomId]);

  const answer = useCallback(
    (index: number, choice: number) => {
      dispatch({ type: 'choose', choice }); // optimistic
      socketRef.current?.send(JSON.stringify({ type: 'answer', room: roomId, index, choice }));
    },
    [roomId],
  );

  /** Leave the match; server counts the absence as a loss (KUR-054 forfeit). */
  const forfeit = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  return { state, answer, forfeit };
}
