/**
 * Which routes count as staff surface.
 *
 * The admin 2FA gate used to answer that from the URL — anything under /admin —
 * and six routes just as privileged were registered elsewhere, so a password
 * with no second factor reached them. The answer now comes from the guard: a
 * route that asks for a role is staff surface wherever it lives.
 *
 * These tests pin the mechanism that carries that answer, because it is easy to
 * break silently. Wrap `requireRoles` in one more helper that returns a plain
 * arrow function and the mark is gone, every route it guards quietly leaves the
 * gate, and nothing else in the suite would notice.
 */
import { describe, expect, it } from 'vitest';
import { markPrivileged, requireAuth, requireRoles, routeIsPrivileged } from './auth.js';

describe('privileged guards', () => {
  it('marks a role guard', () => {
    expect(routeIsPrivileged(requireRoles('admin'))).toBe(true);
  });

  it('finds the mark anywhere in a preHandler chain', () => {
    // guards are usually an array — [requireAuth, requireAdmin(totp, 'superadmin')]
    expect(routeIsPrivileged([requireAuth, requireRoles('superadmin')])).toBe(true);
    expect(routeIsPrivileged([requireRoles('moderator'), requireAuth])).toBe(true);
  });

  it('does not mark a route that only requires a signed-in user', () => {
    // being logged in is not being staff; gating every authenticated route on a
    // TOTP code would lock every player out of the app
    expect(routeIsPrivileged(requireAuth)).toBe(false);
    expect(routeIsPrivileged([requireAuth])).toBe(false);
  });

  it('treats a route with no preHandler as public', () => {
    expect(routeIsPrivileged(undefined)).toBe(false);
    expect(routeIsPrivileged([])).toBe(false);
  });

  it('marks the guard itself, not one shared object', () => {
    // each call to requireRoles returns a fresh closure; marking must travel with
    // it rather than depending on a registry keyed by something else
    const a = requireRoles('admin');
    const b = requireRoles('support');
    expect(routeIsPrivileged(a)).toBe(true);
    expect(routeIsPrivileged(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('keeps the mark non-enumerable, so it never lands in logs or JSON', () => {
    const guard = requireRoles('admin');
    expect(Object.keys(guard)).toEqual([]);
    expect(JSON.stringify({ guard })).toBe('{}');
  });

  it('returns the same function it was given', () => {
    // markPrivileged must not wrap: a wrapper would change `this`, arity, and the
    // identity Fastify holds on to
    const original = async (): Promise<void> => undefined;
    expect(markPrivileged(original)).toBe(original);
  });
});
