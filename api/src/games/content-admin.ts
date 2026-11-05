/**
 * The learning games' own content in the admin panel: rows written, imported,
 * reviewed and published the way stories are.
 *
 *   draft ──submit──▶ in_review ──publish──▶ published ──unpublish──▶ draft
 *     └──────────────publish──────────────────▲      any ──archive──▶ archived
 *
 * A draft or a row in review can be edited; a published one is unpublished
 * first, so what learners meet is always exactly what was published. Every
 * change names the `lockVersion` the editor loaded, and a stale one is refused
 * (409 STALE). A reviewer approves a row and only an approved row is published
 * (409 NOT_REVIEWED; the table checks it too); a change to its content — the
 * payload or its level — sends an approved row back to unreviewed.
 *
 * What may be stored is `checkGameContent` (@kurda/shared): the kind's schema,
 * and every Kurdish text in the row's own variety's script. A row that fails
 * is refused with 422 INVALID and its issues, each with a path.
 *
 * The importers make drafts from what is already approved, so no Kurdish is
 * typed again: published lessons' sentences become `sentence` rows, published
 * stories' paragraphs `passage` rows (their glossary terms the words to hide).
 * An import run twice adds nothing: each row remembers where it came from
 * (`origin`, unique per kind and variety).
 *
 * Reviewing, publishing, unpublishing, archiving, deleting and importing are
 * audited, the row before and after, beside the automatic audit of every
 * admin call.
 */
import type pg from 'pg';
import {
  GAME_LEVELS,
  LEARN_GAMES,
  PASSAGE_HIDDEN,
  checkGameContent,
  contentHeadline,
  gameOfKind,
  sentenceShape,
  type AdminGameContent,
  type GameContentIssue,
  type GameContentKind,
  type GameContentReadiness,
  type GameContentPayload,
  type GameContentReview,
  type GameContentSource,
  type GameContentStatus,
  type GameDialect,
  type Meanings,
} from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import type { Cache } from '../cache/cache.js';
import { escapeLike } from '../db/like.js';
import { AppError } from '../plugins/errors.js';
import { bustAvailability, type GameAvailabilityService } from './availability.js';
import { bustGamePools, type TrustedSources } from './sources.js';

/** A row as the admin panel lists and edits it (@kurda/shared `AdminGameContent`). */
export type GameContentRow = AdminGameContent;

export interface GameContentFilter {
  game?: string;
  kind?: GameContentKind;
  dialect?: GameDialect;
  level?: number;
  status?: GameContentStatus;
  review?: GameContentReview;
  source?: GameContentSource;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ActionContext {
  adminId: string;
  requestId?: string | null;
}

export type Transition = 'submit' | 'publish' | 'unpublish' | 'archive';

const TRANSITIONS: Record<Transition, { from: readonly GameContentStatus[]; to: GameContentStatus }> = {
  submit: { from: ['draft'], to: 'in_review' },
  // one editor who is also the reviewer may publish a draft straight away, once it is approved
  publish: { from: ['draft', 'in_review'], to: 'published' },
  unpublish: { from: ['published'], to: 'draft' },
  archive: { from: ['draft', 'in_review', 'published'], to: 'archived' },
};

const DONE: Record<Transition, string> = { submit: 'submitted for review', publish: 'published', unpublish: 'unpublished', archive: 'archived' };

export const ADMIN_LIST_MAX = 100;

interface Row {
  id: string;
  kind: GameContentKind;
  dialect: GameDialect;
  level: number;
  payload: GameContentPayload;
  status: GameContentStatus;
  review_status: GameContentReview;
  reviewed_by: string | null;
  reviewer_username: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  source: GameContentSource;
  origin: string | null;
  lock_version: number;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `c.id, c.kind, c.dialect, c.level, c.payload, c.status, c.review_status, c.reviewed_by, ru.username AS reviewer_username,
  c.reviewed_at, c.review_note, c.source, c.origin, c.lock_version, c.published_at, c.created_at, c.updated_at`;
const FROM = `FROM game_content c LEFT JOIN users ru ON ru.id = c.reviewed_by`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shape(row: Row): GameContentRow {
  const checked = checkGameContent(row.kind, row.dialect, row.payload);
  return {
    id: row.id,
    kind: row.kind,
    game: gameOfKind(row.kind)?.id ?? null,
    dialect: row.dialect,
    level: row.level,
    payload: row.payload,
    headline: checked.ok ? contentHeadline(row.kind, checked.payload) : '',
    status: row.status,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by ? { id: row.reviewed_by, username: row.reviewer_username } : null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewNote: row.review_note,
    source: row.source,
    origin: row.origin,
    lockVersion: row.lock_version,
    publishedAt: row.published_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    issues: checked.ok ? [] : checked.issues,
  };
}

/** A payload in one fixed order — jsonb does not keep key order — for telling whether a save changed what a reviewer read. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function invalid(issues: GameContentIssue[]): AppError {
  const n = issues.length;
  return new AppError('INVALID', 422, `the content has ${n} problem${n === 1 ? '' : 's'} to fix first`, { errors: issues });
}

function levelOk(level: number): boolean {
  return (GAME_LEVELS as readonly number[]).includes(level);
}

/** What one import added and what it found already there. */
export interface ImportResult {
  created: number;
  skipped: number;
}

/** The readiness view (@kurda/shared `GameContentReadiness`). */
export type Readiness = GameContentReadiness;

export class GameContentAdminService {
  private readonly audit: AuditService;

