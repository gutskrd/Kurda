import type pg from 'pg';
import type { Redis } from 'ioredis';
import type { FriendService } from '../friends/service.js';
import { broadcasts, FEED_CAP, type ActivityEvent, type ActivityType } from './feed.js';

export interface FeedEntry extends ActivityEvent {
  actorUsername: string;
  congrats: number;
  didCongrats: boolean;
}

const feedKey = (userId: string): string => `feed:${userId}`;

/**
 * Friend activity feed (KUR-087). Milestone events fan out on write to each
 * friend's Redis feed (capped at 100), skipping private actors; blocks are
 * already excluded because a block dissolves the friendship. Postgres is the
 * source of truth and the rebuild fallback when Redis is absent. Reactions are
 * "congratulate" toggles.
 */
export class ActivityService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
    private readonly redis?: Redis,
  ) {}

  /** Record a milestone and fan it out to friends' feeds. */
  async publish(actorId: string, type: ActivityType, payload: Record<string, unknown> = {}): Promise<ActivityEvent> {
    const row = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO activity_events (actor_id, type, payload) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [actorId, type, JSON.stringify(payload)],
    );
    const event: ActivityEvent = {
      id: row.rows[0]!.id,
      actorId,
      type,
      payload,
      createdAt: row.rows[0]!.created_at.toISOString(),
    };
    await this.fanOut(actorId, event).catch(() => undefined);
    return event;
  }

  /**
   * Push the event onto each friend's Redis feed (capped). Skipped for private
   * actors. For very large friend lists this belongs on a background job (the
   * queue from KUR-007); it's pipelined here and safe to move off the request
   * path in a follow-up.
   */
  private async fanOut(actorId: string, event: ActivityEvent): Promise<void> {
    const vis = await this.pool.query<{ profile_visibility: string }>(
      `SELECT profile_visibility FROM users WHERE id = $1`,
      [actorId],
    );
    if (!broadcasts(vis.rows[0]?.profile_visibility ?? 'everyone')) return;
    if (!this.redis) return; // DB fallback serves reads without a cache

    const friends = await this.friends.friendIds(actorId);
    if (friends.length === 0) return;
    const serialized = JSON.stringify(event);
    const pipe = this.redis.multi();
    for (const friendId of friends) {
      pipe.lpush(feedKey(friendId), serialized);
      pipe.ltrim(feedKey(friendId), 0, FEED_CAP - 1);
    }
    await pipe.exec();
  }

  /** The caller's feed, newest first, hydrated with actor + live congrats. */
  async feed(userId: string, limit = 30): Promise<FeedEntry[]> {
    const events = this.redis ? await this.feedFromRedis(userId, limit) : await this.feedFromDb(userId, limit);
    return this.hydrate(userId, events);
  }

  private async feedFromRedis(userId: string, limit: number): Promise<ActivityEvent[]> {
    const raw = await this.redis!.lrange(feedKey(userId), 0, limit - 1);
    if (raw.length > 0) return raw.map((s) => JSON.parse(s) as ActivityEvent);
    // cold cache → rebuild from Postgres
    return this.feedFromDb(userId, limit);
  }

  private async feedFromDb(userId: string, limit: number): Promise<ActivityEvent[]> {
    const friends = await this.friends.friendIds(userId);
    if (friends.length === 0) return [];
    const rows = await this.pool.query<{ id: string; actor_id: string; type: ActivityType; payload: Record<string, unknown>; created_at: Date }>(
      `SELECT e.id, e.actor_id, e.type, e.payload, e.created_at
         FROM activity_events e JOIN users u ON u.id = e.actor_id
        WHERE e.actor_id = ANY($1) AND u.profile_visibility <> 'nobody'
        ORDER BY e.created_at DESC LIMIT $2`,
      [friends, limit],
    );
    return rows.rows.map((r) => ({
      id: r.id, actorId: r.actor_id, type: r.type, payload: r.payload, createdAt: r.created_at.toISOString(),
    }));
  }

  private async hydrate(userId: string, events: ActivityEvent[]): Promise<FeedEntry[]> {
    if (events.length === 0) return [];
    const ids = events.map((e) => e.id);
    const actorIds = [...new Set(events.map((e) => e.actorId))];
    const [names, counts, mine] = await Promise.all([
      this.pool.query<{ id: string; username: string }>(`SELECT id, username FROM users WHERE id = ANY($1)`, [actorIds]),
      this.pool.query<{ event_id: string; n: number }>(
        `SELECT event_id, count(*)::int n FROM activity_congrats WHERE event_id = ANY($1) GROUP BY event_id`,
        [ids],
      ),
      this.pool.query<{ event_id: string }>(
        `SELECT event_id FROM activity_congrats WHERE event_id = ANY($1) AND user_id = $2`,
        [ids, userId],
      ),
    ]);
    const nameOf = new Map(names.rows.map((r) => [r.id, r.username]));
    const countOf = new Map(counts.rows.map((r) => [r.event_id, r.n]));
    const didOf = new Set(mine.rows.map((r) => r.event_id));
    return events.map((e) => ({
      ...e,
      actorUsername: nameOf.get(e.actorId) ?? '',
      congrats: countOf.get(e.id) ?? 0,
      didCongrats: didOf.has(e.id),
    }));
  }

  /** Congratulate an event (idempotent); returns the new total. */
  async congratulate(userId: string, eventId: string): Promise<number> {
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
