import type { PostMediaView, WrittenPostType } from '@kurda/shared';

/**
 * A written post as `GET`/`POST`/`PATCH /library/posts` send it back: words,
 * up to four pictures, or both. The older `LibraryPost` in lib/types predates
 * the saying and the pictures and stays for the pages that only list titles.
 */
export interface ComposedPost {
  id: string;
  authorId: string;
  author?: { id: string; username: string; avatarUrl: string | null };
  type: WrittenPostType;
  /** null on a saying */
  title: string | null;
  /** '' on a post that is only its pictures */
  body: string;
  media: PostMediaView[];
  meme: boolean;
  sourceCredit: string | null;
  status: 'draft' | 'published' | 'removed';
  audioUrl?: string | null;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt?: string;
  publishedAt: string | null;
}

/** What `POST /images/upload` answers. */
export interface UploadedPicture {
  imageMediaId: string;
  url: string | null;
  width: number | null;
  height: number | null;
  signed?: boolean;
}
