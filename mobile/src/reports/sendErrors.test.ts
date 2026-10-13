import { describe, expect, it } from 'vitest';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';
import type { ApiError } from '../api/types';
import { formatDay, formatUntil, restrictionOf, restrictionText, sendErrorOf, standingExplains } from './sendErrors';
import { mutedDetails, suspendedDetails } from './suspension';
import { describeUploadFailure, uploadWasLimited } from '../profile/photoUploadResult';

const t = (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(TRANSLATIONS.en[key], vars);
const NOW = new Date('2026-10-13T09:00:00Z');
const refusal = (code: string, details?: unknown): ApiError => ({ kind: 'client', status: 403, code, message: 'no', details });

describe('restrictionOf', () => {
  it('reads a Hevalo mute with its scope and end', () => {
    expect(restrictionOf(refusal('MUTED', { scope: 'post', until: '2026-10-20T10:00:00.000Z' }))).toEqual({
      kind: 'muted',
      scope: 'post',
      until: '2026-10-20T10:00:00.000Z',
    });
    // a feature limit is a mute on media
    expect(restrictionOf(refusal('MUTED', { scope: 'media', until: null }))).toEqual({ kind: 'muted', scope: 'media', until: null });
  });

  it('tells a group’s own mute (no details) from a Hevalo one', () => {
    expect(restrictionOf(refusal('MUTED'))).toEqual({ kind: 'groupMuted' });
    expect(restrictionOf(refusal('MUTED', { scope: 'nonsense' }))).toEqual({ kind: 'groupMuted' });
  });

  it('knows the automatic pause and a suspension, and nothing else', () => {
    expect(restrictionOf(refusal('CHAT_MUTED'))).toEqual({ kind: 'chatMuted' });
    expect(restrictionOf(refusal('ACCOUNT_SUSPENDED', { until: null }))).toEqual({ kind: 'suspended', until: null });
    expect(restrictionOf(refusal('NOT_FRIENDS'))).toBeNull();
    expect(restrictionOf({ kind: 'rate_limited', status: 429, code: 'MUTED', message: '' })).toBeNull();
    expect(restrictionOf(null)).toBeNull();
  });
});

describe('restrictionText', () => {
  it('says what is limited and until when, in local words', () => {
    const text = restrictionText({ kind: 'muted', scope: 'chat', until: '2026-10-14T16:00:00.000Z' }, t, 'en-GB', NOW);
    expect(text).toMatch(/^You can’t send messages until 14 Oct/);
    expect(restrictionText({ kind: 'muted', scope: 'chat', until: null }, t, 'en', NOW)).toBe('You can’t send messages right now.');
    expect(restrictionText({ kind: 'muted', scope: 'media', until: null }, t, 'en', NOW)).toBe('You can’t add pictures or voice right now.');
    expect(restrictionText({ kind: 'groupMuted' }, t, 'en', NOW)).toBe('The group’s admins have muted you in this group.');
  });

  it('points to Account standing only where Hevalo wrote the reasons down', () => {
    expect(standingExplains({ kind: 'muted', scope: 'post', until: null })).toBe(true);
    expect(standingExplains({ kind: 'suspended', until: null })).toBe(true);
    expect(standingExplains({ kind: 'chatMuted' })).toBe(false);
    expect(standingExplains({ kind: 'groupMuted' })).toBe(false);
  });

  it('falls back to the everyday sentence for anything that is not a limit', () => {
    const offline = sendErrorOf({ kind: 'network', message: 'x' }, t, 'en');
    expect(offline.restriction).toBeNull();
    expect(offline.message).toBe(TRANSLATIONS.en['error.offline']);
  });
});

describe('dates', () => {
  it('leaves the year out when it is this one', () => {
    expect(formatUntil('2026-10-14T16:00:00.000Z', 'en-GB', NOW)).not.toMatch(/2026/);
    expect(formatUntil('2027-01-02T16:00:00.000Z', 'en-GB', NOW)).toMatch(/2027/);
    expect(formatDay('2026-03-01T12:00:00.000Z', 'en-GB', NOW)).toBe('1 Mar');
    expect(formatDay('not a date', 'en', NOW)).toBe('not a date');
  });
});

describe('suspendedDetails / mutedDetails', () => {
  it('takes only a refusal that can lead somewhere', () => {
    expect(suspendedDetails({ until: null, policy: 'spam', statement: 'Spam.', appealable: true, appealToken: 'tok' })).toEqual({
      until: null,
      policy: 'spam',
      statement: 'Spam.',
      appealable: true,
      appealToken: 'tok',
    });
    expect(suspendedDetails({ statement: 'x' })).toBeNull();
    expect(suspendedDetails(null)).toBeNull();
    expect(mutedDetails({ scope: 'chat' })).toEqual({ scope: 'chat', until: null });
    expect(mutedDetails({ scope: 'account' })).toBeNull();
  });
});

describe('uploads refused by a limit', () => {
  it('say what is limited instead of the server’s English, and are marked limited', () => {
    const muted = JSON.stringify({ code: 'MUTED', message: "you can't upload pictures or voice right now", details: { scope: 'media', until: null } });
    expect(describeUploadFailure(403, muted, t)).toBe('You can’t add pictures or voice right now.');
    expect(uploadWasLimited(403, muted)).toBe(true);
    // the automatic pause is said, but its reasons are not on the standing page
    const paused = JSON.stringify({ code: 'CHAT_MUTED', message: 'x' });
    expect(uploadWasLimited(403, paused)).toBe(false);
    expect(uploadWasLimited(500, 'not json')).toBe(false);
  });
});
