/**
 * Admin RBAC: four admin roles, each with a fixed set of capabilities. Enforcement is always server-side (see
 * `requireAdmin`); this module is the single source of truth for which role can do what, shared by the API guards and
 * the admin app's nav (which only hides UI).
 */

export const ADMIN_ROLES = ['superadmin', 'content_editor', 'moderator', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * The legacy catch-all role. Most admin routes are still guarded by requireRoles('admin'), so any "is this person
 * staff" check, the 2FA gate especially, must count it.
 */
export const LEGACY_ADMIN_ROLE = 'admin';

/**
 * Who may use the Leagues and Badges tools under /admin: the legacy role and `superadmin`. Guarded by a role list
 * rather than a capability; the admin app's nav reads the same list (PROGRESS_TOOLS).
 */
export const PROGRESS_TOOL_ROLES = [LEGACY_ADMIN_ROLE, 'superadmin'] as const;

/**
 * Someone who only records for the course: the "Record by person" page and its uploads, for the voices a superadmin
 * linked to the account (api/src/recording). Deliberately not in ADMIN_ROLES, since `requireAdmin` with no role list
 * admits any of those; it grants no capability and opens only routes that name it.
 */
export const VOICE_ACTOR_ROLE = 'voice_actor';

/**
 * Every role that can reach anything under /admin, and so must clear 2FA. 'founder' curates tags through /admin/tags
 * and the voice actor records through /admin/recording and the upload routes. Deliberately no exceptions: a role
 * reaching staff surface without 2FA is the hole the gate closes.
 */
export const PRIVILEGED_ROLES: readonly string[] = [...ADMIN_ROLES, LEGACY_ADMIN_ROLE, 'founder', VOICE_ACTOR_ROLE];

/** True if the user can reach admin surface at all (RBAC role or the legacy one). */
export function isPrivileged(roles: readonly string[]): boolean {
  return roles.some((r) => PRIVILEGED_ROLES.includes(r));
}

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
  // the moderation queue, cases, sanctions and appeals
  'moderation.act',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  // superadmin is granted everything (kept in sync via `capabilitiesFor`)
  superadmin: CAPABILITIES,
  content_editor: ['content.edit', 'content.publish', 'events.manage'],
  moderator: ['users.view', 'users.moderate', 'moderation.act'],
  support: ['users.view', 'economy.view'],
};

export function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** True if any of the user's roles is an admin role. */
export function isAdmin(roles: readonly string[]): boolean {
  return roles.some(isAdminRole);
}

/**
 * What the legacy role can do through capability guards: moderation only, so moving moderation routes from
 * `requireRoles('admin')` to the capability does not lock it out. Everything else it reaches is still guarded by the
 * role itself.
 */
const LEGACY_ADMIN_CAPABILITIES: readonly Capability[] = ['moderation.act'];

function capabilitiesOfRole(role: string): readonly Capability[] {
  if (isAdminRole(role)) return ROLE_CAPABILITIES[role];
  return role === LEGACY_ADMIN_ROLE ? LEGACY_ADMIN_CAPABILITIES : [];
}

/** The union of capabilities across the user's admin roles. */
export function capabilitiesFor(roles: readonly string[]): Capability[] {
  const set = new Set<Capability>();
  for (const role of roles) for (const cap of capabilitiesOfRole(role)) set.add(cap);
  return CAPABILITIES.filter((c) => set.has(c));
}

/** Whether the user's roles grant a specific capability. */
export function hasCapability(roles: readonly string[], capability: Capability): boolean {
  return roles.some((role) => capabilitiesOfRole(role).includes(capability));
}
