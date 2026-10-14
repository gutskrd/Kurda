/**
 * Admin RBAC (KUR-099). Four admin roles, each granting a fixed set of
 * capabilities. Enforcement is always server-side (see `requireAdmin`); this
 * module is the single source of truth for "which role can do what", shared by
 * the API guards and the admin app's nav (where it only hides UI — never the
 * access control itself).
 */

export const ADMIN_ROLES = ['superadmin', 'content_editor', 'moderator', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * The legacy catch-all role. Most admin routes are still guarded by
 * requireRoles('admin') rather than an RBAC role, so anything asking "is this
 * person staff at all" — the 2FA gate especially — must count it, or an account
 * holding only 'admin' would slip past.
 */
export const LEGACY_ADMIN_ROLE = 'admin';

/**
 * Who may use the Game Ranks, Seasons, Leagues and Badges tools under /admin
 * (contract 4 §U, Admin): the legacy catch-all role they were first guarded
 * by, and `superadmin`, which is granted everything. Like the shop, the config
 * approvals and the tags, these are guarded by a role list rather than a
 * capability; the admin app's nav reads the same list (RANK_TOOLS).
 */
export const RANK_TOOL_ROLES = [LEGACY_ADMIN_ROLE, 'superadmin'] as const;

/**
 * Every role that can reach anything under /admin, and so must clear 2FA.
 *
 * 'founder' is here because it curates the tag catalog through /admin/tags. The
 * rule is deliberately "anything under /admin", with no exceptions — a role that
 * could reach staff surface without 2FA would be the hole the gate exists to
 * close, and exceptions are exactly what gets forgotten.
 */
export const PRIVILEGED_ROLES: readonly string[] = [...ADMIN_ROLES, LEGACY_ADMIN_ROLE, 'founder'];

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
 * What the legacy catch-all role can do through capability guards. Moderation
 * only: every moderation route used to be guarded by `requireRoles('admin')`,
 * and moving them to the capability must not lock out an account that holds
 * just that role. Everything else it reaches is still guarded by the role itself.
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
