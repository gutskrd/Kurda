/**
 * Parental controls (shared/src/parental.ts): who may be a parent and who a teen, the one-time codes that connect them,
 * the links, the teen's controls, and what a parent sees, which is the teen's learning in numbers and nothing they
 * wrote or who they know. Everything a link depends on is checked again under both people's locks when it is made, so
 * two teens racing for a parent's last place, or a code used twice at once, connect one link.
 */
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  addDays,
  isBelowConsentAge,
  isBelowMinimumAge,
  isMinor,
  isPlausibleBirthMonth,
  localDay,
  MAX_PARENTS_PER_TEEN,
  MAX_TEENS_PER_PARENT,
  MIN_SIGNUP_AGE,
  normalizeParentCode,
  OPEN_CONTROLS,
  PARENT_CODE_ALPHABET,
  PARENT_CODE_LENGTH,
  PARENT_CODE_TTL_HOURS,
  PARENTAL_SWITCHES,
  type Bedtime,
  type BirthMonth,
  type ParentalControls,
  type SupervisionState,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { lockPeopleFor, lockPersonFor } from '../limits/limits.js';
import { availableSql } from '../moderation/availability.js';
import { IN_FORCE_SQL } from '../moderation/sanctions-service.js';
import { moderationKeyed } from '../moderation/pseudonym.js';
import { recordNotifications } from '../notifications/inbox-service.js';
import type { Notification } from '../push/service.js';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { birthMonthOf, minorSql } from '../users/age.js';
import { invalidBirthMonth } from '../users/birth-month.js';
import { StreakService } from '../streaks/service.js';
import { answeredTodaySql, countsAsLearningSql, safeTimeZone } from '../streaks/streak-logic.js';
import { sendEmailJob } from '../jobs/email.js';
import type { JobQueue } from '../jobs/queue.js';
import { emailLocaleFor } from '../email/templates.js';
import {
  birthNotice,
  changedNotice,
  connectedNotice,
  leaveAskedNotice,
  leaveEndsOn,
  leaveKeptNotice,
  parentAddedNotice,
  parentalEmail,
  stoppedNotice,
  type NoticePerson,
  type ParentalTemplate,
} from './notices.js';
import { CONTROL_COLUMNS, controlsOf, endDueLinks, leaveDueSql, leaveEndsAt, recordBeat, supervisionOf, type ControlsRow } from './supervision.js';

