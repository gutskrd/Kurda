import { useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useOptimisticSend } from '../lib/optimistic';
import type { ApiError } from '../lib/types';
import { useRail } from '../social/RailProvider';
import { railEdits } from '../social/useSocialRail';

/**
 * Blocking someone once it is confirmed: they leave the social rail at once and the server is told in the background
 * (lib/optimistic.ts). A refusal brings them back, runs `undo` for whatever the caller took away, and says why, by
 * `onFailed` where given or the app's notice. Resolves to whether the block went through.
 */
export function useBlock(): (userId: string, undo?: () => void, onFailed?: (error: ApiError) => void) => Promise<boolean> {
  const { client } = useAuth();
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
  return useCallback(
    async (userId, undo, onFailed) => {
      const change = adjust(railEdits.personGone(userId));
      const res = await sendShown(
        () => client.post(`/friends/${userId}/block`),
        {
          keep: change.keep,
          undo: () => {
            change.undo();
            undo?.();
          },
        },
        onFailed ? { onFailed } : undefined,
      );
      return res.ok;
    },
    [client, adjust, sendShown],
  );
}
