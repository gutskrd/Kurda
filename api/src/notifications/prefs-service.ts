import type pg from 'pg';
import {
  allows,
  defaultPrefs,
  minuteOfDayInTz,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPrefs,
} from './prefs.js';

interface PrefsRow {
  streak: boolean;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  quiet_start_min: number | null;
  quiet_end_min: number | null;
}

function toPrefs(row: PrefsRow): NotificationPrefs {
  return {
    streak: row.streak,
    friends: row.friends,
    games: row.games,
    events: row.events,
    marketing: row.marketing,
    quietStartMin: row.quiet_start_min,
    quietEndMin: row.quiet_end_min,
  };
}

export interface PrefsPatch {
  streak?: boolean;
  friends?: boolean;
  games?: boolean;
  events?: boolean;
  marketing?: boolean;
  quietStartMin?: number | null;
  quietEndMin?: number | null;
}

/**
 * Notification preferences (KUR-095). Missing rows read as defaults (marketing
 * off), so a user who never touched settings still gets a sane policy. `allows`
 * is the delivery-time gate: it loads the current prefs + the user's timezone
 * and evaluates category + quiet hours against the moment of delivery.
 */
export class NotificationPrefsService {
  constructor(private readonly pool: pg.Pool) {}

  async get(userId: string): Promise<NotificationPrefs> {
    const res = await this.pool.query<PrefsRow>(
      `SELECT streak, friends, games, events, marketing, quiet_start_min, quiet_end_min
       FROM notification_prefs WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] ? toPrefs(res.rows[0]) : defaultPrefs();
  }

  /** Upsert the caller's preferences; unspecified fields keep their value. */
  async update(userId: string, patch: PrefsPatch): Promise<NotificationPrefs> {
    const current = await this.get(userId);
    const next: NotificationPrefs = {
      streak: patch.streak ?? current.streak,
      friends: patch.friends ?? current.friends,
      games: patch.games ?? current.games,
      events: patch.events ?? current.events,
      marketing: patch.marketing ?? current.marketing,
      quietStartMin: patch.quietStartMin === undefined ? current.quietStartMin : patch.quietStartMin,
      quietEndMin: patch.quietEndMin === undefined ? current.quietEndMin : patch.quietEndMin,
    };
    await this.pool.query(
      `INSERT INTO notification_prefs
         (user_id, streak, friends, games, events, marketing, quiet_start_min, quiet_end_min, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id) DO UPDATE SET
         streak = EXCLUDED.streak, friends = EXCLUDED.friends, games = EXCLUDED.games,
         events = EXCLUDED.events, marketing = EXCLUDED.marketing,
         quiet_start_min = EXCLUDED.quiet_start_min, quiet_end_min = EXCLUDED.quiet_end_min,
         updated_at = now()`,
      [
        userId,
        next.streak,
        next.friends,
        next.games,
        next.events,
        next.marketing,
        next.quietStartMin,
        next.quietEndMin,
      ],
    );
    return next;
  }

  /** Delivery-time gate: category enabled and not in the user's quiet hours. */
  async allows(userId: string, category: NotificationCategory, at: Date = new Date()): Promise<boolean> {
    const [prefs, tz] = await Promise.all([this.get(userId), this.timezone(userId)]);
    return allows(prefs, category, minuteOfDayInTz(at, tz));
  }

  private async timezone(userId: string): Promise<string> {
    const res = await this.pool.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.timezone ?? 'UTC';
  }
}

export { NOTIFICATION_CATEGORIES };
