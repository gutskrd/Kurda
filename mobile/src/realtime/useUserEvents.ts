import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * Everything the gateway pushes on your own channel.
 *
 * Challenges (KUR-088) were the first, which is what this hook used to be called
 * and where it used to live — and the name was doing real harm: it filtered to
 * `challenge_*`, so the two matchmaking pushes arrived on the same socket and
 * were thrown away. Queueing for a quiz on the phone could therefore never
 * resolve, either way: `match_found` never navigated anybody into the room a
 * server had already built for them, and `match_timeout` never stopped the
 * spinner after the queue had given up.
 */
export type UserEvent =
  | { type: 'challenge_invite' | 'challenge_declined' | 'challenge_cancelled'; from?: string; by?: string }
  | { type: 'challenge_accepted'; from?: string; by?: string; roomId?: string }
  /** a queue match: the room is already made and both players get this */
  | { type: 'match_found'; roomId?: string }
  /** the queue waited long enough and dropped you (see MatchmakingService.sweep) */
  | { type: 'match_timeout' };

/** The prefixes this channel carries; anything else is somebody else's business. */
const MINE = ['challenge_', 'match_'];

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

/** Is this an event meant for the person, rather than a room's traffic? */
export function isUserEvent(type: unknown): type is UserEvent['type'] {
  return typeof type === 'string' && MINE.some((p) => type.startsWith(p));
}

/**
 * Opens the realtime socket and forwards the events on your own channel.
 *
 * The gateway auto-joins each connection to its `user:{id}` channel, so these
 * arrive without any room join. Mounted once, app-wide, by `ChallengeListener` —
 * a second caller would mean a second socket and every event delivered twice,
 * so anything that needs these should go through that one listener.
 */
export function useUserEvents(onEvent: (event: UserEvent) => void): void {
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
          const msg = JSON.parse(String(e.data)) as { type: string; event?: { type?: unknown } };
          if (msg.type === 'event' && msg.event && isUserEvent(msg.event.type)) {
            handlerRef.current(msg.event as UserEvent);
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
