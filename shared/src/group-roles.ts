/**
 * Group role rules (KUR-084). Pure so permission logic is unit-testable.
 * Hierarchy: owner > moderator > member. Owners manage everything (including
 * promoting moderators + transferring ownership); moderators manage members.
 */

export const ROLES = ['member', 'moderator', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_GROUP_MEMBERS = 100;

/** A group's name, in characters once trimmed; the server holds both ends. */
export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 60;
/** A group's description, which can be left empty. */
export const GROUP_DESCRIPTION_MAX = 300;

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

/**
 * Who may change how a group presents itself — its name, its description and
 * its picture: the owner and the admins (moderators), the people already
 * trusted to keep it in order. Members may not; the server decides with this.
 */
export function canEditGroup(actor: Role | null): boolean {
  return actor === 'owner' || actor === 'moderator';
}
