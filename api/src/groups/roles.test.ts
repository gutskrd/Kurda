import { describe, expect, it } from 'vitest';
import { canManage, canSetRole, outranks, roleRank } from './roles.js';

describe('role hierarchy', () => {
  it('ranks owner > moderator > member', () => {
    expect(roleRank('owner')).toBeGreaterThan(roleRank('moderator'));
    expect(roleRank('moderator')).toBeGreaterThan(roleRank('member'));
    expect(outranks('owner', 'member')).toBe(true);
    expect(outranks('member', 'moderator')).toBe(false);
  });
});

describe('canManage', () => {
  it('staff can act only on strictly-lower roles', () => {
    expect(canManage('owner', 'moderator')).toBe(true);
    expect(canManage('owner', 'member')).toBe(true);
    expect(canManage('moderator', 'member')).toBe(true);
    expect(canManage('moderator', 'moderator')).toBe(false);
    expect(canManage('moderator', 'owner')).toBe(false);
    expect(canManage('member', 'member')).toBe(false);
  });
});

describe('canSetRole', () => {
  it('only owners set roles, and never grant ownership via setRole', () => {
    expect(canSetRole('owner', 'moderator')).toBe(true);
    expect(canSetRole('owner', 'member')).toBe(true);
    expect(canSetRole('owner', 'owner')).toBe(false); // use transfer
    expect(canSetRole('moderator', 'member')).toBe(false);
  });
});
