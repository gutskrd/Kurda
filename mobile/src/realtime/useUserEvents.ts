import { useCallback } from 'react';
import { useRealtimeListener } from './RealtimeProvider';
import { userEventOf, type UserEvent } from './events';

export { isUserEvent, type UserEvent } from './events';

/**
 * Your own channel's events (invites, rematch offers, `play_changed`, gifts) while mounted, over the shared
 * connection, so any number of screens each get every event once.
 */
export function useUserEvents(onEvent: (event: UserEvent) => void): void {
  useRealtimeListener(
    useCallback(
      (event, room) => {
        const mine = userEventOf(event, room);
        if (mine) onEvent(mine);
      },
      [onEvent],
    ),
  );
}
