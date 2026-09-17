import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/** The server's page size, so "show more" asks for exactly one more page. */
export const BLOCKS_PAGE = 25;

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
 * The only way back.
 *
 * A block is absolute: the other person leaves search, your friends list and
 * every board, and their profile answers "no such user" to you. So the moment
 * it lands there is no screen left anywhere that could offer to undo it, which
 * is exactly why the blocklist has to exist somewhere you can find it.
 */
export function unblockUser(client: ApiClient, userId: string): Promise<ApiResult<unknown>> {
  return client.delete(`/friends/${userId}/block`);
}

/** What a reporter says the problem is. Matches the server's enum exactly. */
export const REPORT_CATEGORIES = [
  'harassment',
  'spam',
  'impersonation',
  'hate',
  'self_harm',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** The server refuses anything shorter; saying so up front beats a rejection. */
export const MIN_REASON = 10;
export const MAX_REASON = 1000;

export function reportUser(
  client: ApiClient,
  userId: string,
  category: ReportCategory,
  reason: string,
): Promise<ApiResult<unknown>> {
  return client.post(`/users/${userId}/report`, { category, reason });
}
