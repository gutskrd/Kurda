import { useCallback } from 'react';
import { useRealtimeListener, useRealtimeRoom } from './RealtimeProvider';

/**
 * Events from one room, for a screen that is looking at it.
 *
 * Your own channel arrives by itself (the gateway puts every connection in
 * it); a room has to be asked for. The group thread is why this exists: it
 * had no socket at all, so a reply never appeared until you left the screen
 * and came back.
 *
 * It rides the app's one connection now (RealtimeProvider): the room is joined
 * there while this is mounted — and joined again by itself after a reconnect —
 * and only that room's events reach the handler.
 */

/** One event off the wire. `type` is the discriminator; the rest is the payload. */
export interface RoomEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Join `room` for as long as the caller is mounted, and forward its events.
 *
 * The handler is held in a ref, so a screen may pass a fresh closure on every
 * render without leaving and rejoining the room — which would drop whatever
 * arrived in between.
 */
export function useRoomEvents(room: string, onEvent: (event: RoomEvent) => void): void {
  useRealtimeRoom(room);
  useRealtimeListener(
    useCallback(
      (event, from) => {
        if (from === room) onEvent(event);
      },
      [room, onEvent],
    ),
  );
}
