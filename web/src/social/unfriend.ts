import { useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useOptimisticSend } from '../lib/optimistic';
import { useRail } from './RailProvider';
import { railEdits } from './useSocialRail';

/**
 * Removing a friend once it is confirmed: they leave the social rail at once and the server is told in the background
 * (lib/optimistic.ts). A refusal brings them back, runs `undo` for whatever the caller took away, and says why.
 */
export function useUnfriend(): (userId: string, undo?: () => void) => Promise<void> {
  const { client } = useAuth();
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
  return useCallback(
    async (userId, undo) => {
      const change = adjust(railEdits.personGone(userId));
      await sendShown(() => client.delete(`/friends/${userId}`), {
        keep: change.keep,
        undo: () => {
          change.undo();
          undo?.();
        },
      });
    },
    [client, adjust, sendShown],
  );
}
