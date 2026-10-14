import {
  POST_ALT_MAX,
  POST_BODY_MAX,
  POST_PICTURES_MAX,
  POST_SOURCE_MAX,
  POST_TITLE_MAX,
  cleanPostText,
  emptyPostDraft,
  postTextLength,
  type PostDraft,
  type PostPictureDraft,
  type PostTextField,
  type UpdatePostRequest,
  type WrittenPostType,
} from '@kurda/shared';
import type { ComposerPost } from './api';

/**
 * The composer's state, kept apart from the screen so it can be tested.
 *
 * What is written is a `PostDraft` (`@kurda/shared` post-composer), the same
 * shape the browser keeps, so the limits, the counting and the request it
 * becomes are the API's own. On top of it each picture carries what the phone
 * is doing with it right now — uploading, how far, or why it failed — which is
 * never saved: a picture comes back from a draft either uploaded or not.
 */

export type PictureStatus = 'uploading' | 'done' | 'failed';

export interface ComposerPicture extends PostPictureDraft {
  /** stable while the picture is on screen, so a finished upload finds its tile */
  id: string;
  status: PictureStatus;
  /** 0 to 1 while uploading */
  progress: number;
  /** what went wrong, already in the reader's language */
  error: string | null;
  /** already on the post being edited: its "I made this" was settled when it went up */
  existing: boolean;
}

export interface ComposerState {
  draft: PostDraft;
  pictures: ComposerPicture[];
}

let seq = 0;
/** An id for a picture on screen. Not stored, not sent. */
export function pictureId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq}`;
}

/** The limit each counted field has (`@kurda/shared`). */
export const FIELD_MAX: Readonly<Record<PostTextField, number>> = {
  title: POST_TITLE_MAX,
  body: POST_BODY_MAX,
  altText: POST_ALT_MAX,
  sourceCredit: POST_SOURCE_MAX,
};

/**
 * What a counter under a field shows: nothing while there is plenty of room,
 * the characters left once a tenth of the limit or less is left, and how far
 * over (negative) past it. Counted exactly as the server counts.
 */
export function counterFor(text: string, max: number): { show: boolean; left: number; over: boolean } {
  const left = max - postTextLength(text);
  return { show: left <= Math.ceil(max / 10), left, over: left < 0 };
}

/** A draft as the device keeps it: the pictures as they are now. */
export function toStoredDraft(state: ComposerState, now: number = Date.now()): PostDraft {
  return {
    ...state.draft,
    pictures: state.pictures.map(({ mediaKey, localUri, altText, ownWork, status }) => ({
      // a key only once the upload has finished: a half-sent picture is sent again
      mediaKey: status === 'done' ? mediaKey : null,
      localUri,
      altText,
      ownWork,
    })),
    meme: state.draft.meme && state.pictures.length > 0,
    savedAt: now,
  };
}

/**
 * An upload no post uses is cleared away by the server after a day. A draft
 * older than this keeps its pictures' files but forgets their keys, and they
 * are uploaded again — a key that may already be gone would only fail at Post.
 */
export const UPLOAD_KEEP_MS = 20 * 60 * 60 * 1000;

/**
 * A draft back from the device, as the composer's state. Each picture says
 * whether it still needs uploading (`needsUpload`) — a picture with neither a
 * usable key nor a file is dropped by `parsePostDraft` already, or here when
 * its key is too old and it has no file.
 */
export function fromStoredDraft(draft: PostDraft, now: number = Date.now()): ComposerState {
  const stale = now - draft.savedAt > UPLOAD_KEEP_MS;
  const pictures = draft.pictures
    .map((p): ComposerPicture | null => {
      const mediaKey = stale ? null : p.mediaKey;
      if (!mediaKey && !p.localUri) return null;
      return {
        ...p,
        mediaKey,
        id: pictureId(),
        status: mediaKey ? 'done' : 'uploading',
        progress: mediaKey ? 1 : 0,
        error: null,
        existing: false,
      };
    })
    .filter((p): p is ComposerPicture => p !== null);
  return { draft: { ...draft, pictures: [], meme: draft.meme && pictures.length > 0 }, pictures };
}

export function emptyComposer(now: number = Date.now()): ComposerState {
  return { draft: emptyPostDraft(now), pictures: [] };
}

/** The draft with its pictures, for the shared checks and the request. */
export function withPictures(state: ComposerState): PostDraft {
  return { ...state.draft, pictures: state.pictures.map(({ mediaKey, localUri, altText, ownWork }) => ({ mediaKey, localUri, altText, ownWork })) };
}

/** Pictures still to be added before the limit. */
export function roomForPictures(state: ComposerState): number {
  return Math.max(0, POST_PICTURES_MAX - state.pictures.length);
}

/** A post being edited (or an old draft being finished), as the composer's state. */
export function fromPost(post: ComposerPost): ComposerState {
  const pictures: ComposerPicture[] = post.media.map((m) => ({
    id: pictureId(),
    mediaKey: m.mediaKey,
    localUri: m.url,
    altText: m.altText ?? '',
    ownWork: true,
    status: 'done',
    progress: 1,
    error: null,
    existing: true,
  }));
  return {
    draft: {
      ...emptyPostDraft(0),
      // a gotin was never "chosen"; leaving it null lets a title turn it into a çîrok, as in a new post
      type: post.type === 'gotin' ? null : post.type,
      title: post.title ?? '',
      body: post.body,
      meme: post.meme,
      sourceCredit: post.sourceCredit ?? '',
    },
    pictures,
  };
}

/**
 * What an edit changes, as `PATCH /library/posts/:id` takes it — only the
 * fields that differ from the post as it was, so an edit that changes nothing
 * sends nothing, and a field cleared is sent as cleared.
 */
export function toUpdateRequest(before: ComposerPost, state: ComposerState): UpdatePostRequest | null {
  if (state.pictures.some((p) => p.status !== 'done' || !p.mediaKey)) return null;
  const patch: UpdatePostRequest = {};
  const type: WrittenPostType = state.draft.type ?? (cleanPostText(state.draft.title) ? 'story' : 'gotin');
  if (type !== before.type) patch.type = type;
  const title = cleanPostText(state.draft.title);
  if (title !== (before.title ?? '')) patch.title = title || null;
  const body = cleanPostText(state.draft.body);
  if (body !== before.body) patch.body = body;
  const media = state.pictures.map((p) => {
    const alt = cleanPostText(p.altText);
    return alt ? { mediaKey: p.mediaKey!, altText: alt } : { mediaKey: p.mediaKey! };
  });
  const mediaBefore = before.media.map((m) => ({ mediaKey: m.mediaKey, altText: m.altText ?? '' }));
  const mediaChanged =
    media.length !== mediaBefore.length ||
    media.some((m, i) => m.mediaKey !== mediaBefore[i]!.mediaKey || (m.altText ?? '') !== mediaBefore[i]!.altText);
  if (mediaChanged) patch.media = media;
  const meme = state.draft.meme && state.pictures.length > 0;
  if (meme !== before.meme) patch.meme = meme;
  const source = cleanPostText(state.draft.sourceCredit);
  if (source !== (before.sourceCredit ?? '')) patch.sourceCredit = source || null;
  return patch;
}

/** Whether an edit has anything to save. */
export function hasChanges(patch: UpdatePostRequest | null): boolean {
  return patch === null || Object.keys(patch).length > 0;
}
