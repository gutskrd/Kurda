import { describe, expect, it } from 'vitest';
import { auditActionName, auditTargetId, auditTargetType, isAuditableAdminMutation } from './audit-action.js';

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

  it('audits a staff write that lives outside /admin, like the shop catalogue', () => {
    expect(isAuditableAdminMutation('POST', '/shop/items', 200, true)).toBe(true);
    expect(isAuditableAdminMutation('PATCH', '/shop/items/:sku/stock', 200, true)).toBe(true);
    // a player's purchase is not staff surface
    expect(isAuditableAdminMutation('POST', '/shop/purchase', 200, false)).toBe(false);
    expect(isAuditableAdminMutation('GET', '/shop/items', 200, true)).toBe(false);
  });
});

describe('auditTargetId', () => {
  it('reads the target from whichever parameter the route names it by', () => {
    expect(auditTargetId({ id: 'case-1' })).toBe('case-1');
    expect(auditTargetId({ userId: 'u-1' })).toBe('u-1');
    expect(auditTargetId({ key: 'daily_lesson' })).toBe('daily_lesson');
    expect(auditTargetId({ sku: 'tag_kurdish' })).toBe('tag_kurdish');
    expect(auditTargetId({ id: 'x', sku: 'y' })).toBe('x');
    expect(auditTargetId({})).toBeNull();
    expect(auditTargetId(undefined)).toBeNull();
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
    expect(auditActionName('POST', '/admin/rhyme/prompts/rebuild', { dryRun: true })).toBe('POST /admin/rhyme/prompts/rebuild (dry run)');
    expect(auditActionName('POST', '/admin/rhyme/prompts/rebuild', { dryRun: false })).toBe('POST /admin/rhyme/prompts/rebuild');
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
    expect(auditTargetType('/shop/items/:sku/stock')).toBe('shop_item');
    expect(auditTargetType('/admin/antibot/:userId/clear')).toBe('user');
    expect(auditTargetType('/admin/gem-rules/:key')).toBe('gem_rule');
    expect(auditTargetType('/admin/tags/:key')).toBe('tag');
  });
});
