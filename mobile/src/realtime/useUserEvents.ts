import { useCallback } from 'react';
import { useRealtimeListener } from './RealtimeProvider';
import { userEventOf, type UserEvent } from './events';

export { isUserEvent, type UserEvent } from './events';

/**
 * Your own channel's events — invites, rematch offers, `play_changed`, gifts —
 * for as long as the caller is mounted.
 *
 * It rides the app's one shared connection (RealtimeProvider), so any number
 * of screens may listen and each gets every event once. It used to open a
 * socket of its own, which a chat screen's socket pushed off the gateway, and
 * it never came back: invites sent after that were lost until a restart.
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
