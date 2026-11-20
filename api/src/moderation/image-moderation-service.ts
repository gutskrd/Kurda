import type pg from 'pg';
import type { PictureRejectReason, PictureSurface } from '@kurda/shared';
import { decidePicture, legacyAction, legacyReasons, legacyScores, type PictureLevels, type PictureOutcome } from './image-scan.js';
import type { ImageScanner } from './image-scanner.js';
import type { Executor } from './tx.js';

/**
 * The automatic check every picture goes through before anyone else sees it, and its record. `check` asks the scanner
 * (vision-scanner.ts) and applies the policy (image-scan.ts); with no scanner, in `people` mode, or past the service's
 * daily limit, every picture is held for a person instead, and any failure of the scanner holds it too: nothing unclear
 * is ever cleared. One account past its own daily limit is told to wait instead (429), so it can neither run up the
 * cost nor fill the review queue. Both limits are counted atomically in Redis, in Postgres while Redis is down, and an
 * unknown count is taken as reached. `record` writes each check to `image_scans`, with the findings, the model, what it
 * cost and how it came to be held.
 */

export type CheckedBy = 'auto' | 'people_only' | 'checker_unavailable';

export interface PictureCheck {
  outcome: PictureOutcome;
  /** null when no automatic check ran */
  levels: PictureLevels | null;
  model: string;
  checkedBy: CheckedBy;
  /** what the call cost, when one was made */
  usage?: { inputTokens: number; outputTokens: number };
}

/** One account has had its automatic checks for the day: its next pictures wait until the next day (UTC). */
export interface PersonOverLimit {
  limited: true;
  retryAfterSec: number;
}

/** The parts of a Redis client the counters use. */
export type CounterStore = { incr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<number> };

export type PictureReviewMode = 'auto' | 'people';

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ImageModerationOptions {
  /** null or absent: no automatic checker, so every picture waits for a person */
  scanner?: ImageScanner | null;
  mode?: PictureReviewMode;
  /** automatic checks a day at most for the whole service (UTC) */
  dailyLimit?: number;
  /** automatic checks a day at most for one account (UTC) */
  perUserDaily?: number;
  /** where the counts live; without it they are read from Postgres */
  counters?: CounterStore | null;
  /** the counts' Redis key prefix; a test run gets its own, so suites sharing a Redis never reach each other's limits */
  counterPrefix?: string;
  /** told of every call made, for the spend counters (observability/metrics.ts) */
  onCheck?: (check: { outcome: PictureOutcome['state'] | 'unavailable'; usage?: PictureCheck['usage'] }) => void;
  log?: Logger;
}

export interface PendingImageScan {
  id: string;
  mediaKey: string;
  surface: string;
  action: string;
  reasons: string[];
  nsfwScore: number;
  violenceScore: number;
  csamMatch: boolean;
  preserveEvidence: boolean;
  modelVersion: string;
  createdAt: Date;
  /** the moderation case it waits in (the Picture checks page decides it); null for an older flag the queue has not taken in */
  caseId: string | null;
}

/** What the scan row of an outcome is: decided automatically, waiting for a person, or nothing to do. */
function rowStatus(outcome: PictureOutcome): 'clear' | 'pending' | 'actioned' {
  if (outcome.state === 'clear') return 'clear';
  return outcome.state === 'refused' ? 'actioned' : 'pending';
}

const held = (checkedBy: CheckedBy, model: string): PictureCheck => ({ outcome: { state: 'held' }, levels: null, model, checkedBy });

const COUNTER_PREFIX = 'picture-checks';

/** The model column of a verdict reused for the same bytes, so the daily counts never count it as a call. */
export const REUSED_SUFFIX = ' (reused)';

/** Seconds until the next UTC midnight, when the daily counts start again. */
export function secondsToUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

const utcDay = (now = new Date()): string => now.toISOString().slice(0, 10);

