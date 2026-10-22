import { describe, expect, it } from 'vitest';
import { commentText, type Comment } from './types';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/** The real catalogue: a stub that echoes the key would hide a missing one. */
const tr =
  (locale: 'en' | 'ku') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    interpolate(TRANSLATIONS[locale][key], vars);
const t = tr('en');

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
