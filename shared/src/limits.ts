/**
 * How much of each thing one person may have at once — groups, friends, saved
 * words, open games — the same numbers for the API, which holds people to
 * them, and for the website and the phone, which say so before anyone runs
 * into one.
 *
 * Each number is far above anything a person using Hevalo as it is meant to
 * be used comes near, and low enough that a script cannot fill the database
 * or a stranger's screen. The server checks it inside the same transaction as
 * the write, under a lock on the person, so two requests at once cannot both
 * squeeze under it; what is already over a number when it is lowered stays,
 * and only new ones are refused. Staff tools are not held to any of them.
 */
import { MAX_GROUP_MEMBERS } from './group-roles.js';
import { REPORTS_PER_DAY } from './reports.js';

/**
 * Groups one person owns at once, archived ones aside. A group is somebody's
 * to look after; ten is several communities' worth, and a spammer cannot open
 * a hundred rooms to post the same thing in.
 */
export const MAX_GROUPS_OWNED = 10;
/** Groups one person is in at once, owned ones included: more rooms than anyone can follow. */
export const MAX_GROUP_MEMBERSHIPS = 50;
/** Accepted friends (this was the friend list's cap before there was this file). */
export const MAX_FRIENDS = 500;
/**
 * Friend requests one person has sent and nobody has answered yet. They
 * expire after thirty days; a hundred at once is a lot of introductions and
 * stops a script asking every account it can find.
 */
export const MAX_FRIEND_REQUESTS_SENT = 100;
/** Friend requests waiting for one person at once, so nobody's list can be flooded. */
export const MAX_FRIEND_REQUESTS_RECEIVED = 500;
/**
 * Accounts one person has blocked. Blocking is how a person keeps themselves
 * safe, so this is set far above what harassment by people produces; it bounds
 * a script, and reporting is always there beside it.
 */
export const MAX_BLOCKS = 5000;
/** Words saved from the dictionary: years of learning, and one list a phone can still show. */
export const MAX_SAVED_WORDS = 5000;
/**
 * Game invites one person has sent that are still waiting for an answer. An
 * invite lasts fifteen minutes and one request asks up to seven friends.
 */
export const MAX_PENDING_PLAY_INVITES = 30;
/**
 * Games one person hosts at once, for each kind of game: a fourth closes the
 * host's oldest lobby nobody has started, and is refused only when all three
 * are being played.
 */
export const MAX_HOSTED_GAMES = 3;
/** Unfinished drafts kept on the server (the apps keep new drafts on the device). */
export const MAX_OPEN_DRAFTS = 20;
/**
 * Signed-in sessions one account holds. A new sign-in is never refused for
 * it: the session used longest ago ends instead, as signing out of it would.
 */
export const MAX_SESSIONS = 50;
/** Phones one account gets notifications on; a new one takes the place of the one seen longest ago. */
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

/** The code of a refusal for a limit that had no code of its own before: 409, with `LimitDetails`. */
export const LIMIT_REACHED = 'LIMIT_REACHED';

/**
 * What a limit refusal carries in `details`: which limit, its number, and
 * `theirs` when it is the other person's — the friend whose list is full, the
 * member who already owns as many groups as anyone may.
 */
export interface LimitDetails {
  limit: LimitKind;
  max: number;
  theirs?: boolean;
}

/**
 * The limits that had a code before `LIMIT_REACHED` existed keep it, so an app
 * that knows only the old code still reads them; each now carries
 * `LimitDetails` too, and stands for its own kind when it arrives without.
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

/**
 * Which limit an error from the API is about, or null when it is not about
 * one. The number is the server's when it sent one, so an app older than a
 * change to a limit still says the number in force.
 */
export function limitOf(error: { code?: string; details?: unknown } | null | undefined): LimitDetails | null {
  const code = error?.code;
  if (!code || (code !== LIMIT_REACHED && CODE_KIND[code] === undefined)) return null;
  const d = typeof error.details === 'object' && error.details !== null ? (error.details as Record<string, unknown>) : {};
  const limit = isLimitKind(d.limit) ? d.limit : (CODE_KIND[code] ?? null);
  if (!limit) return null;
  const max = typeof d.max === 'number' && Number.isFinite(d.max) && d.max > 0 ? d.max : LIMITS[limit];
  return { limit, max, ...(d.theirs === true ? { theirs: true } : {}) };
}

/** What a list of one's own groups says about the group limits: `GET /me/groups` as both apps load it. */
export interface GroupLimitState {
  owned: number;
  memberships: number;
  /** why a new group cannot be started now, or null when it can */
  create: LimitDetails | null;
  /** why another group cannot be joined now, or null when it can */
  join: LimitDetails | null;
}

/**
 * Where a person stands against the group limits, counted the way the server
 * counts them: archived groups are not owned or belonged to any more.
 */
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
