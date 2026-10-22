/**
 * The rating box, "Send feedback", and the native store prompt.
 *
 * After a player's first finished game, once per account on any device, Hevalo
 * the deer holds up a board of five stars: how are you enjoying Hevalo? Every
 * answer goes to the admin's feedback inbox — under three stars with "what
 * could be better?", three and more with "what do you love?" — and ends with a
 * thank-you. Nothing in it links to a store.
 *
 * That is deliberate (research3-keyboards-review §2). Sending only the happy
 * players on to the store is review gating, which Apple's guidelines (5.6.1
 * and section 3), Google Play's in-app review policy and the FTC all forbid.
 * So the native store prompt is a separate thing that never depends on the
 * stars: the phone may ask for it after a game the player won or a personal
 * best, once they have played a while, never for a minor, never in the same
 * session as the box, and rarely.
 *
 * Shared so the API that decides, the two apps that ask, and the admin inbox
 * that reads the answers agree on the categories, the limits and the shapes.
 */

// ---------- the box ----------

/** The chips under "what could be better?" (and the Settings form). */
export const APP_FEEDBACK_CATEGORIES = [
  'lessons',
  'games',
  'stories',
  'bugs',
  'too_hard',
  'too_easy',
  'other',
] as const;
export type AppFeedbackCategory = (typeof APP_FEEDBACK_CATEGORIES)[number];

export function isAppFeedbackCategory(v: unknown): v is AppFeedbackCategory {
  return (APP_FEEDBACK_CATEGORIES as readonly unknown[]).includes(v);
}

/** Where an answer came from: the one-time box after a game, or Settings → Send feedback. */
export const APP_FEEDBACK_SOURCES = ['first_game', 'settings'] as const;
export type AppFeedbackSource = (typeof APP_FEEDBACK_SOURCES)[number];

