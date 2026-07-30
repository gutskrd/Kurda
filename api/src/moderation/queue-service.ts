import type pg from 'pg';

export type CaseSource = 'chat_report' | 'anti_cheat' | 'text_flag' | 'image_flag';
export type CaseResolution = 'dismiss' | 'warn' | 'mute' | 'ban';

export interface QueueCase {
  id: string;
  source: CaseSource;
  sourceRef: string;
  subjectUserId: string | null;
  severity: number;
  summary: string;
  status: 'open' | 'claimed' | 'resolved';
  claimedBy: string | null;
  sourceCreatedAt: Date;
}

/** How long an auto/queue mute lasts. */
const MUTE_MS = 24 * 60 * 60 * 1000;

/**
 * Unified moderation queue (KUR-102). `sync` ingests open items from every
 * source into `moderation_cases`; `queue` serves them severity-sorted; `claim`
 * gives a moderator an exclusive lock; `resolve` applies a one-click action
 * (dismiss / warn / mute / ban), closes the source row, and records it. `sla`
 * reports the median time-to-resolution.
 */
export class ModerationQueueService {
  constructor(private readonly pool: pg.Pool) {}

  /** Pull open items from each source into cases (idempotent). Returns #added. */
  async sync(): Promise<number> {
    let added = 0;
    // human chat reports (#086) — user-submitted, medium severity
    added += await this.ingest(
      `SELECT id::text AS ref, reported_user_id AS subject, 50 AS severity,
              'Chat report (' || message_type || ')' AS summary,
              jsonb_build_object('messageId', message_id, 'context', context) AS evidence,
              created_at
       FROM chat_reports WHERE status = 'open'`,
      'chat_report',
    );
    // anti-cheat reviews (#058) — shadow-flagged is high severity
    added += await this.ingest(
      `SELECT id::text AS ref, user_id AS subject,
              CASE WHEN shadow_flagged THEN 90 ELSE 60 END AS severity,
              'Anti-cheat flag (' || room_id || ')' AS summary,
              jsonb_build_object('flags', flags, 'confidence', confidence) AS evidence,
              created_at
       FROM cheat_reviews WHERE reviewed = false`,
      'anti_cheat',
    );
    // automated text moderation (#293)
    added += await this.ingest(
      `SELECT id::text AS ref, author_id AS subject,
              CASE action WHEN 'auto_block' THEN 85 WHEN 'auto_hide' THEN 70 ELSE 50 END AS severity,
              'Auto text flag: ' || COALESCE(top_category, 'spam') AS summary,
              jsonb_build_object('action', action, 'score', top_score, 'model', model_version) AS evidence,
              created_at
       FROM moderation_flags WHERE status = 'pending'`,
      'text_flag',
    );
    // automated image scanning (#294) — CSAM hard-block is top severity
    added += await this.ingest(
      `SELECT id::text AS ref, NULL::uuid AS subject,
              CASE action WHEN 'hard_block' THEN 100 WHEN 'auto_block' THEN 90 WHEN 'gate' THEN 70 ELSE 50 END AS severity,
              'Auto image flag: ' || array_to_string(reasons, ',') AS summary,
              jsonb_build_object('action', action, 'reasons', reasons, 'csam', csam_match, 'mediaKey', media_key) AS evidence,
              created_at
       FROM image_scans WHERE status = 'pending'`,
      'image_flag',
    );
    return added;
  }

  private async ingest(selectSql: string, source: CaseSource): Promise<number> {
    const res = await this.pool.query(
      `INSERT INTO moderation_cases (source, source_ref, subject_user_id, severity, summary, evidence, source_created_at)
       SELECT $1, s.ref, s.subject, s.severity, s.summary, s.evidence, s.created_at
       FROM (${selectSql}) AS s
       ON CONFLICT (source, source_ref) DO NOTHING`,
      [source],
    );
    return res.rowCount ?? 0;
  }

