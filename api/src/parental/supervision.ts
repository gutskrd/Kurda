/**
 * A supervised teen's controls as the server reads them for every guarded write, GET /me and the usage beat: one
 * indexed lookup, which finds nothing for anyone who is not a supervised teen. A link whose teen has turned 18 is
 * ended the first time it is read this way, so supervision stops on the birthday without a sweep.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { localDay, parentalPause, type ParentalControls, type ParentalSwitch, type SupervisionState } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { Executor } from '../moderation/tx.js';
import type { Notification } from '../push/service.js';
import { currentRequest } from '../security/context.js';
import { storableTimeZone } from '../streaks/time-zones.js';
import { minorSql } from '../users/age.js';
import { barredNotice, grownUpParentNotice, grownUpTeenNotice, tellParental, zoneNotice, type NoticePerson } from './notices.js';

/** The switches a write is refused for; purchases are told to the shop list instead (`parentalAllows`). */
export type GuardedSwitch = Exclude<ParentalSwitch, 'purchases'>;

/** A beat counts one minute at most this often, whichever device or tab sends it. */
export const BEAT_SPACING_SEC = 50;

/** How long the time zone a teen's day is counted in stays put once changed, as an account's own zone does. */
export const ZONE_HOLD_DAYS = 7;

/** The columns of `parental_controls c` every reader takes. */
export const CONTROL_COLUMNS = 'c.daily_limit_minutes, c.bedtime_from, c.bedtime_to, c.chat, c.letters, c.posts, c.games, c.friends, c.purchases, c.time_zone';

export interface ControlsRow {
  daily_limit_minutes: number | null;
  bedtime_from: string | null;
  bedtime_to: string | null;
  chat: boolean;
  letters: boolean;
  posts: boolean;
  games: boolean;
  friends: boolean;
  purchases: boolean;
  time_zone: string;
}

export function controlsOf(row: ControlsRow): ParentalControls {
  return {
    dailyLimitMinutes: row.daily_limit_minutes,
    bedtime: row.bedtime_from && row.bedtime_to ? { from: row.bedtime_from, to: row.bedtime_to } : null,
    chat: row.chat,
    letters: row.letters,
    posts: row.posts,
    games: row.games,
    friends: row.friends,
    purchases: row.purchases,
  };
}

/** The state a teen and their apps are told: the controls, today's minutes, and the pause they make. */
export function stateOf(controls: ParentalControls, minutesToday: number, timeZone: string, now: Date): SupervisionState {
  const { paused, resumesAt } = parentalPause(controls, minutesToday, now, timeZone);
  return { controls, minutesToday, timeZone, paused, resumesAt };
}

/**
 * Ends the live links of `who` whose teen is no longer a minor, as having turned 18, and tells both sides: each parent,
 * and the teen once. `side` is a literal from this module's callers, never input.
 */
export async function endGrownUpLinks(db: Executor, side: 'teen_id' | 'parent_id', who: string, now: Date = new Date()): Promise<void> {
  const ended = await db.query<NoticePerson & { parent_id: string }>(
    `WITH ended AS (
       UPDATE parental_links l SET ended_at = $2, ended_by = 'age'
         FROM users t
        WHERE l.${side} = $1 AND l.ended_at IS NULL AND t.id = l.teen_id AND NOT ${minorSql('t')}
        RETURNING l.parent_id, l.teen_id
     )
     SELECT e.parent_id, t.id, t.username, t.display_name FROM ended e JOIN users t ON t.id = e.teen_id`,
    [who, now],
  );
  if (!ended.rowCount) return;
  const teens = new Map(ended.rows.map((r) => [r.id, r]));
  await tellParental(db, [
    ...ended.rows.map((r) => ({ userId: r.parent_id, notification: grownUpParentNotice(r) })),
    ...[...teens.values()].map((teen) => ({ userId: teen.id, notification: grownUpTeenNotice(teen) })),
  ]);
}

/**
 * Ends every live link where `parentId` is the parent, their account barred from supervising (a ban or suspension for
 * a child's safety), and tells each teen without saying why. In the caller's transaction, pushed once it commits.
 */
export async function endLinksOfBarredParent(db: Executor, parentId: string, now: Date = new Date()): Promise<number> {
  const ended = await db.query<{ teen_id: string } & NoticePerson>(
    `WITH ended AS (
       UPDATE parental_links SET ended_at = $2, ended_by = 'account'
        WHERE parent_id = $1 AND ended_at IS NULL
        RETURNING teen_id
     )
     SELECT e.teen_id, p.id, p.username, p.display_name FROM ended e JOIN users p ON p.id = $1`,
    [parentId, now],
  );
  await tellParental(db, ended.rows.map((r) => ({ userId: r.teen_id, notification: barredNotice(r) })));
  return ended.rowCount ?? 0;
}

interface SupervisionRow extends ControlsRow {
  minor: boolean;
  /** minutes by local day, for the days around today in any zone */
  minutes: Record<string, number>;
}

