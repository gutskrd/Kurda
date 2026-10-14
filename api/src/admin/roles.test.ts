import { describe, expect, it } from 'vitest';
import { capabilitiesFor, CAPABILITIES, hasCapability, isAdmin, isAdminRole, PRIVILEGED_ROLES, RANK_TOOL_ROLES } from './roles.js';

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

  it('lets moderators, superadmins and the legacy admin role moderate, and nobody else', () => {
    expect(hasCapability(['moderator'], 'moderation.act')).toBe(true);
    expect(hasCapability(['superadmin'], 'moderation.act')).toBe(true);
    expect(hasCapability(['admin'], 'moderation.act')).toBe(true);
    expect(capabilitiesFor(['admin'])).toEqual(['moderation.act']);
    expect(hasCapability(['support'], 'moderation.act')).toBe(false);
    expect(hasCapability(['content_editor'], 'moderation.act')).toBe(false);
  });

  it('non-admin roles grant nothing', () => {
    expect(capabilitiesFor(['user'])).toEqual([]);
    expect(hasCapability(['user'], 'users.view')).toBe(false);
  });
  it('opens the rank, league, season and badge tools to the legacy admin role and superadmin', () => {
    expect([...RANK_TOOL_ROLES].sort()).toEqual(['admin', 'superadmin']);
    // every one of them is staff, so the 2FA gate covers the routes
    for (const role of RANK_TOOL_ROLES) expect(PRIVILEGED_ROLES).toContain(role);
  });
});
