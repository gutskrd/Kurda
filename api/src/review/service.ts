import type pg from 'pg';
import { INITIAL_SM2, dueAfter, review, type Quality, type Sm2State } from './sm2.js';

/** Default cap on the review queue — no overwhelming wall of cards. */
export const REVIEW_QUEUE_LIMIT = 20;

/** Executor: a pool or a client, so a review can join a transaction. */
type Executor = Pick<pg.Pool, 'query'>;

export interface ReviewItem {
  itemId: string;
  repetitions: number;
  intervalDays: number;
  easiness: number;
  dueAt: string;
}

export interface ReviewQueue {
  items: ReviewItem[];
  /** total items due now (may exceed items.length when capped) */
  dueCount: number;
}

interface ItemRow {
  item_id: string;
  repetitions: number;
  interval_days: number;
  easiness: number;
  due_at: Date;
}

function toItem(row: ItemRow): ReviewItem {
  return {
    itemId: row.item_id,
    repetitions: row.repetitions,
    intervalDays: row.interval_days,
    easiness: row.easiness,
    dueAt: new Date(row.due_at).toISOString(),
  };
}

/**
 * Per-user word-strength tracking (KUR-033). Each review outcome advances
 * the item's SM-2 state and reschedules it; the queue returns items due now,
 * most-overdue first, capped so a long absence never floods the learner.
 */
export class ReviewService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Record a review outcome for an item and reschedule it. Upserts the
   * item's SM-2 state; runs inside the caller's transaction when an
   * executor is passed.
   */
  async record(
    userId: string,
    itemId: string,
    quality: Quality,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<ReviewItem> {
    const existing = await executor.query<ItemRow>(
      `SELECT item_id, repetitions, interval_days, easiness, due_at
       FROM review_items WHERE user_id = $1 AND item_id = $2`,
      [userId, itemId],
    );
    const prev: Sm2State = existing.rows[0]
      ? {
          repetitions: existing.rows[0].repetitions,
          interval: existing.rows[0].interval_days,
          easiness: existing.rows[0].easiness,
        }
      : INITIAL_SM2;

    const next = review(prev, quality);
    const dueAt = dueAfter(now, next.interval);

    const saved = await executor.query<ItemRow>(
      `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         repetitions = EXCLUDED.repetitions,
         interval_days = EXCLUDED.interval_days,
         easiness = EXCLUDED.easiness,
         due_at = EXCLUDED.due_at,
         last_reviewed_at = EXCLUDED.last_reviewed_at
       RETURNING item_id, repetitions, interval_days, easiness, due_at`,
      [userId, itemId, next.repetitions, next.interval, next.easiness, dueAt, now],
    );
    return toItem(saved.rows[0]!);
  }

  /**
   * Items due for review now, most overdue first, capped at `limit`. Also
   * reports the total due so the UI can show "20+".
   */
  async queue(userId: string, now: Date = new Date(), limit = REVIEW_QUEUE_LIMIT): Promise<ReviewQueue> {
    const [due, count] = await Promise.all([
      this.pool.query<ItemRow>(
        `SELECT item_id, repetitions, interval_days, easiness, due_at
         FROM review_items
         WHERE user_id = $1 AND due_at <= $2
         ORDER BY due_at ASC
         LIMIT $3`,
        [userId, now, limit],
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::text n FROM review_items WHERE user_id = $1 AND due_at <= $2`,
        [userId, now],
      ),
    ]);
    return { items: due.rows.map(toItem), dueCount: Number(count.rows[0]!.n) };
  }
}
