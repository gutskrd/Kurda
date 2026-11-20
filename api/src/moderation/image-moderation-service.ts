import type pg from 'pg';
import type { PictureRejectReason, PictureSurface } from '@kurda/shared';
import { decidePicture, legacyAction, legacyReasons, legacyScores, type PictureLevels, type PictureOutcome } from './image-scan.js';
import type { ImageScanner } from './image-scanner.js';
import type { Executor } from './tx.js';

/**
 * The automatic check every picture goes through before anyone else sees it, and its record. `check` asks the scanner
 * (vision-scanner.ts) and applies the policy (image-scan.ts); with no scanner, in `people` mode, or past the daily
 * limit, every picture is held for a person instead, and any failure of the scanner holds it too: nothing unclear is
 * ever cleared. `record` writes each check to `image_scans`, with the findings, the model and how it came to be held.
 */

export type CheckedBy = 'auto' | 'people_only' | 'checker_unavailable';

export interface PictureCheck {
  outcome: PictureOutcome;
  /** null when no automatic check ran */
  levels: PictureLevels | null;
  model: string;
  checkedBy: CheckedBy;
}

export type PictureReviewMode = 'auto' | 'people';

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface ImageModerationOptions {
  /** null or absent: no automatic checker, so every picture waits for a person */
  scanner?: ImageScanner | null;
  mode?: PictureReviewMode;
  /** automatic checks a day at most (UTC) */
  dailyLimit?: number;
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

export class ImageModerationService {
  private readonly scanner: ImageScanner | null;
  private readonly mode: PictureReviewMode;
  private readonly dailyLimit: number;
  /** the UTC day moderators were last told the limit was reached, so this process asks at most once a day */
  private limitToldOn: string | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: ImageModerationOptions = {},
  ) {
    this.scanner = opts.scanner ?? null;
    this.mode = opts.mode ?? 'auto';
    this.dailyLimit = opts.dailyLimit ?? 3000;
  }

  /** Whether pictures are checked automatically at all (a scanner, and not people-only). */
  get automatic(): boolean {
    return this.scanner !== null && this.mode === 'auto';
  }

  /** Check a picture's bytes for where it will be shown. Never throws for the scanner's sake. */
  async check(bytes: Buffer, surface: PictureSurface): Promise<PictureCheck> {
    if (!this.scanner || this.mode === 'people') return held('people_only', 'people');
    if (await this.limitReached()) {
      await this.tellLimitReached().catch((err) => this.opts.log?.warn({ err }, 'could not tell moderators the picture check limit was reached'));
      return held('people_only', 'daily-limit');
    }
    try {
      const report = await this.scanner.scan({ bytes });
      return { outcome: decidePicture(report.levels, surface), levels: report.levels, model: report.model, checkedBy: 'auto' };
    } catch (err) {
      this.opts.log?.warn({ err: err instanceof Error ? err.message : String(err), surface }, 'picture check unavailable; held for a person');
      return held('checker_unavailable', 'unavailable');
    }
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
          levels, checked_by, outcome, reason, uploader_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15) RETURNING id`,
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
      ],
    );
    return res.rows[0]!.id;
  }

  /** Today's automatic checks (UTC) against the limit; an unknown count lets the check go ahead. */
  private async limitReached(): Promise<boolean> {
    if (this.dailyLimit <= 0) return true;
    const r = await this.pool
      .query<{ n: number }>(`SELECT count(*)::int AS n FROM image_scans WHERE checked_by = 'auto' AND created_at >= date_trunc('day', now(), 'UTC')`)
      .catch(() => null);
    return (r?.rows[0]?.n ?? 0) >= this.dailyLimit;
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
