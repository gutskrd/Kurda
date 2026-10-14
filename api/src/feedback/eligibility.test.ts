import { describe, expect, it } from 'vitest';
import { STORE_REVIEW_SPACING_DAYS } from '@kurda/shared';
import { feedbackState, shouldPromptFeedback, storeReviewEligible, type FeedbackFacts } from './eligibility.js';

const NOW = new Date('2026-10-12T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

/** A player the store prompt is due for, and the box is not. */
const veteran: FeedbackFacts = {
  now: NOW,
  feedbackPromptedAt: daysAgo(30),
  storeReviewPromptedAt: null,
  storeReviewVersion: null,
  finishedGames: 5,
  finishedDays: 3,
  knownAdult: true,
  platform: 'ios',
  appVersion: '1.4.0',
};

/** A player who has just finished their first game. */
const newcomer: FeedbackFacts = {
  ...veteran,
  feedbackPromptedAt: null,
  finishedGames: 1,
  finishedDays: 1,
};

describe('the rating box', () => {
  it('is due after the first finished game', () => {
    expect(shouldPromptFeedback(newcomer)).toBe(true);
  });

  it('waits for a finished game', () => {
    expect(shouldPromptFeedback({ ...newcomer, finishedGames: 0, finishedDays: 0 })).toBe(false);
  });

  it('comes once per account, ever', () => {
    expect(shouldPromptFeedback({ ...newcomer, feedbackPromptedAt: daysAgo(400) })).toBe(false);
  });

  it('is offered to minors too — it is feedback, not a review', () => {
    expect(shouldPromptFeedback({ ...newcomer, knownAdult: false, platform: 'web' })).toBe(true);
  });

  it('never comes on the heels of a store prompt', () => {
    expect(shouldPromptFeedback({ ...newcomer, storeReviewPromptedAt: hoursAgo(2) })).toBe(false);
    expect(shouldPromptFeedback({ ...newcomer, storeReviewPromptedAt: hoursAgo(30) })).toBe(true);
  });
});

describe('the store prompt', () => {
  it('is eligible for a known adult with a few games on more than one day', () => {
    expect(storeReviewEligible(veteran)).toBe(true);
    expect(storeReviewEligible({ ...veteran, platform: 'android' })).toBe(true);
  });

  it('never on the web, or when the app does not say its version', () => {
    expect(storeReviewEligible({ ...veteran, platform: 'web' })).toBe(false);
    expect(storeReviewEligible({ ...veteran, platform: null })).toBe(false);
    expect(storeReviewEligible({ ...veteran, appVersion: null })).toBe(false);
  });

  it('never for a minor, or an account whose age is not on record', () => {
    expect(storeReviewEligible({ ...veteran, knownAdult: false })).toBe(false);
  });

  it('waits for three finished games on two different days', () => {
    expect(storeReviewEligible({ ...veteran, finishedGames: 2 })).toBe(false);
    expect(storeReviewEligible({ ...veteran, finishedDays: 1 })).toBe(false);
    expect(storeReviewEligible({ ...veteran, finishedGames: 3, finishedDays: 2 })).toBe(true);
  });

  it('asks at most once per app version', () => {
    const asked = { ...veteran, storeReviewPromptedAt: daysAgo(400), storeReviewVersion: '1.4.0' };
    expect(storeReviewEligible(asked)).toBe(false);
    expect(storeReviewEligible({ ...asked, appVersion: '1.5.0' })).toBe(true);
  });

  it('keeps its spacing, so a year never holds more than three', () => {
    const asked = { ...veteran, storeReviewVersion: '1.3.0' };
    expect(storeReviewEligible({ ...asked, storeReviewPromptedAt: daysAgo(90) })).toBe(false);
    expect(storeReviewEligible({ ...asked, storeReviewPromptedAt: daysAgo(STORE_REVIEW_SPACING_DAYS - 1) })).toBe(false);
    expect(storeReviewEligible({ ...asked, storeReviewPromptedAt: daysAgo(STORE_REVIEW_SPACING_DAYS) })).toBe(true);
  });

  it('never in the session the box was shown', () => {
    expect(storeReviewEligible({ ...veteran, feedbackPromptedAt: hoursAgo(1) })).toBe(false);
    expect(storeReviewEligible({ ...veteran, feedbackPromptedAt: hoursAgo(25) })).toBe(true);
  });

  it('is decided without the stars: none of the facts is an answer', () => {
    // a structural guarantee as much as a test — the facts have no rating in them
    expect(Object.keys(veteran).some((k) => /star|rating/i.test(k))).toBe(false);
  });
});

describe('feedbackState', () => {
  it('answers both questions at once', () => {
    expect(feedbackState(newcomer)).toEqual({ shouldPrompt: true, storeReviewEligible: false });
    expect(feedbackState(veteran)).toEqual({ shouldPrompt: false, storeReviewEligible: true });
  });
});
