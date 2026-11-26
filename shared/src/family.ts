/**
 * Families and child profiles: who may be in a family, the codes that bring people in, the ages a child profile is
 * for, and the PIN and pairing code that sign a child in. Shared so the server enforces, and the phone offers and
 * explains, the same numbers.
 *
 * A child profile belongs to the parent who made it and consented for it; it has no email, password or picture of its
 * own, and nothing about it is shown outside the family.
 */
import { ageInYears, isPlausibleBirthMonth, MIN_CHILD_PROFILE_AGE, MIN_SIGNUP_AGE, type BirthMonth } from './age.js';
import { PARENT_CODE_ALPHABET } from './parental.js';

/** An owner and up to five more, adults, teens and children together: the family plan's seats. */
export const MAX_FAMILY_SIZE = 6;

/** The child profiles one parent may look after. */
export const MAX_CHILDREN_PER_PARENT = 5;

/** How long an adult's invitation to a family works, and how many letters it has. */
export const FAMILY_CODE_TTL_HOURS = 48;
export const FAMILY_CODE_LENGTH = 8;

/** A child's phone is paired with a code of this many digits, shown on the parent's phone for this long. */
export const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_MINUTES = 10;

/** A family PIN is this many digits; wrong guesses lock it for a while after this many in a row. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const PIN_TRIES = 5;
export const PIN_LOCK_MINUTES = 15;

/** A child's name or nickname, as short as a name on a badge. */
export const CHILD_NAME_MAX = 24;

/** The wording a parent agrees to when making a child profile; a new wording gets a new version. */
export const CHILD_CONSENT_VERSION = '2026-11';

/** The part each person has in a family. */
export const FAMILY_ROLES = ['owner', 'adult', 'teen', 'child'] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

/** What a child can ask a parent to buy: a plan, a pack of Zêr, or a look from the shop. */
export const PURCHASE_REQUEST_KINDS = ['plus', 'zer', 'look'] as const;
export type PurchaseRequestKind = (typeof PURCHASE_REQUEST_KINDS)[number];
export type PurchaseRequestStatus = 'pending' | 'approved' | 'declined';

/** Old enough for a child profile and young enough to need one: 6 to 12 now. */
export function isChildAge(birth: BirthMonth, now: Date = new Date()): boolean {
  if (!isPlausibleBirthMonth(birth, now)) return false;
  const age = ageInYears(birth, now);
  return age >= MIN_CHILD_PROFILE_AGE && age < MIN_SIGNUP_AGE;
}

/** Thirteen or older: the profile can become a teen's own account. */
export function hasOutgrownChildProfile(birth: BirthMonth, now: Date = new Date()): boolean {
  return ageInYears(birth, now) >= MIN_SIGNUP_AGE;
}

/** The birth years the add-a-child form offers, newest first: every year a child of 6 to 12 can be born in. */
export function childBirthYearChoices(now: Date = new Date()): number[] {
  const year = now.getUTCFullYear();
  const years: number[] = [];
  for (let y = year - MIN_CHILD_PROFILE_AGE; y >= year - MIN_SIGNUP_AGE; y--) years.push(y);
  return years;
}

/** A family code as typed or pasted, in its stored form, or null when it cannot be one; read like a parent's code. */
export function normalizeFamilyCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== FAMILY_CODE_LENGTH) return null;
  for (const ch of code) if (!PARENT_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** A family code as shown and read aloud: two groups of four. */
export function formatFamilyCode(code: string): string {
  return code.length === FAMILY_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** A pairing code as typed or pasted, digits only, or null when it is not eight of them; spaces and hyphens are ignored. */
export function normalizePairingCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '');
  return new RegExp(`^\\d{${PAIRING_CODE_LENGTH}}$`).test(code) ? code : null;
}

/** A pairing code as shown, or as far as it is typed: groups of four digits ("1234 5678"), easy to read across a room. */
export function formatPairingCode(code: string): string {
  return code
    .replace(/\D/g, '')
    .slice(0, PAIRING_CODE_LENGTH)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Four to six digits. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

/** A person as their family sees them. */
export interface FamilyPerson {
  userId: string;
  /** The name they go by: a display name or username, or a child's first name or nickname. */
  name: string;
  avatarUrl: string | null;
  role: FamilyRole;
}

/** One line of the family's board: XP this week, from Monday. */
export interface FamilyBoardRow extends FamilyPerson {
  xp: number;
}
