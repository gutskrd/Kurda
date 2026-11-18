/** Group role rules: owner over moderator over member. Owners manage everything, including promotions and transfers; moderators manage members. */

export const ROLES = ['member', 'moderator', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const MAX_GROUP_MEMBERS = 100;

/** A group's name, in characters once trimmed; the server enforces both ends. */
export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 60;
/** A group's description, which can be left empty. */
export const GROUP_DESCRIPTION_MAX = 300;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** A higher rank has more power. */
export function roleRank(role: Role): number {
  return ROLES.indexOf(role);
}

export function outranks(a: Role, b: Role): boolean {
  return roleRank(a) > roleRank(b);
}

/** Whether `actor` may remove or act on `target`: an owner or moderator who strictly outranks them. */
export function canManage(actor: Role, target: Role): boolean {
  return (actor === 'owner' || actor === 'moderator') && outranks(actor, target);
}

/** Only owners promote to moderator or transfer ownership. */
export function canSetRole(actor: Role, newRole: Role): boolean {
  if (newRole === 'owner') return false; // ownership moves by transfer, never by setRole
  return actor === 'owner';
}

/** Who may change a group's name, description and picture: the owner and the moderators, never members; the server decides with this. */
export function canEditGroup(actor: Role | null): boolean {
  return actor === 'owner' || actor === 'moderator';
}
