import type { ApiClient } from '../lib/api';
import type { ApiResult } from '../lib/types';
import type { ClaimedTag, ProfileTags, TagRow } from '@kurda/shared';

/** The tag requests; the shapes and view helpers live in `@kurda/shared`, shared with the phone app. */

export const myTags = (client: ApiClient): Promise<ApiResult<ProfileTags>> => client.get('/me/tags');

export const myClaimedTags = (client: ApiClient): Promise<ApiResult<{ tags: ClaimedTag[] }>> =>
  client.get('/me/tags/claimed');

export const tagCatalog = (client: ApiClient): Promise<ApiResult<{ tags: TagRow[] }>> => client.get('/tags');

export const claimTag = (
  client: ApiClient,
  input: { key: string; value?: string; consent?: boolean },
): Promise<ApiResult<{ claimed: true }>> => client.post('/me/tags/claim', input);

export const setTagDisplayed = (
  client: ApiClient,
  key: string,
  displayed: boolean,
): Promise<ApiResult<{ updated: true }>> => client.post('/me/tags/display', { key, displayed });

/** The key travels in the path, so it is encoded. */
export const unclaimTag = (client: ApiClient, key: string): Promise<ApiResult<{ removed: true }>> =>
  client.delete(`/me/tags/${encodeURIComponent(key)}`);
