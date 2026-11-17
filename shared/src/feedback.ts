/**
 * The rating box, "Send feedback", and the native store prompt. After a player's first finished game, once per account,
 * Hevalo holds up five stars; every answer goes to the admin's feedback inbox, with "what could be better?" under three
 * stars and "what do you love?" from three, and nothing links to a store. Sending only happy players on to the store would
 * be review gating, which the app stores' rules and consumer-protection law forbid, so the store prompt never depends on
 * the stars: it may follow a won game or a personal best after a while of play, never for a minor, never in the same
 * session as the box, and rarely. Shared so the API, both apps and the admin inbox agree on categories, limits and shapes.
 */

// ---------- the box ----------

/** The chips under "what could be better?", also in the Settings form. */
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
/** Answers one account may send a day: the box once, the rest from Settings. */
export const APP_FEEDBACK_DAILY_LIMIT = 10;

/** Under this many stars the box asks what could be better; from it, what the player loves. */
export const APP_FEEDBACK_LOW_STARS = 3;

/** The box arrives this long after the results screen shows, without covering it. */
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
 * The gap the API keeps between store prompts, which satisfies both rules above with only the last prompt on record: 90 days
 * alone would allow five in a year (days 0, 90, 180, 270, 360), while 122 days apart no 365 days can hold more than three.
 */
export const STORE_REVIEW_SPACING_DAYS = Math.max(
  STORE_REVIEW_MIN_GAP_DAYS,
  Math.ceil(365 / STORE_REVIEW_MAX_PER_YEAR),
);
/** The box and the store prompt are never closer than this, standing in for "never in the same session" across devices too. */
export const PROMPT_SEPARATION_HOURS = 24;

// ---------- what the API sends and takes ----------

/**
 * `GET /me/app-feedback/state?platform=&appVersion=`. `shouldPrompt`: the account has finished a game and was never shown
 * the box (nor answered or dismissed it). `storeReviewEligible`: the phone may call the store prompt at its next natural
 * break; always false on the web, for minors and unrecorded ages, and when no app version was sent.
 */
export interface AppFeedbackState {
  shouldPrompt: boolean;
  storeReviewEligible: boolean;
}

/**
 * `POST /me/app-feedback` (201 `{ id }`; 429 `RATE_LIMITED` past the daily limit), with at least stars, categories or a
 * comment. Answering from the box or from Settings counts as having been shown the box.
 */
export interface AppFeedbackRequest {
  stars?: number;
  categories?: AppFeedbackCategory[];
  comment?: string;
  source: AppFeedbackSource;
  platform: AppPlatform;
  appVersion: string;
  /** the interface language of the answer; the account's when left out */
  locale?: string;
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
 * `GET /admin/feedback?status=&stars=&category=&platform=&source=&q=&limit=&offset=&beforeId=`: `stars` one number or a
 * list such as `1,2`, `q` searching comment and username (up to 80 characters), an empty parameter no filter. Newest
 * first, `limit` 1–200 (default 50). `beforeId` pages from the last answer of the previous page, which survives answers
 * being marked meanwhile; `total` counts the whole filter.
 */
export interface AdminFeedbackList {
  items: AdminFeedbackItem[];
  total: number;
}

/** `PATCH /admin/feedback/:id`; answers with the updated `AdminFeedbackItem`. */
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
  /** the last 30 days, oldest first, one entry per UTC day even when empty */
  daily: Array<{ day: string; count: number; averageStars: number | null }>;
  byStatus: Record<AppFeedbackStatus, number>;
  byCategory: Record<AppFeedbackCategory, number>;
}

// ---------- when the apps ask ----------

/**
 * Whether to open the box now, on the results screen: only on the transition into finished (not a daily Peyvok reopened
 * or a finished battle opened from a link), never after giving up or in a session that called the store prompt, and only
 * when the API says the account is due.
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
 * Whether the phone may call the store prompt now: after a won game or a personal best, never after a loss, an error or a
 * report, when the API allows and never in the session the box was shown. The apps call it a second or two into the
 * results, never from a button.
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
