import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * Events from one room, for a screen that is looking at it.
 *
 * The user channel ([[useUserEvents]]) arrives on its own because the gateway
 * auto-joins it; a room has to be asked for. `useGameSocket` has done this for a
 * game room since KUR-054 — this is the same three lines with the game logic
 * taken out, so anything else that watches a room does not have to open its own.
 *
 * The group thread is the reason it exists: it had no socket at all, so a reply
 * to a group message never appeared until you left the screen and came back.
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

/** One event off the wire. `type` is the discriminator; the rest is the payload. */
export interface RoomEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Join `room` for as long as the caller is mounted, and forward its events.
 *
 * The handler is held in a ref, so a screen may pass a fresh closure on every
 * render without tearing the socket down and rejoining — which would drop
 * whatever arrived in between.
 */
export function useRoomEvents(room: string, onEvent: (event: RoomEvent) => void): void {
  const { client, baseUrl } = useAuth();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const Ctor = (globalThis as { WebSocket?: SocketCtor }).WebSocket;
    if (!Ctor) return;
    let closed = false;
    let socket: SocketLike | null = null;

    void (async () => {
      const ticketRes = await client.post<{ ticket: string }>('/realtime/ticket');
      if (closed || !ticketRes.ok) return;
      const ws = new Ctor(wsUrl(baseUrl, ticketRes.data.ticket));
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room }));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type?: string; event?: RoomEvent };
          if (msg.type === 'event' && msg.event && typeof msg.event.type === 'string') {
            handlerRef.current(msg.event);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    })();

    return () => {
      closed = true;
      socket?.close();
    };
  }, [client, baseUrl, room]);
}
