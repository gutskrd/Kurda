import { createHmac } from 'node:crypto';
import type pg from 'pg';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_FEEDBACK_STATUSES,
  stripControlChars,
  type AdminFeedbackItem,
  type AdminFeedbackList,
  type AdminFeedbackPatch,
  type AdminFeedbackSummary,
  type AppFeedbackCategory,
  type AppFeedbackRequest,
  type AppFeedbackSource,
  type AppFeedbackState,
  type AppFeedbackStatus,
  type AppPlatform,
  type FeedbackStats,
} from '@kurda/shared';
import { isKnownAdultRow } from '../users/age.js';
import { feedbackState } from './eligibility.js';
import { countFinishedGames } from './finished-games.js';

/**
 * The rating box, "Send feedback", the store prompt's bookkeeping, and the
 * admin's feedback inbox (@kurda/shared `feedback`; migration 1751000156000).
 */

export interface FeedbackFilter {
  status?: AppFeedbackStatus;
  stars?: number[];
  category?: AppFeedbackCategory;
  platform?: AppPlatform;
  source?: AppFeedbackSource;
  q?: string;
  limit: number;
  offset: number;
}

interface FeedbackRow {
  id: string;
  user_id: string | null;
  username: string | null;
  user_deleted: boolean | null;
  stars: number | null;
  categories: AppFeedbackCategory[];
  comment: string | null;
  source: AppFeedbackSource;
  platform: AppPlatform;
  app_version: string;
  locale: string | null;
  status: AppFeedbackStatus;
  admin_note: string | null;
  created_at: Date;
}

const ITEM_SELECT = `
  SELECT f.id, f.user_id, u.username, u.deleted_at IS NOT NULL AS user_deleted, f.stars, f.categories,
         f.comment, f.source, f.platform, f.app_version, f.locale, f.status, f.admin_note, f.created_at
    FROM app_feedback f LEFT JOIN users u ON u.id = f.user_id`;

function toItem(r: FeedbackRow): AdminFeedbackItem {
  return {
    id: r.id,
    // an anonymised account is a "deleted_…" name pointing at nobody
    user: r.user_id && r.username && !r.user_deleted ? { id: r.user_id, username: r.username } : null,
    stars: r.stars,
    categories: r.categories,
    comment: r.comment,
    source: r.source,
    platform: r.platform,
    appVersion: r.app_version,
    locale: r.locale,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at.toISOString(),
  };
}

/** Free text as it is kept: no control characters, NFC, trimmed; nothing left is nothing. */
function cleanText(text: string | null | undefined): string | null {
  if (text == null) return null;
  const clean = stripControlChars(text).normalize('NFC').trim();
  return clean.length > 0 ? clean : null;
}

