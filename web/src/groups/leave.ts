import { useCallback } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useOptimisticSend } from '../lib/optimistic';
import type { ApiError } from '../lib/types';
import { useRail } from '../social/RailProvider';
import { railEdits } from '../social/useSocialRail';
import { announceGroupsChanged } from './groupsChanged';

/**
 * Leaving a group once it is confirmed: it leaves the social rail at once and the server is told in the background
 * (lib/optimistic.ts). Group lists reload once the server has it; a refusal brings the group back and says why, by
 * `onFailed` where given or the app's notice. Resolves to whether the leave went through.
 */
export function useLeaveGroup(): (groupId: string, onFailed?: (error: ApiError) => void) => Promise<boolean> {
  const { client } = useAuth();
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
  return useCallback(
    async (groupId, onFailed) => {
      const change = adjust(railEdits.groupGone(groupId));
      const res = await sendShown(() => client.post(`/groups/${groupId}/leave`), change, onFailed ? { onFailed } : undefined);
      if (res.ok) announceGroupsChanged();
      return res.ok;
    },
    [client, adjust, sendShown],
  );
}
