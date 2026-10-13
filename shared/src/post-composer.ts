/**
 * Writing a post: one box for words and up to four pictures, X-style.
 *
 * A written post (a gotin, a çîrok or a helbest) can carry pictures now, so
 * "words or a picture first?" is no longer a question anybody has to answer.
 * The API decides what a post may be, and the browser and the phone both build
 * the request and show the counter — so the limits, the rule for what kind of
 * post it is, the way characters are counted and the shape of a draft kept on
 * the device live here, where the three cannot drift apart.
 *
 * Drafts stay on the device (the browser's storage, the phone's). The server's
 * own "draft" status is still there for apps installed before this, and
 * `GET /me/library/drafts` finds what they saved.
 */
import { stripControlChars } from './sanitize.js';

/** A çîrok's or a helbest's name. */
export const POST_TITLE_MAX = 200;
/**
 * The text of a post, with or without pictures.
 *
 * One limit: a caption used to be its own, shorter thing on a separate kind of
 * post, but pictures live on the written post now and the words are the same
 * words either way.
 */
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

/** Only a gotin may go without a name; the database says so too. */
export function titleRequiredFor(type: WrittenPostType): boolean {
  return type !== 'gotin';
}

/**
 * Text as the server keeps it: control characters stripped (newlines and tabs
 * stay, a poem needs its lines), the ends trimmed.
 */
export function cleanPostText(text: string | null | undefined): string {
  return text ? stripControlChars(text).trim() : '';
}

/**
 * How long a piece of text is, counted exactly the way the server counts it.
 *
 * The counter under the box must agree with the server to the character, or
 * someone is told they have room left and then refused: so it is the cleaned
 * text's `.length` (UTF-16 units, which is what the server measures) — spaces
 * and blank lines at either end do not count, an emoji counts as two.
 */
export function postTextLength(text: string | null | undefined): number {
  return cleanPostText(text).length;
}

/**
 * What kind of written post this is.
 *
 * A kind somebody chose wins. Without one the title decides: no title makes a
 * gotin, a title makes a çîrok (a helbest is only ever chosen). Clearing the
 * title of an unchosen post goes back to a gotin.
 */
export function derivePostType(input: { title?: string | null; type?: WrittenPostType | null }): WrittenPostType {
  if (input.type && isWrittenPostType(input.type)) return input.type;
  return cleanPostText(input.title) ? 'story' : 'gotin';
}

/** What a post is made of — a draft, a request, or a post being edited. */
export interface PostContent {
  /** the kind somebody chose; empty means "decide from the title" */
  type?: WrittenPostType | null;
  title?: string | null;
  body?: string | null;
  pictures?: ReadonlyArray<{ altText?: string | null }>;
  /** marked as a meme, for the Memes filter — only a post with pictures can be */
  meme?: boolean;
  sourceCredit?: string | null;
}

/** A field that has a length limit. */
export type PostTextField = 'title' | 'body' | 'altText' | 'sourceCredit';

/**
 * Why a post cannot be posted yet. `code` is the error code the API answers
 * with (HTTP 422), so a client can use one message table for both.
 */
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

/**
 * Everything that stops this post from being posted, most fundamental first.
 * Empty when it can be posted.
 */
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
  // one problem for the alt texts, however many of them are too long
  if (pictures.some((p) => postTextLength(p.altText) > POST_ALT_MAX)) {
    problems.push({ code: 'TOO_LONG', field: 'altText', max: POST_ALT_MAX });
  }
  tooLong('sourceCredit', post.sourceCredit);
  return problems;
}

/**
 * Whether the Post button is on, and if not, the first thing to fix.
 *
 * The API runs the same check, so a post this allows is not refused for its
 * shape — only for what the server alone knows (whose pictures they are,
 * posting too fast).
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
 * `POST /library/posts`.
 *
 * `type` may be left out (see `derivePostType`); `body` may be empty when
 * there are pictures. Each `mediaKey` must be the author's own upload, not yet
 * on any post.
 */
export interface CreatePostRequest {
  type?: WrittenPostType;
  title?: string | null;
  body?: string;
  media?: PostMediaInput[];
  meme?: boolean;
  sourceCredit?: string | null;
  language?: string;
  /** false saves a server draft — kept for apps installed before device drafts */
  publish?: boolean;
}

/**
 * `PATCH /library/posts/:id`. Every field is optional; `media` replaces the
 * whole list in the order given — a key already on the post stays, a new one
 * must be an unused upload of the author's, and a key left out is let go.
 * `title: null` clears a gotin's title.
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

/** A picture on a post, as the API sends it back (in order). */
export interface PostMediaView {
  mediaKey: string;
  /** null only when the server has no storage configured */
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

/**
 * A picture on a wall card (`GET /feed` → `items[].images`, the first four).
 * Old picture posts have no alt text and no recorded size.
 */
export interface FeedImage {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

/**
 * The codes `POST`/`PATCH /library/posts` (and `POST /images`) answer with when
 * a post is refused, beyond the shape problems above:
 *
 * - INVALID_MEDIA: a picture that is not the author's own upload for a post,
 *   or one the scan did not clear (with `mediaKey`);
 * - MEDIA_IN_USE: an upload already on a post, or twice in this one (with
 *   `mediaKey`). One upload is one post's: to post the same picture again,
 *   upload it again (a file already posted comes back as a new upload);
 * - INVALID_POST: the old picture route's answer for an unusable picture;
 * - TRUST_VELOCITY (429): posting faster than the account may yet;
 * - AUTO_MODERATED (403): the account was just restricted for spam.
 */
export const POST_ERROR_CODES = [
  'EMPTY_POST',
  'TITLE_REQUIRED',
  'TOO_LONG',
  'TOO_MANY_PICTURES',
  'MEME_NEEDS_PICTURE',
  'INVALID_MEDIA',
  'MEDIA_IN_USE',
  'INVALID_POST',
  'TRUST_VELOCITY',
  'AUTO_MODERATED',
] as const;
export type PostErrorCode = (typeof POST_ERROR_CODES)[number];

/**
 * Where to upload a picture for a post.
 *
 * "I made this" (on unless switched off) puts the small Hevalo signature with
 * the poster's handle on the picture; a picture somebody did not make goes up
 * without it, since a signature on it would claim it as theirs.
 */
export function pictureUploadPath(ownWork: boolean): string {
  return ownWork ? '/images/upload' : '/images/upload?ownWork=false';
}

// ---- drafts on the device ---------------------------------------------------

/** A picture in a draft: picked, maybe already uploaded. */
export interface PostPictureDraft {
  /** set once uploaded; an upload not used by a post is cleared away after a day */
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

/** Nothing worth keeping: closing the composer need not ask. */
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
 * Read a draft back from the device.
 *
 * Storage can hold anything — an older version, a half-written value, a value
 * another tab wrote — so this accepts the JSON text or the parsed value, keeps
 * what it recognises, and answers null rather than throwing when it is not a
 * draft at all. Pictures past the limit are dropped.
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
 * The request for a finished draft, or null while a picture is still uploading.
 *
 * Empty fields are left out rather than sent empty, so the request means the
 * same thing to the server as the draft does to the counter.
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
