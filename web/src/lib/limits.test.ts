import { describe, expect, it } from 'vitest';
import { LIMIT_KINDS, LIMITS, LIMIT_REACHED } from '@kurda/shared';
import { en, type MessageKey } from '../i18n/en';
import { describeError } from './api';
import { limitErrorText, limitText } from './limits';
import type { ApiError } from './types';

/** English, with its placeholders filled the way the provider fills them. */
const t = (key: MessageKey, vars?: Record<string, string | number>): string =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));

const refused = (code: string, details?: unknown, extra: Partial<ApiError> = {}): ApiError => ({
  kind: 'client',
  code,
  message: 'the server’s English',
  status: 409,
  ...(details !== undefined ? { details } : {}),
  ...extra,
});

describe('limit sentences', () => {
  it('has words for every limit, with its number where it says one', () => {
    for (const kind of LIMIT_KINDS) {
      const text = limitText({ limit: kind, max: LIMITS[kind] }, t);
      expect(text, kind).not.toMatch(/\{\w+\}/);
      expect(text.length, kind).toBeGreaterThan(10);
    }
    expect(limitText({ limit: 'groups_owned', max: 10 }, t)).toMatch(/^You run 10 groups/);
  });

  it('says when the limit is somebody else’s', () => {
    expect(limitText({ limit: 'friends', max: 500, theirs: true }, t)).toBe(en['limits.friendsTheirs'].replace('{max}', '500'));
    expect(limitText({ limit: 'friends', max: 500 }, t)).toBe(en['limits.friends'].replace('{max}', '500'));
    expect(limitText({ limit: 'group_memberships', max: 50, theirs: true }, t)).toMatch(/^They’re already in 50 groups/);
  });

  it('is nothing for an error that is no limit', () => {
    expect(limitErrorText(refused('NOT_FRIENDS'), t)).toBeNull();
    expect(limitErrorText(null, t)).toBeNull();
  });
});

describe('describeError, for a limit', () => {
  it('names the limit and its number rather than the server’s English', () => {
    expect(describeError(refused(LIMIT_REACHED, { limit: 'saved_words', max: 5000 }), t)).toBe(
      en['limits.savedWords'].replace('{max}', '5000'),
    );
  });

  it('reads the older codes too, with or without details', () => {
    expect(describeError(refused('GROUP_FULL', { limit: 'group_members', max: 100 }), t)).toMatch(/up to 100 members/);
    expect(describeError(refused('FRIENDS_FULL'), t)).toBe(en['limits.friends'].replace('{max}', '500'));
  });

  it('says what makes room before any countdown: a full list does not empty by waiting', () => {
    const drafts = refused('DRAFT_LIMIT', { limit: 'library_drafts', max: 20 }, { kind: 'rate_limited', status: 429, retryAfterSec: 60 });
    expect(describeError(drafts, t)).toBe(en['limits.drafts'].replace('{max}', '20'));
  });
});
