import { useCallback } from 'react';
import { useRealtimeListener, useRealtimeRoom } from './RealtimeProvider';

/**
 * Events from one room, for a screen showing it. Your own channel arrives automatically; a room must be joined.
 * It uses the app's single connection (RealtimeProvider): the room is joined while mounted, rejoined after a
 * reconnect, and only its events reach the handler.
 */

/** One event off the wire. `type` is the discriminator; the rest is the payload. */
export interface RoomEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Join `room` while mounted and forward its events. The handler is kept in a ref, so a fresh closure each render
 * does not leave and rejoin the room and drop events.
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
