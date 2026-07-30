import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

/** DM events pushed on the user channel (KUR-083). */
export interface ChatEvent {
  type: 'dm' | 'dm_read' | 'dm_typing' | 'dm_delivered';
  from?: string;
  by?: string;
  message?: { id: string; senderId: string; body: string; createdAt: string };
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
 * Opens the realtime socket and forwards DM events (KUR-083). The gateway
 * auto-joins each connection to its `user:{id}` channel, so no room join is
 * needed — server pushes (messages, receipts, typing) just arrive here.
 * Messages are *sent* over HTTP; this hook is receive-only.
 */
export function useChatSocket(onEvent: (event: ChatEvent) => void): void {
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
          const msg = JSON.parse(String(e.data)) as { type: string; event?: ChatEvent };
          if (msg.type === 'event' && msg.event && msg.event.type?.startsWith('dm')) {
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
