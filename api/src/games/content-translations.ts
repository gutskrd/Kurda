/**
 * Riddle and proverb translations in the admin panel, one language at a time (`game_content_translations`,
 * shared/src/lore.ts):
 *
 *   PUT  /admin/game-content/:id/translations/:locale          { payload }          (content.edit)
 *   POST /admin/game-content/:id/translations/:locale/review   { status, note? }    (content.publish)
 *
 * A row's Kurdish is reviewed and approved as a whole (content-admin.ts), but each translation language has its own
 * review, so a translation can be corrected on a row in any state but archived, published included, without
 * unpublishing, moving the lock version or touching the approval. A changed translation is marked unreviewed in that
 * language only; an unchanged save keeps its review.
 *
 * Learners get every language a row has regardless of review (the review records who read which language). What may be
 * stored is `checkLoreTranslation`: the kind's fields, never the row's own language, the two Kurdish interface
 * languages in their own scripts, and a riddle's hints one for one.
 *
 * Both changes are audited with the language's text before and after, beside the audit of every admin call.
 */
import type pg from 'pg';
import {
  checkLoreTranslation,
  isLoreKind,
  type AdminContentTranslation,
  type AppLocale,
  type GameContentKind,
  type GameDialect,
  type LoreTranslation,
  type RiddleContent,
  type TranslationReview,
} from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import { AppError } from '../plugins/errors.js';
import { canonical } from './content-admin.js';

interface TranslationRow {
  locale: AppLocale;
  payload: LoreTranslation;
  review_status: TranslationReview;
  reviewed_by: string | null;
  reviewer_username: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  updated_at: Date;
}

/** What a translation is checked against: the row's kind, its variety, and for a riddle how many hints it has. */
export interface TranslatedRow {
  kind: GameContentKind;
  dialect: GameDialect;
  payload: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hintsOf(row: TranslatedRow): number | undefined {
  return row.kind === 'riddle' ? ((row.payload as Partial<RiddleContent>).hints?.length ?? 0) : undefined;
}

function shape(row: TranslatedRow, t: TranslationRow): AdminContentTranslation {
  const checked = isLoreKind(row.kind) ? checkLoreTranslation(row.kind, { dialect: row.dialect, hints: hintsOf(row) }, t.locale, t.payload) : null;
  return {
    payload: t.payload,
    reviewStatus: t.review_status,
    reviewedBy: t.reviewed_by ? { id: t.reviewed_by, username: t.reviewer_username } : null,
    reviewedAt: t.reviewed_at?.toISOString() ?? null,
    reviewNote: t.review_note,
    updatedAt: t.updated_at.toISOString(),
    issues: checked && !checked.ok ? checked.issues : [],
  };
}

function invalid(issues: Array<{ path: string; message: string }>): AppError {
  const n = issues.length;
  return new AppError('INVALID', 422, `the translation has ${n} problem${n === 1 ? '' : 's'} to fix first`, { errors: issues });
}

export class GameContentTranslations {
  private readonly audit: AuditService;

