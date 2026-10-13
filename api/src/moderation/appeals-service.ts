import type pg from 'pg';
import {
  APPEAL_WINDOW_DAYS,
  MAX_APPEAL_LEN,
  SANCTION_KINDS,
  stripControlChars,
  type AdminAppealItem,
  type AppealStatus,
  type AppealView,
  type DecideAppealRequest,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { CasesService } from './cases-service.js';
import { restoreContent, type RemovalRecord } from './content-removal.js';
import { appealDecidedNotice } from './notices.js';
import { userHash } from './pseudonym.js';
import {
  deliverNotice,
  logAdminAction,
  toAppealView,
  toSanctionView,
  type AppealRow,
  type SanctionRow,
  type SanctionsService,
} from './sanctions-service.js';
import { inTransaction } from './tx.js';

/**
 * Asking for a review, and answering.
 *
 * Anyone sanctioned can ask once per decision, for six months (DSA Art. 20,
 * UK OSA appeals), and so can a reporter whose report was found not to break
 * the rules. The review is done by a different admin from the one who decided,
 * whenever there is one (Santa Clara: someone not involved); a lone admin may
 * review their own decision, and must say why.
 *
 * - upheld: nothing changes; the person is told.
 * - overturned: the sanction is lifted (an overturned removal puts the content
 *   back), the person is told; for a reporter's appeal the case goes back to
 *   the queue.
 * - modified: the sanction is replaced by a lighter (or different) one.
 */

export type DecideAppealInput = DecideAppealRequest;

function cleanText(text: string, max: number): string {
  return [...stripControlChars(text).trim()].slice(0, max).join('').trim();
}

export class AppealsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sanctions: SanctionsService,
    private readonly cases: CasesService,
  ) {}

  /** File an appeal about one of your sanctions, or about a report of yours that was turned down. */
  async file(userId: string, input: { sanctionId?: string; caseId?: string; text: string }): Promise<AppealView> {
    if (!input.sanctionId === !input.caseId) {
      throw new AppError('APPEAL_SUBJECT', 400, 'appeal one sanction or one report decision');
    }
    const text = cleanText(input.text, MAX_APPEAL_LEN);
    if (!text) throw new AppError('APPEAL_TEXT_REQUIRED', 400, 'tell us why you think we got it wrong');
    const windowMs = APPEAL_WINDOW_DAYS * 86_400_000;

    if (input.sanctionId) {
      const s = await this.pool.query<{ created_at: Date; revoked_at: Date | null; pending_approval: boolean }>(
        `SELECT created_at, revoked_at, pending_approval FROM sanctions WHERE id = $1 AND user_id = $2`,
        [input.sanctionId, userId],
      );
      const row = s.rows[0];
      if (!row || row.pending_approval) throw new AppError('NOT_FOUND', 404, 'no such decision on your account');
      if (row.revoked_at) throw new AppError('NOTHING_TO_APPEAL', 409, 'this was already lifted');
      if (row.created_at.getTime() + windowMs < Date.now()) {
        throw new AppError('APPEAL_WINDOW_CLOSED', 409, 'the six months to ask for a review have passed');
      }
    } else {
      const r = await this.pool.query<{ closed_at: Date | null }>(
        `SELECT max(closed_at) AS closed_at FROM reports WHERE case_id = $1 AND reporter_id = $2 AND status = 'no_violation'`,
        [input.caseId, userId],
      );
      const closedAt = r.rows[0]?.closed_at;
      if (!closedAt) throw new AppError('NOT_FOUND', 404, 'no such decision on a report of yours');
      if (closedAt.getTime() + windowMs < Date.now()) {
        throw new AppError('APPEAL_WINDOW_CLOSED', 409, 'the six months to ask for a review have passed');
      }
    }

    try {
      const res = await this.pool.query<AppealRow>(
        `INSERT INTO appeals (sanction_id, case_id, user_id, user_hash, text) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.sanctionId ?? null, input.sanctionId ? null : input.caseId, userId, userHash(userId), text],
      );
      return toAppealView(res.rows[0]!);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('ALREADY_APPEALED', 409, 'you have already asked for a review of this decision');
      }
      throw err;
    }
  }

  /** The admin's list, oldest first so the longest-waiting are answered first. */
  async list(status: AppealStatus | 'all' = 'open', limit = 100): Promise<AdminAppealItem[]> {
    const r = await this.pool.query<AppealRow & { username: string | null; decider: string | null }>(
      `SELECT a.*, u.username,
              COALESCE(s.created_by, c.resolved_by) AS decider
         FROM appeals a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN sanctions s ON s.id = a.sanction_id
         LEFT JOIN moderation_cases c ON c.id = a.case_id
        WHERE ($1::text = 'all' OR a.status = $1)
        ORDER BY a.created_at
        LIMIT $2`,
      [status, Math.min(Math.max(limit, 1), 200)],
    );
    const sanctionIds = r.rows.map((a) => a.sanction_id).filter((x): x is string => x !== null);
    const sanctions = sanctionIds.length
      ? await this.pool.query<SanctionRow>(`SELECT * FROM sanctions WHERE id = ANY($1::uuid[])`, [sanctionIds])
      : { rows: [] as SanctionRow[] };
    const byId = new Map(sanctions.rows.map((s) => [s.id, toSanctionView(s)]));
    return r.rows.map((a) => ({
      ...toAppealView(a),
      user: a.user_id && a.username ? { id: a.user_id, username: a.username } : null,
      sanction: a.sanction_id ? byId.get(a.sanction_id) ?? null : null,
      originalDeciderId: a.decider,
    }));
  }

  async decide(appealId: string, adminId: string, input: DecideAppealInput): Promise<AppealView> {
    const note = cleanText(input.note, 2000);
    if (!note) throw new AppError('NOTE_REQUIRED', 400, 'say why — the person reads this');
    const reopenCase: { id: string | null } = { id: null };

    const view = await inTransaction(this.pool, async (client) => {
      const found = await client.query<AppealRow>(`SELECT * FROM appeals WHERE id = $1 FOR UPDATE`, [appealId]);
      const appeal = found.rows[0];
      if (!appeal) throw new AppError('NOT_FOUND', 404, 'no such appeal');
      if (appeal.status !== 'open') throw new AppError('ALREADY_DECIDED', 409, 'this appeal was already answered');

      // the person first, then their sanction (the sanctions service's lock order)
      if (appeal.sanction_id) await this.sanctions.lockOwnerOf(client, appeal.sanction_id);
      const sanction = appeal.sanction_id
        ? (await client.query<SanctionRow>(`SELECT * FROM sanctions WHERE id = $1 FOR UPDATE`, [appeal.sanction_id])).rows[0] ?? null
        : null;
      const decided = appeal.case_id
        ? (await client.query<{ resolved_by: string | null; removed_content: RemovalRecord | null }>(
            `SELECT resolved_by, removed_content FROM moderation_cases WHERE id = $1`,
            [appeal.case_id],
          )).rows[0] ?? null
        : null;
      // never your own appeal, nor one from a case you are part of (as the
      // reported person or a reporter)
      if (appeal.user_id === adminId) throw new AppError('CONFLICT_OF_INTEREST', 403, 'you cannot review your own appeal');
      const caseId = sanction?.case_id ?? appeal.case_id;
      const related = caseId ? await this.cases.find(client, caseId) : null;
      if (related) await this.cases.assertNotParty(client, related, adminId);

      const decider = sanction?.created_by ?? decided?.resolved_by ?? null;
      // someone not involved reviews it, whenever there is someone else
      if (decider === adminId && (await this.sanctions.moderatorCount()) >= 2) {
        throw new AppError('DIFFERENT_ADMIN_REQUIRED', 403, 'another admin has to review your own decision');
      }

      if (input.outcome === 'modified') {
        if (!sanction) throw new AppError('CANNOT_MODIFY', 422, 'only a sanction can be modified');
        const m = input.modifiedSanction;
        if (!m || !(SANCTION_KINDS as readonly string[]).includes(m.kind)) {
          throw new AppError('MODIFIED_SANCTION_REQUIRED', 400, 'say what the sanction becomes');
        }
        // a review lightens or changes a decision; it is not a way around the
        // second-admin rule for a permanent ban
        if (m.kind === 'permanent_ban') throw new AppError('CANNOT_MODIFY', 422, 'a permanent ban is decided on the case, not on appeal');
      }

      if ((input.outcome === 'overturned' || input.outcome === 'modified') && sanction && !sanction.revoked_at) {
        await this.sanctions.revoke(client, sanction.id, adminId, `appeal ${input.outcome}: ${note}`, { notify: false });
      }
      if (input.outcome === 'overturned' && sanction?.kind === 'content_removal' && sanction.case_id) {
        // the removal was wrong: the content comes back. Only for the removal
        // itself — overturning a mute that came with it lifts the mute and
        // leaves the removal standing, and a CSAM ban (which has no removal of
        // its own) never brings its content back by itself.
        const c = await client.query<{ removed_content: RemovalRecord | null }>(
          `SELECT removed_content FROM moderation_cases WHERE id = $1 FOR UPDATE`,
          [sanction.case_id],
        );
        const removed = c.rows[0]?.removed_content;
        if (removed) {
          await restoreContent(client, removed);
          await client.query(`UPDATE moderation_cases SET removed_content = NULL, resolution_note = $2 WHERE id = $1`, [
            sanction.case_id,
            `Overturned on appeal: ${note}`,
          ]);
        }
      }
      if (input.outcome === 'modified' && sanction && sanction.user_id && input.modifiedSanction) {
        await this.sanctions.apply(client, {
          userId: sanction.user_id,
          kind: input.modifiedSanction.kind,
          policy: sanction.policy,
          statement: input.modifiedSanction.statement,
          durationHours: input.modifiedSanction.durationHours ?? null,
          caseId: sanction.case_id,
          createdBy: adminId,
          origin: sanction.origin,
          internalNote: `replaces ${sanction.id} after appeal ${appeal.id}`,
          meta: { replaces: sanction.id, appealId: appeal.id },
        });
      }
      if (input.outcome === 'overturned' && !sanction && appeal.case_id) reopenCase.id = appeal.case_id;

      const updated = await client.query<AppealRow>(
        `UPDATE appeals SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1 RETURNING *`,
        [appealId, input.outcome, adminId, note],
      );
      await logAdminAction(client, {
        targetUserId: appeal.user_id,
        adminId,
        action: 'appeal_decision',
        reason: note,
        caseId: sanction?.case_id ?? appeal.case_id,
        sanctionId: sanction?.id ?? null,
        policy: sanction?.policy ?? null,
        before: { appeal: 'open', sanctionRevoked: sanction?.revoked_at !== null && sanction?.revoked_at !== undefined },
        after: { appeal: input.outcome },
        meta: { decider, selfReview: decider === adminId },
      });
      if (appeal.user_id) await deliverNotice(client, appeal.user_id, appealDecidedNotice(appeal.id, input.outcome, note));
      return toAppealView(updated.rows[0]!);
    });

    // a reporter's appeal upheld in their favour: the case gets a second look
    if (reopenCase.id) {
      await this.cases.reopen(reopenCase.id, adminId, `reporter's appeal ${appealId} overturned the decision`).catch((err) => {
        // an open case about the same thing already exists: that one is the second look
        if (!(err instanceof AppError && (err.code === 'OPEN_CASE_EXISTS' || err.code === 'CASE_OPEN'))) throw err;
      });
    }
    return view;
  }
}
