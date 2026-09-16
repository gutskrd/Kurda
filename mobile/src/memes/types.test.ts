import { describe, expect, it } from 'vitest';
import { REACTION_LABEL, REACTION_ORDER, commentText, relativeTime, topReactionEmojis, type Comment, type ReactionSummary } from './types';
import { LOCALES, TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/** The real catalogue: a stub that echoes the key would hide a missing one. */
const tr =
  (locale: 'en' | 'ku') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = tr('en');

describe('relativeTime', () => {
  const now = Date.parse('2026-08-18T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('buckets recent → old', () => {
    expect(relativeTime(ago(10_000), now)).toBe('now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5m');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3h');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d');
    expect(relativeTime(ago(3 * 7 * 86_400_000), now)).toBe('3w');
  });
  it('falls back to a date past ~5 weeks and tolerates junk', () => {
    expect(relativeTime(ago(60 * 86_400_000), now)).toMatch(/\d/);
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('topReactionEmojis', () => {
  it('returns the most-used emojis first, dropping zeros, capped', () => {
    const s: ReactionSummary = { counts: { laugh: 5, love: 2, like: 9, wow: 0 }, total: 16, mine: 'like' };
    expect(topReactionEmojis(s, 2)).toEqual(['👍', '😂']); // like(9) then laugh(5)
  });
  it('is empty when there are no reactions', () => {
    expect(topReactionEmojis({ counts: {}, total: 0, mine: null })).toEqual([]);
  });
});

describe('commentText', () => {
  const base: Comment = {
    id: '1', postId: 'p', authorId: 'a', authorRole: 'user', parentCommentId: null, depth: 0,
    body: 'hello', status: 'visible', replyCount: 0, createdAt: '', updatedAt: '',
  };
  it('shows body when visible, placeholder when removed', () => {
    expect(commentText(base, t)).toBe('hello');
    expect(commentText({ ...base, status: 'removed', body: null }, t)).toBe(TRANSLATIONS.en['comments.removed']);
    expect(commentText({ ...base, status: 'removed', body: null }, tr('ku'))).toBe(TRANSLATIONS.ku['comments.removed']);
  });
});

describe('REACTION_LABEL', () => {
  /**
   * The reaction buttons announced their raw ids to a screen reader — like,
   * laugh, wow — because the label was a template literal holding the id.
   * Every reaction in the bar now needs a word in every language.
   */
  it('names every reaction in the bar, in all nine languages', () => {
    for (const reaction of REACTION_ORDER) {
      const key = REACTION_LABEL[reaction];
      for (const loc of LOCALES) {
        const copy = TRANSLATIONS[loc][key];
        expect(copy, loc + ' ' + reaction).toBeTruthy();
        expect(copy, loc + ' ' + reaction + ' reads as its own key').not.toBe(key);
      }
    }
  });
});
