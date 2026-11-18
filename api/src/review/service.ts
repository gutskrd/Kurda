import type pg from 'pg';
import type { ExerciseType } from '../content/repository.js';
import { INITIAL_SM2, scheduleAnswer, type Quality } from './sm2.js';

/** Default cap on the review queue — no overwhelming wall of cards. */
export const REVIEW_QUEUE_LIMIT = 20;

/**
 * Whether an answer to this exercise type is evidence for the scheduler. Speaking is not: the learner rates their own
 * recording, so a self-rated "good" must not push a word weeks away.
 */
export function feedsReview(type: ExerciseType): boolean {
  return type !== 'speaking';
}

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
  /** Total items due now; may exceed items.length when capped. */
  dueCount: number;
}

interface ItemRow {
  item_id: string;
  repetitions: number;
  interval_days: number;
  easiness: number;
  due_at: Date;
}

/** The item as `record` reads it, with what spacing is judged by. */
interface RecordRow extends ItemRow {
  last_reviewed_at: Date | null;
  timezone: string;
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
 * Per-user word strength. Each review outcome advances the item's SM-2 state and reschedules it; the queue returns
 * items due now, most overdue first, capped so a long absence never floods the learner.
 */
export class ReviewService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Records a review outcome and reschedules the item, upserting its SM-2 state, inside the caller's transaction when
   * given an executor. Only a spaced review moves the schedule (`scheduleAnswer`): a right answer to an item not yet due
   * (a same-day replay, early practice) leaves it unchanged; a wrong answer always counts as a lapse. "Same day" is the
   * learner's, so their time zone is read with the item.
   */
  async record(
    userId: string,
    itemId: string,
    quality: Quality,
    now: Date = new Date(),
    executor: Executor = this.pool,
  ): Promise<ReviewItem> {
    const existing = await executor.query<RecordRow>(
      `SELECT u.timezone, r.item_id, r.repetitions, r.interval_days, r.easiness, r.due_at, r.last_reviewed_at
       FROM users u
       LEFT JOIN review_items r ON r.user_id = u.id AND r.item_id = $2
       WHERE u.id = $1`,
      [userId, itemId],
    );
    const found = existing.rows[0];
    const row = found?.item_id ? found : undefined;
    const next = scheduleAnswer(
      row
        ? {
            state: { repetitions: row.repetitions, interval: row.interval_days, easiness: row.easiness },
            dueAt: new Date(row.due_at),
            lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
          }
        : null,
      quality,
      now,
      found?.timezone ?? 'UTC',
    );
    if (!next) return toItem(row!);

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
      [userId, itemId, next.state.repetitions, next.state.interval, next.state.easiness, next.dueAt, now],
    );
    return toItem(saved.rows[0]!);
  }

  /** Schedules a new review item, due now. Idempotent: an existing item, such as a re-saved word, keeps its history. Returns whether one was created. */
  async scheduleNew(userId: string, itemId: string, now: Date = new Date()): Promise<boolean> {
    const res = await this.pool.query(
      `INSERT INTO review_items (user_id, item_id, repetitions, interval_days, easiness, due_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, item_id) DO NOTHING`,
      [userId, itemId, INITIAL_SM2.repetitions, INITIAL_SM2.interval, INITIAL_SM2.easiness, now],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Items due now, most overdue first, capped at `limit`. Dictionary items (`dict:<entryId>`) appear only while the word
   * is still saved; unsaving keeps the history. Speaking items never appear, since their answers no longer move the
   * schedule and a leftover one would be due forever.
   */
  async queue(userId: string, now: Date = new Date(), limit = REVIEW_QUEUE_LIMIT): Promise<ReviewQueue> {
    const savedFilter = `AND (item_id NOT LIKE 'dict:%'
       OR item_id IN (SELECT 'dict:' || entry_id FROM saved_words WHERE user_id = $1))
       AND item_id NOT IN (SELECT id::text FROM exercises WHERE type = 'speaking')`;
    const [due, count] = await Promise.all([
      this.pool.query<ItemRow>(
        `SELECT item_id, repetitions, interval_days, easiness, due_at
         FROM review_items
         WHERE user_id = $1 AND due_at <= $2 ${savedFilter}
         ORDER BY due_at ASC
         LIMIT $3`,
        [userId, now, limit],
      ),
      this.pool.query<{ n: string }>(
        `SELECT count(*)::text n FROM review_items WHERE user_id = $1 AND due_at <= $2 ${savedFilter}`,
        [userId, now],
      ),
    ]);
    return { items: due.rows.map(toItem), dueCount: Number(count.rows[0]!.n) };
  }
}
