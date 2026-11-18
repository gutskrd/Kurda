import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import * as library from '../library/api';
import * as images from '../memes/api';
import type { CommentSurface, ThreadComment } from './thread';

/**
 * A thread's API paths for each surface. The two APIs have the same shape at different paths, so this table
 * replaces a second copy of the thread (the web app does the same). Posting is not here: a library comment can
 * carry a voice note, which its page uploads first.
 */
export interface ThreadCalls {
  list: (client: ApiClient, postId: string) => Promise<ApiResult<{ comments: ThreadComment[] }>>;
  replies: (client: ApiClient, commentId: string) => Promise<ApiResult<{ comments: ThreadComment[] }>>;
  remove: (client: ApiClient, commentId: string) => Promise<ApiResult<unknown>>;
}

export const THREAD_CALLS: Record<CommentSurface, ThreadCalls> = {
  library: {
    list: (client, postId) => library.listComments(client, postId, { sort: 'newest' }),
    replies: library.listReplies,
    remove: library.deleteComment,
  },
  images: {
    list: (client, postId) => images.listComments(client, postId, { sort: 'newest' }),
    replies: images.listReplies,
    remove: images.deleteComment,
  },
};
