import type { Executor } from '../moderation/tx.js';
import { CONTROL_COLUMNS, controlsOf, type ControlsRow } from './supervision.js';

/** How long a teen's minutes by day are kept: the week a parent sees, with a month to spare. */
export const USAGE_KEPT_DAYS = 35;

/**
 * Parental controls in a data export (Art. 15): the person's links in both directions with the other side by name
 * only, when each began and ended and who ended it; their controls as a teen; and their minutes by day. Codes are kept
 * only as keyed hashes, which would mean nothing to them.
 */
export async function exportParental(db: Executor, userId: string): Promise<Record<string, unknown>> {
  const links = await db.query<{ mine_as: 'parent' | 'teen'; username: string; display_name: string | null; since: Date; ended_at: Date | null; ended_by: string | null }>(
    `SELECT CASE WHEN l.parent_id = $1 THEN 'parent' ELSE 'teen' END AS mine_as, o.username, o.display_name,
            l.created_at AS since, l.ended_at, l.ended_by
       FROM parental_links l
       JOIN users o ON o.id = CASE WHEN l.parent_id = $1 THEN l.teen_id ELSE l.parent_id END
      WHERE l.parent_id = $1 OR l.teen_id = $1
      ORDER BY l.created_at`,
    [userId],
  );
  const named = (as: 'parent' | 'teen') =>
    links.rows
      .filter((l) => l.mine_as === as)
      .map((l) => ({ username: l.username, displayName: l.display_name, since: l.since, endedAt: l.ended_at, endedBy: l.ended_by }));
  const controls = await db.query<ControlsRow & { updated_at: Date }>(`SELECT ${CONTROL_COLUMNS}, c.updated_at FROM parental_controls c WHERE c.teen_id = $1`, [userId]);
  const row = controls.rows[0];
  const usage = await db.query(`SELECT day::text AS day, minutes FROM parental_usage WHERE teen_id = $1 ORDER BY day`, [userId]);
  return {
    // the parents connected to them, and the teens they look after
    parents: named('teen'),
    teens: named('parent'),
    controls: row ? { ...controlsOf(row), timeZone: row.time_zone, updatedAt: row.updated_at } : null,
    minutesByDay: usage.rows,
  };
}

/** Erasing an account ends its links by removing them, with its code, its controls and its minutes. */
export async function eraseParental(db: Executor, userId: string): Promise<void> {
  await db.query(`DELETE FROM parental_links WHERE parent_id = $1 OR teen_id = $1`, [userId]);
  await db.query(`DELETE FROM parental_codes WHERE parent_id = $1`, [userId]);
  await db.query(`DELETE FROM parental_usage WHERE teen_id = $1`, [userId]);
  await db.query(`DELETE FROM parental_controls WHERE teen_id = $1`, [userId]);
}

/** The daily retention: minutes past USAGE_KEPT_DAYS, and codes used or expired, which can never work again. */
export async function pruneParental(db: Executor): Promise<void> {
  await db.query(`DELETE FROM parental_usage WHERE day < (now() AT TIME ZONE 'UTC')::date - $1::int`, [USAGE_KEPT_DAYS]);
  await db.query(`DELETE FROM parental_codes WHERE used_at IS NOT NULL OR expires_at <= now()`);
}