export const APP_PLATFORMS = ['web', 'ios', 'android'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** Where an answer is in the admin's inbox. */
export const APP_FEEDBACK_STATUSES = ['new', 'read', 'archived'] as const;
export type AppFeedbackStatus = (typeof APP_FEEDBACK_STATUSES)[number];

export const APP_FEEDBACK_COMMENT_MAX = 2000;
export const APP_FEEDBACK_NOTE_MAX = 2000;
/** Answers one account may send in a day (the box once, the rest from Settings). */
export const APP_FEEDBACK_DAILY_LIMIT = 10;

/** Under this many stars the box asks what could be better; from it, what the player loves. */
export const APP_FEEDBACK_LOW_STARS = 3;

/** The results screen shows first; the box arrives this long after, without covering it. */
export const APP_FEEDBACK_DELAY_MS = 1200;

/** Which follow-up question the box asks after the stars. */
export function feedbackFollowUp(stars: number): 'improve' | 'love' {
  return stars < APP_FEEDBACK_LOW_STARS ? 'improve' : 'love';
}

// ---------- the native store prompt ----------

/** Finished games before the store prompt may come up at all … */
export const STORE_REVIEW_MIN_GAMES = 3;
/** … played on at least this many different days. */
export const STORE_REVIEW_MIN_DAYS = 2;
/** At least this long between two store prompts … */
export const STORE_REVIEW_MIN_GAP_DAYS = 90;
/** … and no more than this many in a year. */
export const STORE_REVIEW_MAX_PER_YEAR = 3;
/**
 * The gap the API actually keeps between two store prompts: the longer of the
 * two rules above, and what makes both true with only the last prompt on
 * record. 90 days alone allows a fourth and a fifth within a year (days 0, 90,
 * 180, 270, 360); 122 days apart, no 365 days can hold more than three.
 */
export const STORE_REVIEW_SPACING_DAYS = Math.max(
  STORE_REVIEW_MIN_GAP_DAYS,
  Math.ceil(365 / STORE_REVIEW_MAX_PER_YEAR),
);
/**
 * The box and the store prompt are never this close together. A stand-in for
 * "never in the same session" that also holds across devices; the apps keep
 * the session rule themselves as well.
 */
export const PROMPT_SEPARATION_HOURS = 24;

// ---------- what the API sends and takes ----------

/**
 * `GET /me/app-feedback/state?platform=&appVersion=`
 *
 * `shouldPrompt`: this account has never been shown the box (nor answered or
 * dismissed it anywhere) and has finished a game. `storeReviewEligible`: the
 * phone may call the native prompt at its next natural break; always false on
 * the web, for minors and accounts whose age is not on record, and when the
 * request did not say which app version is asking.
 */
export interface AppFeedbackState {
  shouldPrompt: boolean;
  storeReviewEligible: boolean;
}

/**
 * `POST /me/app-feedback` (201 `{ id }`; 429 `RATE_LIMITED` past the daily
 * limit). At least one of stars, categories or comment. Answering — from the
 * box or from Settings — counts as having been shown the box.
 */
export interface AppFeedbackRequest {
  stars?: number;
  categories?: AppFeedbackCategory[];
  comment?: string;
  source: AppFeedbackSource;
  platform: AppPlatform;
  appVersion: string;
  /** the interface language the answer was written in; the account's when left out */
  locale?: string;
}

/** `POST /me/store-review/prompted`: the phone has just called the native prompt for this version. */
export interface StoreReviewPromptedRequest {
  appVersion: string;
}

/** One answer in `GET /admin/feedback`. */
export interface AdminFeedbackItem {
  id: string;
  /** null once the account is gone */
  user: { id: string; username: string } | null;
  stars: number | null;
  categories: AppFeedbackCategory[];
  comment: string | null;
  source: AppFeedbackSource;
  platform: AppPlatform;
  appVersion: string;
  locale: string | null;
  status: AppFeedbackStatus;
  adminNote: string | null;
  createdAt: string;
}

/**
 * `GET /admin/feedback?status=&stars=&category=&platform=&source=&q=&limit=&offset=&beforeId=`
 * (`stars` one number or a comma-separated list, e.g. `1,2`; `q` searches the
 * comment and the username, up to 80 characters; a parameter sent empty is no
 * filter). Newest first; `limit` 1–200, default 50. `beforeId` (the last
 * answer of the page before) starts the page after it — the way to page while
 * answers are being marked, which an offset would skip; `total` counts the
 * whole filter either way.
 */
export interface AdminFeedbackList {
  items: AdminFeedbackItem[];
  total: number;
}

/** `PATCH /admin/feedback/:id` — answers with the updated `AdminFeedbackItem`. */
export interface AdminFeedbackPatch {
  status?: AppFeedbackStatus;
  /** null or '' clears it */
  adminNote?: string | null;
}

export interface FeedbackStats {
  count: number;
  /** average of the answers that gave stars; null when none did */
  averageStars: number | null;
  /** answers with 1, 2, 3, 4 and 5 stars, in that order */
  distribution: [number, number, number, number, number];
}

/** `GET /admin/feedback/summary` */
export interface AdminFeedbackSummary {
  total: FeedbackStats;
  last30Days: FeedbackStats;
  /** the last 30 days, oldest first, one entry per day (UTC) even when empty */
  daily: Array<{ day: string; count: number; averageStars: number | null }>;
  byStatus: Record<AppFeedbackStatus, number>;
  byCategory: Record<AppFeedbackCategory, number>;
}

// ---------- when the apps ask ----------

/**
 * Whether to open the box now, on the results screen.
 *
 * Only on the transition into finished — a daily Peyvok reopened after it was
 * played, or a finished battle opened from a link, is not a game just
 * finished — and never after giving up, never in a session that has already
 * called the store prompt, and only when the API says this account is due.
 */
export function shouldOfferFeedbackBox(input: {
  state: AppFeedbackState | null;
  justFinished: boolean;
  gaveUp: boolean;
  storePromptThisSession: boolean;
}): boolean {
  return Boolean(input.state?.shouldPrompt) && input.justFinished && !input.gaveUp && !input.storePromptThisSession;
}

/**
 * Whether the phone may call the native store prompt now: after a game won or
 * a personal best (never after a loss, an error or a report), when the API
 * says so, and never in the session the box was shown. The apps call it a
 * second or two into the results, never from a button.
 */
export function shouldAskStoreReview(input: {
  state: AppFeedbackState | null;
  platform: AppPlatform;
  moment: 'won' | 'personal_best' | 'other';
  feedbackBoxThisSession: boolean;
  storePromptThisSession: boolean;
}): boolean {
  return (
    input.platform !== 'web' &&
    Boolean(input.state?.storeReviewEligible) &&
    input.moment !== 'other' &&
    !input.feedbackBoxThisSession &&
    !input.storePromptThisSession
  );
}
