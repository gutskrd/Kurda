import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  LIMIT_KINDS,
  LIMIT_REACHED,
  MAX_GROUP_MEMBERSHIPS,
  MAX_GROUPS_OWNED,
  groupLimits,
  isLimitKind,
  limitDetails,
  limitOf,
} from './limits.js';
import { MAX_GROUP_MEMBERS } from './group-roles.js';
import { REPORTS_PER_DAY } from './reports.js';

describe('limits', () => {
  it('has a positive whole number for every kind', () => {
    for (const kind of LIMIT_KINDS) {
      expect(Number.isInteger(LIMITS[kind]), kind).toBe(true);
      expect(LIMITS[kind], kind).toBeGreaterThan(0);
    }
  });

  it('keeps the numbers that were already in force', () => {
    expect(LIMITS.group_members).toBe(MAX_GROUP_MEMBERS);
    expect(LIMITS.reports_per_day).toBe(REPORTS_PER_DAY);
    expect(LIMITS.friends).toBe(500);
    expect(LIMITS.library_drafts).toBe(20);
    expect(LIMITS.hosted_games).toBe(3);
  });

  it('knows its own kinds and nothing else', () => {
    expect(isLimitKind('groups_owned')).toBe(true);
    expect(isLimitKind('toString')).toBe(false);
    expect(isLimitKind(3)).toBe(false);
  });

  it('describes a limit with its number, and says when it is the other person’s', () => {
    expect(limitDetails('saved_words')).toEqual({ limit: 'saved_words', max: LIMITS.saved_words });
    expect(limitDetails('friends', { theirs: true })).toEqual({ limit: 'friends', max: 500, theirs: true });
  });
});

describe('limitOf', () => {
  it('reads LIMIT_REACHED with its details', () => {
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'groups_owned', max: 10 } })).toEqual({ limit: 'groups_owned', max: 10 });
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'group_memberships', max: 50, theirs: true } })).toEqual({
      limit: 'group_memberships',
      max: 50,
      theirs: true,
    });
  });

  it('takes the server’s number over its own', () => {
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'saved_words', max: 4000 } })?.max).toBe(4000);
  });

  it('falls back to its own number when the server sent none it can use', () => {
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'blocks', max: -1 } })?.max).toBe(LIMITS.blocks);
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'blocks', max: '9' } })?.max).toBe(LIMITS.blocks);
  });

  it('reads the older codes, with details or without', () => {
    expect(limitOf({ code: 'GROUP_FULL' })).toEqual({ limit: 'group_members', max: MAX_GROUP_MEMBERS });
    expect(limitOf({ code: 'FRIENDS_FULL', details: { limit: 'friends', max: 500, theirs: true } })).toEqual({
      limit: 'friends',
      max: 500,
      theirs: true,
    });
    expect(limitOf({ code: 'DRAFT_LIMIT' })?.limit).toBe('library_drafts');
    expect(limitOf({ code: 'REPORT_LIMIT', details: { retryAfterSec: 3600 } })?.limit).toBe('reports_per_day');
    expect(limitOf({ code: 'TOO_MANY_GAMES' })?.limit).toBe('hosted_games');
  });

  it('is null for anything that is not a limit', () => {
    expect(limitOf(null)).toBeNull();
    expect(limitOf({})).toBeNull();
    expect(limitOf({ code: 'NOT_FOUND', details: { limit: 'groups_owned' } })).toBeNull();
    expect(limitOf({ code: LIMIT_REACHED })).toBeNull();
    expect(limitOf({ code: LIMIT_REACHED, details: { limit: 'teapots', max: 3 } })).toBeNull();
  });
});

describe('groupLimits', () => {
  const owned = (n: number, archived = false) =>
    Array.from({ length: n }, () => ({ myRole: 'owner', archivedAt: archived ? '2026-01-01T00:00:00.000Z' : null }));
  const member = (n: number) => Array.from({ length: n }, () => ({ myRole: 'member', archivedAt: null }));

  it('lets someone with room start and join groups', () => {
    const state = groupLimits([...owned(2), ...member(3)]);
    expect(state).toEqual({ owned: 2, memberships: 5, create: null, join: null });
  });

  it('stops a new group at the owned limit, and only that', () => {
    const state = groupLimits(owned(MAX_GROUPS_OWNED));
    expect(state.create).toEqual(limitDetails('groups_owned'));
    expect(state.join).toBeNull();
  });

  it('does not count archived groups', () => {
    const state = groupLimits([...owned(MAX_GROUPS_OWNED - 1), ...owned(5, true)]);
    expect(state.owned).toBe(MAX_GROUPS_OWNED - 1);
    expect(state.memberships).toBe(MAX_GROUPS_OWNED - 1);
    expect(state.create).toBeNull();
  });

  it('stops joining and starting once in as many groups as anyone may be', () => {
    const state = groupLimits(member(MAX_GROUP_MEMBERSHIPS));
    expect(state.join).toEqual(limitDetails('group_memberships'));
    expect(state.create).toEqual(limitDetails('group_memberships'));
  });

  it('names the owned limit first when both are reached', () => {
    const state = groupLimits([...owned(MAX_GROUPS_OWNED), ...member(MAX_GROUP_MEMBERSHIPS)]);
    expect(state.create?.limit).toBe('groups_owned');
    expect(state.join?.limit).toBe('group_memberships');
  });
});
