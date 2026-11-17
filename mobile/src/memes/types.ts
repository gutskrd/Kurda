/** Types and pure helpers for the meme and image feed. */

import type { Translate } from '../api/errors';
import type { CommentAuthor } from '../comments/thread';

export type Category = 'meme' | 'image';
export type AuthorRole = 'user' | 'admin' | 'founder';

export interface ImagePost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  /** Who posted it: a face and a name; older APIs leave it out. */
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
  /** Who wrote it: a face and a name, rather than an id. */
  author?: CommentAuthor;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A deleted comment renders as a placeholder; otherwise the body passes through in whatever language it was written. */
export function commentText(c: Comment, t: Translate): string {
  if (c.status === 'removed') return t('comments.removed');
  return c.body ?? '';
}
