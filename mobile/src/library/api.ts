import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { LibraryComment, LibraryPost, PostType } from './types';

export interface BrowseFilters {
  type?: PostType;
  sort?: 'newest' | 'popular';
  limit?: number;
  offset?: number;
}

function query(filters: BrowseFilters): string {
  const p = new URLSearchParams();
  if (filters.type) p.set('type', filters.type);
  if (filters.sort) p.set('sort', filters.sort);
  if (filters.limit != null) p.set('limit', String(filters.limit));
  if (filters.offset != null) p.set('offset', String(filters.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const listPosts = (client: ApiClient, filters: BrowseFilters = {}): Promise<ApiResult<{ posts: LibraryPost[] }>> =>
  client.get(`/library/posts${query(filters)}`);

export const getPost = (client: ApiClient, id: string): Promise<ApiResult<LibraryPost>> => client.get(`/library/posts/${id}`);

export const createPost = (
  client: ApiClient,
  input: { type: PostType; title: string; body: string; publish?: boolean; audioMediaId?: string },
): Promise<ApiResult<LibraryPost>> => client.post('/library/posts', input);

export const listComments = (
  client: ApiClient,
  postId: string,
  page: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' } = {},
): Promise<ApiResult<{ comments: LibraryComment[] }>> => {
  const p = new URLSearchParams();
  if (page.limit != null) p.set('limit', String(page.limit));
  if (page.offset != null) p.set('offset', String(page.offset));
  if (page.sort) p.set('sort', page.sort);
  const s = p.toString();
  return client.get(`/library/posts/${postId}/comments${s ? `?${s}` : ''}`);
};

export const addComment = (
  client: ApiClient,
  postId: string,
  input: { body?: string; audioMediaId?: string; parentId?: string },
): Promise<ApiResult<LibraryComment>> =>
  client.post(`/library/posts/${postId}/comments`, {
    ...(input.body ? { body: input.body } : {}),
    ...(input.audioMediaId ? { audioMediaId: input.audioMediaId } : {}),
    ...(input.parentId ? { parentId: input.parentId } : {}),
  });

export const reportPost = (client: ApiClient, postId: string, reason?: string): Promise<ApiResult<{ reported: true }>> =>
  client.post(`/library/posts/${postId}/report`, reason ? { reason } : {});

export const reportComment = (client: ApiClient, commentId: string, reason?: string): Promise<ApiResult<{ reported: true }>> =>
  client.post(`/library/comments/${commentId}/report`, reason ? { reason } : {});
