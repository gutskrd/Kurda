import {
  PICTURE_REVIEW_NOTE_MAX,
  isPictureRejection,
  type PendingPicture,
  type PictureRejectReason,
  type PictureRejection,
  type PictureReviewNotificationData,
  type PictureReviewState,
  type PictureReviewTarget,
  type PictureSurface,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { describeError, type Translate } from '../api/errors';
import type { ApiError, ApiResult } from '../api/types';
import type { TranslationKey } from '../i18n/translations';

/**
 * How the phone reads a picture's check (shared picture-review.ts), with no React Native: why a picture was refused, in
 * the reader's words; asking a person to look again; what a held picture's owner is told; and the inbox's line and
 * destination once a person has decided.
 */

/** What a refusal says, by its reason; self-harm also offers the helpline. */
export const REFUSAL_KEY: Readonly<Record<PictureRejectReason, TranslationKey>> = {
  sexual: 'picture.refused.sexual',
  violence: 'picture.refused.violence',
  self_harm: 'picture.refused.selfHarm',
  hate: 'picture.refused.hate',
  other: 'picture.refused.other',
};

/** A refusal from an upload's raw answer (the bytes bypass the JSON client), or null when it is not one. */
export function rejectionInBody(status: number, body: string): PictureRejection | null {
  if (status !== 422) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return isPictureRejection(parsed) ? parsed : null;
  } catch {
    // Not JSON (a proxy's page): not a refusal this can explain.
    return null;
  }
}

/** A refusal the JSON client kept (api/client.ts), or null. */
export function rejectionOf(error: ApiError | null | undefined): PictureRejection | null {
  return error?.rejection ?? null;
}

/** Whether something of yours (a letter, your bird's letter) waits for a person before anyone else sees it. */
export function isHeld(value: unknown): boolean {
  return (value as { review?: unknown } | null | undefined)?.review === 'held';
}

/** Whether an upload's answer says the picture waits for a person; anything else is shown at once. */
export function reviewStateOf(body: { review?: unknown }): PictureReviewState {
  return body.review === 'held' ? 'held' : 'clear';
}

/** A picture waiting for a person, from an answer's field, when it is a link the owner can open. */
export function pendingOf(value: unknown): PendingPicture | null {
  const url = (value as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? { url } : null;
}

/** Ask a person to look at a refused picture again, with an optional note no longer than the server keeps. */
export function askForReview(client: ApiClient, reviewId: string, note: string): Promise<ApiResult<{ ok: true }>> {
  const said = note.trim().slice(0, PICTURE_REVIEW_NOTE_MAX);
  return client.post<{ ok: true }>(`/me/picture-reviews/${encodeURIComponent(reviewId)}`, said ? { note: said } : {});
}

/**
 * What asking said: done (the person will be told), already asked (the same promise, so it is done too), or a failure
 * in the app's usual words, for the sheet to show and keep the note.
 */
export function askOutcome(res: ApiResult<unknown>, t: Translate): { done: boolean; text: string } {
  if (res.ok) return { done: true, text: t('picture.ask.thanks') };
  if (res.error.code === 'REVIEW_ALREADY_ASKED') return { done: true, text: t('picture.ask.already') };
  return { done: false, text: describeError(res.error, t) };
}

/** A notification's data read as a picture's check, or null; only the outcomes, surfaces and targets this app knows. */
export function pictureReviewOf(data: Record<string, unknown>): PictureReviewNotificationData | null {
  if (data.kind !== 'picture_review') return null;
  if (data.outcome !== 'approved' && data.outcome !== 'upheld') return null;
  const surface = data.surface;
  if (surface !== 'post' && surface !== 'profile_photo' && surface !== 'group_photo' && surface !== 'letter') return null;
  return { kind: 'picture_review', outcome: data.outcome, surface, asked: data.asked === true, target: targetOf(data.target) };
}

const TARGET_TYPES: readonly PictureReviewTarget['type'][] = ['library_post', 'image_post', 'group', 'letter_thread'];
const UUIDISH = /^[0-9a-f-]{8,64}$/i;

/** A target this app can open; an unknown kind or an id that is not an id is never followed. */
function targetOf(value: unknown): PictureReviewTarget | null {
  const t = value as { type?: unknown; id?: unknown } | null | undefined;
  if (!t || !TARGET_TYPES.includes(t.type as PictureReviewTarget['type'])) return null;
  return typeof t.id === 'string' && UUIDISH.test(t.id) ? { type: t.type as PictureReviewTarget['type'], id: t.id } : null;
}

const APPROVED_KEY: Readonly<Record<PictureSurface, TranslationKey>> = {
  post: 'notifications.picture.approvedPost',
  profile_photo: 'notifications.picture.approvedProfile',
  group_photo: 'notifications.picture.approvedGroup',
  letter: 'notifications.picture.approvedLetter',
};

/**
 * The inbox's words for a person's decision, in the reader's language: where an approved picture now shows, or for a
 * refused one its owner asked about, that it may be shared again, since nothing was put back for them.
 */
export function pictureReviewText(review: PictureReviewNotificationData, t: Translate): { title: string; body: string } {
  if (review.outcome === 'upheld') return { title: t('notifications.picture.upheldTitle'), body: t('notifications.picture.upheldBody') };
  return { title: t('notifications.picture.approvedTitle'), body: t(review.asked ? 'notifications.picture.approvedAsked' : APPROVED_KEY[review.surface]) };
}

/** Where a tap goes: what the picture belongs to, your own profile for a profile photo, else nowhere. */
export type PictureReviewLink =
  | { screen: 'LibraryPost'; params: { postId: string } }
  | { screen: 'MemeDetail'; params: { postId: string } }
  | { screen: 'GroupThread'; params: { groupId: string; name: string } }
  | { screen: 'LetterThread'; params: { threadId: string } }
  | { screen: 'Tabs'; params: { screen: 'Profile' } };

export function pictureReviewLink(review: PictureReviewNotificationData): PictureReviewLink | null {
  const target = review.target;
  if (!target) return review.outcome === 'approved' && review.surface === 'profile_photo' && !review.asked ? { screen: 'Tabs', params: { screen: 'Profile' } } : null;
  switch (target.type) {
    case 'library_post':
      return { screen: 'LibraryPost', params: { postId: target.id } };
    case 'image_post':
      return { screen: 'MemeDetail', params: { postId: target.id } };
    case 'group':
      return { screen: 'GroupThread', params: { groupId: target.id, name: '' } };
    case 'letter_thread':
      return { screen: 'LetterThread', params: { threadId: target.id } };
  }
}
