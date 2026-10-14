import { describe, expect, it } from 'vitest';
import {
  COPYRIGHT_EXPLANATION_MAX,
  copyrightNoticeProblems,
  copyrightReference,
  counterNoticeProblems,
  isPlausibleEmail,
  parseCopyrightTarget,
  restoreNotBefore,
  type CopyrightNoticeRequest,
} from './copyright.js';
import { PROVIDER, isProviderPlaceholder } from './provider.js';

const ID = '1a2b3c4d-0000-4000-8000-00000000abcd';

const notice = (over: Partial<Record<keyof CopyrightNoticeRequest, unknown>> = {}) => ({
  name: 'Rojda Amed',
  email: 'rojda@example.com',
  address: 'Keizersgracht 1, Amsterdam',
  role: 'owner',
  work: 'My photo of the Zagros at dawn',
  contentUrl: `https://hevalo.app/app/dimen/${ID}`,
  explanation: 'The picture is mine and was posted without permission.',
  goodFaith: true,
  accurate: true,
  signature: 'Rojda Amed',
  ...over,
});

describe('parseCopyrightTarget', () => {
  it('reads every kind of link to a post or profile', () => {
    expect(parseCopyrightTarget(`https://hevalo.app/app/library/${ID}`)).toEqual({ type: 'library_post', id: ID });
    expect(parseCopyrightTarget(`hevalo.app/app/dimen/${ID}/`)).toEqual({ type: 'image_post', id: ID });
    expect(parseCopyrightTarget(`/app/users/${ID}`)).toEqual({ type: 'user', id: ID });
    expect(parseCopyrightTarget(`https://staging.example.test/app/library/${ID}?ref=share#top`)).toEqual({ type: 'library_post', id: ID });
    expect(parseCopyrightTarget(`  ${ID.toUpperCase()}  `)).toEqual({ type: 'library_post', id: ID });
  });

  it('answers null for anything that is not one', () => {
    expect(parseCopyrightTarget('')).toBeNull();
    expect(parseCopyrightTarget(null)).toBeNull();
    expect(parseCopyrightTarget('https://hevalo.app/app/civak')).toBeNull();
    expect(parseCopyrightTarget('https://hevalo.app/app/library/not-an-id')).toBeNull();
    expect(parseCopyrightTarget(`https://hevalo.app/app/library/${ID}/edit`)).toBeNull();
    expect(parseCopyrightTarget('javascript:alert(1)')).toBeNull();
    expect(parseCopyrightTarget(`https://hevalo.app/app/library/${ID}`.padEnd(600, 'x'))).toBeNull();
  });
});

describe('copyrightNoticeProblems', () => {
  it('accepts a complete notice, with or without a phone and the original’s link', () => {
    expect(copyrightNoticeProblems(notice())).toEqual([]);
    expect(copyrightNoticeProblems(notice({ phone: '+31 6 1234 5678', workUrl: 'https://example.com/zagros' }))).toEqual([]);
  });

  it('asks for every field both laws need', () => {
    const fields = copyrightNoticeProblems({}).map((p) => p.field);
    expect(fields).toEqual(['name', 'email', 'address', 'role', 'work', 'contentUrl', 'explanation', 'goodFaith', 'accurate', 'signature']);
  });

  it('needs the rights holder’s name only from someone acting for them', () => {
    expect(copyrightNoticeProblems(notice({ role: 'authorised' }))).toEqual([{ field: 'rightsHolder', code: 'REQUIRED' }]);
    expect(copyrightNoticeProblems(notice({ role: 'authorised', rightsHolder: 'Zagros Photo BV' }))).toEqual([]);
  });

  it('checks the email, the link, the statements and the lengths', () => {
    expect(copyrightNoticeProblems(notice({ email: 'not an email' }))).toEqual([{ field: 'email', code: 'INVALID_EMAIL' }]);
    expect(copyrightNoticeProblems(notice({ contentUrl: 'https://example.com/elsewhere' }))).toEqual([{ field: 'contentUrl', code: 'INVALID_LINK' }]);
    expect(copyrightNoticeProblems(notice({ goodFaith: 'yes', accurate: false }))).toEqual([
      { field: 'goodFaith', code: 'NOT_CONFIRMED' },
      { field: 'accurate', code: 'NOT_CONFIRMED' },
    ]);
    expect(copyrightNoticeProblems(notice({ explanation: 'x'.repeat(COPYRIGHT_EXPLANATION_MAX + 1) }))).toEqual([
      { field: 'explanation', code: 'TOO_LONG', max: COPYRIGHT_EXPLANATION_MAX },
    ]);
    // whitespace and control characters are not an answer
    expect(copyrightNoticeProblems(notice({ signature: ' \u0007\t ' }))).toEqual([{ field: 'signature', code: 'REQUIRED' }]);
  });
});

describe('counterNoticeProblems', () => {
  it('asks for contact details, the statement, both confirmations and a signature', () => {
    expect(counterNoticeProblems({}).map((p) => p.field)).toEqual(['name', 'address', 'email', 'statement', 'goodFaith', 'consent', 'signature']);
    expect(
      counterNoticeProblems({
        name: 'Baran',
        address: 'Street 1, Utrecht',
        email: 'baran@example.com',
        statement: 'I took this photo myself.',
        goodFaith: true,
        consent: true,
        signature: 'Baran',
      }),
    ).toEqual([]);
  });
});

describe('helpers', () => {
  it('gives a short, readable reference', () => {
    expect(copyrightReference(ID)).toBe('CN-1A2B3C4D');
  });

  it('is loose about email but not empty-handed', () => {
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('a@b')).toBe(false);
    expect(isPlausibleEmail('a b@c.d')).toBe(false);
  });

  it('counts ten business days for a restore, skipping weekends', () => {
    // Wednesday 14 October 2026 → two weeks later, Wednesday 28 October
    expect(restoreNotBefore(new Date('2026-10-14T09:00:00Z')).toISOString()).toBe('2026-10-28T09:00:00.000Z');
    // Friday → the Friday two weeks on
    expect(restoreNotBefore(new Date('2026-10-16T09:00:00Z')).toISOString()).toBe('2026-10-30T09:00:00.000Z');
    // Saturday → ten weekdays from Monday: Friday two weeks on
    expect(restoreNotBefore(new Date('2026-10-17T09:00:00Z')).toISOString()).toBe('2026-10-30T09:00:00.000Z');
  });
});

describe('the provider details', () => {
  it('marks placeholders, so a missing detail shows instead of vanishing', () => {
    expect(isProviderPlaceholder('[KvK number]')).toBe(true);
    expect(isProviderPlaceholder('12345678')).toBe(false);
    expect(PROVIDER.governingLaw).toBe('the Netherlands');
    expect(PROVIDER.userContact.languages.length).toBeGreaterThan(0);
    expect(PROVIDER.authorityContact.languages.length).toBeGreaterThan(0);
  });
});
