/**
 * How much of each thing one person may have at once, the same numbers for the API, which enforces them, and both apps,
 * which say so first. Each is far above normal use and low enough that a script cannot fill the database or a stranger's
 * screen. The server checks inside the write's transaction under a lock on the person, so two requests cannot both slip
 * under; lowering a number keeps what is already over it and refuses only new ones. Staff tools are exempt.
 */
import { MAX_GROUP_MEMBERS } from './group-roles.js';
import { REPORTS_PER_DAY } from './reports.js';

/** Groups one person owns at once, archived ones aside: several communities' worth, too few for a spammer's hundred rooms. */
export const MAX_GROUPS_OWNED = 10;
/** Groups one person is in at once, owned ones included: more rooms than anyone can follow. */
export const MAX_GROUP_MEMBERSHIPS = 50;
/** Accepted friends. */
export const MAX_FRIENDS = 500;
/** Unanswered friend requests one person has sent. They expire after thirty days; a hundred stops a script asking every account. */
export const MAX_FRIEND_REQUESTS_SENT = 100;
/** Friend requests waiting for one person at once, so nobody's list can be flooded. */
export const MAX_FRIEND_REQUESTS_RECEIVED = 500;
/**
 * Accounts one person has blocked. Blocking keeps a person safe, so this is far above what human harassment produces; it
 * only bounds a script, and reporting is always there too.
 */
export const MAX_BLOCKS = 5000;
/** Words saved from the dictionary: years of learning, and still a list a phone can show. */
export const MAX_SAVED_WORDS = 5000;
/** Game invites one person sent still awaiting an answer; an invite lasts fifteen minutes and asks up to seven friends. */
export const MAX_PENDING_PLAY_INVITES = 30;
/** Games one person hosts at once per kind: a fourth closes their oldest unstarted lobby and is refused only when all three are in play. */
export const MAX_HOSTED_GAMES = 3;
/** Unfinished drafts kept on the server; the apps keep new drafts on the device. */
export const MAX_OPEN_DRAFTS = 20;
/** Signed-in sessions one account holds. A new sign-in is never refused: the session used longest ago ends instead. */
export const MAX_SESSIONS = 50;
/** Phones one account gets notifications on; a new one replaces the one seen longest ago. */
export const MAX_PUSH_DEVICES = 20;

/** Everything a refusal can be about, and how many of it one person may have. */
export const LIMITS = {
  groups_owned: MAX_GROUPS_OWNED,
  group_memberships: MAX_GROUP_MEMBERSHIPS,
  group_members: MAX_GROUP_MEMBERS,
  friends: MAX_FRIENDS,
  friend_requests_sent: MAX_FRIEND_REQUESTS_SENT,
  friend_requests_received: MAX_FRIEND_REQUESTS_RECEIVED,
  blocks: MAX_BLOCKS,
  saved_words: MAX_SAVED_WORDS,
  play_invites_pending: MAX_PENDING_PLAY_INVITES,
  hosted_games: MAX_HOSTED_GAMES,
  library_drafts: MAX_OPEN_DRAFTS,
  reports_per_day: REPORTS_PER_DAY,
} as const;

export type LimitKind = keyof typeof LIMITS;

export const LIMIT_KINDS = Object.keys(LIMITS) as LimitKind[];

/** The code for limits that had no code of their own: 409, with `LimitDetails`. */
export const LIMIT_REACHED = 'LIMIT_REACHED';

/** A limit refusal's `details`: which limit, its number, and `theirs` when it is the other person's (the friend whose list is full). */
export interface LimitDetails {
  limit: LimitKind;
  max: number;
  theirs?: boolean;
}

/**
 * Limits that had their own code before `LIMIT_REACHED` keep it, so older apps still read them; each now also carries
 * `LimitDetails`, and means its own kind when it arrives without.
 */
const CODE_KIND: Readonly<Record<string, LimitKind>> = {
  GROUP_FULL: 'group_members',
  FRIENDS_FULL: 'friends',
  DRAFT_LIMIT: 'library_drafts',
  REPORT_LIMIT: 'reports_per_day',
  TOO_MANY_GAMES: 'hosted_games',
};

export function isLimitKind(value: unknown): value is LimitKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LIMITS, value);
}

/** The details a refusal for `limit` is sent with. */
export function limitDetails(limit: LimitKind, opts: { theirs?: boolean } = {}): LimitDetails {
  return { limit, max: LIMITS[limit], ...(opts.theirs ? { theirs: true } : {}) };
}

/** Which limit an API error is about, or null; the number is the server's when sent, so older apps still say the one in force. */
export function limitOf(error: { code?: string; details?: unknown } | null | undefined): LimitDetails | null {
  const code = error?.code;
  if (!code || (code !== LIMIT_REACHED && CODE_KIND[code] === undefined)) return null;
  const d = typeof error.details === 'object' && error.details !== null ? (error.details as Record<string, unknown>) : {};
  const limit = isLimitKind(d.limit) ? d.limit : (CODE_KIND[code] ?? null);
  if (!limit) return null;
  const max = typeof d.max === 'number' && Number.isFinite(d.max) && d.max > 0 ? d.max : LIMITS[limit];
  return { limit, max, ...(d.theirs === true ? { theirs: true } : {}) };
}

/** What a list of one's own groups (`GET /me/groups`) says about the group limits. */
export interface GroupLimitState {
  owned: number;
  memberships: number;
  /** why a new group cannot be started now, or null when it can */
  create: LimitDetails | null;
  /** why another group cannot be joined now, or null when it can */
  join: LimitDetails | null;
}

/** Where a person stands against the group limits, counted as the server counts: archived groups no longer count. */
export function groupLimits(groups: ReadonlyArray<{ myRole: string; archivedAt?: string | null }>): GroupLimitState {
  const live = groups.filter((g) => !g.archivedAt);
  const owned = live.filter((g) => g.myRole === 'owner').length;
  const memberships = live.length;
  const full = memberships >= MAX_GROUP_MEMBERSHIPS ? limitDetails('group_memberships') : null;
  return {
    owned,
    memberships,
    create: owned >= MAX_GROUPS_OWNED ? limitDetails('groups_owned') : full,
    join: full,
  };
}
