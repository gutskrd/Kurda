import type { PictureReviewState, PostMediaView, WrittenPostType } from '@kurda/shared';

/**
 * A written post as `GET`/`POST`/`PATCH /library/posts` return it: words, up to four pictures, or both. The older
 * `LibraryPost` in lib/types remains for pages that only list titles.
 */
export interface ComposedPost {
  id: string;
  authorId: string;
  author?: { id: string; username: string; avatarUrl: string | null };
  type: WrittenPostType;
  /** Null on a saying. */
  title: string | null;
  /** '' on a post that is only pictures. */
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
  /** Only on the author's own copy, while a picture on it waits for a person to check it; nobody else is sent it. */
  review?: PictureReviewState;
}

/** What `POST /images/upload` answers. */
export interface UploadedPicture {
  imageMediaId: string;
  url: string | null;
  width: number | null;
  height: number | null;
  signed?: boolean;
  /** `held`: only its owner can open `url` (a short-lived private link), and a post made with it waits for a person. */
  review?: PictureReviewState;
}
