import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { minorSql } from '../users/age.js';
import { filterText, seriousCategory, type FilterResult } from './filter.js';
import { ReportsService } from './reports-service.js';
import { CHAT_FLAG_CONTENT, WORDLIST_MODEL } from './sources.js';

export type MessageType = 'dm' | 'group';

/** Escalation thresholds: flagged-message count → mute severity. */
export const OFFENSE_1H = 3;
export const OFFENSE_24H = 5;
export const OFFENSE_PERM = 8;

export interface OffenseResult {
  count: number;
  mutedUntil: Date | null;
  perm: boolean;
}

/** A letter or private message the word filter flagged, once it is stored: what its text flag points at. */
export interface FlaggedMessage {
  targetType: keyof typeof CHAT_FLAG_CONTENT;
  id: string;
  /** the listed words that matched (filter.ts `hits`) */
  words: readonly string[];
}

/**
 * Chat moderation: profanity masking on delivery, message reporting with captured context, and repeat-offender
 * auto-mute escalation. The mute is global (enforced by the DM and group send paths). A flagged letter or private
 * message becomes a text flag, which the queue opens a case for (queue-service.ts), only when a moderator must see it:
 * sexual words or slurs, or anything sent to a minor. Plain swearing between adults only counts against its writer.
 */
export class ModerationService {
  private readonly reports: ReportsService;

  constructor(
    private readonly pool: pg.Pool,
    deps: { reports?: ReportsService } = {},
  ) {
    this.reports = deps.reports ?? new ReportsService(pool);
  }

  /** Mask + flag a message body (pure filter). */
  filter(text: string): FilterResult {
    return filterText(text);
  }

  /** Is the user currently under an escalation mute? */
  async isChatMuted(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ perm_muted: boolean; muted_until: Date | null }>(
      `SELECT perm_muted, muted_until FROM chat_offenses WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return false;
    return row.perm_muted || (row.muted_until !== null && row.muted_until > new Date());
  }

  /** Record a flagged message and apply escalating auto-mute; a stored letter or message goes to a moderator when it must. */
  async recordOffense(userId: string, flagged?: FlaggedMessage): Promise<OffenseResult> {
    if (flagged) await this.flagForModerator(userId, flagged);
    const inc = await this.pool.query<{ offense_count: number }>(
      `INSERT INTO chat_offenses (user_id, offense_count) VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET offense_count = chat_offenses.offense_count + 1, updated_at = now()
       RETURNING offense_count`,
      [userId],
    );
    const count = inc.rows[0]!.offense_count;

    let mutedUntil: Date | null = null;
    let perm = false;
    if (count >= OFFENSE_PERM) perm = true;
    else if (count >= OFFENSE_24H) mutedUntil = new Date(Date.now() + 24 * 3600 * 1000);
    else if (count >= OFFENSE_1H) mutedUntil = new Date(Date.now() + 3600 * 1000);

    if (perm || mutedUntil) {
      await this.pool.query(
        `UPDATE chat_offenses SET muted_until = $2, perm_muted = $3, updated_at = now() WHERE user_id = $1`,
        [userId, mutedUntil, perm],
      );
    }
    return { count, mutedUntil, perm };
  }

  /**
   * A text flag for a moderator on a letter or private message with sexual words or slurs, or sent to a minor (a teen
   * band's letter, a direct message to a minor, a group with a minor in it); anything else is not flagged at all.
   */
  private async flagForModerator(userId: string, flagged: FlaggedMessage): Promise<void> {
    const category = seriousCategory(flagged.words);
    const reader = minorSql('u');
    const toMinor = {
      dm_message: `SELECT EXISTS (SELECT 1 FROM dm_messages m JOIN users u ON u.id = CASE WHEN m.user_lo = m.sender_id THEN m.user_hi ELSE m.user_lo END
                                   WHERE m.id = $1 AND ${reader}) AS minor`,
      group_message: `SELECT EXISTS (SELECT 1 FROM group_messages m JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id <> m.sender_id
                                      JOIN users u ON u.id = gm.user_id WHERE m.id = $1 AND ${reader}) AS minor`,
      letter: `SELECT EXISTS (SELECT 1 FROM letters l LEFT JOIN users u ON u.id = l.recipient_id
                               WHERE l.id = $1 AND (l.age_band IN ('13-15','16-17') OR ${reader})) AS minor`,
    }[flagged.targetType];
    const minor = (await this.pool.query<{ minor: boolean }>(toMinor, [flagged.id])).rows[0]?.minor === true;
    if (!category && !minor) return;
    await this.pool.query(
      `INSERT INTO moderation_flags (surface, content_type, content_ref, author_id, action, top_category, top_score, scores, model_version, matched, minor_target)
       VALUES ('chat', $1, $2, $3, 'flag', $4, 1, jsonb_build_object($4::text, 1), $5, $6, $7)`,
      [CHAT_FLAG_CONTENT[flagged.targetType], flagged.id, userId, category ?? 'profanity', WORDLIST_MODEL, [...flagged.words], minor],
    );
  }

  /**
   * Report a message through the single report service (reports-service.ts): only a participant may report it, the
   * message is snapshotted with the ten before and five after it (with usernames), and the report joins its case at
   * once. `chat_reports` keeps its history and takes no new rows. Returns the new report's id.
   */
  async report(reporterId: string, messageType: MessageType, messageId: string, reason?: string): Promise<{ id: string }> {
    try {
      const { receipt } = await this.reports.file(reporterId, {
        targetType: messageType === 'dm' ? 'dm_message' : 'group_message',
        targetId: messageId,
        category: 'other',
        note: reason,
      });
      return { id: receipt.report.id };
    } catch (err) {
      if (err instanceof AppError && err.code === 'TARGET_NOT_FOUND') throw new AppError('MESSAGE_NOT_FOUND', 404, 'no such message');
      throw err;
    }
  }

  /** Resolve a report; 'actioned' also records an offense against the author. */
  async resolveReport(reportId: string, action: 'actioned' | 'dismissed', adminId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{ reporter_id: string | null; reported_user_id: string | null; status: string }>(
        `SELECT reporter_id, reported_user_id, status FROM chat_reports WHERE id = $1 FOR UPDATE`,
        [reportId],
      );
      const report = r.rows[0];
      if (!report) throw new AppError('REPORT_NOT_FOUND', 404, 'no such report');
      // nobody decides a report they are part of, on this old route either
      if (report.reported_user_id === adminId || report.reporter_id === adminId) {
        throw new AppError('CONFLICT_OF_INTEREST', 403, 'you are part of this report; another moderator must handle it');
      }
      if (report.status !== 'open') throw new AppError('ALREADY_RESOLVED', 409, 'report already resolved');
      await client.query(
        `UPDATE chat_reports SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`,
        [reportId, action, adminId],
      );
      await client.query('COMMIT');
      if (action === 'actioned' && report.reported_user_id) await this.recordOffense(report.reported_user_id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