/** A LIKE pattern matching `q` literally, wherever it appears. */
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class FeedbackService {
  private readonly secret: string;
  private readonly now: () => Date;

  constructor(
    private readonly pool: pg.Pool,
    opts: { secret: string; now?: () => Date },
  ) {
    this.secret = opts.secret;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * A pseudonym for the account an answer came from, so the counts can tell
   * people apart after `user_id` is gone. Keyed with the server's secret: an
   * unkeyed hash of a user id could be reversed by hashing every id there is.
   */
  userHash(userId: string): string {
    return createHmac('sha256', this.secret).update(`app-feedback:${userId}`).digest('hex');
  }

  /** `GET /me/app-feedback/state`: is the box due, and may the phone ask for a store review. */
  async state(
    userId: string,
    who: { platform?: AppPlatform | null; appVersion?: string | null } = {},
  ): Promise<AppFeedbackState> {
    const res = await this.pool.query<{
      app_feedback_prompted_at: Date | null;
      store_review_prompted_at: Date | null;
      store_review_version: string | null;
      birth_year: number | null;
      birth_month: number | null;
      timezone: string | null;
    }>(
      `SELECT app_feedback_prompted_at, store_review_prompted_at, store_review_version,
              birth_year, birth_month, timezone
         FROM users WHERE id = $1`,
      [userId],
    );
    const user = res.rows[0];
    if (!user) return { shouldPrompt: false, storeReviewEligible: false };
    const now = this.now();
    const played = await countFinishedGames(this.pool, userId, user.timezone);
    return feedbackState({
      now,
      feedbackPromptedAt: user.app_feedback_prompted_at,
      storeReviewPromptedAt: user.store_review_prompted_at,
      storeReviewVersion: user.store_review_version,
      finishedGames: played.games,
      finishedDays: played.days,
      knownAdult: isKnownAdultRow(user, now),
      platform: who.platform ?? null,
      appVersion: who.appVersion ?? null,
    });
  }

  /**
   * An answer, from the box or from Settings. Answering counts as having been
   * shown the box, on every device. Returns null only for an account that is
   * not there.
   */
  async submit(userId: string, input: AppFeedbackRequest): Promise<{ id: string } | null> {
    const categories = [...new Set(input.categories ?? [])];
    const res = await this.pool.query<{ id: string }>(
      `WITH shown AS (
         UPDATE users SET app_feedback_prompted_at = COALESCE(app_feedback_prompted_at, now())
          WHERE id = $1 RETURNING locale
       )
       INSERT INTO app_feedback (user_id, user_hash, stars, categories, comment, source, platform, app_version, locale)
       SELECT $1, $2, $3, $4::text[], $5, $6, $7, $8, COALESCE($9, shown.locale) FROM shown
       RETURNING id`,
      [
        userId,
        this.userHash(userId),
        input.stars ?? null,
        categories,
        cleanText(input.comment),
        input.source,
        input.platform,
        input.appVersion,
        input.locale ?? null,
      ],
    );
    return res.rows[0] ?? null;
  }

  /** "Not now": the box counts as shown. */
  async dismiss(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET app_feedback_prompted_at = COALESCE(app_feedback_prompted_at, now()) WHERE id = $1`,
      [userId],
    );
  }

  /**
   * The phone has just called the native store prompt. Neither store says
   * whether anything was shown, so this records the asking. Once per app
   * version, so a repeated call does not count twice.
   */
  async storeReviewPrompted(userId: string, appVersion: string): Promise<void> {
    await this.pool.query(
      `UPDATE users
          SET store_review_prompted_at = now(), store_review_count = store_review_count + 1,
              store_review_version = $2
        WHERE id = $1 AND store_review_version IS DISTINCT FROM $2`,
      [userId, appVersion],
    );
  }

  // ---- the admin's inbox -----------------------------------------------------

  async list(filter: FeedbackFilter): Promise<AdminFeedbackList> {
    const params: unknown[] = [];
    const conds: string[] = [];
    const add = (sql: (p: string) => string, value: unknown): void => {
      params.push(value);
      conds.push(sql(`$${params.length}`));
    };
    if (filter.status) add((p) => `f.status = ${p}`, filter.status);
    if (filter.stars?.length) add((p) => `f.stars = ANY(${p}::smallint[])`, filter.stars);
    if (filter.category) add((p) => `${p} = ANY(f.categories)`, filter.category);
    if (filter.platform) add((p) => `f.platform = ${p}`, filter.platform);
    if (filter.source) add((p) => `f.source = ${p}`, filter.source);
    if (filter.q) add((p) => `(f.comment ILIKE ${p} OR u.username ILIKE ${p})`, containsPattern(filter.q));
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [counted, rows] = await Promise.all([
      this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM app_feedback f LEFT JOIN users u ON u.id = f.user_id ${where}`,
        params,
      ),
      this.pool.query<FeedbackRow>(
        `${ITEM_SELECT} ${where}
          ORDER BY f.created_at DESC, f.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, filter.limit, filter.offset],
      ),
    ]);
    return { items: rows.rows.map(toItem), total: counted.rows[0]?.n ?? 0 };
  }

  /** Mark an answer read or archived, and keep a note on it. Null when there is no such answer. */
  async update(id: string, patch: AdminFeedbackPatch): Promise<AdminFeedbackItem | null> {
    const res = await this.pool.query<{ id: string }>(
      `UPDATE app_feedback
          SET status = COALESCE($2, status),
              admin_note = CASE WHEN $3::boolean THEN $4 ELSE admin_note END
        WHERE id = $1
       RETURNING id`,
      [id, patch.status ?? null, patch.adminNote !== undefined, cleanText(patch.adminNote)],
    );
    if (!res.rowCount) return null;
    const row = await this.pool.query<FeedbackRow>(`${ITEM_SELECT} WHERE f.id = $1`, [id]);
    return toItem(row.rows[0]!);
  }

  /** Counts, the average and the spread of stars — overall and over 30 days — for the inbox's chart. */
  async summary(): Promise<AdminFeedbackSummary> {
    const statsSql = (where: string) =>
      `SELECT count(*)::int AS count, round(avg(stars), 2)::float AS average,
              count(*) FILTER (WHERE stars = 1)::int AS s1, count(*) FILTER (WHERE stars = 2)::int AS s2,
              count(*) FILTER (WHERE stars = 3)::int AS s3, count(*) FILTER (WHERE stars = 4)::int AS s4,
              count(*) FILTER (WHERE stars = 5)::int AS s5
         FROM app_feedback ${where}`;
    type StatsRow = { count: number; average: number | null; s1: number; s2: number; s3: number; s4: number; s5: number };
    const toStats = (r: StatsRow): FeedbackStats => ({
      count: r.count,
      averageStars: r.average,
      distribution: [r.s1, r.s2, r.s3, r.s4, r.s5],
    });

    const [total, recent, daily, statuses, categories] = await Promise.all([
      this.pool.query<StatsRow>(statsSql('')),
      this.pool.query<StatsRow>(statsSql(`WHERE created_at > now() - interval '30 days'`)),
      this.pool.query<{ day: string; count: number; average: number | null }>(
        `SELECT to_char(d, 'YYYY-MM-DD') AS day, count(f.id)::int AS count, round(avg(f.stars), 2)::float AS average
           FROM generate_series(
                  ((now() AT TIME ZONE 'UTC')::date - 29)::timestamp,
                  (now() AT TIME ZONE 'UTC')::date::timestamp,
                  interval '1 day'
                ) AS d
           LEFT JOIN app_feedback f
             ON f.created_at >= (d AT TIME ZONE 'UTC') AND f.created_at < ((d + interval '1 day') AT TIME ZONE 'UTC')
          GROUP BY d ORDER BY d`,
      ),
      this.pool.query<{ status: AppFeedbackStatus; n: number }>(
        `SELECT status, count(*)::int AS n FROM app_feedback GROUP BY status`,
      ),
      this.pool.query<{ category: AppFeedbackCategory; n: number }>(
        `SELECT c AS category, count(*)::int AS n FROM app_feedback, unnest(categories) AS c GROUP BY c`,
      ),
    ]);

    const byStatus = Object.fromEntries(APP_FEEDBACK_STATUSES.map((s) => [s, 0])) as Record<AppFeedbackStatus, number>;
    for (const r of statuses.rows) byStatus[r.status] = r.n;
    const byCategory = Object.fromEntries(APP_FEEDBACK_CATEGORIES.map((c) => [c, 0])) as Record<
      AppFeedbackCategory,
      number
    >;
    for (const r of categories.rows) byCategory[r.category] = r.n;

    return {
      total: toStats(total.rows[0]!),
      last30Days: toStats(recent.rows[0]!),
      daily: daily.rows.map((r) => ({ day: r.day, count: r.count, averageStars: r.average })),
      byStatus,
      byCategory,
    };
  }
}
