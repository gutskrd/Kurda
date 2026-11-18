import type pg from 'pg';
import type { Redis } from 'ioredis';
import type { FriendService } from '../friends/service.js';
import { notBlockedSql } from '../friends/blocked.js';

export type ActivityType = 'streak_milestone' | 'league_promotion' | 'achievement';

export interface ActivityEvent {
  id: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Friend milestones (league promotions, achievements) and the congratulations left on them, kept in Postgres. */
export class ActivityService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
    // Unused; the standalone game services still pass their Redis client.
    _redis?: Redis,
  ) {}

  /** Records a milestone. */
  async publish(actorId: string, type: ActivityType, payload: Record<string, unknown> = {}): Promise<ActivityEvent> {
    const row = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO activity_events (actor_id, type, payload) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [actorId, type, JSON.stringify(payload)],
    );
    return {
      id: row.rows[0]!.id,
      actorId,
      type,
      payload,
      createdAt: row.rows[0]!.created_at.toISOString(),
    };
  }

  /**
   * Congratulates an event (idempotent) and returns the new total, or null when the caller is not shown the event.
   * Only a friend's event counts, from a profile that is not closed and with no block between the two: an event id
   * is not a secret, and anyone else could otherwise leave their name on it and read the count.
   */
  async congratulate(userId: string, eventId: string): Promise<number | null> {
    const friends = await this.friends.friendIds(userId);
    const shown = await this.pool.query(
      `SELECT 1 FROM activity_events e JOIN users u ON u.id = e.actor_id
        WHERE e.id = $1 AND e.actor_id = ANY($3::uuid[]) AND u.profile_visibility <> 'nobody'
          AND ${notBlockedSql('e.actor_id', '$2::uuid')}`,
      [eventId, userId, friends],
    );
    if ((shown.rowCount ?? 0) === 0) return null;
    await this.pool.query(
      `INSERT INTO activity_congrats (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [eventId, userId],
    );
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM activity_congrats WHERE event_id = $1`,
      [eventId],
    );
    return r.rows[0]!.n;
  }
}
