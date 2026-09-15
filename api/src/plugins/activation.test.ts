/**
 * The activation rule, read as a rule.
 *
 * `activation.integration.test.ts` proves the gate against real routes and a
 * real database. This covers the part that has no route behind it: what happens
 * to an endpoint nobody has written yet. Deny-by-default is only true if it
 * stays true for the next person's endpoint, and the only place to check that
 * is here.
 */
import { describe, expect, it } from 'vitest';
import { blockedBeforeActivation } from './activation.js';

describe('blockedBeforeActivation', () => {
  it('lets reading through, because a guest can read without an account at all', () => {
    expect(blockedBeforeActivation('GET', '/feed?limit=20')).toBe(false);
    expect(blockedBeforeActivation('HEAD', '/library/posts')).toBe(false);
    expect(blockedBeforeActivation('OPTIONS', '/library/posts')).toBe(false);
  });

  it('refuses everything that writes', () => {
    expect(blockedBeforeActivation('POST', '/library/posts')).toBe(true);
    expect(blockedBeforeActivation('PATCH', '/me/profile/sections')).toBe(true);
    expect(blockedBeforeActivation('PUT', '/goals')).toBe(true);
    expect(blockedBeforeActivation('DELETE', '/library/posts/abc')).toBe(true);
  });

  it('keeps open the way through the gate, and the way out', () => {
    expect(blockedBeforeActivation('POST', '/auth/verify-email-code')).toBe(false);
    expect(blockedBeforeActivation('POST', '/auth/resend-verification-code')).toBe(false);
    expect(blockedBeforeActivation('POST', '/auth/refresh')).toBe(false);
    expect(blockedBeforeActivation('POST', '/me/heartbeat')).toBe(false);
    expect(blockedBeforeActivation('DELETE', '/me')).toBe(false);
    expect(blockedBeforeActivation('DELETE', '/me/sessions')).toBe(false);
  });

  it('refuses a route that does not exist yet', () => {
    // the exemptions name a method as well as a path on purpose: `DELETE /me`
    // is leaving, and leaving is not editing
    expect(blockedBeforeActivation('PATCH', '/me')).toBe(true);
    expect(blockedBeforeActivation('PUT', '/me')).toBe(true);
    expect(blockedBeforeActivation('POST', '/me/sessions')).toBe(true);
    expect(blockedBeforeActivation('POST', '/whatever-ships-next-year')).toBe(true);
  });

  it('is not fooled by a query string, or by a path that merely starts the same', () => {
    expect(blockedBeforeActivation('POST', '/me/heartbeat?tab=civak')).toBe(false);
    // /authors is not /auth/
    expect(blockedBeforeActivation('POST', '/authors')).toBe(true);
    expect(blockedBeforeActivation('POST', '/me/heartbeats')).toBe(true);
  });

  /**
   * The exemption used to be the prefix `/auth/`, and these are the routes
   * that shows to be wrong. Sending an SMS is filed under authentication and
   * costs money; an account that has not proved it owns its email address has
   * no business spending it.
   */
  it('refuses the auth routes that are not the way through the gate', () => {
    expect(blockedBeforeActivation('POST', '/auth/phone/send')).toBe(true);
    expect(blockedBeforeActivation('POST', '/auth/phone/verify')).toBe(true);
    expect(blockedBeforeActivation('DELETE', '/auth/phone')).toBe(true);
  });

  it('refuses an /auth/ route nobody has thought about yet', () => {
    expect(blockedBeforeActivation('POST', '/auth/whatever-ships-next-year')).toBe(true);
  });

  it('still lets every step of signing up and signing in through', () => {
    for (const path of [
      '/auth/register',
      '/auth/login',
      '/auth/refresh',
      '/auth/oauth',
      '/auth/verify-email',
      '/auth/verify-email-code',
      '/auth/resend-verification',
      '/auth/resend-verification-code',
      '/auth/request-password-reset',
      '/auth/reset-password',
    ]) {
      expect(blockedBeforeActivation('POST', path), path).toBe(false);
    }
  });
});
