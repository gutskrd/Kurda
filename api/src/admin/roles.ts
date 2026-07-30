/**
 * Admin RBAC (KUR-099). Four admin roles, each granting a fixed set of
 * capabilities. Enforcement is always server-side (see `requireAdmin`); this
 * module is the single source of truth for "which role can do what", shared by
 * the API guards and the admin app's nav (where it only hides UI — never the
 * access control itself).
 */

export const ADMIN_ROLES = ['superadmin', 'content_editor', 'moderator', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const CAPABILITIES = [
  'content.edit',
  'content.publish',
  'users.view',
  'users.moderate',
  'economy.view',
  'economy.adjust',
  'fraud.review',
  'events.manage',
  'admins.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  // superadmin is granted everything (kept in sync via `capabilitiesFor`)
  superadmin: CAPABILITIES,
  content_editor: ['content.edit', 'content.publish', 'events.manage'],
  moderator: ['users.view', 'users.moderate'],
  support: ['users.view', 'economy.view'],
};

export function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** True if any of the user's roles is an admin role. */
export function isAdmin(roles: readonly string[]): boolean {
  return roles.some(isAdminRole);
}

/** The union of capabilities across the user's admin roles. */
export function capabilitiesFor(roles: readonly string[]): Capability[] {
  const set = new Set<Capability>();
  for (const role of roles) {
    if (isAdminRole(role)) for (const cap of ROLE_CAPABILITIES[role]) set.add(cap);
  }
  return CAPABILITIES.filter((c) => set.has(c));
}

/** Whether the user's roles grant a specific capability. */
export function hasCapability(roles: readonly string[], capability: Capability): boolean {
  return roles.some((role) => isAdminRole(role) && ROLE_CAPABILITIES[role].includes(capability));
}
