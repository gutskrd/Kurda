import { describe, expect, it } from 'vitest';
import { capabilitiesFor, CAPABILITIES, hasCapability, isAdmin, isAdminRole } from './roles.js';

describe('admin roles', () => {
  it('recognizes admin roles', () => {
    expect(isAdminRole('superadmin')).toBe(true);
    expect(isAdminRole('moderator')).toBe(true);
    expect(isAdminRole('user')).toBe(false);
    expect(isAdmin(['user', 'support'])).toBe(true);
    expect(isAdmin(['user'])).toBe(false);
  });

  it('superadmin has every capability', () => {
    expect(capabilitiesFor(['superadmin'])).toEqual([...CAPABILITIES]);
  });

  it('scopes capabilities per role', () => {
    expect(hasCapability(['content_editor'], 'content.publish')).toBe(true);
    expect(hasCapability(['content_editor'], 'users.moderate')).toBe(false);
    expect(hasCapability(['moderator'], 'users.moderate')).toBe(true);
    expect(hasCapability(['support'], 'economy.adjust')).toBe(false);
  });

  it('unions capabilities across multiple roles', () => {
    const caps = capabilitiesFor(['moderator', 'support']);
    expect(caps).toContain('users.moderate');
    expect(caps).toContain('economy.view');
    expect(caps).not.toContain('content.edit');
  });

  it('non-admin roles grant nothing', () => {
    expect(capabilitiesFor(['user'])).toEqual([]);
    expect(hasCapability(['user'], 'users.view')).toBe(false);
  });
});
