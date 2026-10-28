/**
 * Writing stories in the admin panel: drafts, review, publishing.
 *
 *   draft ──submit──▶ in_review ──publish──▶ published ──unpublish──▶ draft
 *     └──────────────publish──────────────────▲      any ──archive──▶ archived
 *
 * A draft or a story in review can be edited; a published one is unpublished
 * first (it leaves the hub at once — games already under way keep their own
 * copy), so what learners read is always exactly what someone published.
 * Every change carries the `lockVersion` the editor loaded, and a stale one is
 * refused, so two editors cannot silently overwrite each other.
 *
 * `validateStory` (@kurda/shared) decides what may be saved: at the draft
 * stage an unfinished story is fine (no text yet, between lengths, too few
 * questions), anything broken is not; submitting and publishing require the
 * whole story. The importer and the starter seeding go through `saveStory`
 * below, so all three write a story the same way.
 *
 * Publishing, unpublishing, archiving and deleting are audited with the story
 * before and after — the whole of it, text and questions, on the side where it
 * is live — beside the automatic one-line audit of every admin call.
 */
import type pg from 'pg';
import {
  readingMinutes,
  storySlugFor,
  validateStory,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryInput,
  type StoryLength,
  type StoryQuestionInput,
  type StoryValidation,
} from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import type { Cache } from '../cache/cache.js';
import { AppError } from '../plugins/errors.js';
import { STORY_ORDER_SQL, UUID_RE, bustStoryLists, storyTextFacts, type Executor, type QuestionRow } from './service.js';

export type StoryStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type StorySource = 'admin' | 'starter';

/** Who writes stories: whoever edits lessons and records their audio (the routes and the import command ask for it). */
export const STORY_EDITOR_ROLES = ['superadmin', 'content_editor', 'admin'] as const;

/** A story as an editor sends it: everything, every time (PUT replaces the whole draft). */
export interface StoryDraft extends StoryInput {
  slug: string;
}

export interface AdminStoryQuestion extends StoryQuestionInput {
  id: string;
}

export interface AdminStory {
  id: string;
  slug: string;
  dialect: StoryDialect;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  questions: AdminStoryQuestion[];
  status: StoryStatus;
  /** 'starter': seeded from api/content/stories, written by Claude, waiting for a native speaker */
  source: StorySource;
  wordCount: number;
  length: StoryLength | null;
  readingMinutes: number;
  lockVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** what would stop it being published (errors) and what is worth a look (warnings) */
  problems: StoryValidation;
}

export interface AdminStorySummary {
  id: string;
  slug: string;
  dialect: StoryDialect;
  level: number;
  title: string;
  status: StoryStatus;
  source: StorySource;
  wordCount: number;
  length: StoryLength | null;
  questionCount: number;
  lockVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  /** counts of `validateStory(…, 'publish')` problems */
  problems: { errors: number; warnings: number };
}

