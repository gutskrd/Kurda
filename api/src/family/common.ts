/**
 * What the family services share: the refusals, who someone is to their family, a child's name as it may be kept,
 * and the family a person is in.
 */
import { CHILD_NAME_MAX, isReservedUsername, MAX_CHILDREN_PER_PARENT, MAX_FAMILY_SIZE, type FamilyRole } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { Executor } from '../moderation/tx.js';
import { filterText } from '../moderation/filter.js';
import { cleanDisplayName } from '../users/display-name.js';
import { roleOf, type AccountRow } from '../parental/service.js';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';

/** The same answer for a family, member or child that does not exist and one that is not the caller's. */
export const notFound = (): AppError => new AppError('NOT_FOUND', 404, 'nothing to show here');

/** Why an account may not take an adult's part in a family: as for parental controls, or a minor, or a child's profile. */
export type NotAdultReason = 'guest' | 'birth_month' | 'email' | 'standing' | 'minor' | 'child' | 'leaving';

export function notAdultReason(account: AccountRow, now: Date = new Date()): NotAdultReason | null {
  if (account.kind === 'child') return 'child';
  const { role, reason } = roleOf(account, now);
  if (reason) return reason;
  if (role === 'teen') return 'minor';
  return account.leaving ? 'leaving' : null;
}

/** Only an adult with a confirmed address in good standing starts a family, joins one or makes a child's profile. */
export function notAdult(account: AccountRow | null): AppError {
  return new AppError('FAMILY_NOT_ADULT', 403, 'a family is started and joined by an adult with a confirmed email, in good standing', {
    reason: account ? notAdultReason(account) : null,
  });
}

export const familyFull = (): AppError => new AppError('FAMILY_FULL', 409, `a family has ${MAX_FAMILY_SIZE} people at most`, { max: MAX_FAMILY_SIZE });
export const childrenFull = (): AppError =>
  new AppError('FAMILY_CHILDREN_FULL', 409, `a parent can make ${MAX_CHILDREN_PER_PARENT} child profiles`, { max: MAX_CHILDREN_PER_PARENT });
export const inAnotherFamily = (): AppError => new AppError('FAMILY_ALREADY_IN_ONE', 409, 'a person is in one family at a time');
export const ownerOnly = (): AppError => new AppError('FAMILY_OWNER_ONLY', 403, 'only the person who started the family can do this');
export const codeInvalid = (): AppError => new AppError('FAMILY_CODE_INVALID', 404, 'that code doesn’t work: ask for a new one');

/** The family a person is in, with their part in it, or null. */
export interface Membership {
  familyId: string;
  ownerId: string;
  role: FamilyRole;
}

export async function membershipOf(db: Executor, userId: string, opts: { lock?: boolean } = {}): Promise<Membership | null> {
  const r = await db.query<{ family_id: string; owner_id: string; role: FamilyRole }>(
    `SELECT fm.family_id, f.owner_id, fm.role FROM family_members fm JOIN families f ON f.id = fm.family_id
      WHERE fm.user_id = $1${opts.lock ? ' FOR UPDATE OF f' : ''}`,
    [userId],
  );
  const row = r.rows[0];
  return row ? { familyId: row.family_id, ownerId: row.owner_id, role: row.role } : null;
}

/** How many people a family has. */
export async function familySize(db: Executor, familyId: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM family_members WHERE family_id = $1`, [familyId]);
  return r.rows[0]!.n;
}

/** The columns a person is shown by. */
export interface PersonColumns {
  id: string;
  username: string;
  display_name: string | null;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
}

/** The name a person goes by in their family: the one they chose, or their username; a child's is always chosen. */
export function nameOf(row: Pick<PersonColumns, 'username' | 'display_name'>): string {
  return row.display_name?.trim() || row.username;
}

export function avatarOf(row: Pick<PersonColumns, 'profile_photo_key' | 'selected_avatar_key'>, publicUrl: PublicUrl): string | null {
  return resolveAvatarUrl(row.profile_photo_key, row.selected_avatar_key, publicUrl);
}

/** A first name or nickname: letters, with spaces, hyphens, apostrophes and dots between them. */
const NAME_SHAPE = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;

/**
 * A child's name as it is kept, or null when it may not be one: cleaned as a display name, held to CHILD_NAME_MAX,
 * only the letters a name is written in (so no number, address or link can be kept in it), and nothing the word
 * filter or the reserved names would refuse in a username.
 */
export function childName(raw: string): string | null {
  const name = cleanDisplayName(raw)?.slice(0, CHILD_NAME_MAX).trim();
  if (!name || !NAME_SHAPE.test(name)) return null;
  if (filterText(name).flagged || isReservedUsername(name)) return null;
  return name;
}

/** Monday 00:00 UTC of the week `at` is in, where the family's board starts counting. */
export function weekStart(at: Date): Date {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * 86_400_000);
}

/** Starts a family with `ownerId` as its owner and first member, for an adult in none; their family's id. */
export async function createFamilyIfNone(db: Executor, ownerId: string, now: Date): Promise<string> {
  const made = await db.query<{ id: string }>(`INSERT INTO families (owner_id, created_at) VALUES ($1, $2) RETURNING id`, [ownerId, now]);
  const id = made.rows[0]!.id;
  await db.query(`INSERT INTO family_members (user_id, family_id, role, joined_at) VALUES ($1, $2, 'owner', $3)`, [ownerId, id, now]);
  return id;
}