/** A person as either side of a link is shown the other. */
export interface PersonRef {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export type ParentalRole = 'teen' | 'parent' | 'none';
/** Why an account has no part in parental controls: a guest, no birth month, an unconfirmed address, or a limited account. */
export type NoRoleReason = 'guest' | 'birth_month' | 'email' | 'standing';

export interface LearningDay {
  day: string;
  minutes: number;
  lessons: number;
  xp: number;
}

/** A teen's parent as the teen sees them: since when, and when the teen's request to leave ends the link, if they asked. */
export type ConnectedParent = PersonRef & { since: string; leaveEndsAt: string | null };

export interface ParentalOverview {
  role: ParentalRole;
  reason?: NoRoleReason;
  parents?: ConnectedParent[];
  supervision?: SupervisionState | null;
  teens?: Array<{ teen: PersonRef; since: string; today: { minutes: number; lessons: number }; leaveEndsAt: string | null }>;
}

export interface TeenPage {
  teen: PersonRef;
  since: string;
  controls: ParentalControls;
  /** the zone the teen's day and bedtime are counted in */
  timeZone: string;
  /** the caller is the first parent, who alone may loosen a control */
  canLoosen: boolean;
  week: LearningDay[];
  streak: number;
  /** every parent, the first first */
  parents: Array<PersonRef & { first: boolean }>;
  /** when the teen's request to stop this parent's supervision ends it, or null when they have not asked */
  leaveEndsAt: string | null;
  birthMonth: BirthMonth;
  /** the caller may correct the birth month: the first parent, while nobody has */
  birthCorrectable: boolean;
}

/** The days a parent's week shows, today the last. */
export const WEEK_DAYS = 7;

/** How often each person is pushed a change to a teen's controls at most; later changes join the notice already sent. */
export const CHANGE_NOTICE_EVERY_MIN = 10;

/** The sanctions that make an account a limited one, which may not take on a teen: warnings and removals do not. */
const LIMITING_SANCTIONS = ['chat_mute', 'post_mute', 'feature_limit', 'suspension', 'permanent_ban'];

/** What both eligibility rules read about an account, in one row. */
export interface AccountRow extends NoticePerson {
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  email: string | null;
  locale: string;
  timezone: string;
  guest: boolean;
  birth_year: number | null;
  birth_month: number | null;
  email_verified: boolean;
  /** closed, or its deletion asked for */
  leaving: boolean;
  /** suspended, banned, held, muted, or under a feature limit */
  limited: boolean;
  /** in a live link as its teen, which for an adult is one left from before they turned 18 */
  supervised: boolean;
  /** 'child' for a child's profile (family/), which a parent made and nobody connects to with a code */
  kind: string;
}

const ACCOUNT_SQL = `
  SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.email, u.locale, u.timezone, u.guest, u.kind,
         u.birth_year, u.birth_month, u.email_verified_at IS NOT NULL AS email_verified,
         (u.deleted_at IS NOT NULL OR u.deletion_requested_at IS NOT NULL) AS leaving,
         (NOT ${availableSql('u')} OR u.held_at IS NOT NULL OR COALESCE(u.muted_until > now(), false)
           OR EXISTS (SELECT 1 FROM sanctions s WHERE s.user_id = u.id AND s.kind = ANY($2::text[]) AND ${IN_FORCE_SQL})) AS limited,
         EXISTS (SELECT 1 FROM parental_links pl WHERE pl.teen_id = u.id AND pl.ended_at IS NULL) AS supervised
    FROM users u WHERE u.id = $1`;

/**
 * Which part an account can take: a known 13–17 is a teen; a known adult with a confirmed address in good standing
 * is a parent; anyone else none, with the reason the apps explain. A guest is asked to make an account first, and an
 * unknown age for the birth month, since neither side can be decided without it.
 */
export function roleOf(account: Pick<AccountRow, 'guest' | 'birth_year' | 'birth_month' | 'email_verified' | 'limited'>, now: Date = new Date()): {
  role: ParentalRole;
  reason?: NoRoleReason;
} {
  if (account.guest) return { role: 'none', reason: 'guest' };
  const birth = birthMonthOf(account);
  if (!birth) return { role: 'none', reason: 'birth_month' };
  if (isMinor(birth, now)) return { role: 'teen' };
  if (!account.email_verified) return { role: 'none', reason: 'email' };
  if (account.limited) return { role: 'none', reason: 'standing' };
  return { role: 'parent' };
}

/**
 * May take on a teen now: a parent by `roleOf`, and not closing. A parent is never supervised themselves, being an adult:
 * a teen's links end at 18, and links left from before then are ended as they are read.
 */
export function mayBeParent(account: AccountRow, now: Date = new Date()): boolean {
  return roleOf(account, now).role === 'parent' && !account.leaving;
}

/** May connect a parent now: a teen by `roleOf`, and not closing. */
export function mayBeTeen(account: AccountRow, now: Date = new Date()): boolean {
  return roleOf(account, now).role === 'teen' && !account.leaving && account.kind !== 'child';
}

/** The row both eligibility rules read, for the family pages, which ask the same of a parent (family/). */
export async function parentalAccount(db: Executor, userId: string): Promise<AccountRow | null> {
  const r = await db.query<AccountRow>(ACCOUNT_SQL, [userId, LIMITING_SANCTIONS]);
  return r.rows[0] ?? null;
}

/**
 * SQL: the live link `alias` is to a teen's own account, not to a child's profile, which a parent looks after from the
 * family page and which counts against MAX_CHILDREN_PER_PARENT instead. `alias` is a literal from this module.
 */
const teenLinkSql = (alias: string): string => `NOT EXISTS (SELECT 1 FROM child_profiles cp WHERE cp.user_id = ${alias}.teen_id)`;

/** A new code: PARENT_CODE_LENGTH letters drawn evenly from PARENT_CODE_ALPHABET by the system's secure random source. */
export function makeParentCode(): string {
  let code = '';
  for (let i = 0; i < PARENT_CODE_LENGTH; i++) code += PARENT_CODE_ALPHABET[randomInt(PARENT_CODE_ALPHABET.length)];
  return code;
}

/**
 * A code as it is stored: keyed with the server's secret, so the table alone gives nobody a way to try every code
 * against it. A lookup is by this hash's index, so the time it takes says nothing about the code.
 */
export function hashParentCode(code: string): string {
  return moderationKeyed('parent-code', code);
}

/**
 * Whether `after` opens anything `before` kept closed: a switch back on, a longer daily limit or none, a shorter bedtime
 * or none. A bedtime runs from an evening to a morning, so one is at least as strict as another when it starts no later
 * and ends no earlier.
 */
export function loosens(before: ParentalControls, after: ParentalControls): boolean {
  if (PARENTAL_SWITCHES.some((s) => !before[s] && after[s])) return true;
  if (before.dailyLimitMinutes !== null && (after.dailyLimitMinutes === null || after.dailyLimitMinutes > before.dailyLimitMinutes)) return true;
  return before.bedtime !== null && (after.bedtime === null || !covers(after.bedtime, before.bedtime));
}

const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function covers(outer: Bedtime, inner: Bedtime): boolean {
  return minutesOf(outer.from) <= minutesOf(inner.from) && minutesOf(outer.to) >= minutesOf(inner.to);
}

export const codeInvalid = (): AppError => new AppError('PARENT_CODE_INVALID', 404, 'that code doesn’t work: ask for a new one');
const notTeen = (): AppError => new AppError('PARENTAL_NOT_TEEN', 403, 'parental controls are for accounts of people aged 13 to 17');
const selfCode = (): AppError => new AppError('PARENTAL_SELF', 400, 'that is your own code: enter it on your teen’s account');
const tooManyParents = (): AppError =>
  new AppError('PARENTAL_TOO_MANY_PARENTS', 409, `an account can have ${MAX_PARENTS_PER_TEEN} parents connected`, { max: MAX_PARENTS_PER_TEEN });
const parentFull = (): AppError =>
  new AppError('PARENTAL_PARENT_FULL', 409, `a parent can look after ${MAX_TEENS_PER_PARENT} teens`, { max: MAX_TEENS_PER_PARENT });
const alreadyConnected = (): AppError => new AppError('PARENTAL_ALREADY_CONNECTED', 409, 'you are already connected to this parent');
/** A parent who is not the first tried to loosen a control; the first parent is named so the apps can say whom to ask. */
const firstParentOnly = (first: PersonRef): AppError =>
  new AppError('PARENTAL_FIRST_PARENT_ONLY', 403, 'only the first parent connected can loosen these settings', { parent: first });
/** A parent tried to turn on a part of Hevalo a child's profile never has. */
const childSwitchesFixed = (): AppError =>
  new AppError('CHILD_CONTROLS_FIXED', 422, 'a child profile has no chat, letters, posts, online games, friends or purchases to turn on');

async function isChildProfile(db: Executor, userId: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM child_profiles WHERE user_id = $1`, [userId]);
  return (r.rowCount ?? 0) > 0;
}

/** The same answer for a link that does not exist and one that is not the caller's, so no link is ever revealed. */
const noSuchLink = (): AppError => new AppError('NOT_FOUND', 404, 'nothing to show here');
/** A birth month is corrected once by a parent; after that only support can. */
const birthAlreadyCorrected = (): AppError =>
  new AppError('PARENTAL_BIRTH_ALREADY_CORRECTED', 409, 'this birth month has already been corrected once: write to support to change it again');
/** A correction that would take the teen out of 13 to 17, with which way, so the apps can say what to do instead. */
const birthOutOfRange = (reason: 'under13' | 'adult'): AppError =>
  new AppError(
    'PARENTAL_BIRTH_OUT_OF_RANGE',
    422,
    reason === 'under13'
      ? `Hevalo is for people aged ${MIN_SIGNUP_AGE} and over: write to support to fix this`
      : 'that would make them an adult: you can stop supervising instead',
    { reason },
  );

interface PersonColumns {
  id: string;
  username: string;
  display_name: string | null;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
}

interface TeenPageRow extends PersonColumns, ControlsRow {
  since: Date;
  minor: boolean;
  timezone: string;
  birth_year: number;
  birth_month: number;
  birth_corrected_at: Date | null;
  leave_requested_at: Date | null;
  /** a live link of the teen's, this one or another parent's, whose leave has run its days */
  any_leave_due: boolean;
  /** a child's profile, whose birth month its parent set when making it and changes on the family page */
  child: boolean;
}

export interface ParentalDeps {
  /** Pushes a notification already written to the inbox (jobs/push-jobs.ts `pushRecorded`). */
  push?: (userId: string, notification: Notification) => Promise<void>;
  /** where the parent's email goes; without a queue none is sent */
  jobs?: JobQueue | null;
  publicUrl?: PublicUrl;
  log?: { warn: (obj: unknown, msg?: string) => void };
}

export class ParentalService {
  private readonly publicUrl: PublicUrl;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: ParentalDeps = {},
  ) {
    this.publicUrl = deps.publicUrl ?? (() => null);
  }

  private person(row: PersonColumns): PersonRef {
    return {
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: resolveAvatarUrl(row.profile_photo_key, row.selected_avatar_key, this.publicUrl),
    };
  }

  private account(db: Executor, userId: string): Promise<AccountRow | null> {
    return parentalAccount(db, userId);
  }

  /** The caller's part in parental controls, and what goes with it: their parents, or their teens and today's numbers. */
  async overview(userId: string, now: Date = new Date()): Promise<ParentalOverview> {
    const account = await this.account(this.pool, userId);
    if (!account) throw noSuchLink();
    const { role, reason } = roleOf(account, now);
    if (role === 'teen') {
      // the supervision read first, since it ends a link whose leave has run its days, which the list must not show
      const supervision = await supervisionOf(this.pool, userId, now);
      return { role, parents: await this.parentsOf(this.pool, userId), supervision };
    }
    // an adult still listed as someone's teen has turned 18 since it was last read
    if (account.supervised) await endDueLinks(this.pool, 'teen_id', userId, now);
    // A parent whose address or standing changed keeps their teens in view (and can stop supervising), but adds no more.
    const adult = role === 'parent' || reason === 'email' || reason === 'standing';
    const teens = adult ? await this.teensOf(userId, now) : [];
    if (role === 'none' && teens.length === 0) return { role, reason };
    return { role: 'parent', teens };
  }

  /** A teen's parents, longest connected first: the first of them is the first parent. */
  private async parentsOf(db: Executor, teenId: string): Promise<ConnectedParent[]> {
    const r = await db.query<PersonColumns & { since: Date; leave_requested_at: Date | null }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, l.created_at AS since, l.leave_requested_at
         FROM parental_links l JOIN users u ON u.id = l.parent_id
        WHERE l.teen_id = $1 AND l.ended_at IS NULL
        ORDER BY l.created_at, l.id`,
      [teenId],
    );
    return r.rows.map((row) => ({ ...this.person(row), since: row.since.toISOString(), leaveEndsAt: leaveEndOf(row.leave_requested_at) }));
  }

  /** A parent's teens with today's minutes and lessons, longest connected first; one who turned 18 or whose leave ran out is let go here. */
  private async teensOf(parentId: string, now: Date): Promise<NonNullable<ParentalOverview['teens']>> {
    await endDueLinks(this.pool, 'parent_id', parentId, now);
    const r = await this.pool.query<PersonColumns & { since: Date; time_zone: string | null; leave_requested_at: Date | null }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, l.created_at AS since, c.time_zone, l.leave_requested_at
         FROM parental_links l
         JOIN users u ON u.id = l.teen_id
         LEFT JOIN parental_controls c ON c.teen_id = l.teen_id
        WHERE l.parent_id = $1 AND l.ended_at IS NULL AND ${teenLinkSql('l')}
        ORDER BY l.created_at`,
      [parentId],
    );
    return Promise.all(
      r.rows.map(async (row) => {
        const zone = safeTimeZone(row.time_zone);
        const [today] = await learningDays(this.pool, row.id, zone, localDay(now, zone), 1, row.since);
        return {
          teen: this.person(row),
          since: row.since.toISOString(),
          today: { minutes: today?.minutes ?? 0, lessons: today?.lessons ?? 0 },
          leaveEndsAt: leaveEndOf(row.leave_requested_at),
        };
      }),
    );
  }

  /**
   * A new code for a parent, replacing any they had, so the old one stops working. Refused to anyone who may not be a
   * parent and to a parent already looking after MAX_TEENS_PER_PARENT teens.
   */
  async createCode(userId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
    return inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'parental', userId);
      const account = await this.account(client, userId);
      if (!account || !mayBeParent(account, now)) {
        throw new AppError('PARENTAL_NOT_PARENT', 403, 'a parent’s account is an adult’s, with a confirmed email, in good standing', {
          reason: account ? (roleOf(account, now).reason ?? null) : null,
        });
      }
      if (account.supervised) await endDueLinks(client, 'teen_id', userId, now);
      await endDueLinks(client, 'parent_id', userId, now);
      const teens = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM parental_links l WHERE l.parent_id = $1 AND l.ended_at IS NULL AND ${teenLinkSql('l')}`,
        [userId],
      );
      if (teens.rows[0]!.n >= MAX_TEENS_PER_PARENT) throw parentFull();

      await client.query(`DELETE FROM parental_codes WHERE parent_id = $1`, [userId]);
      const expiresAt = new Date(now.getTime() + PARENT_CODE_TTL_HOURS * 3_600_000);
      // Another parent's live code with the same letters is vanishingly rare; the insert then makes nothing, and a fresh
      // draw goes in instead.
      for (let draw = 0; draw < 5; draw++) {
        const code = makeParentCode();
        const made = await client.query(
          `INSERT INTO parental_codes (parent_id, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [userId, hashParentCode(code), expiresAt, now],
        );
        if (made.rowCount) return { code, expiresAt: expiresAt.toISOString() };
      }
      throw new Error('five parent codes in a row were already taken');
    });
  }

  /**
   * Refuses anyone but a teen before a code is looked at, so an adult cannot use these routes to learn whose a code
   * is; the one thing told to an adult about a code is that it is their own.
   */
  private async assertTeen(account: AccountRow | null, userId: string, code: string | null, now: Date): Promise<void> {
    if (account && mayBeTeen(account, now)) return;
    if (code) {
      const own = await this.pool.query(`SELECT 1 FROM parental_codes WHERE parent_id = $1 AND code_hash = $2`, [userId, hashParentCode(code)]);
      if (own.rowCount) throw selfCode();
    }
    throw notTeen();
  }

  /** The parent a live code belongs to, while they may still be one; null for any code that does not work. */
  private async codeOwner(db: Executor, code: string, now: Date, opts: { lock?: boolean } = {}): Promise<AccountRow | null> {
    const r = await db.query<{ parent_id: string }>(
      `SELECT parent_id FROM parental_codes WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2${opts.lock ? ' FOR UPDATE' : ''}`,
      [hashParentCode(code), now],
    );
    const parentId = r.rows[0]?.parent_id;
    if (!parentId) return null;
    const parent = await this.account(db, parentId);
    return parent && mayBeParent(parent, now) ? parent : null;
  }

  /** Who made a code, for the teen to see before connecting. Every code that does not work is the same 404. */
  async lookup(userId: string, input: string, now: Date = new Date()): Promise<{ parent: PersonRef }> {
    const code = normalizeParentCode(input);
    await this.assertTeen(await this.account(this.pool, userId), userId, code, now);
    const parent = code ? await this.codeOwner(this.pool, code, now) : null;
    if (!parent || parent.id === userId) throw codeInvalid();
    return { parent: this.person(parent) };
  }

  /**
   * Connects the teen to the parent whose code they entered: their confirmation is the teen's consent, and the code the
   * parent's. Under both people's locks everything is read again: the teen, the code (then used), the parent, and both
   * sides' links against the caps. The first parent starts the teen's controls open, counted in the account's own time
   * zone for at least ZONE_HOLD_DAYS; a second finds them as they are, and the parents already there are told in the
   * app and by email, so a second account cannot join unseen.
   */
  async connect(userId: string, input: string, now: Date = new Date()): Promise<{ parents: ConnectedParent[]; supervision: SupervisionState | null }> {
    const code = normalizeParentCode(input);
    await this.assertTeen(await this.account(this.pool, userId), userId, code, now);
    // whose code it is, read once without a lock to know whose lock to take
    const claimed = code ? await this.pool.query<{ parent_id: string }>(`SELECT parent_id FROM parental_codes WHERE code_hash = $1`, [hashParentCode(code)]) : null;
    const parentId = claimed?.rows[0]?.parent_id;
    if (!code || !parentId || parentId === userId) throw codeInvalid();

    const { parent, teen, others } = await inTransaction(this.pool, async (client) => {
      await lockPeopleFor(client, 'parental', parentId, userId);
      const teen = await this.account(client, userId);
      if (!teen || !mayBeTeen(teen, now)) throw notTeen();
      const parent = await this.codeOwner(client, code, now, { lock: true });
      if (!parent || parent.id !== parentId) throw codeInvalid();

      // links whose time is up count against neither side's cap
      await endDueLinks(client, 'parent_id', parentId, now);
      await endDueLinks(client, 'teen_id', userId, now);
      const links = await client.query<{ parent_id: string; teen_id: string }>(
        `SELECT parent_id, teen_id FROM parental_links l WHERE (l.teen_id = $1 OR l.parent_id = $2) AND l.ended_at IS NULL AND ${teenLinkSql('l')}`,
        [userId, parentId],
      );
      if (links.rows.some((l) => l.parent_id === parentId && l.teen_id === userId)) throw alreadyConnected();
      const already = links.rows.filter((l) => l.teen_id === userId).map((l) => l.parent_id);
      if (already.length >= MAX_PARENTS_PER_TEEN) throw tooManyParents();
      if (links.rows.filter((l) => l.parent_id === parentId).length >= MAX_TEENS_PER_PARENT) throw parentFull();

      await client.query(`UPDATE parental_codes SET used_at = $2 WHERE parent_id = $1`, [parentId, now]);
      await client.query(`INSERT INTO parental_links (parent_id, teen_id, created_at) VALUES ($1, $2, $3)`, [parentId, userId, now]);
      // Limits left from an earlier parent are not carried to a new one: the first parent starts from open controls.
      const open = OPEN_CONTROLS;
      // the zone is stamped as just set, so even the first change waits out the hold (supervision.ts `recordBeat`)
      await client.query(
        `INSERT INTO parental_controls (teen_id, daily_limit_minutes, bedtime_from, bedtime_to, chat, letters, posts, games, friends, purchases,
                                        time_zone, time_zone_changed_at, last_beat_at, updated_at)
         VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $10)
         ON CONFLICT (teen_id) DO UPDATE SET
           daily_limit_minutes = EXCLUDED.daily_limit_minutes, bedtime_from = NULL, bedtime_to = NULL,
           chat = EXCLUDED.chat, letters = EXCLUDED.letters, posts = EXCLUDED.posts, games = EXCLUDED.games,
           friends = EXCLUDED.friends, purchases = EXCLUDED.purchases, time_zone = EXCLUDED.time_zone,
           time_zone_changed_at = EXCLUDED.time_zone_changed_at, updated_at = EXCLUDED.updated_at
         WHERE $11::boolean`,
        [userId, open.dailyLimitMinutes, open.chat, open.letters, open.posts, open.games, open.friends, open.purchases, safeTimeZone(teen.timezone), now, already.length === 0],
      );
      const others: AccountRow[] = [];
      for (const id of already) {
        const other = await this.account(client, id);
        if (other) others.push(other);
      }
      await recordNotifications(client, [
        { userId: parentId, notification: connectedNotice(teen) },
        ...others.map((other) => ({ userId: other.id, notification: parentAddedNotice(teen, parent) })),
      ]);
      return { parent, teen, others };
    });
    await this.tell(parent.id, connectedNotice(teen));
    for (const other of others) {
      await this.tell(other.id, parentAddedNotice(teen, parent));
      await this.email(other, 'parental-parent-added', { teen: `@${teen.username}`, parent: `@${parent.username}` }, now);
    }
    const [parents, supervision] = await Promise.all([this.parentsOf(this.pool, userId), supervisionOf(this.pool, userId, now)]);
    return { parents, supervision };
  }

  /**
   * What a parent sees of one of their teens: who, since when, the controls and the zone they are counted in, whether
   * this parent may loosen them, the week in numbers from the day they connected, the streak, every parent, when the
   * teen's request to leave ends this link, and the birth month with whether this parent may correct it.
   */
  async teen(parentId: string, teenId: string, now: Date = new Date()): Promise<TeenPage> {
    const r = await this.pool.query<TeenPageRow>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key, u.timezone, u.birth_year, u.birth_month,
              l.created_at AS since, l.leave_requested_at, c.birth_corrected_at, ${CONTROL_COLUMNS}, ${minorSql('u')} AS minor,
              EXISTS (SELECT 1 FROM parental_links d WHERE d.teen_id = l.teen_id AND d.ended_at IS NULL AND ${leaveDueSql('d', '$3')}) AS any_leave_due,
              u.kind = 'child' AS child
         FROM parental_links l
         JOIN users u ON u.id = l.teen_id
         JOIN parental_controls c ON c.teen_id = l.teen_id
        WHERE l.parent_id = $1 AND l.teen_id = $2 AND l.ended_at IS NULL`,
      [parentId, teenId, now],
    );
    const row = r.rows[0];
    if (!row) throw noSuchLink();
    if (!row.minor || row.any_leave_due) {
      await endDueLinks(this.pool, 'teen_id', teenId, now);
      // the teen's leave from another parent ends that link only
      if (!row.minor || (row.leave_requested_at && leaveEndsAt(row.leave_requested_at) <= now)) throw noSuchLink();
    }
    const zone = safeTimeZone(row.time_zone);
    const [week, streak, parents] = await Promise.all([
      learningDays(this.pool, teenId, zone, addDays(localDay(now, zone), 1 - WEEK_DAYS), WEEK_DAYS, row.since),
      // the streak as the teen sees it, in their account's own zone
      new StreakService(this.pool).get(teenId, safeTimeZone(row.timezone), now),
      this.parentsOf(this.pool, teenId),
    ]);
    const canLoosen = parents[0]?.userId === parentId;
    return {
      teen: this.person(row),
      since: row.since.toISOString(),
      controls: controlsOf(row),
      timeZone: zone,
      canLoosen,
      week,
      streak: streak.current,
      parents: parents.map((p, i) => ({ ...refOf(p), first: i === 0 })),
      leaveEndsAt: leaveEndOf(row.leave_requested_at),
      birthMonth: { year: row.birth_year, month: row.birth_month },
      // the first parent alone, as for loosening, and once; never a child's here
      birthCorrectable: canLoosen && row.birth_corrected_at === null && !row.child,
    };
  }

  /**
   * A parent changes some of a teen's controls; every parent and the teen see the same values. Only the first parent,
   * whose link is the oldest, may loosen any of them: another may only tighten, so a second account cannot undo what the
   * first set, and a change that loosens anything is refused whole. The teen and every other parent are told, naming
   * whoever changed it last (`foldChange`).
   */
  async updateControls(parentId: string, teenId: string, patch: Partial<ParentalControls>, now: Date = new Date()): Promise<{ controls: ParentalControls }> {
    const done = await inTransaction(this.pool, async (client) => {
      // in the order connecting and ending take them, so who is first cannot change meanwhile
      await lockPeopleFor(client, 'parental', parentId, teenId);
      // a parent whose time is up neither changes anything nor counts as first
      await endDueLinks(client, 'teen_id', teenId, now);
      const r = await client.query<ControlsRow>(
        `SELECT ${CONTROL_COLUMNS}
           FROM parental_controls c JOIN users u ON u.id = c.teen_id
          WHERE c.teen_id = $1 AND ${minorSql('u')}
            AND EXISTS (SELECT 1 FROM parental_links l WHERE l.teen_id = c.teen_id AND l.parent_id = $2 AND l.ended_at IS NULL)
          FOR UPDATE OF c`,
        [teenId, parentId],
      );
      const row = r.rows[0];
      if (!row) throw noSuchLink();
      const before = controlsOf(row);
      const next: ParentalControls = { ...before, ...patch };
      // A child's profile has none of the parts the switches open, so only its two times are a parent's to set.
      if (PARENTAL_SWITCHES.some((sw) => next[sw] !== before[sw]) && (await isChildProfile(client, teenId))) throw childSwitchesFixed();
      if (sameControls(before, next)) return { controls: before, pushes: [] };
      const parents = await this.parentsOf(client, teenId);
      const first = parents[0]!;
      if (first.userId !== parentId && loosens(before, next)) throw firstParentOnly(refOf(first));
      await client.query(
        `UPDATE parental_controls SET daily_limit_minutes = $2, bedtime_from = $3, bedtime_to = $4,
                chat = $5, letters = $6, posts = $7, games = $8, friends = $9, purchases = $10, updated_at = $11
          WHERE teen_id = $1`,
        [teenId, next.dailyLimitMinutes, next.bedtime?.from ?? null, next.bedtime?.to ?? null, ...PARENTAL_SWITCHES.map((sw) => next[sw]), now],
      );
      const teen = (await this.account(client, teenId))!;
      const changer = (await this.account(client, parentId))!;
      const recipients: Array<{ userId: string; to: 'teen' | 'parent' }> = [
        { userId: teenId, to: 'teen' },
        ...parents.filter((p) => p.userId !== parentId).map((p) => ({ userId: p.userId, to: 'parent' as const })),
      ];
      const pushes: Array<{ userId: string; notification: Notification }> = [];
      for (const { userId, to } of recipients) {
        const notification = changedNotice(teen, changer, to);
        if (!(await this.foldChange(client, userId, teenId, notification, now))) pushes.push({ userId, notification });
      }
      await recordNotifications(client, pushes);
      return { controls: next, pushes };
    });
    for (const { userId, notification } of done.pushes) await this.tell(userId, notification);
    return { controls: done.controls };
  }

  /**
   * Folds a change into the recipient's notice of an earlier one from the last CHANGE_NOTICE_EVERY_MIN minutes, which
   * then names the latest changer and reads as unread again: true when there was one. Otherwise a new notice is due and
   * pushed, so each person is pushed at most once a window and no change goes untold.
   */
  private async foldChange(client: Executor, userId: string, teenId: string, notice: Notification, now: Date): Promise<boolean> {
    const folded = await client.query(
      `UPDATE notifications n SET title = $4, body = $5, data = $6::jsonb, read_at = NULL
         FROM (SELECT id, created_at FROM notifications
                WHERE user_id = $1 AND created_at > $3::timestamptz - make_interval(mins => $7)
                  AND data->>'kind' = 'parental_changed' AND data->>'teenId' = $2
                ORDER BY created_at DESC LIMIT 1) latest
        WHERE n.id = latest.id AND n.created_at = latest.created_at`,
      [userId, teenId, now, notice.title, notice.body, JSON.stringify(notice.data ?? {}), CHANGE_NOTICE_EVERY_MIN],
    );
    return (folded.rowCount ?? 0) > 0;
  }

  /** A parent stops supervising a teen, which is also how a parent lets a teen who asked to leave go at once; the teen is told. */
  async stopSupervising(parentId: string, teenId: string, now: Date = new Date()): Promise<{ ended: true }> {
    const parent = await inTransaction(this.pool, async (client) => {
      await lockPeopleFor(client, 'parental', parentId, teenId);
      // a request to leave has nothing left to end
      const ended = await client.query(
        `UPDATE parental_links SET ended_at = $3, ended_by = 'parent', leave_requested_at = NULL WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL`,
        [parentId, teenId, now],
      );
      if (!ended.rowCount) throw noSuchLink();
      const parent = await this.account(client, parentId);
      if (!parent) throw noSuchLink();
      await recordNotifications(client, [{ userId: teenId, notification: stoppedNotice(parent) }]);
      return parent;
    });
    await this.tell(teenId, stoppedNotice(parent));
    return { ended: true };
  }

  /**
   * A teen asks to stop a parent's supervision. A teen may always leave, since a parent could be someone they should
   * not be linked to, but nothing changes for PARENTAL_LEAVE_DAYS, so leaving is no way round tonight's bedtime; the
   * link then ends the next time either side is read (supervision.ts `endDueLinks`). The parent is told at once, in the
   * app and by email, and can let them go sooner. Asking again keeps the first time and tells nobody twice.
   */
  async requestLeave(teenId: string, parentId: string, now: Date = new Date()): Promise<{ endsAt: string }> {
    const done = await inTransaction(this.pool, async (client) => {
      await lockPeopleFor(client, 'parental', parentId, teenId);
      await endDueLinks(client, 'teen_id', teenId, now);
      const link = await this.liveLink(client, parentId, teenId);
      if (link.leave_requested_at) return { endsAt: leaveEndsAt(link.leave_requested_at), told: null };
      await client.query(`UPDATE parental_links SET leave_requested_at = $3 WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL`, [
        parentId,
        teenId,
        now,
      ]);
      const endsAt = leaveEndsAt(now);
      const teen = (await this.account(client, teenId))!;
      const parent = (await this.account(client, parentId))!;
      const notification = leaveAskedNotice(teen, endsAt);
      await recordNotifications(client, [{ userId: parentId, notification }]);
      return { endsAt, told: { teen, parent, notification } };
    });
    if (done.told) {
      const { teen, parent, notification } = done.told;
      await this.tell(parentId, notification);
      const endsOn = leaveEndsOn(done.endsAt, emailLocaleFor(parent.locale), parent.timezone);
      await this.email(parent, 'parental-leave-requested', { teen: `@${teen.username}`, endsOn }, now);
    }
    return { endsAt: done.endsAt.toISOString() };
  }

  /** A teen takes back their request to leave, and the parent is told; with no request to take back, nobody is. */
  async cancelLeave(teenId: string, parentId: string, now: Date = new Date()): Promise<{ kept: true }> {
    const told = await inTransaction(this.pool, async (client) => {
      await lockPeopleFor(client, 'parental', parentId, teenId);
      // one whose days have run has already ended, and is not kept
      await endDueLinks(client, 'teen_id', teenId, now);
      const link = await this.liveLink(client, parentId, teenId);
      if (!link.leave_requested_at) return null;
      await client.query(`UPDATE parental_links SET leave_requested_at = NULL WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL`, [parentId, teenId]);
      const notification = leaveKeptNotice((await this.account(client, teenId))!);
      await recordNotifications(client, [{ userId: parentId, notification }]);
      return notification;
    });
    if (told) await this.tell(parentId, told);
    return { kept: true };
  }

  /** The live link between two people, locked for the caller's transaction; 404 when there is none. */
  private async liveLink(client: Executor, parentId: string, teenId: string): Promise<{ leave_requested_at: Date | null }> {
    const r = await client.query<{ leave_requested_at: Date | null }>(
      `SELECT leave_requested_at FROM parental_links WHERE parent_id = $1 AND teen_id = $2 AND ended_at IS NULL FOR UPDATE`,
      [parentId, teenId],
    );
    const link = r.rows[0];
    if (!link) throw noSuchLink();
    return link;
  }

  /**
   * The first parent corrects their teen's birth month, once: the teen answered it alone, and a fake older year keeps
   * fewer protections and ends supervision early. The month must be possible and keep the teen 13 to 17, since a
   * parent must not close an account by typing a date (support can), and one who says the teen is an adult can stop
   * supervising instead. A younger age turns analytics off as a first answer would (users/birth-month.ts); the teen is
   * a minor before and after, so the minor's defaults are in place already. The teen and every other parent are told.
   */
  async correctBirthMonth(
    parentId: string,
    teenId: string,
    birth: BirthMonth,
    now: Date = new Date(),
  ): Promise<{ birthMonth: BirthMonth; birthCorrectable: boolean }> {
    if (!isPlausibleBirthMonth(birth, now)) throw invalidBirthMonth();
    const done = await inTransaction(this.pool, async (client) => {
      await lockPeopleFor(client, 'parental', parentId, teenId);
      await endDueLinks(client, 'teen_id', teenId, now);
      const r = await client.query<{ birth_year: number; birth_month: number; birth_corrected_at: Date | null }>(
        `SELECT u.birth_year, u.birth_month, c.birth_corrected_at
           FROM parental_controls c JOIN users u ON u.id = c.teen_id
          WHERE c.teen_id = $1 AND ${minorSql('u')}
            AND EXISTS (SELECT 1 FROM parental_links l WHERE l.teen_id = c.teen_id AND l.parent_id = $2 AND l.ended_at IS NULL)
          FOR UPDATE OF c, u`,
        [teenId, parentId],
      );
      const row = r.rows[0];
      if (!row) throw noSuchLink();
      const parents = await this.parentsOf(client, teenId);
      const first = parents[0]!;
      if (first.userId !== parentId) throw firstParentOnly(refOf(first));
      if (row.birth_corrected_at) throw birthAlreadyCorrected();
      if (isBelowMinimumAge(birth, now)) throw birthOutOfRange('under13');
      if (!isMinor(birth, now)) throw birthOutOfRange('adult');
      // the month already on record corrects nothing, and leaves the one correction unused
      if (row.birth_year === birth.year && row.birth_month === birth.month) return { pushes: [], correctable: true };

      await client.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [teenId, birth.year, birth.month]);
      // Analytics consent below 16 needs a parent's, which POST /me/consent asks for; until then it is off.
      if (isBelowConsentAge(birth, now)) await client.query(`UPDATE users SET analytics_consent = false WHERE id = $1`, [teenId]);
      await client.query(`UPDATE parental_controls SET birth_corrected_at = $2, birth_corrected_by = $3 WHERE teen_id = $1`, [teenId, now, parentId]);
      const teen = (await this.account(client, teenId))!;
      const parent = (await this.account(client, parentId))!;
      const pushes: Array<{ userId: string; notification: Notification }> = [
        { userId: teenId, notification: birthNotice(teen, parent, birth, 'teen') },
        ...parents.slice(1).map((p) => ({ userId: p.userId, notification: birthNotice(teen, parent, birth, 'parent') })),
      ];
      await recordNotifications(client, pushes);
      return { pushes, correctable: false };
    });
    for (const { userId, notification } of done.pushes) await this.tell(userId, notification);
    return { birthMonth: { year: birth.year, month: birth.month }, birthCorrectable: done.correctable };
  }

  /** The usage beat (supervision.ts `recordBeat`). */
  beat(userId: string, timeZone: string, now: Date = new Date()): Promise<SupervisionState | null> {
    return recordBeat(this.pool, userId, timeZone, now);
  }

  /** Pushes a notice already in the inbox; a push that cannot go is no reason to fail what happened. */
  private async tell(userId: string, notice: Notification): Promise<void> {
    await this.deps.push?.(userId, notice).catch((err: unknown) => this.deps.log?.warn({ err }, 'a parental controls push could not be queued'));
  }

  /** A parent's email about their teen, to a confirmed address only; best-effort. */
  private async email(to: AccountRow, template: ParentalTemplate, vars: Record<string, string>, now: Date): Promise<void> {
    const email = parentalEmail(to, template, vars, now);
    if (!this.deps.jobs || !email) return;
    await this.deps.jobs
      .enqueue(sendEmailJob, email)
      .catch((err: unknown) => this.deps.log?.warn({ err, template }, 'a parental controls email could not be queued'));
  }
}