interface StoryRow {
  id: string;
  slug: string;
  dialect: StoryDialect;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  word_count: number;
  length: StoryLength | null;
  glossary: StoryGlossEntry[];
  status: StoryStatus;
  lock_version: number;
  source: StorySource;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const STORY_COLUMNS = `s.id, s.slug, s.dialect, s.level, s.title, s.summary, s.body, s.word_count, s.length, s.glossary,
  s.status, s.lock_version, s.source, s.published_at, s.created_at, s.updated_at`;

function trimmedOrNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * What is stored: titles, options and translations trimmed, an empty optional
 * field as null, the text with one kind of line ending. Validation runs on
 * this, so what is checked is what is saved.
 */
export function tidyStory<T extends StoryInput>(story: T): T {
  return {
    ...story,
    title: story.title.trim(),
    summary: trimmedOrNull(story.summary),
    body: story.body.replace(/\r\n?/g, '\n').trim(),
    glossary: story.glossary.map((entry) => {
      const meanings: Record<string, string> = {};
      for (const [locale, meaning] of Object.entries(entry.meanings)) {
        const t = typeof meaning === 'string' ? meaning.trim() : '';
        if (t) meanings[locale] = t;
      }
      return { term: entry.term.trim(), meanings: { ...meanings, en: meanings.en ?? '' } };
    }),
    questions: story.questions.map((q) => ({
      ...q,
      prompt: q.prompt.trim(),
      promptEn: trimmedOrNull(q.promptEn),
      options: q.options.map((o) => o.trim()),
      explanation: trimmedOrNull(q.explanation),
      explanationEn: trimmedOrNull(q.explanationEn),
      evidenceParagraph: q.evidenceParagraph ?? null,
      evidenceSentence: q.evidenceSentence ?? null,
    })),
  };
}

function questionInput(r: QuestionRow): AdminStoryQuestion {
  return {
    id: r.id,
    kind: r.kind,
    prompt: r.prompt,
    promptEn: r.prompt_en,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    explanationEn: r.explanation_en,
    evidenceParagraph: r.evidence_paragraph,
    evidenceSentence: r.evidence_sentence,
  };
}

function storyInput(row: StoryRow, questions: readonly StoryQuestionInput[]): StoryInput {
  return {
    dialect: row.dialect,
    level: row.level,
    title: row.title,
    summary: row.summary,
    body: row.body,
    glossary: row.glossary,
    questions: [...questions],
  };
}

/**
 * A story as the audit keeps it on one side of a status change. Stories have
 * no version history — unpublishing, editing and publishing again overwrites
 * the row — so on the side where a story is live (just published, or about
 * to be unpublished or archived) the audit keeps the whole of it, questions
 * included: which text a reviewer approved, and what learners read until it
 * was pulled, can always be told afterwards. A draft or a story in review is
 * noted by its status alone; its content is on the other side of the entry.
 */
function auditState(
  row: StoryRow,
  status: StoryStatus,
  lockVersion: number,
  questions: readonly AdminStoryQuestion[] | null,
): Record<string, unknown> {
  const head = { status, slug: row.slug, title: row.title, lockVersion };
  return status === 'published' && questions ? { ...head, ...storyInput(row, questions) } : head;
}

function invalid(validation: StoryValidation): AppError {
  const n = validation.errors.length;
  return new AppError('INVALID', 422, `the story has ${n} problem${n === 1 ? '' : 's'} to fix first`, validation);
}

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function pgCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
}

/**
 * Write a story's content and its whole bank into an existing row or a new
 * one, inside the caller's transaction. Does not validate (the caller has)
 * and does not touch status or lock_version beyond what `set` says.
 *
 * Used by the admin routes, the importer and the starter seeding, so a story
 * is stored the same way whichever door it came in by: the word count, the
 * length and the recording keys always match the text.
 */