/** A supervised teen's state now, or null for everyone else. */
export async function supervisionOf(db: Executor, userId: string, now: Date = new Date()): Promise<SupervisionState | null> {
  // A local day is at most a day either side of UTC's, so the days from yesterday on cover today wherever they are.
  const r = await db.query<SupervisionRow>(
    `SELECT ${CONTROL_COLUMNS}, ${minorSql('u')} AS minor,
            COALESCE((SELECT json_object_agg(pu.day::text, pu.minutes) FROM parental_usage pu
                       WHERE pu.teen_id = c.teen_id AND pu.day >= ($2::timestamptz AT TIME ZONE 'UTC')::date - 1), '{}'::json) AS minutes
       FROM parental_controls c
       JOIN users u ON u.id = c.teen_id
      WHERE c.teen_id = $1
        AND EXISTS (SELECT 1 FROM parental_links l WHERE l.teen_id = c.teen_id AND l.ended_at IS NULL)`,
    [userId, now],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (!row.minor) {
    await endGrownUpLinks(db, 'teen_id', userId, now);
    return null;
  }
  return stateOf(controlsOf(row), row.minutes[localDay(now, row.time_zone)] ?? 0, row.time_zone, now);
}

/** Reads made by the guards, once per person per request, so a write checking two switches still makes one lookup. */
const guardReads = new WeakMap<object, Map<string, Promise<SupervisionState | null>>>();

function guardRead(db: Executor, userId: string): Promise<SupervisionState | null> {
  const req = currentRequest();
  if (!req) return supervisionOf(db, userId);
  let byUser = guardReads.get(req);
  if (!byUser) guardReads.set(req, (byUser = new Map()));
  let read = byUser.get(userId);
  if (!read) byUser.set(userId, (read = supervisionOf(db, userId)));
  return read;
}

/** 403 PARENTAL_BLOCKED: a parent switched this part of Hevalo off. */
export function parentalBlocked(control: GuardedSwitch): AppError {
  return new AppError('PARENTAL_BLOCKED', 403, 'your parent turned this off', { control });
}

/** 403 PARENTAL_PAUSED: bedtime, or the day's minutes are used up, until `resumesAt`. */
export function parentalPaused(state: SupervisionState): AppError {
  return new AppError('PARENTAL_PAUSED', 403, 'Hevalo is resting right now', { paused: state.paused, resumesAt: state.resumesAt });
}

/**
 * The one check every switch-guarded write makes: throws PARENTAL_BLOCKED when a parent switched `control` off, or
 * PARENTAL_PAUSED during bedtime or once the day's limit is used. A switch that is off is said first, since the pause
 * passes and the switch does not.
 */
export async function assertParentalAllowed(db: Executor, userId: string, control: GuardedSwitch): Promise<void> {
  const state = await guardRead(db, userId);
  if (!state) return;
  if (!state.controls[control]) throw parentalBlocked(control);
  if (state.paused) throw parentalPaused(state);
}

/**
 * Whether a parent left `control` on for this person: true for anyone not supervised. For what others do to a teen
 * (adding them to a group, accepting their old request), what reaches them live, and the shop list.
 */
export async function parentalAllows(db: Executor, userId: string, control: ParentalSwitch): Promise<boolean> {
  const state = await guardRead(db, userId);
  return !state || state.controls[control];
}

/**
 * The check a read makes: PARENTAL_BLOCKED when a parent switched `control` off, so what that part holds is not shown
 * while it is off. A pause does not hide anything; the apps cover the screen instead. What arrives meanwhile is kept,
 * and shows again once the switch is back on.
 */
export async function assertSwitchOn(db: Executor, userId: string, control: GuardedSwitch): Promise<void> {
  if (!(await parentalAllows(db, userId, control))) throw parentalBlocked(control);
}

/**
 * SQL: the user behind `userExpr` is a supervised teen whose parent switched `control` off, for queries that decide
 * many people at once (who in a group room a message goes to live). Both are literals from this codebase.
 */
export function switchedOffSql(userExpr: string, control: GuardedSwitch): string {
  return `EXISTS (
    SELECT 1 FROM parental_controls so JOIN users su ON su.id = so.teen_id
     WHERE so.teen_id = ${userExpr} AND NOT so.${control} AND ${minorSql('su')}
       AND EXISTS (SELECT 1 FROM parental_links sl WHERE sl.teen_id = so.teen_id AND sl.ended_at IS NULL))`;
}

/** The switch that keeps a notification's push from a teen, by what it is about; none for anything else, parental news included. */
export function noticeSwitch(notification: Pick<Notification, 'category' | 'data'>): GuardedSwitch | null {
  const kind = notification.data?.kind ?? '';
  if (kind === 'letter' || notification.category === 'letters') return 'letters';
  if (kind === 'gift' || kind === 'dm' || kind.startsWith('group_')) return 'chat';
  if (kind === 'play_invite' || notification.category === 'games') return 'games';
  if (kind === 'friend_request') return 'friends';
  return null;
}

/**
 * Whether a parent's switch keeps this push from `userId`; the inbox keeps it either way. Asked at delivery, so it
 * costs a lookup only for the kinds a switch covers.
 */
export async function pushMutedByParent(db: Executor, userId: string, notification: Pick<Notification, 'category' | 'data'>): Promise<boolean> {
  const control = noticeSwitch(notification);
  return control !== null && !(await parentalAllows(db, userId, control));
}

/** Marks a preHandler as the parental guard, which the route table's test reads to know a write is covered. */
export const PARENTAL_GUARD = Symbol.for('kurda.parentalGuard');

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** preHandler: `assertParentalAllowed` for the signed-in account. Put it after the guard that signs the user in. */
export function requireParental(control: GuardedSwitch): Guard {
  const guard: Guard = async (req) => {
    // a guest is never supervised, and the guard before this one has answered a request with no user
    if (!req.user || req.user.guest) return;
    await assertParentalAllowed(req.server.db, req.user.id, control);
  };
  Object.defineProperty(guard, PARENTAL_GUARD, { value: control });
  return guard;
}

/**
 * preHandler for a read: `assertSwitchOn` for the signed-in account, so what a switched-off part holds is not shown.
 * Unmarked, since the route table's test is about writes.
 */
export function requireSwitchOn(control: GuardedSwitch): Guard {
  return async (req) => {
    if (!req.user || req.user.guest) return;
    await assertSwitchOn(req.server.db, req.user.id, control);
  };
}

/** The switch a route's preHandlers check, or null when none does. */
export function routeParentalSwitch(preHandler: unknown): GuardedSwitch | null {
  const chain = Array.isArray(preHandler) ? preHandler : [preHandler];
  for (const h of chain) {
    const control = typeof h === 'function' ? (h as unknown as Record<symbol, unknown>)[PARENTAL_GUARD] : undefined;
    if (typeof control === 'string') return control as GuardedSwitch;
  }
  return null;
}

/**
 * The usage beat: one minute counted for a supervised teen, at most once per BEAT_SPACING_SEC, under their local day,
 * and none while the app is paused, since a pause screen is not time spent in Hevalo. The zone the beat carries is
 * taken when the database knows it and the stored one, set when the first parent connected, has been kept
 * ZONE_HOLD_DAYS, so moving the phone's clock to another zone cannot lift a bedtime or start a new day; every parent is
 * told when it moves. Null for anyone who is not a supervised teen.
 */
export async function recordBeat(db: Executor, teenId: string, timeZone: string, now: Date = new Date()): Promise<SupervisionState | null> {
  let state = await supervisionOf(db, teenId, now);
  if (!state) return null;
  const wanted = await storableTimeZone(db, timeZone);
  if (wanted && wanted !== state.timeZone) {
    const moved = await db.query<NoticePerson>(
      `WITH moved AS (
         UPDATE parental_controls SET time_zone = $2, time_zone_changed_at = $3
          WHERE teen_id = $1 AND time_zone <> $2
            AND (time_zone_changed_at IS NULL OR time_zone_changed_at <= $3::timestamptz - make_interval(days => $4))
          RETURNING teen_id
       )
       SELECT u.id, u.username, u.display_name FROM moved JOIN users u ON u.id = moved.teen_id`,
      [teenId, wanted, now, ZONE_HOLD_DAYS],
    );
    const teen = moved.rows[0];
    if (teen) {
      const parents = await db.query<{ parent_id: string }>(`SELECT parent_id FROM parental_links WHERE teen_id = $1 AND ended_at IS NULL`, [teenId]);
      await tellParental(db, parents.rows.map((p) => ({ userId: p.parent_id, notification: zoneNotice(teen, wanted) })));
      // the new zone's day has minutes of its own
      state = (await supervisionOf(db, teenId, now)) ?? state;
    }
  }
  if (state.paused) return state;
  // Spaced by the controls row, which every beat of the teen's locks in turn, so two devices cannot both count.
  const counted = await db.query<{ minutes: number }>(
    `WITH beat AS (
       UPDATE parental_controls SET last_beat_at = $3
        WHERE teen_id = $1 AND (last_beat_at IS NULL OR last_beat_at <= $3::timestamptz - make_interval(secs => $4))
        RETURNING teen_id
     )
     INSERT INTO parental_usage (teen_id, day, minutes)
     SELECT teen_id, $2::date, 1 FROM beat
     ON CONFLICT (teen_id, day) DO UPDATE SET minutes = LEAST(parental_usage.minutes + 1, 1440)
     RETURNING minutes`,
    [teenId, localDay(now, state.timeZone), now, BEAT_SPACING_SEC],
  );
  const minutes = counted.rows[0]?.minutes;
  return minutes === undefined ? state : stateOf(state.controls, minutes, state.timeZone, now);
}
