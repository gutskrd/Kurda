import { describe, expect, it } from 'vitest';
import {
  decodeCursor,
  encodeCursor,
  isZeroTolerance,
  permanentBanMode,
  reportCaseSummary,
  reportPriority,
  reportWeight,
  slaDueAt,
} from './rules.js';

const adult = { reporterMinor: false, subjectAge: 'adult' as const, newAccount: false };

describe('report priority', () => {
  it('starts from the category', () => {
    expect(reportPriority({ ...adult, category: 'child_safety' })).toBe(0);
    expect(reportPriority({ ...adult, category: 'hate' })).toBe(1);
    expect(reportPriority({ ...adult, category: 'harassment' })).toBe(2);
    expect(reportPriority({ ...adult, category: 'spam' })).toBe(3);
  });

  it('makes an adult reaching a minor with sexual content P0', () => {
    expect(reportPriority({ category: 'sexual', reporterMinor: true, subjectAge: 'adult', newAccount: false })).toBe(0);
    expect(reportPriority({ category: 'child_safety', reporterMinor: true, subjectAge: 'adult', newAccount: true })).toBe(0);
  });

  it('moves any other case with a minor in it up one level', () => {
    expect(reportPriority({ category: 'spam', reporterMinor: false, subjectAge: 'minor', newAccount: false })).toBe(2);
    expect(reportPriority({ category: 'harassment', reporterMinor: true, subjectAge: 'unknown', newAccount: false })).toBe(1);
    // and a minor's report is never demoted for the account being new
    expect(reportPriority({ category: 'harassment', reporterMinor: true, subjectAge: 'adult', newAccount: true })).toBe(1);
  });

  it('moves a day-old account’s report down one, but never a P0 and never below P3', () => {
    expect(reportPriority({ ...adult, category: 'hate', newAccount: true })).toBe(2);
    expect(reportPriority({ ...adult, category: 'spam', newAccount: true })).toBe(3);
    expect(reportPriority({ ...adult, category: 'self_harm', newAccount: true })).toBe(0);
    expect(reportPriority({ ...adult, category: 'violence', newAccount: true })).toBe(0);
  });

  it('weighs a new account’s report half', () => {
    expect(reportWeight(true)).toBe(0.5);
    expect(reportWeight(false)).toBe(1);
  });
});

describe('case summary', () => {
  it('never comes out empty, whatever is missing', () => {
    // a gotin has no title and a deleted account no name: the old SQL made this NULL
    expect(reportCaseSummary({ reportCount: 1, category: 'other', targetType: 'library_post', subjectUsername: null })).toBe(
      '1 report · Something else · Library post',
    );
    expect(reportCaseSummary({ reportCount: 3, category: 'harassment', targetType: 'dm_message', subjectUsername: 'rojda' })).toBe(
      '3 reports · Bullying or harassment · Direct message by @rojda',
    );
  });
});

describe('SLA', () => {
  it('runs from the first report, by priority', () => {
    const first = new Date('2026-10-01T10:00:00Z');
    expect(slaDueAt(0, first).toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(slaDueAt(1, first).toISOString()).toBe('2026-10-02T10:00:00.000Z');
    expect(slaDueAt(3, first).toISOString()).toBe('2026-10-08T10:00:00.000Z');
  });
});

describe('permanent bans', () => {
  it('wait for a second admin when there are two, apply at once for child safety, and stand alone with one', () => {
    expect(permanentBanMode(2, false)).toBe('second_approval');
    expect(permanentBanMode(5, false)).toBe('second_approval');
    expect(permanentBanMode(1, false)).toBe('single');
    expect(permanentBanMode(0, false)).toBe('single');
    expect(permanentBanMode(2, true)).toBe('zero_tolerance');
    expect(permanentBanMode(1, true)).toBe('zero_tolerance');
  });

  it('treat child safety, and only child safety, as zero tolerance', () => {
    expect(isZeroTolerance('child_safety')).toBe(true);
    expect(isZeroTolerance('violence')).toBe(false);
    expect(isZeroTolerance('sexual')).toBe(false);
  });
});

describe('queue cursor', () => {
  it('round-trips', () => {
    const c = { priority: 2, firstReportedAt: '2026-10-01T10:00:00.000Z', id: '0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('refuses anything that is not one of ours', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(decodeCursor(Buffer.from('[9,"2026-10-01","x"]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify([1, 'yesterday', '0b5e1c0e-3b8f-4a4e-9d0e-2f1f6f3c9a11'])).toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify([1, '2026-10-01T10:00:00Z', "x'; DROP TABLE"])).toString('base64url'))).toBeNull();
  });
});