export async function saveStory(
  db: Executor,
  story: StoryDraft,
  target:
    | { id: string; set?: string; params?: unknown[] }
    | { insert: { source: StorySource; createdBy: string | null; skipIfSlugTaken?: boolean } },
): Promise<string | null> {
  const facts = storyTextFacts(story.dialect, story.body);
  const values = [
    story.slug,
    story.dialect,
    story.level,
    story.title,
    story.summary,
    story.body,
    facts.wordCount,
    facts.length,
    JSON.stringify(story.glossary),
    facts.sentenceKeys,
  ];
  let id: string;
  if ('insert' in target) {
    // seeding races another instance booting at the same time: the loser's insert is simply nothing
    const res = await db.query<{ id: string }>(
      `INSERT INTO stories (slug, dialect, level, title, summary, body, word_count, length, glossary, sentence_keys,
                            source, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $12)
       ${target.insert.skipIfSlugTaken ? 'ON CONFLICT (slug) DO NOTHING' : ''}
       RETURNING id`,
      [...values, target.insert.source, target.insert.createdBy],
    );
    if (!res.rows[0]) return null;
    id = res.rows[0].id;
  } else {
    const extra = target.params ?? [];
    await db.query(
      `UPDATE stories SET slug = $2, dialect = $3, level = $4, title = $5, summary = $6, body = $7, word_count = $8,
              length = $9, glossary = $10::jsonb, sentence_keys = $11${target.set ? `, ${target.set}` : ''}
       WHERE id = $1`,
      [target.id, ...values, ...extra],
    );
    id = target.id;
    await db.query(`DELETE FROM story_questions WHERE story_id = $1`, [id]);
  }
  // the questions in one statement rather than one each
  if (story.questions.length > 0) {
    await db.query(
      `INSERT INTO story_questions (story_id, position, kind, prompt, prompt_en, options, correct_index,
                                    explanation, explanation_en, evidence_paragraph, evidence_sentence)
       SELECT $1::uuid, q.position, q.kind, q.prompt, q.prompt_en, q.options, q.correct_index,
              q.explanation, q.explanation_en, q.evidence_paragraph, q.evidence_sentence
         FROM jsonb_to_recordset($2::jsonb) AS q(position int, kind text, prompt text, prompt_en text, options jsonb, correct_index int,
                                                 explanation text, explanation_en text, evidence_paragraph int, evidence_sentence int)`,
      [
        id,
        JSON.stringify(
          story.questions.map((q, position) => ({
            position,
            kind: q.kind,
            prompt: q.prompt,
            prompt_en: q.promptEn,
            options: q.options,
            correct_index: q.correctIndex,
            explanation: q.explanation,
            explanation_en: q.explanationEn,
            evidence_paragraph: q.evidenceParagraph,
            evidence_sentence: q.evidenceSentence,
          })),
        ),
      ],
    );
  }
  return id;
}

type Transition = 'submit' | 'publish' | 'unpublish' | 'archive';

const TRANSITIONS: Record<Transition, { from: readonly StoryStatus[]; to: StoryStatus; whole: boolean; audited: boolean }> = {
  submit: { from: ['draft'], to: 'in_review', whole: true, audited: false },
  // a draft can be published straight away: one editor who is also the reviewer
  publish: { from: ['draft', 'in_review'], to: 'published', whole: true, audited: true },
  unpublish: { from: ['published'], to: 'draft', whole: false, audited: true },
  archive: { from: ['draft', 'in_review', 'published'], to: 'archived', whole: false, audited: true },
};

const DONE: Record<Transition, string> = {
  submit: 'submitted for review',
  publish: 'published',
  unpublish: 'unpublished',
  archive: 'archived',
};

export interface ActionContext {
  adminId: string;
  requestId?: string | null;
  /** why, for the audit (the importer says it was the import) */
  reason?: string | null;
}

export class StoryAdminService {
  private readonly audit: AuditService;

