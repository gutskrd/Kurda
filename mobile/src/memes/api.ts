import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { Category, Comment, ImagePost } from './types';

export interface FeedFilters {
  category?: Category;
  sort?: 'newest' | 'popular';
  limit?: number;
  offset?: number;
}

function query(filters: FeedFilters): string {
  const p = new URLSearchParams();
  if (filters.category) p.set('category', filters.category);
  if (filters.sort) p.set('sort', filters.sort);
  if (filters.limit != null) p.set('limit', String(filters.limit));
  if (filters.offset != null) p.set('offset', String(filters.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const listPosts = (client: ApiClient, filters: FeedFilters = {}): Promise<ApiResult<{ posts: ImagePost[] }>> =>
  client.get(`/images${query(filters)}`);

export const getPost = (client: ApiClient, id: string): Promise<ApiResult<ImagePost>> => client.get(`/images/${encodeURIComponent(id)}`);

export const createPost = (
  client: ApiClient,
  input: { imageMediaId: string; caption?: string; category?: Category },
): Promise<ApiResult<ImagePost>> => client.post('/images', input);

export const listComments = (
  client: ApiClient,
  postId: string,
  page: { limit?: number; offset?: number; sort?: 'newest' | 'oldest' } = {},
): Promise<ApiResult<{ comments: Comment[] }>> => {
  const p = new URLSearchParams();
  if (page.limit != null) p.set('limit', String(page.limit));
  if (page.offset != null) p.set('offset', String(page.offset));
  if (page.sort) p.set('sort', page.sort);
  const s = p.toString();
  return client.get(`/images/${encodeURIComponent(postId)}/comments${s ? `?${s}` : ''}`);
};

export const addComment = (
  client: ApiClient,
  postId: string,
  body: string,
  parentId?: string,
): Promise<ApiResult<Comment>> => client.post(`/images/${encodeURIComponent(postId)}/comments`, { body, ...(parentId ? { parentId } : {}) });

/** Direct replies to a comment, oldest first: one branch, loaded when it is opened. */
export const listReplies = (client: ApiClient, commentId: string): Promise<ApiResult<{ comments: Comment[] }>> =>
  client.get(`/images/comments/${encodeURIComponent(commentId)}/replies?limit=50`);

/** Delete your own comment; the server keeps a placeholder where it had replies. */
export const deleteComment = (client: ApiClient, commentId: string): Promise<ApiResult<Comment>> =>
  client.delete(`/images/comments/${encodeURIComponent(commentId)}`);
