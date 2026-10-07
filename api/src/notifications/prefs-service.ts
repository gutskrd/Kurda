import type pg from 'pg';
import {
  allows,
  defaultPrefs,
  minuteOfDayInTz,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPrefs,
} from './prefs.js';
import { notKnownAdultSql } from '../users/age.js';

interface PrefsRow {
  /** null: never chosen, so the default for their age (`defaultPrefs`) */
  streak: boolean | null;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  quiet_start_min: number | null;
  quiet_end_min: number | null;
}

/** A stored row as the settings it means, for someone of the given age. */
function toPrefs(row: PrefsRow, minor: boolean): NotificationPrefs {
  return {
    streak: row.streak ?? defaultPrefs({ minor }).streak,
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
 *
 * Streak reminders are the one setting whose default depends on age (off for
 * a minor, and for an account whose age is not on record yet), so it is
 * stored only once somebody chooses it: NULL means "the default for my age",
 * read when it is asked. Saving another setting leaves it NULL rather than
 * writing today's default in as a choice, which would keep a minor's
 * reminders off for good, past 18.
 */
export class NotificationPrefsService {
  constructor(private readonly pool: pg.Pool) {}

  /** The stored row, if any, and whether the defaults are a minor's. */
  private async stored(userId: string): Promise<{ row: PrefsRow | null; minor: boolean }> {
    const res = await this.pool.query<PrefsRow & { minor: boolean; has_row: boolean }>(
      `SELECT ${notKnownAdultSql('u')} AS minor, p.user_id IS NOT NULL AS has_row,
              p.streak, p.friends, p.games, p.events, p.marketing, p.quiet_start_min, p.quiet_end_min
         FROM users u LEFT JOIN notification_prefs p ON p.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    const r = res.rows[0];
    // an unknown account gets a minor's defaults: the safe way to be wrong
    if (!r) return { row: null, minor: true };
    return { row: r.has_row ? r : null, minor: r.minor };
  }

  async get(userId: string): Promise<NotificationPrefs> {
    const { row, minor } = await this.stored(userId);
    return row ? toPrefs(row, minor) : defaultPrefs({ minor });
  }

  /**
   * Upsert the caller's preferences; unspecified fields keep their value —
   * the streak setting included, which stays "the default for my age" until
   * it is chosen.
   */
  async update(userId: string, patch: PrefsPatch): Promise<NotificationPrefs> {
    const { row, minor } = await this.stored(userId);
    const base = defaultPrefs({ minor });
    const next: PrefsRow = {
      streak: patch.streak ?? row?.streak ?? null,
      friends: patch.friends ?? row?.friends ?? base.friends,
      games: patch.games ?? row?.games ?? base.games,
      events: patch.events ?? row?.events ?? base.events,
      marketing: patch.marketing ?? row?.marketing ?? base.marketing,
      quiet_start_min: patch.quietStartMin === undefined ? (row?.quiet_start_min ?? null) : patch.quietStartMin,
      quiet_end_min: patch.quietEndMin === undefined ? (row?.quiet_end_min ?? null) : patch.quietEndMin,
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
        next.quiet_start_min,
        next.quiet_end_min,
      ],
    );
    return toPrefs(next, minor);
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