  constructor(
    private readonly pool: pg.Pool,
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

  private async questionsOf(db: Executor, ids: readonly string[]): Promise<Map<string, AdminStoryQuestion[]>> {
    const out = new Map<string, AdminStoryQuestion[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) return out;
    const res = await db.query<QuestionRow>(
      `SELECT * FROM story_questions WHERE story_id = ANY($1::uuid[]) ORDER BY story_id, position`,
      [ids],
    );
    for (const r of res.rows) out.get(r.story_id)?.push(questionInput(r));
    return out;
  }

  /** Every story, or those of one status / variety, with what stands between each and publishing. */
  async list(filter: { status?: StoryStatus; dialect?: StoryDialect } = {}): Promise<AdminStorySummary[]> {
    const res = await this.pool.query<StoryRow>(
      `SELECT ${STORY_COLUMNS} FROM stories s
       WHERE ($1::text IS NULL OR s.status = $1) AND ($2::text IS NULL OR s.dialect = $2)
       ORDER BY s.dialect, ${STORY_ORDER_SQL}`,
      [filter.status ?? null, filter.dialect ?? null],
    );
    const questions = await this.questionsOf(this.pool, res.rows.map((r) => r.id));
    return res.rows.map((row) => {
      const bank = questions.get(row.id) ?? [];
      const problems = validateStory(storyInput(row, bank), 'publish');
      return {
        id: row.id,
        slug: row.slug,
        dialect: row.dialect,
        level: row.level,
        title: row.title,
        status: row.status,
        source: row.source,
        wordCount: row.word_count,
        length: row.length,
        questionCount: bank.length,
        lockVersion: row.lock_version,
        publishedAt: row.published_at?.toISOString() ?? null,
        updatedAt: row.updated_at.toISOString(),
        problems: { errors: problems.errors.length, warnings: problems.warnings.length },
      };
    });
  }

  /** One story with its questions, as the editor opens it. */
  async get(id: string, db: Executor = this.pool): Promise<AdminStory | null> {
    if (!UUID_RE.test(id)) return null;
    const res = await db.query<StoryRow>(`SELECT ${STORY_COLUMNS} FROM stories s WHERE s.id = $1`, [id]);
    const row = res.rows[0];
    if (!row) return null;
    const questions = (await this.questionsOf(db, [id])).get(id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      dialect: row.dialect,
      level: row.level,
      title: row.title,
      summary: row.summary,
      body: row.body,
      glossary: row.glossary,
      questions,
      status: row.status,
      source: row.source,
      wordCount: row.word_count,
      length: row.length,
      readingMinutes: readingMinutes(row.dialect, row.word_count),
      lockVersion: row.lock_version,
      publishedAt: row.published_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      problems: validateStory(storyInput(row, questions), 'publish'),
    };
  }

  /** A new draft. Without a slug it gets one from its title (`storySlugFor`), made unique. */
  async create(input: StoryInput & { slug?: string | null }, ctx: ActionContext): Promise<AdminStory> {
    const story = tidyStory(input);
    const validation = validateStory(story, 'draft');
    if (validation.errors.length > 0) throw invalid(validation);
    const id = await this.tx(async (client) => {
      const slug = input.slug ?? (await this.freeSlug(client, storySlugFor(story.title, story.dialect)));
      try {
        return (await saveStory(client, { ...story, slug }, { insert: { source: 'admin', createdBy: ctx.adminId } }))!;
      } catch (err) {
        if (pgCode(err) === PG_UNIQUE_VIOLATION) throw new AppError('SLUG_TAKEN', 409, `another story already uses the address “${slug}”`);
        throw err;
      }
    });
    return (await this.get(id))!;
  }

  /** `base`, or base-2, base-3, … — the first no story uses yet. */
  private async freeSlug(db: Executor, base: string): Promise<string> {
    const res = await db.query<{ slug: string }>(
      `SELECT slug FROM stories WHERE slug = $1 OR slug LIKE $2`,
      [base, `${base.slice(0, 76)}-%`],
    );
    const taken = new Set(res.rows.map((r) => r.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base.slice(0, 80 - String(n).length - 1)}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /** Replace a draft (or a story in review) with what the editor sent, if nobody changed it since they loaded it. */
  async update(id: string, input: StoryDraft, lockVersion: number, ctx: ActionContext): Promise<AdminStory> {
    const story = tidyStory(input);
    const validation = validateStory(story, 'draft');
    if (validation.errors.length > 0) throw invalid(validation);
    await this.tx(async (client) => {
      const current = await this.lockStory(client, id, lockVersion);
      if (current.status !== 'draft' && current.status !== 'in_review') {
        throw new AppError(
          'NOT_EDITABLE',
          409,
          current.status === 'published' ? 'unpublish the story before editing it' : 'an archived story cannot be edited',
        );
      }
      try {
        await saveStory(client, story, {
          id,
          set: 'lock_version = lock_version + 1, updated_by = $12',
          params: [ctx.adminId],
        });
      } catch (err) {
        if (pgCode(err) === PG_UNIQUE_VIOLATION) {
          throw new AppError('SLUG_TAKEN', 409, `another story already uses the address “${story.slug}”`);
        }
        throw err;
      }
    });
    return (await this.get(id))!;
  }

  /**
   * The story row under FOR UPDATE, after the existence and lock checks every
   * change shares: 404 for no such story, 409 STALE when the editor's copy is
   * older than what is stored.
   */
  private async lockStory(db: Executor, id: string, lockVersion: number): Promise<StoryRow> {
    if (!UUID_RE.test(id)) throw new AppError('NOT_FOUND', 404, 'no such story');
    const res = await db.query<StoryRow>(`SELECT ${STORY_COLUMNS} FROM stories s WHERE s.id = $1 FOR UPDATE`, [id]);
    const row = res.rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such story');
    if (row.lock_version !== lockVersion) {
      throw new AppError('STALE', 409, 'someone else changed this story since you opened it — reload it first');
    }
    return row;
  }

  async transition(id: string, action: Transition, ctx: ActionContext & { lockVersion: number }): Promise<AdminStory> {
    const listChanged = await this.tx((client) => this.transitionIn(client, id, action, ctx));
    if (listChanged) await bustStoryLists(this.cache);
    return (await this.get(id))!;
  }

  /**
   * A status change inside the caller's transaction, with every check and
   * the audit of `transition`. Answers whether the published list changed
   * (the story was published, or now is): the caller empties the list cache
   * after it commits, as `transition` does. The importer's --publish goes
   * through here, so a story published from a file is checked, attributed
   * and audited exactly as one published in the admin panel.
   */
  async transitionIn(
    client: Executor,
    id: string,
    action: Transition,
    ctx: ActionContext & { lockVersion: number },
  ): Promise<boolean> {
    const rule = TRANSITIONS[action];
    const row = await this.lockStory(client, id, ctx.lockVersion);
    if (!rule.from.includes(row.status)) {
      throw new AppError('BAD_STATE', 409, `a story that is ${row.status.replace('_', ' ')} cannot be ${DONE[action]}`);
    }
    const publishing = rule.to === 'published';
    // the bank is needed to check a whole story, and for the audit of a live one
    const questions =
      rule.whole || (rule.audited && row.status === 'published') ? ((await this.questionsOf(client, [id])).get(id) ?? []) : null;
    if (rule.whole) {
      const validation = validateStory(storyInput(row, questions!), 'publish');
      if (validation.errors.length > 0) throw invalid(validation);
    }
    const after = await client.query<{ lock_version: number }>(
      `UPDATE stories SET status = $2, lock_version = lock_version + 1, updated_by = $3
              ${publishing ? ', published_by = $3, published_at = now()' : ''}
       WHERE id = $1 RETURNING lock_version`,
      [id, rule.to, ctx.adminId],
    );
    if (rule.audited) {
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: `story.${action}`,
        targetType: 'story',
        targetId: id,
        before: auditState(row, row.status, row.lock_version, questions),
        after: auditState(row, rule.to, after.rows[0]!.lock_version, questions),
        reason: ctx.reason ?? null,
        requestId: ctx.requestId ?? null,
      });
    }
    return row.status === 'published' || publishing;
  }

  /**
   * Delete a story nobody has played. A game keeps a reference to the story
   * it was played on (the foreign key refuses the delete), so a story that
   * was ever used answers 409 IN_USE: archive it instead. The audit keeps the
   * whole story, so a deletion can be undone by hand.
   */
  async delete(id: string, ctx: ActionContext & { lockVersion: number }): Promise<void> {
    let wasPublished = false;
    try {
      await this.tx(async (client) => {
        const row = await this.lockStory(client, id, ctx.lockVersion);
        const questions = (await this.questionsOf(client, [id])).get(id) ?? [];
        await client.query(`DELETE FROM stories WHERE id = $1`, [id]);
        wasPublished = row.status === 'published';
        await this.audit.record(client, {
          adminId: ctx.adminId,
          action: 'story.delete',
          targetType: 'story',
          targetId: id,
          before: { ...storyInput(row, questions), slug: row.slug, status: row.status, source: row.source },
          after: null,
          requestId: ctx.requestId ?? null,
        });
      });
    } catch (err) {
      if (pgCode(err) === PG_FOREIGN_KEY_VIOLATION) {
        throw new AppError('IN_USE', 409, 'this story has been played, so it cannot be deleted — archive it instead');
      }
      throw err;
    }
    if (wasPublished) await bustStoryLists(this.cache);
  }
}
