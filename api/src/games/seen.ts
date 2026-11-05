/**
 * What a learner has met in a game (`game_seen`), and the order a round takes
 * items in because of it: never met first, then those met longest ago that
 * were not answered right lately, and last those answered right within the
 * repeat window — which pay nothing again, so a round reaches for them only
 * when nothing else is left.
 *
 * Read once per round, for one learner and one game: the learner's own rows,
 * however large the game's pool is.
 */
import type pg from 'pg';
import { GAME_REPEAT_XP_DAYS } from '@kurda/shared';

export interface SeenItem {
  lastSeenAt: Date;
  /** answered right within the repeat window */
  recent: boolean;
  /** rounds it was answered in, right or not (Hear It, Find It turns to another voice by it) */
  attempts?: number;
}

export async function seenFor(db: Pick<pg.Pool, 'query'>, userId: string, game: string): Promise<Map<string, SeenItem>> {
  const res = await db.query<{ item_key: string; last_seen_at: Date; recent: boolean; attempts: number }>(
    `SELECT item_key, last_seen_at, COALESCE(last_correct_at > now() - make_interval(days => $3), false) AS recent, attempts
       FROM game_seen WHERE user_id = $1 AND game = $2`,
    [userId, game, GAME_REPEAT_XP_DAYS],
  );
  return new Map(res.rows.map((r) => [r.item_key, { lastSeenAt: r.last_seen_at, recent: r.recent, attempts: r.attempts }]));
}

/**
 * Items in the order a round should take them: unseen (in the order given,
 * which the caller has shuffled), then seen and due, oldest first, then
 * answered right lately, oldest first.
 */
export function freshestFirst<T extends { key: string }>(items: readonly T[], seen: ReadonlyMap<string, SeenItem>): T[] {
  const rank = (item: T): [number, number] => {
    const s = seen.get(item.key);
    if (!s) return [0, 0];
    return [s.recent ? 2 : 1, s.lastSeenAt.getTime()];
  };
  return items
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map((x) => x.item);
}