export class ImageModerationService {
  private readonly scanner: ImageScanner | null;
  private readonly mode: PictureReviewMode;
  private readonly dailyLimit: number;
  private readonly perUserDaily: number;
  /** the UTC day moderators were last told the limit was reached, so this process asks at most once a day */
  private limitToldOn: string | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: ImageModerationOptions = {},
  ) {
    this.scanner = opts.scanner ?? null;
    this.mode = opts.mode ?? 'auto';
    this.dailyLimit = opts.dailyLimit ?? 1000;
    this.perUserDaily = opts.perUserDaily ?? 30;
  }

  /** Whether pictures are checked automatically at all (a scanner, and not people-only). */
  get automatic(): boolean {
    return this.scanner !== null && this.mode === 'auto';
  }

  /**
   * Check a picture's bytes for where it will be shown, on behalf of the account uploading it (null for a second look the
   * service takes itself). Never throws for the scanner's sake.
   */
  async check(bytes: Buffer, surface: PictureSurface, uploaderId: string | null = null): Promise<PictureCheck | PersonOverLimit> {
    if (!this.scanner || this.mode === 'people') return held('people_only', 'people');
    if (uploaderId && (await this.overPersonLimit(uploaderId))) return { limited: true, retryAfterSec: secondsToUtcMidnight() };
    if (await this.limitReached()) {
      await this.tellLimitReached().catch((err) => this.opts.log?.warn({ err }, 'could not tell moderators the picture check limit was reached'));
      return held('people_only', 'daily-limit');
    }
    try {
      const report = await this.scanner.scan({ bytes });
      const outcome = decidePicture(report.levels, surface);
      this.opts.onCheck?.({ outcome: outcome.state, usage: report.usage });
      return { outcome, levels: report.levels, model: report.model, checkedBy: 'auto', usage: report.usage };
    } catch (err) {
      this.opts.onCheck?.({ outcome: 'unavailable' });
      this.opts.log?.warn({ err: err instanceof Error ? err.message : String(err), surface }, 'picture check unavailable; held for a person');
      return held('checker_unavailable', 'unavailable');
    }
  }

  /**
   * Takes one from a daily count and says whether it is past `limit`: in Redis, atomically, else from today's rows in
   * Postgres. A count nobody can read is past the limit, so an outage never lets checks run unbounded.
   */
  private async takeOne(redisKey: string, limit: number, countSql: string, params: unknown[]): Promise<boolean> {
    if (limit <= 0) return true;
    const counters = this.opts.counters;
    if (counters) {
      try {
        const n = await counters.incr(redisKey);
        // two days, so a count read just before midnight is never cut short
        if (n === 1) await counters.expire(redisKey, 2 * 86_400);
        return n > limit;
      } catch (err) {
        this.opts.log?.warn({ err: err instanceof Error ? err.message : String(err) }, 'picture check counter unavailable; counting in Postgres');
      }
    }
    try {
      const r = await this.pool.query<{ n: number }>(countSql, params);
      return (r.rows[0]?.n ?? 0) >= limit;
    } catch {
      return true;
    }
  }

  /** The service's checks today (UTC) against its daily limit. */
  private async limitReached(): Promise<boolean> {
    return this.takeOne(
      `${this.opts.counterPrefix ?? COUNTER_PREFIX}:${utcDay()}`,
      this.dailyLimit,
      `SELECT count(*)::int AS n FROM image_scans
        WHERE checked_by = 'auto' AND created_at >= date_trunc('day', now(), 'UTC') AND model_version NOT LIKE '%${REUSED_SUFFIX}'`,
      [],
    );
  }

  /** One account's checks today (UTC) against its own daily limit. */
  private async overPersonLimit(uploaderId: string): Promise<boolean> {
    return this.takeOne(
      `${this.opts.counterPrefix ?? COUNTER_PREFIX}:${utcDay()}:${uploaderId}`,
      this.perUserDaily,
      `SELECT count(*)::int AS n FROM image_scans
        WHERE uploader_id = $1 AND checked_by = 'auto' AND created_at >= date_trunc('day', now(), 'UTC')
          AND model_version NOT LIKE '%${REUSED_SUFFIX}'`,
      [uploaderId],
    );
  }

  /** Write one check, in the caller's transaction; returns its id (the `reviewId` of a refusal). */
  async record(
    db: Executor,
    input: { key: string; surface: PictureSurface; check: PictureCheck; uploaderId: string | null; status?: 'pending' | 'actioned' | 'clear' },
  ): Promise<string> {
    const { check } = input;
    const scores = check.levels ? legacyScores(check.levels) : { nsfwScore: 0, violenceScore: 0, csamMatch: false };
    const reason: PictureRejectReason | null =
      check.outcome.state === 'refused' ? check.outcome.reason : check.outcome.state === 'child_safety' ? 'other' : null;
    const res = await db.query<{ id: string }>(
      `INSERT INTO image_scans
         (media_key, surface, nsfw_score, violence_score, csam_match, action, reasons, preserve_evidence, model_version, status,
          levels, checked_by, outcome, reason, uploader_id, input_tokens, output_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        input.key,
        input.surface,
        scores.nsfwScore,
        scores.violenceScore,
        scores.csamMatch,
        legacyAction(check.outcome),
        legacyReasons(check.levels, check.outcome),
        check.outcome.state === 'child_safety',
        check.model,
        input.status ?? rowStatus(check.outcome),
        check.levels ? JSON.stringify(check.levels) : null,
        check.checkedBy,
        check.outcome.state,
        reason,
        input.uploaderId,
        check.usage?.inputTokens ?? null,
        check.usage?.outputTokens ?? null,
      ],
    );
    return res.rows[0]!.id;
  }

  /** Every moderator is told once a (UTC) day that pictures now wait for people; staff words, in English like the console. */
  private async tellLimitReached(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.limitToldOn === today) return;
    this.limitToldOn = today;
    this.opts.log?.error({ limit: this.dailyLimit }, 'picture check daily limit reached: pictures wait for a person until tomorrow (UTC)');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // one process tells, however many reach the limit together
      const lock = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext('picture-check-limit')) AS ok`);
      if (lock.rows[0]?.ok) {
        await client.query(
          `INSERT INTO notifications (user_id, category, title, body, data)
           SELECT u.id, 'safety', $1, $2, '{"kind":"picture_check_limit"}'::jsonb FROM users u
            WHERE u.deleted_at IS NULL AND u.roles && ARRAY['moderator','superadmin','admin']::text[]
              AND NOT EXISTS (SELECT 1 FROM notifications n
                               WHERE n.user_id = u.id AND n.data->>'kind' = 'picture_check_limit'
                                 AND n.created_at >= date_trunc('day', now(), 'UTC'))`,
          [
            'Pictures are waiting for people today',
            `The automatic picture check reached its daily limit (${this.dailyLimit}). Until midnight UTC every new picture waits on the Pictures page.`,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Pending image flags oldest-first: the "Automated flags" feed, each with the case it waits in when there is one. */
  async pending(limit = 50): Promise<PendingImageScan[]> {
    const res = await this.pool.query<{
      id: string; media_key: string; surface: string; action: string; reasons: string[];
      nsfw_score: string; violence_score: string; csam_match: boolean; preserve_evidence: boolean;
      model_version: string; created_at: Date; case_id: string | null;
    }>(
      `SELECT s.id, s.media_key, s.surface, s.action, s.reasons, s.nsfw_score, s.violence_score, s.csam_match,
              s.preserve_evidence, s.model_version, s.created_at,
              (SELECT c.id FROM moderation_cases c WHERE c.source = 'image_flag' AND c.source_ref = s.id::text
                ORDER BY c.created_at DESC LIMIT 1) AS case_id
       FROM image_scans s WHERE s.status = 'pending' ORDER BY s.created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id, mediaKey: r.media_key, surface: r.surface, action: r.action, reasons: r.reasons,
      nsfwScore: Number(r.nsfw_score), violenceScore: Number(r.violence_score), csamMatch: r.csam_match,
      preserveEvidence: r.preserve_evidence, modelVersion: r.model_version, createdAt: r.created_at, caseId: r.case_id,
    }));
  }

  /** Is this media cleared for public serving? */
  async isServable(mediaKey: string): Promise<boolean> {
    const res = await this.pool.query<{ scan_status: string; quarantined: boolean }>(
      `SELECT scan_status, quarantine_state IS NOT NULL AS quarantined FROM media_uploads WHERE key = $1`,
      [mediaKey],
    );
    return res.rows[0]?.scan_status === 'cleared' && !res.rows[0].quarantined;
  }
}
