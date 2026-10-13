import { describe, expect, it } from 'vitest';
import { auditActionName, auditTargetType, isAuditableAdminMutation } from './audit-action.js';

describe('isAuditableAdminMutation', () => {
  it('audits successful admin mutations', () => {
    expect(isAuditableAdminMutation('POST', '/admin/users/x/ban', 200)).toBe(true);
    expect(isAuditableAdminMutation('put', '/admin/content/lessons/x', 200)).toBe(true);
    expect(isAuditableAdminMutation('DELETE', '/admin/foo', 204)).toBe(true);
  });

  it('skips reads, non-admin routes, and failures', () => {
    expect(isAuditableAdminMutation('GET', '/admin/users', 200)).toBe(false); // read
    expect(isAuditableAdminMutation('POST', '/auth/login', 200)).toBe(false); // not admin
    expect(isAuditableAdminMutation('POST', '/admin/users/x/ban', 403)).toBe(false); // rejected
    expect(isAuditableAdminMutation('POST', '/admin/users/x/ban', 500)).toBe(false);
  });
});

describe('auditActionName', () => {
  it('is method + route template', () => {
    expect(auditActionName('post', '/admin/users/:id/ban')).toBe('POST /admin/users/:id/ban');
  });

  it('names a dry run as one, so it never reads as the decision itself', () => {
    expect(auditActionName('POST', '/admin/moderation/cases/:id/decide', { preview: true })).toBe(
      'POST /admin/moderation/cases/:id/decide (preview)',
    );
    expect(auditActionName('POST', '/admin/moderation/cases/:id/decide', { preview: false })).toBe('POST /admin/moderation/cases/:id/decide');
    expect(auditActionName('POST', '/admin/moderation/cases/:id/decide', null)).toBe('POST /admin/moderation/cases/:id/decide');
  });
});

describe('auditTargetType', () => {
  it('names what a moderation route acts on, so a case keeps its own history', () => {
    expect(auditTargetType('/admin/moderation/cases/:id/decide')).toBe('moderation_case');
    expect(auditTargetType('/admin/moderation/approvals/:id/approve')).toBe('sanction');
    expect(auditTargetType('/admin/sanctions/:id/revoke')).toBe('sanction');
    expect(auditTargetType('/admin/appeals/:id/decide')).toBe('appeal');
    expect(auditTargetType('/admin/users/:id/ban')).toBe('user');
    expect(auditTargetType('/admin/shop/items')).toBeNull();
  });
});
