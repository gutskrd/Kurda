import type pg from 'pg';
import type { Notification } from '../push/service.js';
import { dueReminder, reminderMessage, type ReminderKind } from './streak-reminder.js';
import { notKnownAdultSql } from '../users/age.js';

/** Queues the pushes of one run together — injected so the service doesn't know the queue. */
export interface ReminderEnqueuer {
  enqueueAll(items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void>;
}

interface CandidateRow {
  user_id: string;
  current_streak: number;
  practiced_today: boolean;
  local_hour: number;
  local_today: string;
  historical_hour: number | null;
  /** the language the account chose; the reminder is written in it */
  locale: string | null;
}

/**
 * Personalized streak reminders, run hourly. For every user with a live streak it takes their local hour and date
 * and their usual practice hour (the mode of their XP activity) and sends what is due: a reminder at the practice hour
 * (19:00 by default), and a last-chance nudge at 22:00 for streaks of 7 or more. The send log makes it idempotent.
 * Nobody who practised today, turned reminders off (minors have them off until they choose), or is awaiting deletion
 * is reminded.
 */
export class StreakReminderService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly enqueuer: ReminderEnqueuer,
  ) {}

  /** Evaluates all live-streak users at `now` and returns how many reminders were sent. */
  async runHourly(now: Date = new Date()): Promise<number> {
    const res = await this.pool.query<CandidateRow>(
      `SELECT
         s.user_id,
         s.current_streak,
         u.locale,
         (s.last_active_on = ($1::timestamptz AT TIME ZONE tz.zone)::date) AS practiced_today,
         EXTRACT(HOUR FROM ($1::timestamptz AT TIME ZONE tz.zone))::int AS local_hour,
         (($1::timestamptz AT TIME ZONE tz.zone)::date)::text AS local_today,
         (
           SELECT mode() WITHIN GROUP (
             ORDER BY EXTRACT(HOUR FROM x.created_at AT TIME ZONE tz.zone)::int
           )
           FROM xp_ledger x WHERE x.user_id = s.user_id AND x.created_at > $1::timestamptz - interval '90 days'
         ) AS historical_hour
       FROM user_streaks s
       JOIN users u ON u.id = s.user_id
       -- One statement serves every learner, so one zone Postgres does not
       -- know would fail the whole run and nobody would be reminded: such a
       -- zone reads as UTC here instead (as badges/measures.ts reads it).
       LEFT JOIN pg_timezone_names known ON known.name = u.timezone
       CROSS JOIN LATERAL (SELECT COALESCE(known.name, 'UTC') AS zone) tz
       LEFT JOIN notification_prefs p ON p.user_id = s.user_id
       WHERE s.current_streak >= 1 AND s.last_active_on IS NOT NULL
         -- Not practised today, and the run still alive: missed days are settled only when the learner is next
         -- seen, so a stored streak can have ended already. It lives while the missed days fit the freezes held
         -- (settle, in streaks/streak-logic.ts).
         AND s.last_active_on < ($1::timestamptz AT TIME ZONE tz.zone)::date
         AND ($1::timestamptz AT TIME ZONE tz.zone)::date - s.last_active_on <= 1 + s.freezes
         -- an account on its way to deletion is not coaxed back to a streak it
         -- asked to have erased (signing in again cancels the deletion, and the
         -- reminders come back with it); nor is one already closed
         AND u.deletion_requested_at IS NULL AND u.deleted_at IS NULL
         -- reminders turned off, or never turned on by a minor (off by default
         -- for them, read from age now, and for an account whose age is not on
         -- record yet): nothing to queue
         AND COALESCE(p.streak, NOT ${notKnownAdultSql('u')})`,
      [now.toISOString()],
    );

    const due: Array<{ row: CandidateRow; kind: ReminderKind }> = [];
    for (const row of res.rows) {
      const kind = dueReminder({
        currentStreak: row.current_streak,
        practicedToday: row.practiced_today,
        localHour: row.local_hour,
        historicalHour: row.historical_hour,
      });
      if (kind) due.push({ row, kind });
    }
    const fresh = await this.markSent(due.map(({ row, kind }) => ({ userId: row.user_id, localDate: row.local_today, kind })));

    const sends = due
      .filter(({ row, kind }) => fresh.has(`${row.user_id}|${row.local_today}|${kind}`))
      .map(({ row, kind }) => ({ userId: row.user_id, notification: { category: 'streak' as const, ...reminderMessage(kind, row.current_streak, row.locale) } }));
    await this.enqueuer.enqueueAll(sends);
    return sends.length;
  }

  /** Records the sends in one statement and returns those not already sent today (as `user|day|kind`), the ones to send. */
  private async markSent(sends: Array<{ userId: string; localDate: string; kind: ReminderKind }>): Promise<Set<string>> {
    if (sends.length === 0) return new Set();
    const res = await this.pool.query<{ user_id: string; sent_on: string; kind: string }>(
      `INSERT INTO streak_reminders_sent (user_id, sent_on, kind)
       SELECT * FROM unnest($1::uuid[], $2::date[], $3::text[])
       ON CONFLICT DO NOTHING
       RETURNING user_id, sent_on::text AS sent_on, kind`,
      [sends.map((s) => s.userId), sends.map((s) => s.localDate), sends.map((s) => s.kind)],
    );
    return new Set(res.rows.map((r) => `${r.user_id}|${r.sent_on}|${r.kind}`));
  }
}
