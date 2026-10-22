import { describe, expect, it } from 'vitest';
import { LIMIT_KINDS, LIMITS, LIMIT_REACHED } from '@kurda/shared';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { limitErrorText, limitText } from './limitCopy';

/** English, with its placeholders filled the way the provider fills them. */
const t = (key: TranslationKey, vars?: Record<string, string | number>): string =>
  TRANSLATIONS.en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));

const refused = (code: string, details?: unknown, extra: Partial<ApiError> = {}): ApiError => ({
  kind: 'client',
  code,
  message: 'the server’s English',
  status: 409,
  ...(details !== undefined ? { details } : {}),
  ...extra,
});

describe('limit sentences', () => {
  it('has words for every limit, with its number where it says one, in every language', () => {
    for (const kind of LIMIT_KINDS) {
      const text = limitText({ limit: kind, max: LIMITS[kind] }, t);
      expect(text, kind).not.toMatch(/\{\w+\}/);
      expect(text.length, kind).toBeGreaterThan(10);
    }
    for (const catalog of Object.values(TRANSLATIONS)) expect(catalog['limits.groupsOwned']).toContain('{max}');
  });

  it('says the number, and whose limit it is', () => {
    expect(limitText({ limit: 'groups_owned', max: 10 }, t)).toMatch(/^You run 10 groups/);
    expect(limitText({ limit: 'friends', max: 500, theirs: true }, t)).toBe('They already have 500 friends, the most anyone can have.');
  });

  it('is nothing for an error that is no limit', () => {
    expect(limitErrorText(refused('NOT_FRIENDS'), t)).toBeNull();
  });
});

describe('describeError, for a limit', () => {
  it('names the limit rather than passing on the server’s English', () => {
    expect(describeError(refused(LIMIT_REACHED, { limit: 'saved_words', max: 5000 }), t)).toMatch(/holds up to 5000 words/);
    expect(describeError(refused('GROUP_FULL'), t)).toMatch(/up to 100 members/);
  });

  it('says what makes room before any countdown', () => {
    const drafts = refused('DRAFT_LIMIT', { limit: 'library_drafts', max: 20 }, { kind: 'rate_limited', status: 429, retryAfterSec: 60 });
    expect(describeError(drafts, t)).toBe('You have 20 unfinished drafts. Publish or delete one to save another.');
  });
});
