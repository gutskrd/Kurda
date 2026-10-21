/** Community library (stories & poems, KUR-281/284) — types + native-free helpers. */

import type { PostMediaView } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { CommentAuthor } from '../comments/thread';

/** A gotin is a saying, with no title; a çîrok (story) and a helbest (poem) have one. */
export type PostType = 'gotin' | 'story' | 'poem';
export type AuthorRole = 'user' | 'admin';

export interface LibraryPost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  type: PostType;
  /** null on a gotin */
  title: string | null;
  /** '' on a post that is only its pictures */
  body: string;
  audioMediaId: string | null;
  audioUrl: string | null;
  language: string;
  status: 'draft' | 'published' | 'removed';
  viewCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** up to four pictures, in order; an older API leaves it out */
  media?: PostMediaView[];
  meme?: boolean;
  /** "Source / credit", shown under the post */
  sourceCredit?: string | null;
}

/** Threaded comment (text or audio), mirroring the API's library_comments. */
export interface LibraryComment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: 'user' | 'admin';
  /** who wrote it, on reads; the answer to a new comment leaves it out */
  author?: CommentAuthor;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  audioMediaId: string | null;
  audioUrl: string | null;
  status: 'visible' | 'removed';
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

/** mm:ss for an audio position/duration in seconds (NaN/negative → 0:00). */
export function clock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A one-line preview of a post body for the browse list. */
export function bodyPreview(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * What to call a post in a list: its title, or for a gotin (which has none)
 * the start of what it says.
 */
export function postName(post: Pick<LibraryPost, 'title' | 'body'>): string {
  return post.title?.trim() || bodyPreview(post.body, 60);
}

/**
 * A tombstoned comment renders as a placeholder rather than empty.
 *
 * Takes a translator because the middle case passes through: the body is
 * whatever the commenter wrote, in whatever language they wrote it.
 */
export function commentText(c: LibraryComment, t: Translate): string {
  if (c.status === 'removed') return t('comments.removed');
  return c.body ?? (c.audioMediaId ? t('comments.voice') : '');
}
