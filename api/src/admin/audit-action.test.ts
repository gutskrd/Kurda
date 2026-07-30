import { describe, expect, it } from 'vitest';
import { auditActionName, isAuditableAdminMutation } from './audit-action.js';

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
});