  constructor(
    private readonly pool: pg.Pool,
    private readonly sources: TrustedSources,
    private readonly availability: GameAvailabilityService,
    private readonly cache: Cache | null = null,
  ) {
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

  /** What learners can be shown changed: every pool and availability count is read afresh. */
  private async liveChanged(): Promise<void> {
    await bustGamePools(this.cache);
    await bustAvailability(this.cache);
  }

  async list(filter: GameContentFilter = {}): Promise<{ rows: GameContentRow[]; total: number }> {
    const limit = Math.min(ADMIN_LIST_MAX, Math.max(1, filter.limit ?? 50));
    const offset = Math.max(0, filter.offset ?? 0);
    const kinds = filter.game ? (LEARN_GAMES.find((g) => g.id === filter.game)?.contentKinds ?? []) : null;
    const q = filter.q?.trim();
    const res = await this.pool.query<Row & { total: number }>(
      `SELECT ${COLUMNS}, (count(*) OVER ())::int AS total ${FROM}
        WHERE ($1::text[] IS NULL OR c.kind = ANY($1)) AND ($2::text IS NULL OR c.kind = $2)
          AND ($3::text IS NULL OR c.dialect = $3) AND ($4::smallint IS NULL OR c.level = $4)
          AND ($5::text IS NULL OR c.status = $5) AND ($6::text IS NULL OR c.review_status = $6)
          AND ($7::text IS NULL OR c.source = $7) AND ($8::text IS NULL OR c.payload::text ILIKE $8)
        ORDER BY c.updated_at DESC, c.id
        LIMIT $9 OFFSET $10`,
      [
        kinds,
        filter.kind ?? null,
        filter.dialect ?? null,
        filter.level ?? null,
        filter.status ?? null,
        filter.review ?? null,
        filter.source ?? null,
        q ? `%${escapeLike(q)}%` : null,
        limit,
        offset,
      ],
    );
    return { rows: res.rows.map(shape), total: res.rows[0]?.total ?? 0 };
  }

  async get(id: string, db: Pick<pg.Pool, 'query'> = this.pool): Promise<GameContentRow | null> {
    if (!UUID_RE.test(id)) return null;
    const res = await db.query<Row>(`SELECT ${COLUMNS} ${FROM} WHERE c.id = $1`, [id]);
    return res.rows[0] ? shape(res.rows[0]) : null;
  }

  async create(input: { kind: GameContentKind; dialect: GameDialect; level: number; payload: unknown }, ctx: ActionContext): Promise<GameContentRow> {
    if (!levelOk(input.level)) throw invalid([{ path: 'level', message: 'a level is 1 to 5' }]);
    const checked = checkGameContent(input.kind, input.dialect, input.payload);
    if (!checked.ok) throw invalid(checked.issues);
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO game_content (kind, dialect, level, payload, source, created_by, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, 'admin', $5, $5) RETURNING id`,
      [input.kind, input.dialect, input.level, JSON.stringify(checked.payload), ctx.adminId],
    );
    return (await this.get(res.rows[0]!.id))!;
  }

  /** The row under FOR UPDATE, after the checks every change shares: 404, and 409 STALE for an older copy. */
  private async lock(db: pg.PoolClient, id: string, lockVersion: number): Promise<Row> {
    if (!UUID_RE.test(id)) throw new AppError('NOT_FOUND', 404, 'no such content');
    const res = await db.query<Row>(
      `SELECT c.*, NULL::text AS reviewer_username FROM game_content c WHERE c.id = $1 FOR UPDATE`,
      [id],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such content');
    if (row.lock_version !== lockVersion) throw new AppError('STALE', 409, 'someone else changed this since you opened it — reload it first');
    return row;
  }

  /** Replace a draft's (or a row in review's) payload and level. A change to approved content takes the approval away. */
  async update(id: string, input: { level: number; payload: unknown; lockVersion: number }, ctx: ActionContext): Promise<GameContentRow> {
    await this.tx(async (client) => {
      const row = await this.lock(client, id, input.lockVersion);
      if (row.status !== 'draft' && row.status !== 'in_review') {
        throw new AppError('NOT_EDITABLE', 409, row.status === 'published' ? 'unpublish it before editing it' : 'archived content cannot be edited');
      }
      if (!levelOk(input.level)) throw invalid([{ path: 'level', message: 'a level is 1 to 5' }]);
      const checked = checkGameContent(row.kind, row.dialect, input.payload);
      if (!checked.ok) throw invalid(checked.issues);
      const changed = row.level !== input.level || canonical(row.payload) !== canonical(checked.payload);
      const reset = changed && row.review_status === 'approved';
      await client.query(
        `UPDATE game_content SET level = $2, payload = $3::jsonb, lock_version = lock_version + 1, updated_by = $4
                ${reset ? `, review_status = 'unreviewed', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL` : ''}
          WHERE id = $1`,
        [id, input.level, JSON.stringify(checked.payload), ctx.adminId],
      );
    });
    return (await this.get(id))!;
  }

  async transition(id: string, action: Transition, ctx: ActionContext & { lockVersion: number }): Promise<GameContentRow> {
    const rule = TRANSITIONS[action];
    const live = await this.tx(async (client) => {
      const row = await this.lock(client, id, ctx.lockVersion);
      if (!rule.from.includes(row.status)) {
        throw new AppError('BAD_STATE', 409, `content that is ${row.status.replace('_', ' ')} cannot be ${DONE[action]}`);
      }
      const publishing = rule.to === 'published';
      if (rule.to === 'in_review' || publishing) {
        const checked = checkGameContent(row.kind, row.dialect, row.payload);
        if (!checked.ok) throw invalid(checked.issues);
      }
      if (publishing && row.review_status !== 'approved') {
        throw new AppError('NOT_REVIEWED', 409, 'a reviewer has to approve this before it is published');
      }
      const after = await client.query<{ lock_version: number }>(
        `UPDATE game_content SET status = $2, lock_version = lock_version + 1, updated_by = $3
                ${publishing ? ', published_by = $3, published_at = now()' : ''}
          WHERE id = $1 RETURNING lock_version`,
        [id, rule.to, ctx.adminId],
      );
      if (action !== 'submit') {
        const state = (status: GameContentStatus, lockVersion: number) =>
          status === 'published' || row.status === 'published'
            ? { status, kind: row.kind, dialect: row.dialect, level: row.level, payload: row.payload, lockVersion }
            : { status, kind: row.kind, lockVersion };
        await this.audit.record(client, {
          adminId: ctx.adminId,
          action: `game_content.${action}`,
          targetType: 'game_content',
          targetId: id,
          before: state(row.status, row.lock_version),
          after: state(rule.to, after.rows[0]!.lock_version),
          requestId: ctx.requestId ?? null,
        });
      }
      return row.status === 'published' || publishing;
    });
    if (live) await this.liveChanged();
    return (await this.get(id))!;
  }

  /** Approve, or withdraw approval (refused while it is published: unpublish it first), with a note. */
  async review(id: string, input: { approved: boolean; note?: string | null }, ctx: ActionContext & { lockVersion: number }): Promise<GameContentRow> {
    await this.tx(async (client) => {
      const row = await this.lock(client, id, ctx.lockVersion);
      if (row.status === 'archived') throw new AppError('BAD_STATE', 409, 'archived content is not reviewed');
      if (!input.approved && row.status === 'published') throw new AppError('BAD_STATE', 409, 'unpublish it before withdrawing its approval');
      if (input.approved) {
        const checked = checkGameContent(row.kind, row.dialect, row.payload);
        if (!checked.ok) throw invalid(checked.issues);
      }
      const status: GameContentReview = input.approved ? 'approved' : 'unreviewed';
      const note = input.note?.trim() || null;
      const after = await client.query<{ lock_version: number }>(
        `UPDATE game_content SET review_status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4,
                lock_version = lock_version + 1, updated_by = $3
          WHERE id = $1 RETURNING lock_version`,
        [id, status, ctx.adminId, note],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'game_content.review',
        targetType: 'game_content',
        targetId: id,
        before: { reviewStatus: row.review_status, reviewNote: row.review_note, lockVersion: row.lock_version },
        after: { reviewStatus: status, reviewNote: note, lockVersion: after.rows[0]!.lock_version, payload: row.payload, level: row.level },
        requestId: ctx.requestId ?? null,
      });
    });
    return (await this.get(id))!;
  }

  /** Delete a row that is not live (a published one is unpublished first). Audited with the whole row. */
  async delete(id: string, ctx: ActionContext & { lockVersion: number }): Promise<void> {
    await this.tx(async (client) => {
      const row = await this.lock(client, id, ctx.lockVersion);
      if (row.status === 'published') throw new AppError('BAD_STATE', 409, 'unpublish it before deleting it');
      await client.query(`DELETE FROM game_content WHERE id = $1`, [id]);
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'game_content.delete',
        targetType: 'game_content',
        targetId: id,
        before: { kind: row.kind, dialect: row.dialect, level: row.level, payload: row.payload, status: row.status, origin: row.origin },
        after: null,
        requestId: ctx.requestId ?? null,
      });
    });
  }

  /** Drafts made of approved Kurdish, written in one statement each; a row that came from the same place before is skipped. */
  private async insertDrafts(
    kind: GameContentKind,
    dialect: GameDialect,
    drafts: Array<{ level: number; payload: GameContentPayload; origin: string }>,
    ctx: ActionContext,
    what: string,
  ): Promise<ImportResult> {
    if (drafts.length === 0) return { created: 0, skipped: 0 };
    return this.tx(async (client) => {
      const res = await client.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, source, origin, created_by, updated_by)
         SELECT $1::text, $2::text, d.level, d.payload, 'admin', d.origin, $4::uuid, $4::uuid
           FROM jsonb_to_recordset($3::jsonb) AS d(level smallint, payload jsonb, origin text)
         ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING
         RETURNING id`,
        [kind, dialect, JSON.stringify(drafts), ctx.adminId],
      );
      const created = res.rowCount ?? 0;
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'game_content.import',
        targetType: 'game_content',
        targetId: null,
        before: null,
        after: { kind, dialect, from: what, created, skipped: drafts.length - created },
        requestId: ctx.requestId ?? null,
      });
      return { created, skipped: drafts.length - created };
    });
  }

  /**
   * Published lessons' sentences as `sentence` drafts, with the English and
   * the orders they accept, on the level their shape gives them. Only those
   * `checkGameContent` would store.
   */
  async importLessonSentences(dialect: GameDialect, ctx: ActionContext, limit = 500): Promise<ImportResult> {
    const sentences = (await this.sources.lessonSentences(dialect)).slice(0, limit);
    const drafts: Array<{ level: number; payload: GameContentPayload; origin: string }> = [];
    for (const s of sentences) {
      const payload = { ku: s.ku, meanings: s.meaning, orders: s.orders.slice(1), origin: { type: s.origin.startsWith('conversation') ? 'conversation' : 'lesson', ref: s.origin.split(':').slice(1).join(':') } };
      const checked = checkGameContent('sentence', dialect, payload);
      if (checked.ok) drafts.push({ level: sentenceShape(s.ku, s.meaning.en, dialect).level, payload: checked.payload, origin: s.origin });
    }
    return this.insertDrafts('sentence', dialect, drafts, ctx, 'published lessons');
  }

  /**
   * Published stories' paragraphs as `passage` drafts: the paragraph, and as
   * the words that vanish the glossary terms it holds (two to six), each with
   * the meanings the story's glossary gives it.
   */
  async importStoryPassages(dialect: GameDialect, ctx: ActionContext, limit = 500): Promise<ImportResult> {
    const passages = (await this.sources.storyPassages(dialect)).filter((p) => p.glossary.length >= PASSAGE_HIDDEN.min).slice(0, limit);
    const drafts: Array<{ level: number; payload: GameContentPayload; origin: string }> = [];
    for (const p of passages) {
      const hidden = p.glossary
        .filter((g) => typeof g.meanings.en === 'string' && g.meanings.en.trim() !== '')
        .slice(0, PASSAGE_HIDDEN.max)
        .map((g) => ({ term: g.term, meanings: g.meanings as Meanings }));
      const payload = { title: p.title, text: p.text, hidden, origin: { type: 'story', ref: `${p.storyId}:${p.paragraph}` } };
      const checked = checkGameContent('passage', dialect, payload);
      if (checked.ok) drafts.push({ level: Math.min(5, Math.max(1, p.level)), payload: checked.payload, origin: `story:${p.storyId}:${p.paragraph}` });
    }
    return this.insertDrafts('passage', dialect, drafts, ctx, 'published stories');
  }

  /** Readiness: what each game can be played with now, per variety, and every row's state. */
  async readiness(): Promise<Readiness> {
    const [kmr, ckb, counts] = await Promise.all([
      this.availability.forDialect('kmr'),
      this.availability.forDialect('ckb'),
      this.pool.query<{ kind: GameContentKind; dialect: GameDialect; status: GameContentStatus; review_status: GameContentReview; n: number }>(
        `SELECT kind, dialect, status, review_status, count(*)::int AS n FROM game_content GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`,
      ),
    ]);
    return {
      availability: [kmr, ckb],
      counts: counts.rows.map((r) => ({ kind: r.kind, dialect: r.dialect, status: r.status, reviewStatus: r.review_status, n: r.n })),
    };
  }
}
