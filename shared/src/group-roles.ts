/**
 * Group role rules (KUR-084). Pure so permission logic is unit-testable.
 * Hierarchy: owner > moderator > member. Owners manage everything (including
 * promoting moderators + transferring ownership); moderators manage members.
 */

export const ROLES = ['member', 'moderator', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_GROUP_MEMBERS = 100;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Higher rank = more power. */
export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

export function outranks(a: Role, b: Role): boolean {
  return roleRank(a) > roleRank(b);
}

/** Can `actor` remove/act on `target` (strictly outranks + is staff)? */
export function canManage(actor: Role, target: Role): boolean {
  return (actor === 'owner' || actor === 'moderator') && outranks(actor, target);
}

/** Only owners promote to moderator or transfer ownership. */
export function canSetRole(actor: Role, newRole: Role): boolean {
  if (newRole === 'owner') return false; // ownership moves via transfer, not setRole
  return actor === 'owner';
}
