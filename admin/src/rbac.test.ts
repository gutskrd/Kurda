import { describe, expect, it } from 'vitest';
import { visibleNav } from './rbac.js';

describe('visibleNav', () => {
  it('shows only sections the capabilities unlock', () => {
    const keys = visibleNav(['users.view']).map((s) => s.key);
    expect(keys).toContain('users');
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('moderation'); // needs users.moderate
  });

  it('a moderator sees users + moderation', () => {
    const keys = visibleNav(['users.view', 'users.moderate']).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['users', 'moderation']));
  });

  it('shows everything for a full capability set', () => {
    const all = [
      'content.edit',
      'content.publish',
      'users.view',
      'users.moderate',
      'economy.view',
      'economy.adjust',
      'fraud.review',
      'events.manage',
      'admins.manage',
    ];
    expect(visibleNav(all)).toHaveLength(7);
  });

  it('shows nothing without capabilities', () => {
    expect(visibleNav([])).toEqual([]);
  });
});
