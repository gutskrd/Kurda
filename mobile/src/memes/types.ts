/** Shared types + pure helpers for the meme/image feed (KUR-291). Native-free so
 *  the helpers are unit-testable. */

import type { Translate } from '../api/errors';
import type { CommentAuthor } from '../comments/thread';

export type Category = 'meme' | 'image';
export type AuthorRole = 'user' | 'admin' | 'founder';

export interface ImagePost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  /** who posted it: a face and a name; older APIs leave it out */
  author?: { id: string; username: string; avatarUrl: string | null } | null;
  imageMediaId: string;
  imageUrl: string | null;
  caption: string | null;
  category: Category;
  language: string | null;
  viewCount: number;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: AuthorRole;
  /** who wrote it: a face and a name, rather than an id */
  author?: CommentAuthor;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A tombstoned comment renders as a placeholder rather than empty.
 *
 * Takes a translator because the other case passes through: the body is
 * whatever the commenter wrote, in whatever language they wrote it.
 */
export function commentText(c: Comment, t: Translate): string {
  if (c.status === 'removed') return t('comments.removed');
  return c.body ?? '';
}
