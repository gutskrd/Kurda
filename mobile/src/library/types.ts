/** Community library (stories & poems, KUR-281/284) — types + native-free helpers. */

export type PostType = 'story' | 'poem';
export type AuthorRole = 'user' | 'admin';

export interface LibraryPost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  type: PostType;
  title: string;
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
}

/** Threaded comment (text or audio), mirroring the API's library_comments. */
export interface LibraryComment {
  id: string;
  postId: string;
  authorId: string;
  authorRole: 'user' | 'admin';
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  audioMediaId: string | null;
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

/** A tombstoned comment renders as a placeholder rather than empty. */
export function commentText(c: LibraryComment): string {
  if (c.status === 'removed') return 'This comment was removed.';
  return c.body ?? (c.audioMediaId ? '🔊 Voice comment' : '');
}
