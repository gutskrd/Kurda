import type { CaseStatus, ReportCategory } from './reports.js';

/**
 * How a picture someone shares is checked before anyone else sees it: the words the server, the website, the phone app
 * and the admin console agree on. A picture is either clear and shown, held for a person to check (only its owner sees
 * it meanwhile), or refused at upload with a reason and a way to ask a person to look again.
 */

/** Where a picture is shown once it is clear. */
export const PICTURE_SURFACES = ['post', 'profile_photo', 'group_photo', 'letter'] as const;
export type PictureSurface = (typeof PICTURE_SURFACES)[number];

/** Whether an accepted picture is shown to others now (`clear`) or waits for a person to check it (`held`). */
export const PICTURE_REVIEW_STATES = ['clear', 'held'] as const;
export type PictureReviewState = (typeof PICTURE_REVIEW_STATES)[number];

/**
 * Why a picture was refused, in words safe to show its owner. `other` covers anything not worth naming, including what
 * child-safety rules forbid, so a refusal never teaches how the check works.
 */
export const PICTURE_REJECT_REASONS = ['sexual', 'violence', 'self_harm', 'hate', 'other'] as const;
export type PictureRejectReason = (typeof PICTURE_REJECT_REASONS)[number];

/**
 * The body of a 422 when a picture is refused at upload: `IMAGE_REJECTED` for post pictures, `PHOTO_REJECTED` for
 * profile and group photos. `reviewId` lets the owner ask a person to check it (`POST /me/picture-reviews/:reviewId`);
 * it is null when a person must check it anyway, or the same picture was refused before.
 */
export interface PictureRejection {
  code: 'IMAGE_REJECTED' | 'PHOTO_REJECTED';
  message: string;
  reason: PictureRejectReason;
  reviewId: string | null;
}

/** A picture waiting for a person, as its owner sees it: a short-lived private link only they can open. */
export interface PendingPicture {
  url: string;
}

/** The outcome of a person checking a picture its owner asked about, or one that was held. */
export const PICTURE_REVIEW_OUTCOMES = ['approved', 'upheld'] as const;
export type PictureReviewOutcome = (typeof PICTURE_REVIEW_OUTCOMES)[number];

/** What the owner's inbox gets when a person has checked their picture; a removal comes as a sanction notice instead. */
export interface PictureReviewNotificationData {
  kind: 'picture_review';
  outcome: PictureReviewOutcome;
  surface: PictureSurface;
  /** the post, group or letter the picture belongs to, when there is one to open */
  target: string | null;
}

/** The most a person may write when asking for a picture to be checked again. */
export const PICTURE_REVIEW_NOTE_MAX = 500;

export function isPictureRejection(body: unknown): body is PictureRejection {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    (b.code === 'IMAGE_REJECTED' || b.code === 'PHOTO_REJECTED') &&
    typeof b.reason === 'string' &&
    (PICTURE_REJECT_REASONS as readonly string[]).includes(b.reason) &&
    (b.reviewId === null || typeof b.reviewId === 'string')
  );
}

// ---------------------------------------------------------------------------
// Admin console: the Pictures page
// ---------------------------------------------------------------------------

/** How sure the automatic check was that a picture shows something in a category. */
export const PICTURE_SCAN_LEVELS = ['none', 'possible', 'likely', 'certain'] as const;
export type PictureScanLevel = (typeof PICTURE_SCAN_LEVELS)[number];

/** What the automatic check looks for. */
export const PICTURE_SCAN_CATEGORIES = ['sexual', 'suggestive', 'minor_safety', 'violence', 'self_harm', 'hate', 'drugs', 'shocking'] as const;
export type PictureScanCategory = (typeof PICTURE_SCAN_CATEGORIES)[number];

/** Why a picture is on the Pictures page: held at upload, its owner asked a person to look, reported, or a child-safety hit. */
export const PICTURE_CASE_ORIGINS = ['held', 'asked', 'reported', 'child_safety'] as const;
export type PictureCaseOrigin = (typeof PICTURE_CASE_ORIGINS)[number];

/** Which list of the Pictures page to show. */
export const PICTURE_CASE_VIEWS = ['waiting', 'asked', 'reported', 'decided'] as const;
export type PictureCaseView = (typeof PICTURE_CASE_VIEWS)[number];

/** One picture waiting for (or given) a decision, as `GET /admin/pictures` lists it. The picture itself is fetched on demand. */
export interface PictureCaseItem {
  caseId: string;
  surface: PictureSurface;
  origin: PictureCaseOrigin;
  /** what the check found, per category; null when no automatic check ran (held for people, or the checker was down) */
  levels: Partial<Record<PictureScanCategory, PictureScanLevel>> | null;
  /** how the picture came to be held */
  checkedBy: 'auto' | 'people_only' | 'checker_unavailable';
  createdAt: string;
  owner: { id: string; username: string; displayName: string | null; minor: boolean | null } | null;
  context: { text: string | null; groupName: string | null };
  /** the owner's own words when they asked for a person to look */
  note: string | null;
  reportCount: number;
  /** the rule reporters chose most often, for a reported picture; null otherwise */
  reportCategory: ReportCategory | null;
  /** a child-safety hit: the console asks before showing it, and it can only be decided through its case */
  sensitive: boolean;
  status: CaseStatus;
  decided: { outcome: 'approved' | 'removed'; byUsername: string | null; at: string } | null;
}

export interface PictureCaseList {
  items: PictureCaseItem[];
  nextCursor: string | null;
  counts: Record<Exclude<PictureCaseView, 'decided'>, number>;
}

/**
 * `GET /admin/pictures/:caseId/image` answers the picture's bytes (never cached, every fetch written to the audit log).
 * The console fetches them with the moderator's own session and shows a local copy, so no storage address reaches the
 * browser and the console's image policy stays closed to other hosts.
 */
export const PICTURE_IMAGE_PATH = (caseId: string): string => `/admin/pictures/${encodeURIComponent(caseId)}/image`;

/**
 * `POST /admin/pictures/:caseId/decide`. A removal names the rule, which the owner is told along with how to appeal. The
 * note stays on the case for staff (at most 1000 characters); the owner is told the rule, not the note.
 */
export type PictureDecision =
  | { decision: 'approve'; note?: string }
  | { decision: 'remove'; policy: ReportCategory; note?: string };
