import type { CaseSource, ReportTargetType } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { Executor } from './tx.js';

/**
 * What a case's source needs when the case is decided or reopened.
 *
 * Most cases now come from `reports`, which the decision closes directly. The
 * automated feeds (text flags, image scans, bot scores, anti-cheat reviews) and
 * the old per-surface report tables still feed the queue, and each keeps its own
 * state: a decided case marks its source row so the next sync does not open the
 * same case again, and a reopened one puts it back.
 */

export type Outcome = 'actioned' | 'no_violation';

export interface CaseSourceRow {
  id: string;
  source: CaseSource;
  source_ref: string;
  subject_user_id: string | null;
  target_type: ReportTargetType | null;
  target_id: string | null;
  evidence: Record<string, unknown>;
}

/** 'library_post:<id>' and friends — the old report tables' case keys. */
export function parseTargetRef(ref: string): { type: string; id: string } | null {
  const i = ref.indexOf(':');
  if (i < 0) return null;
  return { type: ref.slice(0, i), id: ref.slice(i + 1) };
}

/**
 * A CSAM hash match is never cleared by "no violation": the image stays blocked
 * and its record preserved (the same rule as the image-flag page). The old queue
 * let a dismissal mark it reversed; now the decision is refused, before anything
 * else is applied.
 */
export async function assertDismissible(db: Executor, c: CaseSourceRow, outcome: Outcome): Promise<void> {
  if (outcome !== 'no_violation' || c.source !== 'image_flag') return;
  const r = await db.query<{ preserve_evidence: boolean }>(`SELECT preserve_evidence FROM image_scans WHERE id = $1::uuid`, [c.source_ref]);
  if (r.rows[0]?.preserve_evidence) {
    throw new AppError('PRESERVED_EVIDENCE', 409, 'a CSAM match cannot be dismissed — it stays blocked and preserved');
  }
}

/**
 * Mark the source row decided, with the deciding admin (the old queue dropped who).
 * `removed` says whether the decision took the content down: a copyright
 * notice's sender is told "removed" only when something was.
 */
export async function closeSource(
  db: Executor,
  c: CaseSourceRow,
  outcome: Outcome,
  adminId: string | null,
  removed: boolean,
): Promise<void> {
  const actioned = outcome === 'actioned';
  switch (c.source) {
    case 'report':
      return;
    case 'copyright':
      // the notices behind it are decided with it; the outcome sweep emails their senders.
      // Upheld without a removal (a profile, a link that matched nothing) is not "removed":
      // the sender must not be told so, and the uploader has no takedown to counter.
      await db.query(
        `UPDATE copyright_notices SET status = $2 WHERE case_id = $1 AND status = 'received'`,
        [c.id, !actioned ? 'rejected' : removed ? 'actioned' : 'upheld'],
      );
      return;
    case 'chat_report':
      await db.query(
        `UPDATE chat_reports SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1::uuid AND status = 'open'`,
        [c.source_ref, actioned ? 'actioned' : 'dismissed', adminId],
      );
      return;
    case 'anti_cheat':
      await db.query(`UPDATE cheat_reviews SET reviewed = true WHERE id = $1::uuid`, [c.source_ref]);
      return;
    case 'text_flag':
      await db.query(
        `UPDATE moderation_flags SET status = $2, resolved_at = now(), resolved_by = $3 WHERE id = $1::uuid AND status = 'pending'`,
        [c.source_ref, actioned ? 'actioned' : 'reversed', adminId],
      );
      return;
    case 'image_flag': {
      const r = await db.query<{ media_key: string }>(
        `UPDATE image_scans SET status = $2, resolved_at = now(), resolved_by = $3
          WHERE id = $1::uuid AND status = 'pending' RETURNING media_key`,
        [c.source_ref, actioned ? 'actioned' : 'reversed', adminId],
      );
      // a false positive goes back to being served, as on the image-flag page
      if (!actioned && r.rows[0]) {
        await db.query(`UPDATE media_uploads SET scan_status = 'cleared' WHERE key = $1`, [r.rows[0].media_key]);
      }
      return;
    }
    case 'bot_flag': {
      const userId = c.subject_user_id;
      if (!userId) return;
      if (actioned) await confirmBot(db, userId, adminId);
      else {
        await db.query(
          `UPDATE bot_scores SET status = 'cleared', challenge = false, flagged = false, resolved_at = now(), resolved_by = $2
            WHERE user_id = $1 AND status = 'active'`,
          [userId, adminId],
        );
      }
      return;
    }
    case 'library_report':
    case 'image_report': {
      const t = parseTargetRef(c.source_ref);
      if (!t) return;
      const table = c.source === 'library_report' ? 'library_reports' : 'image_reports';
      await db.query(`UPDATE ${table} SET status = 'resolved' WHERE target_type = $1 AND target_id = $2::uuid AND status = 'open'`, [t.type, t.id]);
      return;
    }
    case 'user_report': {
      const t = parseTargetRef(c.source_ref);
      if (!t) return;
      // every open report about the person: the case was all of them
      await db.query(`UPDATE user_reports SET status = 'resolved' WHERE reported_user_id = $1::uuid AND status = 'open'`, [t.id]);
      return;
    }
  }
}

