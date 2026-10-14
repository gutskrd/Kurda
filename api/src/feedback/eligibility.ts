/**
 * When the rating box is due and when the phone may ask for a store review —
 * the rules in one place, kept pure so each can be tested on its own
 * (@kurda/shared `feedback` explains why the two never depend on each other).
 */
import {
  PROMPT_SEPARATION_HOURS,
  STORE_REVIEW_MIN_DAYS,
  STORE_REVIEW_MIN_GAMES,
  STORE_REVIEW_SPACING_DAYS,
  type AppFeedbackState,
  type AppPlatform,
} from '@kurda/shared';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface FeedbackFacts {
  now: Date;
  /** when the box was shown, answered or dismissed (any of them, on any device) */
  feedbackPromptedAt: Date | null;
  storeReviewPromptedAt: Date | null;
  /** the app version the store prompt was last called in */
  storeReviewVersion: string | null;
  finishedGames: number;
  /** different days those games were finished on */
  finishedDays: number;
  /** 18 or over with a birth month on record — never a minor, never unknown */
  knownAdult: boolean;
  /** who is asking: the store prompt is for the phone apps only */
  platform: AppPlatform | null;
  appVersion: string | null;
}

function within(at: Date | null, now: Date, ms: number): boolean {
  return at !== null && now.getTime() - at.getTime() < ms;
}

/**
 * The box: once per account, ever, after a finished game — and not while the
 * store prompt was just called (PROMPT_SEPARATION_HOURS stands in for "not in
 * the same session", and holds across devices).
 */
export function shouldPromptFeedback(f: FeedbackFacts): boolean {
  return (
    f.feedbackPromptedAt === null &&
    f.finishedGames >= 1 &&
    !within(f.storeReviewPromptedAt, f.now, PROMPT_SEPARATION_HOURS * HOUR)
  );
}

/**
 * The native store prompt: a phone app, a known adult, a few games on more
 * than one day, at most once per app version and STORE_REVIEW_SPACING_DAYS
 * apart (which keeps it to three a year), and not while the box was just
 * shown. Nothing here knows the stars, and nothing may.
 */
export function storeReviewEligible(f: FeedbackFacts): boolean {
  return (
    (f.platform === 'ios' || f.platform === 'android') &&
    f.appVersion !== null &&
    f.knownAdult &&
    f.finishedGames >= STORE_REVIEW_MIN_GAMES &&
    f.finishedDays >= STORE_REVIEW_MIN_DAYS &&
    f.storeReviewVersion !== f.appVersion &&
    !within(f.storeReviewPromptedAt, f.now, STORE_REVIEW_SPACING_DAYS * DAY) &&
    !within(f.feedbackPromptedAt, f.now, PROMPT_SEPARATION_HOURS * HOUR)
  );
}

export function feedbackState(f: FeedbackFacts): AppFeedbackState {
  return { shouldPrompt: shouldPromptFeedback(f), storeReviewEligible: storeReviewEligible(f) };
}
