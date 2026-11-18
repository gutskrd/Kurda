import { useCallback, useSyncExternalStore } from 'react';
import type { ApiClient } from '../api/client';
import { useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiResult } from '../api/types';
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

/*
 * People blocked from this phone whose lists have not been read again since: they leave every list showing people at
 * once, before the server has the block, and come back if it refuses.
 */
let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function setHidden(next: ReadonlySet<string>): void {
  hidden = next;
  for (const listener of listeners) listener();
}

/** Take them out of the lists now; the block itself is sent by the caller. */
export function hideBlocked(userId: string): void {
  setHidden(new Set(hidden).add(userId));
}

/** The block was refused: they are back where they were. */
export function unhideBlocked(userId: string): void {
  const next = new Set(hidden);
  next.delete(userId);
  setHidden(next);
}

/** The people a list should leave out while their block is on its way or done. */
export function useHiddenByBlock(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => hidden,
  );
}

/**
 * Block someone, once the question has been answered: they leave the lists at once and the server is told after. A
 * refusal (the block limit, a lost connection) brings them back and says why, wherever the reader has gone since.
 */
export function useBlock(): (userId: string) => void {
  const { client } = useAuth();
  const say = useSayNotSaved();
  const blocking = useIntents<string, boolean>((userId) => blockUser(client, userId), {
    failed: (error, userId) => {
      unhideBlocked(userId);
      say(error);
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