/**
 * Confirm a flagged account as a bot: take back its XP through a compensating
 * ledger entry and mark the verdict confirmed. The same steps as the Antibot
 * page's confirm, inside the caller's transaction.
 */
export async function confirmBot(db: Executor, userId: string, adminId: string | null): Promise<number> {
  const bal = await db.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  const xp = bal.rows[0]?.xp ?? 0;
  if (xp > 0) {
    await db.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'bot_reversal', $2, $3)`, [
      userId,
      -xp,
      `bot:${userId}:${Date.now()}`,
    ]);
    await db.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [userId, -xp]);
  }
  await db.query(`UPDATE bot_scores SET status = 'confirmed', resolved_at = now(), resolved_by = $2 WHERE user_id = $1`, [
    userId,
    adminId,
  ]);
  return xp;
}

/** Put an automated source back to pending, so a reopened case is not closed again by the next sync. */
export async function reopenSource(db: Executor, c: CaseSourceRow): Promise<void> {
  switch (c.source) {
    case 'text_flag':
      await db.query(`UPDATE moderation_flags SET status = 'pending', resolved_at = NULL, resolved_by = NULL WHERE id = $1::uuid`, [c.source_ref]);
      return;
    case 'image_flag':
      await db.query(`UPDATE image_scans SET status = 'pending', resolved_at = NULL, resolved_by = NULL WHERE id = $1::uuid`, [c.source_ref]);
      return;
    case 'anti_cheat':
      await db.query(`UPDATE cheat_reviews SET reviewed = false WHERE id = $1::uuid`, [c.source_ref]);
      return;
    case 'bot_flag':
      if (c.subject_user_id) {
        await db.query(`UPDATE bot_scores SET status = 'active', flagged = true, resolved_at = NULL WHERE user_id = $1`, [c.subject_user_id]);
      }
      return;
    case 'copyright':
      // a second look decides the notices again, and their senders hear the new decision;
      // one already answered by a counter-notice stays answered
      await db.query(
        `UPDATE copyright_notices SET status = 'received', outcome_sent_at = NULL
          WHERE case_id = $1 AND status IN ('actioned','upheld','rejected')`,
        [c.id],
      );
      return;
    default:
      // reports and the old report tables stay closed: a reopened case is a second
      // look at the same reports, and their reporters were already answered
      return;
  }
}

export interface LegacyReport {
  id: string;
  reporterId: string | null;
  category: string | null;
  reason: string | null;
  status: string;
  createdAt: Date;
}

/** The old report rows behind a case from one of the old tables, with their reporters. */
export async function legacyReports(db: Executor, c: Pick<CaseSourceRow, 'source' | 'source_ref'>): Promise<LegacyReport[]> {
  const t = parseTargetRef(c.source_ref);
  let sql: string | null = null;
  let params: unknown[] = [];
  switch (c.source) {
    case 'chat_report':
      sql = `SELECT id, reporter_id, NULL::text AS category, reason, status, created_at FROM chat_reports WHERE id = $1::uuid`;
      params = [c.source_ref];
      break;
    case 'library_report':
      if (t) {
        sql = `SELECT id, reporter_id, NULL::text AS category, reason, status, created_at FROM library_reports
                WHERE target_type = $1 AND target_id = $2::uuid`;
        params = [t.type, t.id];
      }
      break;
    case 'image_report':
      if (t) {
        sql = `SELECT id, reporter_id, NULL::text AS category, reason, status, created_at FROM image_reports
                WHERE target_type = $1 AND target_id = $2::uuid`;
        params = [t.type, t.id];
      }
      break;
    case 'user_report':
      if (t) {
        sql = `SELECT id, reporter_id, category, reason, status, created_at FROM user_reports WHERE reported_user_id = $1::uuid`;
        params = [t.id];
      }
      break;
    default:
      return [];
  }
  if (!sql) return [];
  const r = await db.query<{ id: string; reporter_id: string | null; category: string | null; reason: string | null; status: string; created_at: Date }>(
    `${sql} ORDER BY created_at LIMIT 200`,
    params,
  );
  return r.rows.map((x) => ({
    id: x.id,
    reporterId: x.reporter_id,
    category: x.category,
    reason: x.reason,
    status: x.status,
    createdAt: x.created_at,
  }));
}

/** Everyone who reported this case: from `reports`, or from the old tables. */
export async function reporterIdsOf(db: Executor, c: CaseSourceRow): Promise<string[]> {
  if (c.source === 'report') {
    const r = await db.query<{ reporter_id: string }>(
      `SELECT DISTINCT reporter_id FROM reports WHERE case_id = $1 AND reporter_id IS NOT NULL`,
      [c.id],
    );
    return r.rows.map((x) => x.reporter_id);
  }
  const legacy = await legacyReports(db, c);
  return [...new Set(legacy.map((l) => l.reporterId).filter((x): x is string => x !== null))];
}
