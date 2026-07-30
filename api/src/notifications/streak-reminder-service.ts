import type pg from 'pg';
import type { Notification } from '../push/service.js';
import { dueReminder, reminderMessage, type ReminderKind } from './streak-reminder.js';

/** Enqueue a push for one user — injected so the service doesn't know the queue. */
export interface ReminderEnqueuer {
  enqueue(userId: string, notification: Notification): Promise<void>;
}

interface CandidateRow {
  user_id: string;
  current_streak: number;
  practiced_today: boolean;
  local_hour: number;
  local_today: string;
  historical_hour: number | null;
}

/**
 * Personalized streak reminders (KUR-096). Runs hourly: for every user with a
 * live streak, it computes their LOCAL hour/date from their timezone and their
 * historical practice hour (the mode of their XP activity), then sends the
 * reminder that's due — at the practice hour (fallback 19:00), plus a last-chance
 * nudge at 22:00 for streaks ≥ 7. The send log makes it idempotent, and the
 * per-timezone local-hour match means there's no single global blast. Users who
 * already practiced today are never notified.
 */
export class StreakReminderService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly enqueuer: ReminderEnqueuer,
  ) {}

  /** Evaluate all live-streak users at `now`; returns how many reminders sent. */
  async runHourly(now: Date = new Date()): Promise<number> {
    const res = await this.pool.query<CandidateRow>(
      `SELECT
         s.user_id,
         s.current_streak,
         (s.last_active_on = ($1::timestamptz AT TIME ZONE u.timezone)::date) AS practiced_today,
         EXTRACT(HOUR FROM ($1::timestamptz AT TIME ZONE u.timezone))::int AS local_hour,
         (($1::timestamptz AT TIME ZONE u.timezone)::date)::text AS local_today,
         (
           SELECT mode() WITHIN GROUP (
             ORDER BY EXTRACT(HOUR FROM x.created_at AT TIME ZONE u.timezone)::int
           )
           FROM xp_ledger x WHERE x.user_id = s.user_id
         ) AS historical_hour
       FROM user_streaks s
       JOIN users u ON u.id = s.user_id
       WHERE s.current_streak >= 1 AND s.last_active_on IS NOT NULL`,
      [now.toISOString()],
    );

    let sent = 0;
    for (const row of res.rows) {
      const kind = dueReminder({
        currentStreak: row.current_streak,
        practicedToday: row.practiced_today,
        localHour: row.local_hour,
        historicalHour: row.historical_hour,
      });
      if (!kind) continue;
      if (await this.markSent(row.user_id, row.local_today, kind)) {
        await this.enqueuer.enqueue(row.user_id, {
          category: 'streak',
          ...reminderMessage(kind, row.current_streak),
        });
        sent += 1;
      }
    }
    return sent;
  }

  /** Record the send; returns false if this reminder already went out today. */
  private async markSent(userId: string, localDate: string, kind: ReminderKind): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO streak_reminders_sent (user_id, sent_on, kind)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, localDate, kind],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
