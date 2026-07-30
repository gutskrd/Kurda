import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

/** Challenge events pushed on the user channel (KUR-088). */
export interface ChallengeEvent {
  type: 'challenge_invite' | 'challenge_accepted' | 'challenge_declined' | 'challenge_cancelled';
  from?: string;
  by?: string;
  roomId?: string;
}

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

/**
 * Opens the realtime socket and forwards challenge events (KUR-088). The gateway
 * auto-joins each connection to its `user:{id}` channel, so invites, accepts,
 * declines and cancels arrive here without any room join.
 */
export function useChallengeSocket(onEvent: (event: ChallengeEvent) => void): void {
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
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { type: string; event?: ChallengeEvent };
          if (msg.type === 'event' && msg.event && msg.event.type?.startsWith('challenge_')) {
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
  }, [client, baseUrl]);
}
