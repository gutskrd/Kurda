import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  OPEN_CASE_STATUSES,
  PICTURE_REVIEW_NOTE_MAX,
  stripControlChars,
  type AccountStanding,
  type CaseStatus,
  type PictureCaseItem,
  type PictureCaseList,
  type PictureCaseOrigin,
  type PictureCaseView,
  type PictureDecision,
  type PictureRejectReason,
  type PictureScanCategory,
  type PictureScanLevel,
  type PictureSurface,
  type ReportCategory,
  type ReportPriority,
  type ReportTargetType,
} from '@kurda/shared';
import { mediaKey, type MediaStorage } from '../media/storage.js';
import type { MediaUsageService } from '../media/mediaUsage.js';
import { AppError } from '../plugins/errors.js';
import { minorSql } from '../users/age.js';
import type { ModerationAlerts } from './alerts.js';
import type { CasesService } from './cases-service.js';
import { mediaRemovals, type RemovalRecord } from './content-removal.js';
import { parseLevels, ruleFor, surfaceOfKind, type PictureLevels } from './image-scan.js';
import type { CheckedBy, ImageModerationService, PictureCheck } from './image-moderation-service.js';
import { pictureReviewNotice } from './notices.js';
import { ownerPictureUrl, readStoredPicture, releasePicture, runHoldMoves, runPicturePublishing, type StoredPicture } from './picture-release.js';
import { evidenceObjectKey } from './pseudonym.js';
import { OPEN_CASE_PREDICATE } from './reports-service.js';
import { deliverNotice, logAdminAction } from './sanctions-service.js';
import { inTransaction, type Executor } from './tx.js';

/**
 * Pictures from upload to decision: every picture is checked before anyone else sees it, and what is not clear waits
 * for a person on the admin Pictures page.
 *
 * - `intake` is the upload step every surface shares: bytes refused or removed before are refused again (by their
 *   hash, on every kind), the rest are checked in memory; a clear picture goes to the public bucket, anything else only
 *   to private storage, held for a person (a case, P1, or P0 for a child-safety hit, with the uploader as subject) or
 *   refused with a reason the owner can ask a person about (`ask`).
 * - The Pictures page lists those cases, shows a picture through a short-lived audited link, and decides through the
 *   moderation cases (cases-service.ts): approving releases it (picture-release.ts), removing it is a content removal
 *   with its notice and appeal. A child-safety case is decided only with the full case tools.
 * - Enough reports, or one about child safety, hide a live picture from others until a person decides.
 * - A picture held only because the checker could not be reached is checked again, and released if clear.
 *
 * Picture cases are `image_flag` cases keyed by their `image_scans` row; `evidence.origin` marks the ones this module
 * opened (older image flags keep their own path).
 */

/** An upload as it comes out of `intake`. */
export type Intake =
  | { state: 'clear'; scanId: string | null }
  | { state: 'held'; scanId: string; caseId: string }
  | { state: 'refused'; reason: PictureRejectReason; reviewId: string | null }
  | { state: 'failed' };

export interface IntakeInput {
  key: string;
  bytes: Buffer;
  contentType: string;
  contentHash: string;
  /** the hash of the file as it was sent, before it was resized for its kind */
  sourceHash?: string | null;
  kind: string;
  uploaderId: string | null;
  width?: number | null;
  height?: number | null;
  /** what a person deciding needs: the words around it, the group's name */
  context?: { text?: string | null; groupName?: string | null; groupId?: string | null; letterId?: string | null };
  /** false for a letter's drawing, which the apps draw from its strokes: nothing public is stored when it is clear */
  publicWhenClear?: boolean;
}

interface Logger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface PicturesOptions {
  checks: ImageModerationService;
  /** looked up when needed: tests give an app its bucket after it is built */
  storage: () => MediaStorage | null | undefined;
  alerts?: ModerationAlerts;
  /** distinct reporters within a day that hide a picture from others */
  reportThreshold?: number;
  log?: Logger;
}

/** The upload kind a letter's drawing is kept under while a person checks it. */
const DRAWING_KIND = 'letter-drawing';

/** How long a refused picture is kept privately, for its owner to ask a person and to appeal. */
export const REFUSED_KEPT_DAYS = 182;

/** How many times a picture held because the checker was down is checked again before it is left to a person. */
export const RECHECK_ATTEMPTS = 4;

const PAGE = 30;

/** What the owner is told for a removal from the Pictures page. */
export const PICTURE_REMOVAL_STATEMENT = "A moderator checked a picture you shared and found that it breaks Hevalo's rules, so it was removed.";

/** A refused picture's English words; the apps say it in their own language from `reason`. */
export const REFUSAL_MESSAGES: Readonly<Record<PictureRejectReason, string>> = {
  sexual: 'This picture looks like it shows nudity or sexual content, which isn’t allowed on Hevalo.',
  violence: 'This picture looks violent or gory, which isn’t allowed on Hevalo.',
  self_harm: 'This picture looks like it shows self-harm, so we can’t share it. If you’re going through something hard, you’re not alone.',
  hate: 'This picture looks like it shows hateful symbols or words, which aren’t allowed on Hevalo.',
  other: 'This picture can’t be shared on Hevalo.',
};

/** What a picture case keeps in `evidence`. */
interface PictureEvidence {
  origin: PictureCaseOrigin;
  surface: PictureSurface;
  mediaKey: string;
  scanId: string;
  checkedBy: CheckedBy;
  levels: PictureLevels | null;
  reason: PictureRejectReason | null;
  note: string | null;
  context: { text: string | null; groupName: string | null };
  groupId?: string | null;
  letterId?: string | null;
  /** a live photo reports hid: put back on approval if nothing replaced it meanwhile */
  hiddenProfileOf?: string | null;
  hiddenGroupOf?: string | null;
  reportCaseId?: string | null;
  staffRemoval?: boolean;
}

interface CaseRowLite {
  id: string;
  status: CaseStatus;
  resolution: string | null;
  category: ReportCategory | null;
  subject_user_id: string | null;
  evidence: Partial<PictureEvidence> & Record<string, unknown>;
  removed_content: RemovalRecord | null;
  report_count: number;
  first_reported_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
}

const OPEN_LIST = (OPEN_CASE_STATUSES as readonly string[]).map((s) => `'${s}'`).join(',');

function isOpen(c: Pick<CaseRowLite, 'status' | 'resolution'>): boolean {
  return (OPEN_CASE_STATUSES as readonly string[]).includes(c.status) && c.resolution !== 'csam';
}

