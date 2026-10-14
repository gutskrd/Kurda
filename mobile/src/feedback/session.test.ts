import { describe, expect, it } from 'vitest';
import { FeedbackSession } from './session';

const due = { shouldPrompt: true, storeReviewEligible: false };
const storeDue = { shouldPrompt: false, storeReviewEligible: true };

describe('FeedbackSession.decide', () => {
  it('opens the box after a finished game when the account is due', () => {
    expect(new FeedbackSession().decide({ state: due, finish: { moment: 'other' }, platform: 'ios', minor: false })).toBe('box');
  });

  it('never opens it after a game given up', () => {
    expect(
      new FeedbackSession().decide({ state: due, finish: { moment: 'other', gaveUp: true }, platform: 'ios', minor: false }),
    ).toBe('nothing');
  });

  it('opens it once per session, whatever the server says next', () => {
    const s = new FeedbackSession();
    s.boxShown = true;
    expect(s.decide({ state: due, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('nothing');
  });

  it('asks the store only after a win or a personal best, and only when eligible', () => {
    const s = new FeedbackSession();
    expect(s.decide({ state: storeDue, finish: { moment: 'won' }, platform: 'android', minor: false })).toBe('store');
    expect(s.decide({ state: storeDue, finish: { moment: 'personal_best' }, platform: 'ios', minor: false })).toBe('store');
    expect(s.decide({ state: storeDue, finish: { moment: 'other' }, platform: 'ios', minor: false })).toBe('nothing');
    expect(s.decide({ state: due, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('box');
  });

  it('never asks the store in the session the box was shown, nor shows the box after the store was asked', () => {
    const afterBox = new FeedbackSession();
    afterBox.boxShown = true;
    expect(afterBox.decide({ state: storeDue, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('nothing');

    const afterStore = new FeedbackSession();
    afterStore.storeAsked = true;
    expect(afterStore.decide({ state: due, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('nothing');
  });

  it('never asks a minor, nor on the web, nor twice', () => {
    expect(new FeedbackSession().decide({ state: storeDue, finish: { moment: 'won' }, platform: 'ios', minor: true })).toBe('nothing');
    expect(new FeedbackSession().decide({ state: storeDue, finish: { moment: 'won' }, platform: 'web', minor: false })).toBe('nothing');
    const s = new FeedbackSession();
    s.storeAsked = true;
    expect(s.decide({ state: storeDue, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('nothing');
  });

  it('does nothing when the state could not be read', () => {
    expect(new FeedbackSession().decide({ state: null, finish: { moment: 'won' }, platform: 'ios', minor: false })).toBe('nothing');
  });
});
