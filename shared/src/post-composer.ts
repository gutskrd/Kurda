/**
 * Writing a post: one box for words and up to four pictures. The API decides what a post may be and both apps build the
 * request and show the counter, so the limits, the rule for a post's kind, the character count and the device draft's
 * shape live here. Drafts stay on the device; the server's "draft" status remains for older app installs, and
 * `GET /me/library/drafts` finds what they saved.
 */
import { stripControlChars } from './sanitize.js';

/** A çîrok's or a helbest's name. */
export const POST_TITLE_MAX = 200;
/** The text of a post, with or without pictures. */
export const POST_BODY_MAX = 50_000;
/** What a picture shows, for someone who cannot see it. */
export const POST_ALT_MAX = 1_000;
/** "Source / credit", shown under the post: where a quote or a picture came from. */
export const POST_SOURCE_MAX = 200;
/** Pictures on one post. */
export const POST_PICTURES_MAX = 4;

export const WRITTEN_POST_TYPES = ['gotin', 'story', 'poem'] as const;
/** A gotin is a saying and needs no name; a çîrok (story) and a helbest (poem) do. */
export type WrittenPostType = (typeof WRITTEN_POST_TYPES)[number];

export function isWrittenPostType(value: unknown): value is WrittenPostType {
  return typeof value === 'string' && (WRITTEN_POST_TYPES as readonly string[]).includes(value);
}

/** Only a gotin may go without a name; the database enforces it too. */
export function titleRequiredFor(type: WrittenPostType): boolean {
  return type !== 'gotin';
}

/** Text as the server keeps it: control characters stripped (newlines and tabs stay, since a poem needs its lines) and trimmed. */
export function cleanPostText(text: string | null | undefined): string {
  return text ? stripControlChars(text).trim() : '';
}

/**
 * A text's length exactly as the server counts it, so the counter never promises room the server refuses: the cleaned
 * text's `.length` in UTF-16 units, so spaces at either end do not count and an emoji counts as two.
 */
export function postTextLength(text: string | null | undefined): number {
  return cleanPostText(text).length;
}

/**
 * What kind of written post this is. A chosen kind wins; otherwise no title makes a gotin and a title a çîrok (a helbest
 * is only ever chosen), so clearing an unchosen post's title returns it to a gotin.
 */
export function derivePostType(input: { title?: string | null; type?: WrittenPostType | null }): WrittenPostType {
  if (input.type && isWrittenPostType(input.type)) return input.type;
  return cleanPostText(input.title) ? 'story' : 'gotin';
}

/** What a post is made of: a draft, a request, or a post being edited. */
export interface PostContent {
  /** the kind somebody chose; empty means "decide from the title" */
  type?: WrittenPostType | null;
  title?: string | null;
  body?: string | null;
  pictures?: ReadonlyArray<{ altText?: string | null }>;
  /** marked as a meme for the Memes filter; only a post with pictures can be */
  meme?: boolean;
  sourceCredit?: string | null;
}

/** A field that has a length limit. */
export type PostTextField = 'title' | 'body' | 'altText' | 'sourceCredit';

/** Why a post cannot be posted yet; `code` is the API's 422 error code, so one message table serves both. */
export type PostProblem =
  /** no words and no pictures */
  | { code: 'EMPTY_POST' }
  /** a çîrok or a helbest without a name */
  | { code: 'TITLE_REQUIRED' }
  | { code: 'TOO_LONG'; field: PostTextField; max: number }
  | { code: 'TOO_MANY_PICTURES'; max: number }
  /** "meme" was asked for on a post with no pictures */
  | { code: 'MEME_NEEDS_PICTURE' };

const LIMITS: Readonly<Record<PostTextField, number>> = {
  title: POST_TITLE_MAX,
  body: POST_BODY_MAX,
  altText: POST_ALT_MAX,
  sourceCredit: POST_SOURCE_MAX,
};

/** Everything that stops this post from being posted, most fundamental first; empty when it can be. */
export function postProblems(post: PostContent): PostProblem[] {
  const problems: PostProblem[] = [];
  const pictures = post.pictures ?? [];
  const type = derivePostType(post);

  if (!postTextLength(post.body) && pictures.length === 0) problems.push({ code: 'EMPTY_POST' });
  if (titleRequiredFor(type) && !postTextLength(post.title)) problems.push({ code: 'TITLE_REQUIRED' });
  if (pictures.length > POST_PICTURES_MAX) problems.push({ code: 'TOO_MANY_PICTURES', max: POST_PICTURES_MAX });
  if (post.meme && pictures.length === 0) problems.push({ code: 'MEME_NEEDS_PICTURE' });

  const tooLong = (field: PostTextField, text: string | null | undefined): void => {
    if (postTextLength(text) > LIMITS[field]) problems.push({ code: 'TOO_LONG', field, max: LIMITS[field] });
  };
  tooLong('title', post.title);
  tooLong('body', post.body);
  // One problem for the alt texts, however many are too long.
  if (pictures.some((p) => postTextLength(p.altText) > POST_ALT_MAX)) {
    problems.push({ code: 'TOO_LONG', field: 'altText', max: POST_ALT_MAX });
  }
  tooLong('sourceCredit', post.sourceCredit);
  return problems;
}

/**
 * Whether the Post button is on, and if not the first thing to fix. The API runs the same check, so an allowed post is
 * refused only for what the server alone knows (whose pictures they are, posting too fast).
 */
export function canPost(
  post: PostContent,
): { ok: true; type: WrittenPostType } | { ok: false; problem: PostProblem } {
  const [problem] = postProblems(post);
  return problem ? { ok: false, problem } : { ok: true, type: derivePostType(post) };
}