  /** Open + claimed cases, most severe first (oldest first within a severity). */
  async queue(limit = 100): Promise<QueueCase[]> {
    const res = await this.pool.query<{
      id: string; source: CaseSource; source_ref: string; subject_user_id: string | null;
      severity: number; summary: string; status: 'open' | 'claimed' | 'resolved';
      claimed_by: string | null; source_created_at: Date;
    }>(
      `SELECT id, source, source_ref, subject_user_id, severity, summary, status, claimed_by, source_created_at
       FROM moderation_cases WHERE status IN ('open','claimed')
       ORDER BY severity DESC, source_created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      id: r.id, source: r.source, sourceRef: r.source_ref, subjectUserId: r.subject_user_id,
      severity: r.severity, summary: r.summary, status: r.status, claimedBy: r.claimed_by,
      sourceCreatedAt: r.source_created_at,
    }));
  }

  /** Claim an open case (claim-locking): the first moderator wins. */
  async claim(caseId: string, moderatorId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE moderation_cases SET status = 'claimed', claimed_by = $2, claimed_at = now()
       WHERE id = $1 AND status = 'open'`,
      [caseId, moderatorId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Resolve a case with one action, close the underlying source row, and record
   * a moderation action against the subject (except dismiss). Idempotent-safe:
   * an already-resolved case returns false.
   */
  async resolve(caseId: string, moderatorId: string, resolution: CaseResolution): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ source: CaseSource; source_ref: string; subject_user_id: string | null; status: string }>(
        `SELECT source, source_ref, subject_user_id, status FROM moderation_cases WHERE id = $1 FOR UPDATE`,
        [caseId],
      );
      const c = row.rows[0];
      if (!c || c.status === 'resolved') {
        await client.query('ROLLBACK');
        return false;
      }

      if (resolution !== 'dismiss' && c.subject_user_id) {
        await this.applyAction(client, c.subject_user_id, moderatorId, resolution);
      }
      await this.closeSource(client, c.source, c.source_ref, resolution);

      await client.query(
        `UPDATE moderation_cases SET status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now()
         WHERE id = $1`,
        [caseId, resolution, moderatorId],
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Median time-to-resolution (seconds) over resolved cases; null if none. */
  async sla(): Promise<{ medianSeconds: number | null; resolved: number }> {
    const res = await this.pool.query<{ median: string | null; n: string }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at))) AS median,
              COUNT(*)::int AS n
       FROM moderation_cases WHERE status = 'resolved'`,
    );
    const median = res.rows[0]?.median;
    return { medianSeconds: median === null || median === undefined ? null : Number(median), resolved: Number(res.rows[0]?.n ?? 0) };
  }

  /** Apply warn/mute/ban to the subject (mirrors UserAdminService, KUR-101). */
  private async applyAction(client: pg.PoolClient, userId: string, moderatorId: string, resolution: CaseResolution): Promise<void> {
    const reason = 'moderation queue';
    if (resolution === 'warn') {
      await this.record(client, userId, moderatorId, 'warn', reason, {});
    } else if (resolution === 'mute') {
      const until = new Date(Date.now() + MUTE_MS);
      await client.query(`UPDATE users SET muted_until = $2 WHERE id = $1`, [userId, until]);
      await this.record(client, userId, moderatorId, 'mute', reason, { until: until.toISOString() });
    } else if (resolution === 'ban') {
      await client.query(
        `UPDATE users SET banned_at = now(), banned_until = NULL, token_version = token_version + 1 WHERE id = $1`,
        [userId],
      );
      await this.record(client, userId, moderatorId, 'perm_ban', reason, {});
    }
  }

  private async record(client: pg.PoolClient, userId: string, adminId: string, action: string, reason: string, meta: Record<string, unknown>): Promise<void> {
    await client.query(
      `INSERT INTO admin_actions (target_user_id, admin_id, action, reason, meta) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, adminId, action, reason, JSON.stringify(meta)],
    );
  }

  /** Mark the originating row resolved so it does not re-enter the queue. */
  private async closeSource(client: pg.PoolClient, source: CaseSource, ref: string, resolution: CaseResolution): Promise<void> {
    const actioned = resolution !== 'dismiss';
    switch (source) {
      case 'chat_report':
        await client.query(`UPDATE chat_reports SET status = $2, reviewed_at = now() WHERE id = $1::uuid`, [ref, actioned ? 'actioned' : 'dismissed']);
        break;
      case 'anti_cheat':
        await client.query(`UPDATE cheat_reviews SET reviewed = true WHERE id = $1::uuid`, [ref]);
        break;
      case 'text_flag':
        await client.query(`UPDATE moderation_flags SET status = $2, resolved_at = now(), resolved_by = NULL WHERE id = $1::uuid`, [ref, actioned ? 'actioned' : 'reversed']);
        break;
      case 'image_flag':
        await client.query(`UPDATE image_scans SET status = $2, resolved_at = now() WHERE id = $1::uuid`, [ref, actioned ? 'actioned' : 'reversed']);
        break;
    }
  }
}
