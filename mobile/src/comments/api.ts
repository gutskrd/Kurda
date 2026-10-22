import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import * as library from '../library/api';
import * as images from '../memes/api';
import type { CommentSurface, ThreadComment } from './thread';

/**
 * A thread's calls, whichever surface it is on. The two APIs are the same
 * shape at different paths, so the difference is this table rather than a
 * second copy of the thread to keep in step (the website does the same).
 * Posting is not here: a library comment can carry a voice note, which the
 * post's own page uploads first, so each page sends its own.
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
