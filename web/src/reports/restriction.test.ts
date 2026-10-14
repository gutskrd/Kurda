import { describe, it, expect } from 'vitest';
import { en, type MessageKey } from '../i18n/en';
import type { ApiError } from '../lib/types';
import { describeError } from '../lib/api';
import { formatUntil, restrictionOf, restrictionText, standingExplains, suspensionOf } from './restriction';

const t = (key: MessageKey, vars?: Record<string, string | number>): string =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));

const err = (code: string, details?: unknown): ApiError => ({ kind: 'client', status: 403, code, message: 'nope', details });

describe('restrictionOf', () => {
  it('reads a Hevalo mute with its scope and end', () => {
    expect(restrictionOf(err('MUTED', { scope: 'post', until: '2026-10-14T16:00:00.000Z' }))).toEqual({
      kind: 'muted',
      scope: 'post',
      until: '2026-10-14T16:00:00.000Z',
    });
    expect(restrictionOf(err('MUTED', { scope: 'media', until: null }))).toEqual({ kind: 'muted', scope: 'media', until: null });
  });

  it('reads a MUTED with no scope as a group’s own mute', () => {
    expect(restrictionOf(err('MUTED'))).toEqual({ kind: 'groupMuted' });
    expect(restrictionOf(err('MUTED', { scope: 'everything' }))).toEqual({ kind: 'groupMuted' });
  });

  it('reads the automatic chat pause and a suspension', () => {
    expect(restrictionOf(err('CHAT_MUTED'))).toEqual({ kind: 'chatMuted' });
    expect(restrictionOf(err('ACCOUNT_SUSPENDED', { until: null, appealToken: 'x', statement: 's' }))).toEqual({
      kind: 'suspended',
      until: null,
    });
  });

  it('ignores everything else, and a nonsense date', () => {
    expect(restrictionOf(err('NOT_FRIENDS'))).toBeNull();
    expect(restrictionOf(null)).toBeNull();
    expect(restrictionOf(err('MUTED', { scope: 'chat', until: 'soon' }))).toEqual({ kind: 'muted', scope: 'chat', until: null });
  });
});

describe('restrictionText', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('says what is limited and until when', () => {
    const text = restrictionText({ kind: 'muted', scope: 'chat', until: '2026-10-14T16:00:00.000Z' }, t, 'en', now);
    expect(text).toMatch(/^You can’t send messages until /);
    expect(text).toContain(formatUntil('2026-10-14T16:00:00.000Z', 'en', now));
    expect(restrictionText({ kind: 'muted', scope: 'post', until: null }, t, 'en', now)).toBe('You can’t post or comment right now.');
    expect(restrictionText({ kind: 'muted', scope: 'media', until: null }, t, 'en', now)).toBe('You can’t add pictures or voice right now.');
    expect(restrictionText({ kind: 'groupMuted' }, t, 'en', now)).toBe(en['restriction.groupMuted']);
  });

  it('adds the year only when it is not this one', () => {
    expect(formatUntil('2026-10-14T16:00:00.000Z', 'en', now)).not.toMatch(/2026/);
    expect(formatUntil('2027-01-02T16:00:00.000Z', 'en', now)).toMatch(/2027/);
  });

  it('points to Account standing only for Hevalo’s own sanctions', () => {
    expect(standingExplains({ kind: 'muted', scope: 'chat', until: null })).toBe(true);
    expect(standingExplains({ kind: 'suspended', until: null })).toBe(true);
    expect(standingExplains({ kind: 'groupMuted' })).toBe(false);
    expect(standingExplains({ kind: 'chatMuted' })).toBe(false);
  });
});

describe('describeError', () => {
  it('describes a mute the same way everywhere it is used', () => {
    expect(describeError(err('MUTED', { scope: 'post', until: null }), t, 'en')).toBe('You can’t post or comment right now.');
  });
});

describe('suspensionOf', () => {
  it('takes the reasons and the appeal token from a sign-in refusal', () => {
    const details = { until: null, policy: 'spam', statement: 'Spam links.', appealable: true, appealToken: 'tok' };
    expect(suspensionOf(err('ACCOUNT_SUSPENDED', details))).toEqual(details);
  });

  it('is null for anything that is not one', () => {
    expect(suspensionOf(err('ACCOUNT_SUSPENDED', { until: null }))).toBeNull();
    expect(suspensionOf(err('ACCOUNT_DISABLED'))).toBeNull();
  });
});