const isSensitive = (c: Pick<CaseRowLite, 'category' | 'evidence'>): boolean =>
  c.evidence.origin === 'child_safety' || c.category === 'child_safety';

/** The report category a refusal reason stands for (they share their words). */
const reasonRule = (reason: PictureRejectReason): ReportCategory => reason;

/** A refusal reason for a rule a person removed a picture under: the named ones, else `other`. */
function reasonOfRule(rule: string | null | undefined): PictureRejectReason {
  return rule === 'sexual' || rule === 'violence' || rule === 'self_harm' || rule === 'hate' ? rule : 'other';
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [string, string];
    if (typeof at !== 'string' || typeof id !== 'string' || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export class PictureReviewService {
  private cases: CasesService | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly opts: PicturesOptions,
  ) {}

  /** The case service decisions go through; set once both exist (each needs the other). */
  useCases(cases: CasesService): void {
    this.cases = cases;
  }

  get checks(): ImageModerationService {
    return this.opts.checks;
  }

  private get storage(): MediaStorage | null | undefined {
    return this.opts.storage();
  }

  private requireCases(): CasesService {
    if (!this.cases) throw new Error('picture decisions need the case service');
    return this.cases;
  }

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------

  /**
   * Bytes moderation refused or removed before, under any key and kind (the stored bytes, or the file as it was sent,
   * which each kind resizes differently): refused again, with the reason they were refused for (or the rule they were
   * removed under), and nothing to ask about.
   */
  async refusedBefore(contentHash: string, key: string, sourceHash?: string | null): Promise<PictureRejectReason | null> {
    const r = await this.pool.query<{ reason: PictureRejectReason | null; rule: string | null; child: boolean | null }>(
      `SELECT (SELECT s.reason FROM image_scans s WHERE s.media_key = m.key AND s.reason IS NOT NULL ORDER BY s.created_at DESC LIMIT 1) AS reason,
              (SELECT c.policy FROM moderation_cases c
                WHERE c.source = 'image_flag' AND c.evidence->>'mediaKey' = m.key AND c.status = 'actioned'
                ORDER BY c.resolved_at DESC NULLS LAST LIMIT 1) AS rule,
              (SELECT bool_or(s.outcome = 'child_safety' OR s.csam_match) FROM image_scans s WHERE s.media_key = m.key) AS child
         FROM media_uploads m
        WHERE (m.content_sha256 = $1 OR m.key = $2 OR m.source_sha256 = $3)
          AND (m.scan_status IN ('blocked','refused') OR m.quarantine_state IS NOT NULL)
        ORDER BY m.created_at DESC LIMIT 1`,
      [contentHash, key, sourceHash ?? null],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.child) return 'other';
    return row.reason ?? reasonOfRule(row.rule);
  }

  /** The same bytes are already public and clear, under any key: no need to ask again. */
  private async clearedBefore(contentHash: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM media_uploads WHERE content_sha256 = $1 AND scan_status = 'cleared' AND quarantine_state IS NULL
          AND publish_state IS NULL LIMIT 1`,
      [contentHash],
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Check a picture and store it where its outcome says: clear on the public bucket, anything else only in private
   * storage. Leaves the upload unconfirmed for the caller, which decides what uses it. A storage failure leaves nothing
   * stored and the row for the orphan sweep.
   */
  async intake(storage: MediaStorage | null | undefined, usage: Pick<MediaUsageService, 'recordOps'> | null, input: IntakeInput): Promise<Intake> {
    const surface = surfaceOfKind(input.kind);
    const before = await this.refusedBefore(input.contentHash, input.key, input.sourceHash);
    if (before) return { state: 'refused', reason: before, reviewId: null };

    const check: PictureCheck = (await this.clearedBefore(input.contentHash))
      ? { outcome: { state: 'clear' }, levels: null, model: 'seen-before', checkedBy: 'auto' }
      : await this.checks.check(input.bytes, surface);
    const state = check.outcome.state;
    const privateKey = state === 'clear' ? null : evidenceObjectKey(input.key);
    const status = state === 'clear' ? 'cleared' : state === 'held' ? 'held' : 'refused';
    const storesPublic = state === 'clear' && input.publicWhenClear !== false;

    if (state !== 'clear' || storesPublic) {
      await this.pool.query(
        `INSERT INTO media_uploads (key, content_type, content_length, scan_status, uploader_id, kind, width, height, content_sha256,
                                    private_key, preserve_evidence, source_sha256)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (key) DO UPDATE SET content_length = EXCLUDED.content_length, scan_status = EXCLUDED.scan_status,
           source_sha256 = COALESCE(EXCLUDED.source_sha256, media_uploads.source_sha256),
           uploader_id = COALESCE(media_uploads.uploader_id, EXCLUDED.uploader_id), kind = EXCLUDED.kind,
           width = EXCLUDED.width, height = EXCLUDED.height, content_sha256 = EXCLUDED.content_sha256,
           private_key = EXCLUDED.private_key, publish_state = NULL,
           preserve_evidence = media_uploads.preserve_evidence OR EXCLUDED.preserve_evidence`,
        [
          input.key, input.contentType, input.bytes.length, status, input.uploaderId, input.kind, input.width ?? null,
          input.height ?? null, input.contentHash, privateKey, state === 'child_safety', input.sourceHash ?? null,
        ],
      );
      try {
        // without a bucket (local development) nothing is stored, and a held picture waits with no copy to show
        if (storage && privateKey) await storage.putEvidence(privateKey, input.bytes, input.contentType);
        else if (storage) await storage.put(input.key, input.bytes, input.contentType);
        if (storage) await usage?.recordOps('A');
      } catch (err) {
        this.opts.log?.error({ err, key: input.key }, 'picture storage write failed');
        return { state: 'failed' };
      }
    }

    // nothing to record for bytes seen before; a check's answer is recorded whatever it was, for audit and the daily count
    if (check.model === 'seen-before') return { state: 'clear', scanId: null };

    const out = await inTransaction(this.pool, async (client) => {
      const scanId = await this.checks.record(client, { key: input.key, surface, check, uploaderId: input.uploaderId });
      if (state === 'clear') return { intake: { state: 'clear', scanId } as Intake, urgent: null };
      if (state === 'refused') {
        return { intake: { state: 'refused', reason: check.outcome.state === 'refused' ? check.outcome.reason : 'other', reviewId: scanId } as Intake, urgent: null };
      }
      const origin: PictureCaseOrigin = state === 'child_safety' ? 'child_safety' : 'held';
      const caseId = await this.openCase(client, {
        origin,
        surface,
        key: input.key,
        scanId,
        check,
        uploaderId: input.uploaderId,
        reason: state === 'child_safety' ? 'other' : null,
        context: input.context,
      });
      return {
        intake: (state === 'child_safety' ? { state: 'refused', reason: 'other', reviewId: null } : { state: 'held', scanId, caseId }) as Intake,
        urgent: state === 'child_safety' ? caseId : null,
      };
    });
    if (out.urgent) await this.alertUrgent(out.urgent);
    return out.intake;
  }

  /** Open (or find) the case a picture waits in, in the caller's transaction. */
  private async openCase(
    db: Executor,
    input: {
      origin: PictureCaseOrigin;
      surface: PictureSurface;
      key: string;
      scanId: string;
      check: Pick<PictureCheck, 'checkedBy' | 'levels'>;
      uploaderId: string | null;
      reason: PictureRejectReason | null;
      note?: string | null;
      context?: IntakeInput['context'];
      priority?: ReportPriority;
      category?: ReportCategory;
      reportCount?: number;
      reporterCount?: number;
      extra?: Partial<PictureEvidence>;
    },
  ): Promise<string> {
    const child = input.origin === 'child_safety' || input.category === 'child_safety';
    const priority: ReportPriority = input.priority ?? (child ? 0 : input.origin === 'asked' ? 2 : 1);
    const category: ReportCategory =
      input.category ?? (child ? 'child_safety' : input.reason ? reasonRule(input.reason) : ruleFor(input.check.levels));
    const evidence: PictureEvidence = {
      origin: input.origin,
      surface: input.surface,
      mediaKey: input.key,
      scanId: input.scanId,
      checkedBy: input.check.checkedBy,
      levels: input.check.levels,
      reason: input.reason,
      note: input.note ?? null,
      context: { text: input.context?.text ?? null, groupName: input.context?.groupName ?? null },
      groupId: input.context?.groupId ?? null,
      letterId: input.context?.letterId ?? null,
      ...input.extra,
    };
    const summary =
      input.origin === 'asked'
        ? `Picture refused at upload; its owner asked a person to look (${input.surface})`
        : input.origin === 'reported'
          ? `Picture hidden after reports (${input.surface})`
          : input.origin === 'child_safety'
            ? `Picture refused: possible child-safety hit (${input.surface})`
            : `Picture waiting for a person (${input.surface})`;
    const severity = child ? 100 : input.origin === 'reported' ? 80 : input.origin === 'asked' ? 60 : 70;
    const r = await db.query<{ id: string }>(
      `INSERT INTO moderation_cases (source, source_ref, subject_user_id, severity, summary, evidence, source_created_at, priority,
                                     category, report_count, reporter_count, first_reported_at, last_reported_at, minor_involved)
       VALUES ('image_flag', $1, $2, $3, $4, $5::jsonb, now(), $6, $7, $8, $9, now(), now(),
               $10 OR COALESCE((SELECT ${minorSql('u')} FROM users u WHERE u.id = $2::uuid), false))
       ON CONFLICT (source, source_ref) WHERE ${OPEN_CASE_PREDICATE} DO UPDATE SET updated_at = now()
       RETURNING id`,
      [input.scanId, input.uploaderId, severity, summary, JSON.stringify(evidence), priority, category, input.reportCount ?? 0,
        input.reporterCount ?? 0, child],
    );
    return r.rows[0]!.id;
  }

  private async alertUrgent(caseId: string): Promise<void> {
    await this.opts.alerts?.caseUrgent(caseId).catch((err) => this.opts.log?.warn({ err, caseId }, 'urgent picture alert failed; the sweep will retry'));
  }

  /**
   * A letter's drawing, rendered to a picture (letters/widget-image.ts `letterDrawingPng`), checked before the letter
   * is delivered. Never refused outright except for child safety; anything not clear is held for a person, kept
   * privately, and the letter waits. Nothing public is stored, since the apps draw a letter from its strokes.
   */
  async checkDrawing(userId: string, png: Buffer, words: string | null): Promise<{ state: 'clear' } | { state: 'held'; key: string } | { state: 'refused' }> {
    const contentHash = createHash('sha256').update(png).digest('hex');
    const key = mediaKey(DRAWING_KIND, contentHash, 'image/png');
    // the same drawing sent again (a resend) is the one already checked
    const known = await this.pool.query<{ scan_status: string }>(`SELECT scan_status FROM media_uploads WHERE key = $1`, [key]);
    if (known.rows[0]?.scan_status === 'held') return { state: 'held', key };
    if (known.rows[0]?.scan_status === 'cleared') return { state: 'clear' };
    const intake = await this.intake(this.storage, null, {
      key,
      bytes: png,
      contentType: 'image/png',
      contentHash,
      kind: DRAWING_KIND,
      uploaderId: userId,
      context: { text: words },
      publicWhenClear: false,
    });
    if (intake.state === 'held') return { state: 'held', key };
    if (intake.state === 'clear') return { state: 'clear' };
    // a failed private write still keeps the letter back: unchecked, it is not delivered
    if (intake.state === 'failed') return { state: 'held', key };
    return { state: 'refused' };
  }

  /** The letter a held drawing belongs to, on its open case once the letter exists, in the letter's transaction. */
  async attachLetter(db: Executor, key: string, letterId: string): Promise<void> {
    await db.query(
      `UPDATE moderation_cases SET evidence = jsonb_set(evidence, '{letterId}', to_jsonb($2::text)), updated_at = now()
        WHERE source = 'image_flag' AND evidence ? 'origin' AND evidence->>'mediaKey' = $1 AND ${OPEN_CASE_PREDICATE}`,
      [key, letterId],
    );
  }

  // ---------------------------------------------------------------------------
  // What the owner sees
  // ---------------------------------------------------------------------------

  /** A short-lived link only the owner gets, to a picture nobody else can see yet. */
  async ownerLink(key: string | null | undefined): Promise<{ url: string } | null> {
    if (!key) return null;
    const url = await ownerPictureUrl(this.pool, this.storage, key);
    return url ? { url } : null;
  }

  /** `GET /me/standing`: a removal of a picture carries a private link to it, so its owner knows which one. */
  async withPictures(standing: AccountStanding): Promise<AccountStanding> {
    const removals = [...standing.active, ...standing.past].filter((s) => s.kind === 'content_removal');
    if (removals.length === 0) return standing;
    const r = await this.pool.query<{ id: string; evidence: Partial<PictureEvidence>; removed_content: RemovalRecord | null }>(
      `SELECT s.id, c.evidence, c.removed_content FROM sanctions s JOIN moderation_cases c ON c.id = s.case_id
        WHERE s.id = ANY($1::uuid[])`,
      [removals.map((s) => s.id)],
    );
    const links = new Map<string, { url: string } | null>();
    for (const row of r.rows) {
      const key = pictureKeyOf(row.evidence, row.removed_content);
      if (key) links.set(row.id, await this.ownerLink(key));
    }
    const add = <T extends { id: string }>(s: T): T => (links.has(s.id) ? { ...s, picture: links.get(s.id) ?? null } : s);
    return { ...standing, active: standing.active.map(add), past: standing.past.map(add) };
  }

  // ---------------------------------------------------------------------------
  // Asking a person to look
  // ---------------------------------------------------------------------------

  /** `POST /me/picture-reviews/:reviewId`: the owner of a refused picture asks a person to check it. */
  async ask(userId: string, reviewId: string, rawNote?: string | null): Promise<void> {
    const note = [...stripControlChars(rawNote ?? '').trim()].slice(0, PICTURE_REVIEW_NOTE_MAX).join('').trim() || null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) {
      throw new AppError('NOT_FOUND', 404, 'no such picture of yours to check');
    }
    await inTransaction(this.pool, async (client) => {
      const r = await client.query<{
        media_key: string; surface: string; uploader_id: string | null; outcome: string | null; reason: PictureRejectReason | null;
        asked_at: Date | null; levels: unknown; checked_by: CheckedBy | null; created_at: Date; scan_status: string | null; kind: string | null;
      }>(
        `SELECT s.media_key, s.surface, s.uploader_id, s.outcome, s.reason, s.asked_at, s.levels, s.checked_by, s.created_at,
                m.scan_status, m.kind
           FROM image_scans s LEFT JOIN media_uploads m ON m.key = s.media_key
          WHERE s.id = $1 FOR UPDATE OF s`,
        [reviewId],
      );
      const scan = r.rows[0];
      // not found, not yours, not a refusal you can ask about, or no longer kept: one answer for all
      const kept = scan && scan.created_at.getTime() > Date.now() - REFUSED_KEPT_DAYS * 86_400_000;
      if (!scan || scan.uploader_id !== userId || scan.outcome !== 'refused' || !kept || scan.scan_status !== 'refused') {
        throw new AppError('NOT_FOUND', 404, 'no such picture of yours to check');
      }
      if (scan.asked_at) throw new AppError('REVIEW_ALREADY_ASKED', 409, 'a person is already asked to check this picture');
      await client.query(`UPDATE image_scans SET asked_at = now(), note = $2, status = 'pending' WHERE id = $1`, [reviewId, note]);
      await this.openCase(client, {
        origin: 'asked',
        surface: surfaceOfKind(scan.kind),
        key: scan.media_key,
        scanId: reviewId,
        check: { checkedBy: scan.checked_by ?? 'auto', levels: parseLevels(scan.levels) },
        uploaderId: userId,
        reason: scan.reason ?? 'other',
        note,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // The Pictures page
  // ---------------------------------------------------------------------------

  async list(view: PictureCaseView, cursor?: string, viewerId?: string): Promise<PictureCaseList> {
    const after = decodeCursor(cursor);
    const params: unknown[] = [viewerId ?? null];
    const where = [`c.source = 'image_flag'`, `c.evidence ? 'origin'`];
    const openSql = `c.status IN (${OPEN_LIST}) AND c.resolution IS DISTINCT FROM 'csam'`;
    if (view === 'decided') where.push(`NOT (${openSql})`);
    else {
      where.push(openSql);
      const origins: Record<Exclude<PictureCaseView, 'decided'>, string> = {
        waiting: `('held','child_safety')`,
        asked: `('asked')`,
        reported: `('reported')`,
      };
      where.push(`c.evidence->>'origin' IN ${origins[view]}`);
    }
    // nobody is shown a case about themselves
    where.push(`c.subject_user_id IS DISTINCT FROM $1::uuid`);
    const at = view === 'decided' ? `COALESCE(c.resolved_at, c.updated_at)` : 'c.first_reported_at';
    if (after) {
      params.push(after.at, after.id);
      where.push(view === 'decided' ? `(${at}, c.id) < ($2::timestamptz, $3::uuid)` : `(${at}, c.id) > ($2::timestamptz, $3::uuid)`);
    }
    params.push(PAGE + 1);
    const r = await this.pool.query<ListRow & { at: Date }>(
      `SELECT c.id, c.status, c.resolution, c.category, c.subject_user_id, c.evidence, c.removed_content, c.report_count,
              c.first_reported_at, c.resolved_at, c.resolved_by, ${at} AS at,
              u.username, u.display_name, u.birth_year IS NOT NULL AS owner_known, ${minorSql('u')} AS owner_minor,
              d.username AS decider,
              -- the rule its reporters chose most often
              (SELECT r.category FROM reports r
                WHERE c.evidence->>'origin' = 'reported' AND r.case_id::text = c.evidence->>'reportCaseId'
                GROUP BY r.category ORDER BY count(*) DESC, r.category LIMIT 1) AS report_category
         FROM moderation_cases c
         LEFT JOIN users u ON u.id = c.subject_user_id
         LEFT JOIN users d ON d.id = c.resolved_by
        WHERE ${where.join(' AND ')}
        ORDER BY ${at} ${view === 'decided' ? 'DESC' : 'ASC'}, c.id ${view === 'decided' ? 'DESC' : 'ASC'}
        LIMIT $${params.length}`,
      params,
    );
    const rows = r.rows.slice(0, PAGE);
    const last = rows[rows.length - 1];
    const counts = await this.pool.query<{ origin: string; n: number }>(
      `SELECT c.evidence->>'origin' AS origin, count(*)::int AS n FROM moderation_cases c
        WHERE c.source = 'image_flag' AND c.evidence ? 'origin' AND ${openSql} AND c.subject_user_id IS DISTINCT FROM $1::uuid
        GROUP BY 1`,
      [viewerId ?? null],
    );
    const n = (origins: string[]) => counts.rows.filter((c) => origins.includes(c.origin)).reduce((sum, c) => sum + c.n, 0);
    return {
      items: rows.map((c) => toItem(c)),
      nextCursor: r.rows.length > PAGE && last ? encodeCursor(last.at, last.id) : null,
      counts: { waiting: n(['held', 'child_safety']), asked: n(['asked']), reported: n(['reported']) },
    };
  }

  /**
   * `GET /admin/pictures/:caseId/image`: the picture of a picture case (or of a case whose removal took one down, for an
   * appeal), as bytes, from wherever it is kept now. Never to someone the case is about or who reported it.
   */
  async image(caseId: string, adminId: string): Promise<StoredPicture> {
    const c = await this.findCase(this.pool, caseId, { anyPicture: true });
    const cases = this.requireCases();
    const row = await cases.find(this.pool, caseId);
    if (row) await cases.assertNotParty(this.pool, row, adminId);
    const key = pictureKeyOf(c.evidence, c.removed_content);
    const picture = key ? await readStoredPicture(this.pool, this.storage, key) : null;
    if (!picture) throw new AppError('NOT_FOUND', 404, 'this picture is not kept any more');
    return picture;
  }

  /** `POST /admin/pictures/:caseId/decide`: approve, or remove under a rule. */
  async decide(caseId: string, adminId: string, decision: PictureDecision): Promise<void> {
    const cases = this.requireCases();
    const c = await this.findCase(this.pool, caseId);
    if (isSensitive(c)) {
      throw new AppError('SENSITIVE_CASE', 403, 'a possible child-safety picture is decided only from its case, with the full case tools');
    }
    if (!isOpen(c)) throw new AppError('ALREADY_DECIDED', 409, 'this picture was already decided');
    const note = decision.note?.trim() || undefined;
    try {
      if (decision.decision === 'approve') {
        await cases.decide(caseId, adminId, { outcome: 'no_violation', actions: [], removeContent: false, notifyReporters: false, note });
      } else if (c.evidence.origin === 'asked') {
        await this.uphold(c, adminId, decision.policy, note);
      } else {
        await cases.decide(caseId, adminId, {
          outcome: 'actioned',
          policy: decision.policy,
          actions: c.subject_user_id ? [{ target: 'subject', kind: 'content_removal', statement: PICTURE_REMOVAL_STATEMENT }] : [],
          removeContent: true,
          notifyReporters: false,
          note,
        });
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'CASE_CLOSED') throw new AppError('ALREADY_DECIDED', 409, 'this picture was already decided');
      throw err;
    }
  }

  /** A refusal its owner asked about stays refused: they are told, and nothing else is held against them. */
  private async uphold(c: CaseRowLite, adminId: string, policy: ReportCategory, note?: string): Promise<void> {
    const cases = this.requireCases();
    await inTransaction(this.pool, async (client) => {
      const locked = await cases.find(client, c.id, true);
      if (!locked || !isOpen(locked)) throw new AppError('ALREADY_DECIDED', 409, 'this picture was already decided');
      await cases.assertNotParty(client, locked, adminId);
      if (locked.claimed_by && locked.claimed_by !== adminId && locked.lease_until && locked.lease_until.getTime() > Date.now()) {
        throw new AppError('CLAIMED_BY_OTHER', 409, 'another moderator holds this case');
      }
      await client.query(
        `UPDATE moderation_cases SET status = 'actioned', resolution = 'actioned', resolved_by = $2, resolved_at = now(), policy = $3,
                resolution_note = $4, claimed_by = NULL, lease_until = NULL, updated_at = now()
          WHERE id = $1`,
        [c.id, adminId, policy, note ?? null],
      );
      await client.query(`UPDATE image_scans SET status = 'actioned', resolved_at = now(), resolved_by = $2 WHERE id = $1::uuid`, [
        c.evidence.scanId,
        adminId,
      ]);
      if (c.subject_user_id) {
        await deliverNotice(client, c.subject_user_id, pictureReviewNotice('upheld', c.evidence.surface ?? 'post', null, true));
      }
      await logAdminAction(client, {
        targetUserId: c.subject_user_id,
        adminId,
        action: 'case_decision',
        reason: note || `refusal upheld under ${policy}`,
        caseId: c.id,
        policy,
        before: { status: c.status },
        after: { status: 'actioned', upheld: true },
      });
    });
  }

  /** A picture case (or, with `anyPicture`, any case whose removal took a picture down) by id. */
  private async findCase(db: Executor, caseId: string, opts: { anyPicture?: boolean } = {}): Promise<CaseRowLite> {
    const r = await db.query<CaseRowLite & { source: string }>(
      `SELECT id, source, status, resolution, category, subject_user_id, evidence, removed_content, report_count,
              first_reported_at, resolved_at, resolved_by
         FROM moderation_cases WHERE id = $1`,
      [caseId],
    );
    const c = r.rows[0];
    const picture = c && c.source === 'image_flag' && typeof c.evidence?.origin === 'string';
    if (!c || !(picture || (opts.anyPicture && pictureKeyOf(c.evidence, c.removed_content)))) {
      throw new AppError('NOT_FOUND', 404, 'no such picture case');
    }
    return c;
  }

  /** The appeals list's `picture`: the case behind each sanction that took a picture down. */
  /**
   * The "Automated flags" page's buttons on an image flag, decided like the Pictures page: "Uphold" removes the picture
   * (under the rule its findings point to), "Reverse" approves it. An older flag the queue has not taken in yet gets
   * its case first. A child-safety flag is decided only from its case.
   */
  async resolveFlag(scanId: string, adminId: string, outcome: 'actioned' | 'reversed'): Promise<boolean> {
    const r = await this.pool.query<{
      media_key: string; surface: string; levels: unknown; checked_by: CheckedBy | null; reasons: string[] | null;
      csam_match: boolean; preserve_evidence: boolean; outcome: string | null; uploader_id: string | null; kind: string | null; owner: string | null;
    }>(
      `SELECT s.media_key, s.surface, s.levels, s.checked_by, s.reasons, s.csam_match, s.preserve_evidence, s.outcome, s.uploader_id, m.kind,
              COALESCE(s.uploader_id, m.uploader_id) AS owner
         FROM image_scans s LEFT JOIN media_uploads m ON m.key = s.media_key
        WHERE s.id = $1 AND s.status = 'pending'`,
      [scanId],
    );
    const scan = r.rows[0];
    if (!scan) return false;
    if (scan.csam_match || scan.preserve_evidence || scan.outcome === 'child_safety') {
      throw new AppError('SENSITIVE_CASE', 403, 'a possible child-safety picture is decided only from its case, with the full case tools');
    }
    const levels = parseLevels(scan.levels);
    const found = await this.pool.query<{ id: string; evidence: Record<string, unknown> }>(
      `SELECT id, evidence FROM moderation_cases WHERE source = 'image_flag' AND source_ref = $1 AND ${OPEN_CASE_PREDICATE}`,
      [scanId],
    );
    let caseId = found.rows[0]?.id ?? null;
    if (caseId && typeof found.rows[0]!.evidence.origin !== 'string') {
      // a case the queue opened from an older flag: it is decided here as a picture case from now on
      await this.pool.query(
        `UPDATE moderation_cases SET evidence = evidence || $2::jsonb, subject_user_id = COALESCE(subject_user_id, $3::uuid) WHERE id = $1`,
        [caseId, JSON.stringify(this.legacyEvidence(scanId, scan, levels)), scan.owner],
      );
    }
    if (!caseId) {
      caseId = await inTransaction(this.pool, (client) =>
        this.openCase(client, {
          origin: 'held',
          surface: surfaceOfKind(scan.kind),
          key: scan.media_key,
          scanId,
          check: { checkedBy: scan.checked_by ?? 'auto', levels },
          uploaderId: scan.owner,
          reason: null,
        }),
      );
    }
    const policy: ReportCategory = levels
      ? ruleFor(levels)
      : (scan.reasons ?? []).includes('nsfw')
        ? 'sexual'
        : (scan.reasons ?? []).includes('violence')
          ? 'violence'
          : 'other';
    await this.decide(caseId, adminId, outcome === 'reversed' ? { decision: 'approve' } : { decision: 'remove', policy });
    return true;
  }

  private legacyEvidence(
    scanId: string,
    scan: { media_key: string; kind: string | null; checked_by: CheckedBy | null },
    levels: PictureLevels | null,
  ): PictureEvidence {
    return {
      origin: 'held',
      surface: surfaceOfKind(scan.kind),
      mediaKey: scan.media_key,
      scanId,
      checkedBy: scan.checked_by ?? 'auto',
      levels,
      reason: null,
      note: null,
      context: { text: null, groupName: null },
    };
  }

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  /**
   * After a report: enough distinct reporters (accounts over a day old) on the same picture within a day, or one report
   * about child safety, hide it from others until a person decides. A post is held; a profile or group photo moves to
   * its waiting place, so others see the default while its owner still sees it.
   */
  async afterReport(input: { targetType: ReportTargetType; targetId: string; category: ReportCategory; reportCaseId: string }): Promise<void> {
    const live = await this.livePicturesOf(input.targetType, input.targetId);
    if (live.keys.length === 0) return;
    const urgent = input.category === 'child_safety';
    const counted = await this.pool.query<{ reporters: number; reports: number }>(
      `SELECT count(DISTINCT r.reporter_id)::int AS reporters, count(*)::int AS reports
         FROM reports r JOIN users u ON u.id = r.reporter_id
        WHERE r.target_type = $1 AND r.target_id = $2 AND r.created_at > now() - interval '24 hours'
          AND u.created_at < now() - interval '1 day'`,
      [input.targetType, input.targetId],
    );
    const { reporters, reports } = counted.rows[0] ?? { reporters: 0, reports: 0 };
    if (!urgent && reporters < (this.opts.reportThreshold ?? 3)) return;

    const opened = await inTransaction(this.pool, async (client) => {
      const out: string[] = [];
      const hidden: string[] = [];
      for (const key of live.keys) {
        // already waiting for a person
        const waiting = await client.query(
          `SELECT 1 FROM moderation_cases WHERE source = 'image_flag' AND evidence->>'mediaKey' = $1 AND ${OPEN_CASE_PREDICATE} LIMIT 1`,
          [key],
        );
        if (waiting.rowCount) continue;
        const m = await client.query<{ scan_status: string; kind: string | null; uploader_id: string | null }>(
          `UPDATE media_uploads SET scan_status = 'held' WHERE key = $1 AND scan_status = 'cleared'
            RETURNING scan_status, kind, uploader_id`,
          [key],
        );
        if (!m.rows[0]) continue;
        hidden.push(key);
        const last = await client.query<{ levels: unknown; checked_by: CheckedBy | null }>(
          `SELECT levels, checked_by FROM image_scans WHERE media_key = $1 AND levels IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
          [key],
        );
        const check: PictureCheck = {
          outcome: { state: 'held' },
          levels: parseLevels(last.rows[0]?.levels),
          model: 'reports',
          checkedBy: last.rows[0]?.checked_by ?? 'auto',
        };
        const surface = surfaceOfKind(m.rows[0].kind);
        const owner = live.ownerId ?? m.rows[0].uploader_id;
        const scanId = await this.checks.record(client, { key, surface, check, uploaderId: owner, status: 'pending' });
        out.push(
          await this.openCase(client, {
            origin: 'reported',
            surface,
            key,
            scanId,
            check,
            uploaderId: owner,
            reason: null,
            context: live.context,
            priority: urgent ? 0 : 1,
            category: input.category,
            reportCount: reports,
            reporterCount: reporters,
            extra: { reportCaseId: input.reportCaseId, hiddenProfileOf: live.profileOf ?? null, hiddenGroupOf: live.groupOf ?? null },
          }),
        );
      }
      if (hidden.length === 0) return { cases: out, hidden };
      if (live.postTable && live.postId) {
        await client.query(`UPDATE ${live.postTable} SET status = 'held', updated_at = now() WHERE id = $1 AND status = 'published'`, [live.postId]);
      }
      if (live.profileOf) {
        await client.query(
          `UPDATE users SET profile_photo_key = NULL, pending_profile_photo_key = COALESCE(pending_profile_photo_key, profile_photo_key)
            WHERE id = $1 AND profile_photo_key = ANY($2::text[])`,
          [live.profileOf, hidden],
        );
      }
      if (live.groupOf) {
        await client.query(
          `UPDATE groups SET photo_key = NULL, pending_photo_key = COALESCE(pending_photo_key, photo_key),
                  pending_photo_set_by = CASE WHEN pending_photo_key IS NULL THEN photo_set_by ELSE pending_photo_set_by END
            WHERE id = $1 AND photo_key = ANY($2::text[])`,
          [live.groupOf, hidden],
        );
      }
      return { cases: out, hidden };
    });
    await runHoldMoves(this.pool, this.storage, { keys: opened.hidden, log: this.opts.log });
    if (urgent) for (const caseId of opened.cases) await this.alertUrgent(caseId);
  }

  /** The pictures others see on a reported thing, and whose they are. */
  private async livePicturesOf(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<{
    keys: string[];
    ownerId: string | null;
    postTable?: 'image_posts' | 'library_posts';
    postId?: string;
    profileOf?: string;
    groupOf?: string;
    context?: IntakeInput['context'];
  }> {
    switch (targetType) {
      case 'image_post': {
        const r = await this.pool.query<{ k: string; author_id: string; caption: string | null }>(
          `SELECT image_media_id AS k, author_id, caption FROM image_posts WHERE id = $1::uuid AND status = 'published'`,
          [targetId],
        );
        const p = r.rows[0];
        return p ? { keys: [p.k], ownerId: p.author_id, postTable: 'image_posts', postId: targetId, context: { text: p.caption } } : { keys: [], ownerId: null };
      }
      case 'library_post': {
        const r = await this.pool.query<{ k: string; author_id: string; words: string | null }>(
          `SELECT pm.media_key AS k, p.author_id, concat_ws(E'\\n', p.title, p.body) AS words
             FROM library_posts p JOIN library_post_media pm ON pm.post_id = p.id
            WHERE p.id = $1::uuid AND p.status = 'published' ORDER BY pm.position`,
          [targetId],
        );
        const first = r.rows[0];
        return first
          ? { keys: r.rows.map((x) => x.k), ownerId: first.author_id, postTable: 'library_posts', postId: targetId, context: { text: first.words } }
          : { keys: [], ownerId: null };
      }
      case 'user': {
        const r = await this.pool.query<{ k: string | null }>(`SELECT profile_photo_key AS k FROM users WHERE id = $1::uuid`, [targetId]);
        const k = r.rows[0]?.k;
        return k ? { keys: [k], ownerId: targetId, profileOf: targetId } : { keys: [], ownerId: null };
      }
      case 'group': {
        const r = await this.pool.query<{ k: string | null; set_by: string | null; owner_id: string | null; name: string }>(
          `SELECT photo_key AS k, photo_set_by AS set_by, owner_id, name FROM groups WHERE id = $1::uuid AND archived_at IS NULL`,
          [targetId],
        );
        const g = r.rows[0];
        return g?.k
          ? { keys: [g.k], ownerId: g.set_by ?? g.owner_id, groupOf: targetId, context: { groupName: g.name, groupId: targetId } }
          : { keys: [], ownerId: null };
      }
      default:
        return { keys: [], ownerId: null };
    }
  }

  // ---------------------------------------------------------------------------
  // Staff taking a picture post down
  // ---------------------------------------------------------------------------

  /**
   * `DELETE /images/:id` by staff, for someone else's post: the same removal as a decision (blocked by its bytes, off the
   * public bucket, a removal notice and appeal for its author), recorded as a decided picture case.
   */
  async staffRemovePost(postId: string, adminId: string): Promise<boolean> {
    const p = await this.pool.query<{ key: string; author_id: string; caption: string | null; kind: string | null }>(
      `SELECT i.image_media_id AS key, i.author_id, i.caption, m.kind
         FROM image_posts i LEFT JOIN media_uploads m ON m.key = i.image_media_id
        WHERE i.id = $1 AND i.status <> 'removed'`,
      [postId],
    );
    const post = p.rows[0];
    if (!post) return false;
    const caseId = await inTransaction(this.pool, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM moderation_cases WHERE source = 'image_flag' AND evidence->>'mediaKey' = $1 AND ${OPEN_CASE_PREDICATE} LIMIT 1`,
        [post.key],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const check: PictureCheck = { outcome: { state: 'held' }, levels: null, model: 'staff', checkedBy: 'people_only' };
      const scanId = await this.checks.record(client, { key: post.key, surface: 'post', check, uploaderId: post.author_id, status: 'pending' });
      return this.openCase(client, {
        origin: 'reported',
        surface: 'post',
        key: post.key,
        scanId,
        check,
        uploaderId: post.author_id,
        reason: null,
        context: { text: post.caption },
        category: 'other',
        extra: { staffRemoval: true },
      });
    });
    await this.requireCases().decide(caseId, adminId, {
      outcome: 'actioned',
      policy: 'other',
      actions: [{ target: 'subject', kind: 'content_removal', statement: PICTURE_REMOVAL_STATEMENT }],
      removeContent: true,
      notifyReporters: false,
      note: 'taken down by staff from the post',
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Sweeps
  // ---------------------------------------------------------------------------

  /**
   * Pictures held only because the checker could not be reached are checked again, a few times, and released at once
   * if clear. Anything else the second look finds stays with a person, who now sees what it found; a child-safety hit
   * makes the case urgent.
   */
  async recheckUnavailable(limit = 20): Promise<number> {
    const storage = this.storage;
    if (!storage || !this.checks.automatic) return 0;
    const due = await this.pool.query<{
      id: string; media_key: string; surface: PictureSurface; attempts: number; case_id: string | null; private_key: string | null; kind: string | null;
    }>(
      `SELECT s.id, s.media_key, s.surface, s.rescan_attempts AS attempts, c.id AS case_id, m.private_key, m.kind
         FROM image_scans s
         JOIN media_uploads m ON m.key = s.media_key AND m.scan_status = 'held'
         LEFT JOIN moderation_cases c ON c.source = 'image_flag' AND c.source_ref = s.id::text AND c.status = 'open'
        WHERE s.checked_by = 'checker_unavailable' AND s.status = 'pending' AND s.rescan_attempts < $1
          AND (c.claimed_by IS NULL OR c.lease_until < now())
        ORDER BY s.created_at LIMIT $2`,
      [RECHECK_ATTEMPTS, limit],
    );
    let released = 0;
    for (const scan of due.rows) {
      if (!scan.case_id || !scan.private_key) continue;
      const bytes = await storage.readEvidence(scan.private_key).catch(() => null);
      if (!bytes) continue;
      const surface = surfaceOfKind(scan.kind);
      const check = await this.checks.check(bytes, surface);
      if (check.checkedBy !== 'auto') {
        await this.pool.query(`UPDATE image_scans SET rescan_attempts = rescan_attempts + 1 WHERE id = $1`, [scan.id]);
        continue;
      }
      const urgent = await inTransaction(this.pool, async (client) => {
        const c = await client.query<{ status: string }>(`SELECT status FROM moderation_cases WHERE id = $1 FOR UPDATE`, [scan.case_id]);
        if (c.rows[0]?.status !== 'open') return false;
        const state = check.outcome.state;
        await client.query(
          `UPDATE image_scans SET levels = $2::jsonb, checked_by = 'auto', model_version = $3, rescan_attempts = rescan_attempts + 1,
                  outcome = $4, status = CASE WHEN $4 = 'clear' THEN 'reversed' ELSE status END,
                  resolved_at = CASE WHEN $4 = 'clear' THEN now() END
            WHERE id = $1`,
          [scan.id, JSON.stringify(check.levels), check.model, state === 'refused' ? 'held' : state],
        );
        await client.query(
          `UPDATE moderation_cases SET evidence = evidence || jsonb_build_object('checkedBy', 'auto', 'levels', $2::jsonb), updated_at = now()
            WHERE id = $1`,
          [scan.case_id, JSON.stringify(check.levels)],
        );
        if (state === 'clear') {
          await client.query(
            `UPDATE moderation_cases SET status = 'no_violation', resolution = 'no_violation', resolved_at = now(),
                    resolution_note = 'cleared when the automatic check could be reached again', updated_at = now()
              WHERE id = $1`,
            [scan.case_id],
          );
          await releasePicture(client, scan.media_key, { notify: 'held' });
          return false;
        }
        if (state === 'child_safety') {
          await client.query(
            `UPDATE moderation_cases SET priority = 0, category = 'child_safety', minor_involved = true, severity = 100,
                    evidence = evidence || '{"origin":"child_safety"}'::jsonb
              WHERE id = $1`,
            [scan.case_id],
          );
          await client.query(`UPDATE media_uploads SET preserve_evidence = true WHERE key = $1`, [scan.media_key]);
          return true;
        }
        return false;
      });
      if (check.outcome.state === 'clear') released++;
      if (urgent) await this.alertUrgent(scan.case_id);
    }
    if (released > 0) await runPicturePublishing(this.pool, storage, { log: this.opts.log });
    return released;
  }

  /**
   * Refused pictures nobody asked about, past the window to ask and appeal: their private bytes are deleted and the
   * row handed to the orphan sweep. A child-safety hit is evidence, kept by its own retention.
   */
  async expireRefused(limit = 200): Promise<number> {
    const storage = this.storage;
    const due = await this.pool.query<{ key: string; private_key: string | null }>(
      `SELECT m.key, m.private_key FROM media_uploads m
        WHERE m.scan_status = 'refused' AND NOT m.preserve_evidence
          AND m.created_at < now() - make_interval(days => $1::int)
          AND NOT EXISTS (SELECT 1 FROM moderation_cases c
                           WHERE c.source = 'image_flag' AND c.evidence->>'mediaKey' = m.key AND ${OPEN_CASE_PREDICATE})
        LIMIT $2`,
      [REFUSED_KEPT_DAYS, limit],
    );
    let n = 0;
    for (const row of due.rows) {
      try {
        if (row.private_key && storage) await storage.deleteEvidence(row.private_key);
        await this.pool.query(`UPDATE media_uploads SET private_key = NULL, confirmed_at = NULL WHERE key = $1 AND scan_status = 'refused'`, [row.key]);
        n++;
      } catch (err) {
        this.opts.log?.warn({ err, key: row.key }, 'could not delete a refused picture past its window yet');
      }
    }
    return n;
  }

  /** The five-minute sweep's picture work: approved pictures published, hidden ones moved private. */
  async sweep(): Promise<void> {
    const storage = this.storage;
    await runPicturePublishing(this.pool, storage, { log: this.opts.log });
    await runHoldMoves(this.pool, storage, { log: this.opts.log });
  }
}

/** The picture a case is about: a picture case's own, or the first a removal took down. */
export function pictureKeyOf(evidence: Partial<PictureEvidence> | null | undefined, removed: RemovalRecord | null | undefined): string | null {
  if (evidence && typeof evidence.origin === 'string' && typeof evidence.mediaKey === 'string') return evidence.mediaKey;
  return mediaRemovals(removed)[0]?.key ?? null;
}

/** The words a post carries, put on the open cases of its held pictures once the post exists, in its transaction. */
export async function attachPostContext(db: Executor, keys: readonly string[], text: string | null, postId: string): Promise<void> {
  if (keys.length === 0) return;
  await db.query(
    `UPDATE moderation_cases
        SET evidence = jsonb_set(jsonb_set(evidence, '{context,text}', to_jsonb($2::text)), '{postId}', to_jsonb($3::text)),
            updated_at = now()
      WHERE source = 'image_flag' AND evidence ? 'origin' AND evidence->>'mediaKey' = ANY($1::text[]) AND ${OPEN_CASE_PREDICATE}`,
    [keys, text?.slice(0, 2000) ?? '', postId],
  );
}

/** The appeals list's `picture`: the case behind each removal sanction that took a picture down. */
export async function appealPictures(db: Executor, sanctionIds: string[]): Promise<Map<string, { caseId: string; sensitive: boolean }>> {
  if (sanctionIds.length === 0) return new Map();
  const r = await db.query<{
    id: string; case_id: string; category: ReportCategory | null; evidence: Partial<PictureEvidence>; removed_content: RemovalRecord | null;
  }>(
    `SELECT s.id, c.id AS case_id, c.category, c.evidence, c.removed_content FROM sanctions s JOIN moderation_cases c ON c.id = s.case_id
      WHERE s.id = ANY($1::uuid[]) AND s.kind = 'content_removal'`,
    [sanctionIds],
  );
  return new Map(
    r.rows
      .filter((row) => pictureKeyOf(row.evidence, row.removed_content))
      .map((row) => [row.id, { caseId: row.case_id, sensitive: isSensitive({ category: row.category, evidence: row.evidence ?? {} }) }]),
  );
}

type ListRow = CaseRowLite & {
  username: string | null;
  display_name: string | null;
  owner_minor: boolean | null;
  owner_known: boolean | null;
  decider: string | null;
  report_category: ReportCategory | null;
};

function toItem(c: ListRow): PictureCaseItem {
  const ev = c.evidence;
  const open = isOpen(c);
  const levels = ev.levels ? (Object.fromEntries(Object.entries(ev.levels)) as Partial<Record<PictureScanCategory, PictureScanLevel>>) : null;
  return {
    caseId: c.id,
    surface: (ev.surface as PictureSurface) ?? 'post',
    origin: (ev.origin as PictureCaseOrigin) ?? 'held',
    levels,
    checkedBy: (ev.checkedBy as CheckedBy) ?? 'auto',
    createdAt: c.first_reported_at.toISOString(),
    owner:
      c.subject_user_id && c.username
        ? { id: c.subject_user_id, username: c.username, displayName: c.display_name, minor: c.owner_known ? c.owner_minor === true : null }
        : null,
    context: { text: ev.context?.text ?? null, groupName: ev.context?.groupName ?? null },
    note: ev.note ?? null,
    reportCount: c.report_count,
    reportCategory: c.report_category,
    sensitive: isSensitive(c),
    status: c.status,
    decided: open
      ? null
      : {
          outcome: c.status === 'no_violation' ? 'approved' : 'removed',
          byUsername: c.decider,
          at: (c.resolved_at ?? c.first_reported_at).toISOString(),
        },
  };
}