/** A person without when they connected. */
function refOf(p: PersonRef): PersonRef {
  return { userId: p.userId, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl };
}

/** When a link's leave ends it, as the apps are told, or null when the teen has not asked. */
function leaveEndOf(requestedAt: Date | null): string | null {
  return requestedAt ? leaveEndsAt(requestedAt).toISOString() : null;
}

/** Whether two sets of controls say the same. */
function sameControls(a: ParentalControls, b: ParentalControls): boolean {
  return (
    a.dailyLimitMinutes === b.dailyLimitMinutes &&
    a.bedtime?.from === b.bedtime?.from &&
    a.bedtime?.to === b.bedtime?.to &&
    PARENTAL_SWITCHES.every((s) => a[s] === b[s])
  );
}

/**
 * A teen's learning by day, `count` days from `first`, in `zone`: minutes the app was open (the beats), lessons worked
 * through as the streak counts them (`countsAsLearning`), and XP earned, as the daily view sums them. Nothing from before
 * `since`, when the parent asking connected, is counted: what the teen did before then is not theirs to see. One
 * statement over the teen's own rows, bounded by their local midnights.
 */
export async function learningDays(db: Executor, teenId: string, zone: string, first: string, count: number, since: Date): Promise<LearningDay[]> {
  const answered = answeredTodaySql('session_answers', { session: 'ls.id', zone: '$2', day: '(ls.completed_at AT TIME ZONE $2)' });
  const start = 'GREATEST($3::date::timestamp AT TIME ZONE $2, $5::timestamptz)';
  const until = '(($3::date + $4::int)::timestamp AT TIME ZONE $2)';
  const r = await db.query<LearningDay>(
    `WITH lessons AS (
       SELECT (ls.completed_at AT TIME ZONE $2)::date AS day, count(*)::int AS n
         FROM lesson_sessions ls
        WHERE ls.user_id = $1 AND ls.completed_at >= ${start} AND ls.completed_at < ${until}
          AND ${countsAsLearningSql(`(${answered})`, 'ls.total_count')}
        GROUP BY 1
     ), xp AS (
       SELECT (x.created_at AT TIME ZONE $2)::date AS day, sum(x.amount)::int AS n
         FROM xp_ledger x
        WHERE x.user_id = $1 AND x.created_at >= ${start} AND x.created_at < ${until}
        GROUP BY 1
     )
     SELECT g.day::text AS day, COALESCE(pu.minutes, 0) AS minutes, COALESCE(l.n, 0) AS lessons, GREATEST(COALESCE(x.n, 0), 0) AS xp
       FROM (SELECT ($3::date + i) AS day FROM generate_series(0, $4::int - 1) i) g
       LEFT JOIN parental_usage pu ON pu.teen_id = $1 AND pu.day = g.day AND pu.day >= ($5::timestamptz AT TIME ZONE $2)::date
       LEFT JOIN lessons l ON l.day = g.day
       LEFT JOIN xp x ON x.day = g.day
      ORDER BY g.day`,
    [teenId, zone, first, count, since],
  );
  return r.rows;
}
