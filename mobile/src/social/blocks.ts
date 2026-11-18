import { useCallback } from 'react';
import type { ApiClient } from '../api/client';
import { createHiddenSet, useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiError, ApiResult } from '../api/types';
import { useAuth } from '../auth/AuthContext';

/** The server's page size, so "show more" asks for exactly one more page. */
const BLOCKS_PAGE = 25;

/** Someone you have blocked, as the blocklist shows them. */
export interface BlockedUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface BlockPage {
  blocked: BlockedUser[];
  total: number;
}

export function blockedUsers(client: ApiClient, offset = 0): Promise<ApiResult<BlockPage>> {
  return client.get<BlockPage>(`/friends/blocks?limit=${BLOCKS_PAGE}&offset=${offset}`);
}

export function blockUser(client: ApiClient, userId: string): Promise<ApiResult<unknown>> {
  return client.post(`/friends/${userId}/block`);
}

/**
 * The only way back from a block, which removes the other person from search, your friends and every board, and makes
 * their profile a 404 to you, so the blocklist is the one place to undo it.
 */
export function unblockUser(client: ApiClient, userId: string): Promise<ApiResult<unknown>> {
  return client.delete(`/friends/${userId}/block`);
}

// People blocked from this phone: they leave every list of people at once, before the server has the block.
const blocked = createHiddenSet();
export const hideBlocked = blocked.hide;
export const unhideBlocked = blocked.unhide;
export const useHiddenByBlock = blocked.useHidden;

/**
 * Block someone, once the question has been answered: they leave the lists at once and the server is told after. A
 * refusal (the block limit, a lost connection) brings them back and says why, wherever the reader has gone since;
 * `saidHere` may say it in place instead, returning true when it did.
 */
export function useBlock(saidHere?: (error: ApiError) => boolean): (userId: string) => void {
  const { client } = useAuth();
  const say = useSayNotSaved();
  const blocking = useIntents<string, boolean>((userId) => blockUser(client, userId), {
    failed: (error, userId) => {
      unhideBlocked(userId);
      if (!saidHere?.(error)) say(error);
    },
  });
  return useCallback(
    (userId: string) => {
      hideBlocked(userId);
      blocking.want(userId, true, false);
    },
    [blocking],
  );
}
