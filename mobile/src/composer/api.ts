import type { CreatePostRequest, PostMediaView, UpdatePostRequest, WrittenPostType } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';

/**
 * The composer's calls: a written post with words, pictures or both
 * (`@kurda/shared` post-composer has the request shapes and the rules).
 */

/** A written post as the API answers it — the fields the composer and the post screen read. */
export interface ComposerPost {
  id: string;
  authorId: string;
  type: WrittenPostType;
  /** null on a gotin */
  title: string | null;
  /** '' on a post that is only its pictures */
  body: string;
  status: 'draft' | 'published' | 'removed';
  media: PostMediaView[];
  meme: boolean;
  sourceCredit: string | null;
  updatedAt: string;
}

export const createWrittenPost = (client: ApiClient, body: CreatePostRequest): Promise<ApiResult<ComposerPost>> =>
  client.post('/library/posts', body);

export const updateWrittenPost = (
  client: ApiClient,
  id: string,
  body: UpdatePostRequest,
): Promise<ApiResult<ComposerPost>> => client.patch(`/library/posts/${id}`, body);

export const getWrittenPost = (client: ApiClient, id: string): Promise<ApiResult<ComposerPost>> =>
  client.get(`/library/posts/${id}`);

/** A draft saved on the server by an app from before drafts moved onto the phone. */
export const listServerDrafts = (client: ApiClient): Promise<ApiResult<{ posts: ComposerPost[] }>> =>
  client.get('/me/library/drafts?limit=20');

export const publishWrittenPost = (client: ApiClient, id: string): Promise<ApiResult<ComposerPost>> =>
  client.post(`/library/posts/${id}/publish`);