  constructor(private readonly pool: pg.Pool) {
    this.audit = new AuditService(pool);
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Every language a row is translated into, as the admin panel shows it. */
  async forRow(id: string, row: TranslatedRow, db: Pick<pg.Pool, 'query'> = this.pool): Promise<Partial<Record<AppLocale, AdminContentTranslation>>> {
    const res = await db.query<TranslationRow>(
      `SELECT t.locale, t.payload, t.review_status, t.reviewed_by, u.username AS reviewer_username, t.reviewed_at, t.review_note, t.updated_at
         FROM game_content_translations t LEFT JOIN users u ON u.id = t.reviewed_by
        WHERE t.content_id = $1 ORDER BY t.locale`,
      [id],
    );
    return Object.fromEntries(res.rows.map((t) => [t.locale, shape(row, t)]));
  }

  /**
   * The row a translation belongs to, locked against Kurdish changes while the translation is checked against it (a
   * riddle's hints): 404, or 409 for a kind without translations or an archived row.
   */
  private async owner(client: pg.PoolClient, id: string): Promise<TranslatedRow & { status: string }> {
    if (!UUID_RE.test(id)) throw new AppError('NOT_FOUND', 404, 'no such content');
    const res = await client.query<TranslatedRow & { status: string }>(`SELECT kind, dialect, payload, status FROM game_content WHERE id = $1 FOR SHARE`, [id]);
    const row = res.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such content');
    if (!isLoreKind(row.kind)) throw new AppError('NO_TRANSLATIONS', 409, 'this kind of content has its meanings in its own fields, not translations');
    if (row.status === 'archived') throw new AppError('BAD_STATE', 409, 'archived content is not translated');
    return row;
  }

  private async current(db: Pick<pg.Pool, 'query'>, id: string, locale: AppLocale): Promise<TranslationRow | null> {
    const res = await db.query<TranslationRow>(
      `SELECT t.locale, t.payload, t.review_status, t.reviewed_by, u.username AS reviewer_username, t.reviewed_at, t.review_note, t.updated_at
         FROM game_content_translations t LEFT JOIN users u ON u.id = t.reviewed_by
        WHERE t.content_id = $1 AND t.locale = $2`,
      [id, locale],
    );
    return res.rows[0] ?? null;
  }

  /** Write one language's translation; a changed one is unreviewed again, in that language only. */
  async save(id: string, locale: AppLocale, payload: unknown, ctx: { adminId: string; requestId?: string | null }): Promise<void> {
    await this.tx(async (client) => {
      const row = await this.owner(client, id);
      if (!isLoreKind(row.kind)) return;
      const checked = checkLoreTranslation(row.kind, { dialect: row.dialect, hints: hintsOf(row) }, locale, payload);
      if (!checked.ok) throw invalid(checked.issues);
      const before = await this.current(client, id, locale);
      if (before && canonical(before.payload) === canonical(checked.payload)) return;
      await client.query(
        `INSERT INTO game_content_translations (content_id, locale, payload, updated_by, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, now())
         ON CONFLICT (content_id, locale) DO UPDATE SET
           payload = EXCLUDED.payload, updated_by = EXCLUDED.updated_by, updated_at = now(),
           review_status = 'unreviewed', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL`,
        [id, locale, JSON.stringify(checked.payload), ctx.adminId],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'game_content.translation',
        targetType: 'game_content',
        targetId: id,
        before: before ? { locale, payload: before.payload, reviewStatus: before.review_status } : null,
        after: { locale, payload: checked.payload, reviewStatus: 'unreviewed' },
        requestId: ctx.requestId ?? null,
      });
    });
  }

  /** Mark one language read (or needing another look), with a note. */
  async review(
    id: string,
    locale: AppLocale,
    input: { status: TranslationReview; note?: string | null },
    ctx: { adminId: string; requestId?: string | null },
  ): Promise<void> {
    await this.tx(async (client) => {
      const row = await this.owner(client, id);
      const before = await this.current(client, id, locale);
      if (!before) throw new AppError('NOT_FOUND', 404, 'there is no translation in this language yet');
      if (input.status === 'reviewed' && isLoreKind(row.kind)) {
        // a riddle whose hints changed since is read again once its translation matches them
        const checked = checkLoreTranslation(row.kind, { dialect: row.dialect, hints: hintsOf(row) }, locale, before.payload);
        if (!checked.ok) throw invalid(checked.issues);
      }
      const note = input.note?.trim() || null;
      await client.query(
        `UPDATE game_content_translations SET review_status = $3, reviewed_by = $4, reviewed_at = now(), review_note = $5
          WHERE content_id = $1 AND locale = $2`,
        [id, locale, input.status, ctx.adminId, note],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'game_content.translation_review',
        targetType: 'game_content',
        targetId: id,
        before: { locale, reviewStatus: before.review_status, reviewNote: before.review_note },
        after: { locale, reviewStatus: input.status, reviewNote: note, payload: before.payload },
        requestId: ctx.requestId ?? null,
      });
    });
  }
}