// ---- requests and answers ---------------------------------------------------

/** A picture on a post, as a request names it: an upload from `POST /images/upload`. */
export interface PostMediaInput {
  mediaKey: string;
  altText?: string | null;
}

/**
 * `POST /library/posts`. `type` may be left out (see `derivePostType`) and `body` may be empty when there are pictures.
 * Each `mediaKey` must be the author's own upload, not yet on any post.
 */
export interface CreatePostRequest {
  type?: WrittenPostType;
  title?: string | null;
  body?: string;
  media?: PostMediaInput[];
  meme?: boolean;
  sourceCredit?: string | null;
  language?: string;
  /** false saves a server draft, kept for apps from before device drafts */
  publish?: boolean;
}

/**
 * `PATCH /library/posts/:id`, every field optional. `media` replaces the list in the given order: keys already on the
 * post stay, new ones must be unused uploads of the author's, and missing ones are let go. `title: null` clears a gotin's
 * title.
 */
export interface UpdatePostRequest {
  type?: WrittenPostType;
  title?: string | null;
  body?: string;
  media?: PostMediaInput[];
  meme?: boolean;
  sourceCredit?: string | null;
  language?: string;
}

/** A picture on a post as the API sends it back, in order. */
export interface PostMediaView {
  mediaKey: string;
  /** null only when the server has no storage configured */
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/** A picture on a wall card (`GET /feed` → `items[].images`, the first four); old picture posts have no alt text or size. */
export interface FeedImage {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

/**
 * Where to upload a picture for a post. "I made this" (on by default) adds the small Hevalo signature with the poster's
 * handle; a picture someone else made goes up without it, since the signature would claim it.
 */
export function pictureUploadPath(ownWork: boolean): string {
  return ownWork ? '/images/upload' : '/images/upload?ownWork=false';
}

// ---- drafts on the device ---------------------------------------------------

/** A picture in a draft: picked, maybe already uploaded. */
export interface PostPictureDraft {
  /** set once uploaded; an upload no post uses is cleared after a day */
  mediaKey: string | null;
  /** the phone's file path or the browser's object URL, to show it again */
  localUri: string | null;
  altText: string;
  /** "I made this" */
  ownWork: boolean;
}

export const POST_DRAFT_VERSION = 1;

/** What the composer keeps on the device while somebody writes. */
export interface PostDraft {
  version: typeof POST_DRAFT_VERSION;
  /** the kind chosen with the kind row; null lets the title decide */
  type: WrittenPostType | null;
  title: string;
  body: string;
  pictures: PostPictureDraft[];
  meme: boolean;
  sourceCredit: string;
  /** ms since the epoch */
  savedAt: number;
}

/** One draft per person on a device, under this key. */
export function postDraftStorageKey(userId: string): string {
  return `composer.draft.v${POST_DRAFT_VERSION}:${userId}`;
}

export function emptyPostDraft(now: number = Date.now()): PostDraft {
  return { version: POST_DRAFT_VERSION, type: null, title: '', body: '', pictures: [], meme: false, sourceCredit: '', savedAt: now };
}

/** Nothing worth keeping, so closing the composer need not ask. */
export function isEmptyDraft(draft: PostDraft): boolean {
  return (
    !postTextLength(draft.title) &&
    !postTextLength(draft.body) &&
    !postTextLength(draft.sourceCredit) &&
    draft.pictures.length === 0
  );
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Reads a draft back from the device. Storage can hold anything (an older version, a half-written value, another tab's),
 * so this takes JSON text or the parsed value, keeps what it recognises, drops pictures past the limit, and answers null
 * rather than throwing for anything that is not a draft.
 */
export function parsePostDraft(raw: unknown): PostDraft | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== POST_DRAFT_VERSION) return null;

  const pictures = (Array.isArray(v.pictures) ? v.pictures : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      mediaKey: strOrNull(p.mediaKey),
      localUri: strOrNull(p.localUri),
      altText: str(p.altText),
      ownWork: p.ownWork !== false,
    }))
    .filter((p) => p.mediaKey !== null || p.localUri !== null)
    .slice(0, POST_PICTURES_MAX);

  return {
    version: POST_DRAFT_VERSION,
    type: isWrittenPostType(v.type) ? v.type : null,
    title: str(v.title),
    body: str(v.body),
    pictures,
    meme: v.meme === true && pictures.length > 0,
    sourceCredit: str(v.sourceCredit),
    savedAt: typeof v.savedAt === 'number' && Number.isFinite(v.savedAt) ? v.savedAt : 0,
  };
}

/**
 * The request for a finished draft, or null while a picture is still uploading. Empty fields are left out, so the request
 * means to the server what the draft means to the counter.
 */
export function toCreatePostRequest(draft: PostDraft): CreatePostRequest | null {
  if (draft.pictures.some((p) => !p.mediaKey)) return null;
  const title = cleanPostText(draft.title);
  const source = cleanPostText(draft.sourceCredit);
  const request: CreatePostRequest = { type: derivePostType(draft), body: cleanPostText(draft.body) };
  if (title) request.title = title;
  if (draft.pictures.length > 0) {
    request.media = draft.pictures.map((p) => {
      const alt = cleanPostText(p.altText);
      return alt ? { mediaKey: p.mediaKey!, altText: alt } : { mediaKey: p.mediaKey! };
    });
    if (draft.meme) request.meme = true;
  }
  if (source) request.sourceCredit = source;
  return request;
}
