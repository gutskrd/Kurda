import { describe, expect, it } from 'vitest';
import type { StoryListItem } from '@kurda/shared';
import { availableLengths, changeSetup, createInput, initialSetup, inviteSettings, questionCountsFor } from './setup';

const story = (over: Partial<StoryListItem>): StoryListItem =>
  ({ id: 's', slug: 's', title: 'T', summary: null, dialect: 'kurmanci', level: 1, length: 'short', wordCount: 80, readingMinutes: 2, fullyNarrated: false, ...over }) as StoryListItem;

describe('story setup rules', () => {
  it('offers only lengths that have a published story in the variety', () => {
    const list = [story({ length: 'long' }), story({ length: 'short' }), story({ length: 'medium', dialect: 'sorani' })];
    expect(availableLengths(list, 'kurmanci')).toEqual(['short', 'long']);
    expect(availableLengths(list, 'sorani')).toEqual(['medium']);
  });

  it('offers the counts each length allows, and nothing else', () => {
    expect(questionCountsFor('short')).toEqual([3, 5]);
    expect(questionCountsFor('medium')).toEqual([3, 5, 10]);
    expect(questionCountsFor('long')).toEqual([5, 10]);
  });

  it('starts on the length’s default count and the mode’s default timer', () => {
    expect(initialSetup({ mode: 'solo', dialect: 'kurmanci', length: 'medium' })).toMatchObject({ questionCount: 5, timerSeconds: 0 });
    expect(initialSetup({ mode: 'group', dialect: 'kurmanci', length: 'long' })).toMatchObject({ questionCount: 5, timerSeconds: 60 });
  });

  it('a chosen story fixes the length; "Quiz yourself" starts from what this phone remembered', () => {
    const s = initialSetup({
      mode: 'solo',
      dialect: 'sorani',
      story: { id: 'abc', length: 'long' },
      solo: { questionCount: { long: 10, short: 3 }, timerSeconds: 30, textDuring: 'hidden' },
    });
    expect(s).toMatchObject({ storyId: 'abc', length: 'long', questionCount: 10, timerSeconds: 30, textDuring: 'hidden' });
  });

  it('moves a count the new length does not allow to its default, and drops a story of the old length', () => {
    let s = initialSetup({ mode: 'duo', dialect: 'kurmanci', length: 'medium' });
    s = changeSetup(s, { questionCount: 10, storyId: 'x' });
    s = changeSetup(s, { length: 'short' });
    expect(s).toMatchObject({ length: 'short', questionCount: 3, storyId: null });
    s = changeSetup(s, { length: 'long', questionCount: 3 });
    expect(s.questionCount).toBe(5);
  });

  it('follows the mode’s timer until the host picks one', () => {
    let s = initialSetup({ mode: 'solo', dialect: 'kurmanci' });
    s = changeSetup(s, { mode: 'duo' });
    expect(s.timerSeconds).toBe(60);
    s = changeSetup(s, { timerSeconds: 0 });
    s = changeSetup(s, { mode: 'group' });
    expect(s.timerSeconds).toBe(0);
  });

  it('sends the story when one was chosen, else the variety and length, and never opens a solo game', () => {
    const picked = changeSetup(initialSetup({ mode: 'duo', dialect: 'kurmanci', story: { id: 'abc', length: 'short' } }), { access: 'open' });
    expect(createInput(picked)).toEqual({ mode: 'duo', storyId: 'abc', questionCount: 3, timerSeconds: 60, textDuring: 'visible', access: 'open' });
    const surprise = initialSetup({ mode: 'solo', dialect: 'sorani', length: 'medium' });
    expect(createInput(changeSetup(surprise, { access: 'open' }), { skipReading: true })).toEqual({
      mode: 'solo',
      dialect: 'sorani',
      length: 'medium',
      questionCount: 5,
      timerSeconds: 0,
      textDuring: 'visible',
      access: 'friends',
      skipReading: true,
    });
  });

  it('turns a setup into an invite lobby’s settings (a duo at least)', () => {
    expect(inviteSettings(initialSetup({ mode: 'solo', dialect: 'kurmanci', length: 'short' }))).toMatchObject({ mode: 'duo', dialect: 'kurmanci', length: 'short' });
  });
});
