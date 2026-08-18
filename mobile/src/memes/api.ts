import * as FileSystem from 'expo-file-system/legacy';
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import { describeUploadFailure, normalizeContentType } from '../profile/photoUploadResult';
import type { Category, Comment, ImagePost, Reaction, ReactionSummary } from './types';

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

export const getPost = (client: ApiClient, id: string): Promise<ApiResult<ImagePost>> => client.get(`/images/${id}`);

export const createPost = (
  client: ApiClient,
  input: { imageMediaId: string; caption?: string; category?: Category },
): Promise<ApiResult<ImagePost>> => client.post('/images', input);

export const getReactions = (client: ApiClient, postId: string): Promise<ApiResult<ReactionSummary>> =>
  client.get(`/images/${postId}/reactions`);

export const setReaction = (client: ApiClient, postId: string, reaction: Reaction): Promise<ApiResult<ReactionSummary>> =>
  client.put(`/images/${postId}/reaction`, { reaction });

export const clearReaction = (client: ApiClient, postId: string): Promise<ApiResult<ReactionSummary>> =>
  client.delete(`/images/${postId}/reaction`);

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
  return client.get(`/images/${postId}/comments${s ? `?${s}` : ''}`);
};

export const addComment = (
  client: ApiClient,
  postId: string,
  body: string,
  parentId?: string,
): Promise<ApiResult<Comment>> => client.post(`/images/${postId}/comments`, { body, ...(parentId ? { parentId } : {}) });

export type MemeUploadResult = { ok: true; imageMediaId: string; url: string } | { ok: false; error: string };

/**
 * Upload a picked image through the server (KUR-291): POST the raw bytes to
 * `/images/upload`; the server validates/resizes/WebP-compresses/moderates it and
 * returns a media id to attach to a post. Mirrors the profile-photo through-server
 * upload — binary bodies can't go through `ApiClient.request()` (it JSON-encodes).
 */
export async function uploadMemeImage(
  client: ApiClient,
  photo: { uri: string; contentType: string },
): Promise<MemeUploadResult> {
  try {
    const token = await client.getAccessToken();
    if (!token) return { ok: false, error: 'Your session expired. Please sign in again.' };

    const res = await FileSystem.uploadAsync(`${client.baseUrl}/images/upload`, photo.uri, {
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': normalizeContentType(photo.contentType) },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    if (res.status >= 200 && res.status < 300) {
      try {
        const body = JSON.parse(res.body) as { imageMediaId?: string; url?: string };
        if (body.imageMediaId && body.url) return { ok: true, imageMediaId: body.imageMediaId, url: body.url };
      } catch {
        // fall through
      }
      return { ok: false, error: 'The upload finished but no image was returned. Please try again.' };
    }
    return { ok: false, error: describeUploadFailure(res.status, res.body) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Could not upload the image.' };
  }
}
