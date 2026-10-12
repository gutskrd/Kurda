import { describe, expect, it } from 'vitest';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_FEEDBACK_LOW_STARS,
  STORE_REVIEW_MAX_PER_YEAR,
  STORE_REVIEW_MIN_GAP_DAYS,
  STORE_REVIEW_SPACING_DAYS,
  feedbackFollowUp,
  isAppFeedbackCategory,
  shouldAskStoreReview,
  shouldOfferFeedbackBox,
  type AppFeedbackState,
} from './feedback.js';

const due: AppFeedbackState = { shouldPrompt: true, storeReviewEligible: true };
const notDue: AppFeedbackState = { shouldPrompt: false, storeReviewEligible: false };

describe('the rating box', () => {
  it('asks what could be better under three stars, and what they love from three', () => {
    expect(APP_FEEDBACK_LOW_STARS).toBe(3);
    expect(feedbackFollowUp(1)).toBe('improve');
    expect(feedbackFollowUp(2)).toBe('improve');
    expect(feedbackFollowUp(3)).toBe('love');
    expect(feedbackFollowUp(5)).toBe('love');
  });

  it('offers the chips the owner asked for', () => {
    expect(APP_FEEDBACK_CATEGORIES).toEqual(['lessons', 'games', 'stories', 'bugs', 'too_hard', 'too_easy', 'other']);
    expect(isAppFeedbackCategory('bugs')).toBe(true);
    expect(isAppFeedbackCategory('ads')).toBe(false);
  });

  it('opens on a game just finished, when the account is due', () => {
    expect(
      shouldOfferFeedbackBox({ state: due, justFinished: true, gaveUp: false, storePromptThisSession: false }),
    ).toBe(true);
  });

  it('never on a finished game reopened, a game given up, or after a store prompt this session', () => {
    const base = { state: due, justFinished: true, gaveUp: false, storePromptThisSession: false };
    expect(shouldOfferFeedbackBox({ ...base, justFinished: false })).toBe(false);
    expect(shouldOfferFeedbackBox({ ...base, gaveUp: true })).toBe(false);
    expect(shouldOfferFeedbackBox({ ...base, storePromptThisSession: true })).toBe(false);
    expect(shouldOfferFeedbackBox({ ...base, state: notDue })).toBe(false);
    // the state could not be loaded: no box, rather than one shown twice
    expect(shouldOfferFeedbackBox({ ...base, state: null })).toBe(false);
  });
});

describe('the native store prompt', () => {
  const base = {
    state: due,
    platform: 'ios' as const,
    moment: 'won' as const,
    feedbackBoxThisSession: false,
    storePromptThisSession: false,
  };

  it('comes after a game won or a personal best, when the API says so', () => {
    expect(shouldAskStoreReview(base)).toBe(true);
    expect(shouldAskStoreReview({ ...base, moment: 'personal_best', platform: 'android' })).toBe(true);
  });

  it('never depends on the stars: nothing about the box goes in but whether it was shown', () => {
    // the only box-related input is the session rule; the stars are not even a parameter
    expect(shouldAskStoreReview({ ...base, feedbackBoxThisSession: true })).toBe(false);
  });

  it('never on the web, after a loss, twice in a session, or when not eligible', () => {
    expect(shouldAskStoreReview({ ...base, platform: 'web' })).toBe(false);
    expect(shouldAskStoreReview({ ...base, moment: 'other' })).toBe(false);
    expect(shouldAskStoreReview({ ...base, storePromptThisSession: true })).toBe(false);
    expect(shouldAskStoreReview({ ...base, state: notDue })).toBe(false);
    expect(shouldAskStoreReview({ ...base, state: null })).toBe(false);
  });

  it('keeps prompts far enough apart that a year never holds more than three', () => {
    expect(STORE_REVIEW_SPACING_DAYS).toBeGreaterThanOrEqual(STORE_REVIEW_MIN_GAP_DAYS);
    // the earliest possible prompts, each the minimum gap after the last
    const days = Array.from({ length: 10 }, (_, i) => i * STORE_REVIEW_SPACING_DAYS);
    for (const start of days) {
      const inYear = days.filter((d) => d >= start && d < start + 365);
      expect(inYear.length).toBeLessThanOrEqual(STORE_REVIEW_MAX_PER_YEAR);
    }
  });
});
