import { describe, expect, it } from 'vitest';
import { banEndsAt, canModerateGroup, requestCooldownDays } from './group-membership.js';

describe('group bans and requests to come back', () => {
  it('ends a ban after a day or a week, or never', () => {
    const from = new Date('2026-10-29T12:00:00Z');
    expect(banEndsAt('1d', from)?.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(banEndsAt('7d', from)?.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(banEndsAt('perm', from)).toBeNull();
  });

  it('makes each request turned down wait longer before the next, the last step repeating', () => {
    expect([0, 1, 2, 3, 4, 10].map(requestCooldownDays)).toEqual([0, 1, 7, 30, 30, 30]);
  });

  it('lets the owner and the admins moderate, and nobody else', () => {
    expect(canModerateGroup('owner')).toBe(true);
    expect(canModerateGroup('moderator')).toBe(true);
    expect(canModerateGroup('member')).toBe(false);
    expect(canModerateGroup(null)).toBe(false);
  });
});
