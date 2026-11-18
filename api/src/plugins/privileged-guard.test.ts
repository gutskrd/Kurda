/**
 * Which routes count as staff surface: any route whose guard asks for a role. This pins the marking mechanism, which
 * is easy to break silently: wrapping `requireRoles` in a helper returning a plain arrow function would drop the mark
 * and take its routes out of the 2FA gate unnoticed.
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
    // Being signed in is not being staff; requiring a TOTP code on every authenticated route would lock players out.
    expect(routeIsPrivileged(requireAuth)).toBe(false);
    expect(routeIsPrivileged([requireAuth])).toBe(false);
  });

  it('treats a route with no preHandler as public', () => {
    expect(routeIsPrivileged(undefined)).toBe(false);
    expect(routeIsPrivileged([])).toBe(false);
  });

  it('marks the guard itself, not one shared object', () => {
    // Each requireRoles call returns a fresh closure, so the mark must travel with it.
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
    // markPrivileged must not wrap, which would change `this`, arity and the identity fastify keeps.
    const original = async (): Promise<void> => undefined;
    expect(markPrivileged(original)).toBe(original);
  });
});
