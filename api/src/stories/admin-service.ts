/**
 * Writing stories in the admin panel: drafts, review, publishing, the
 * library's categories.
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
 * Editorial review is separate from publication. A reviewer approves a story
 * (`review`), and only an approved story can be published; a change to its
 * content — title, summary, text, glossary, questions, translations — sends an
 * approved story back to unreviewed, while a change to how it is filed
 * (category, tradition, attribution, cover, reading time) does not.
 *
 * `validateStory` (@kurda/shared) decides what may be saved: at the draft
 * stage an unfinished story is fine (no text yet, between lengths, too few
 * questions, no category), anything broken is not; submitting and publishing
 * require the whole story. The importer and the starter seeding go through
 * `saveStory` below, so all three write a story the same way — and all three
 * link each glossary term to its dictionary entry, when the term is a
 * headword, so the reader can save the word.
 *
 * Publishing, unpublishing, archiving, deleting, reviewing, featuring and the
 * category changes are audited with the story before and after — the whole of
 * it, text and questions, on the side where it is live — beside the automatic
 * one-line audit of every admin call.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  STORY_CATEGORY_NAME_MAX,
  cefrOf,
  isAppLocale,
  letterKey,
  readingMinutes,
  storySlugFor,
  validateStory,
  type CefrLevel,
  type StoryAudioCoverage,
  type StoryCategory,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryInput,
  type StoryLanguage,
  type StoryLength,
  type StoryQuestionInput,
  type StoryTradition,
  type StoryValidation,
} from '@kurda/shared';
import { AuditService } from '../admin/audit-service.js';
import type { Cache } from '../cache/cache.js';
import { escapeLike } from '../db/like.js';
import { storySentenceRecordings, type StoryAudio } from '../lessonaudio/service.js';
import { AppError } from '../plugins/errors.js';
import {
  AUDIO_COUNT_SQL,
  STORY_ORDER_SQL,
  UUID_RE,
  audioCoverage,
  bustStoryLists,
  dictionaryDialectsOf,
  storyTextFacts,
  type Executor,
  type QuestionRow,
} from './service.js';

export type StoryStatus = 'draft' | 'in_review' | 'published' | 'archived';
/** Which door a story came in by: written in the panel, or seeded from api/content/stories (the `source` column). */
export type StoryOrigin = 'admin' | 'starter';
export type StoryReviewStatus = 'unreviewed' | 'approved';

/** Who writes stories: whoever edits lessons and records their audio (the routes and the import command ask for it). */
export const STORY_EDITOR_ROLES = ['superadmin', 'content_editor', 'admin'] as const;

/** A story as an editor sends it: everything, every time (PUT replaces the whole draft). */
export interface StoryDraft extends StoryInput {
  slug: string;
}

/** What goes with a save besides the story: which other story it is a version of. */
export interface SaveOptions {
  /**
   * Another story's id: this one joins its translation group (the same
   * story in another variety). Null leaves the group; left out, nothing
   * about the group changes.
   */
  sameStoryAs?: string | null;
}

export interface AdminStoryQuestion extends StoryQuestionInput {
  id: string;
}

/** Another telling of the same story, any status, for the editor's Versions section. */
export interface AdminStoryVersion {
  id: string;
  slug: string;
  title: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  status: StoryStatus;
}

export interface AdminStory {
  id: string;
  slug: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: number;
  cefr: CefrLevel | null;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  questions: AdminStoryQuestion[];
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  /** the collection, teller, region or publication it comes from */
  source: string | null;
  sourceUrl: string | null;
  attributionNote: string | null;
  /** by interface language, the whole text as the editor typed it */
  translations: Record<string, string>;
  cover: string | null;
  /** the editor's reading time, null for the estimate (`readingMinutes` is whichever applies) */
  readingMinutesOverride: number | null;
  status: StoryStatus;
  /** 'starter': seeded from api/content/stories, written for the app, waiting for a native speaker */
  origin: StoryOrigin;
  wordCount: number;
  length: StoryLength | null;
  readingMinutes: number;
  lockVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  featured: boolean;
  featuredAt: string | null;
  reviewStatus: StoryReviewStatus;
  reviewedBy: { id: string; username: string | null } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  translationGroup: string | null;
  versions: AdminStoryVersion[];
  /** the glossary terms that are dictionary headwords, with the entry each was linked to */
  glossaryMatches: Array<{ term: string; entryId: string; headword: string }>;
  /** the story's sentences in order with their recordings, for the editor's audio section */
  audio: StoryAudio;
  /** what would stop it being published (errors) and what is worth a look (warnings) */
  problems: StoryValidation;
}

export interface AdminStorySummary {
  id: string;
  slug: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: number;
  cefr: CefrLevel | null;
  title: string;
  status: StoryStatus;
  origin: StoryOrigin;
  wordCount: number;
  length: StoryLength | null;
  questionCount: number;
  lockVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  category: string | null;
  tradition: StoryTradition;
  reviewStatus: StoryReviewStatus;
  featured: boolean;
  audio: StoryAudioCoverage;
  translationGroup: string | null;
  /** counts of `validateStory(…, 'publish')` problems */
  problems: { errors: number; warnings: number };
}

export interface AdminStoryFilter {
  /** matched against the title and the slug */
  q?: string;
  status?: StoryStatus;
  dialect?: StoryDialect;
  level?: number;
  category?: string;
  review?: StoryReviewStatus;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

/** The admin list shows this many rows at most per page. */
export const ADMIN_LIST_MAX = 100;
const ADMIN_LIST_DEFAULT = 50;

interface StoryRow {
  id: string;
  slug: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  word_count: number;
  length: StoryLength | null;
  glossary: StoryGlossEntry[];
  status: StoryStatus;
  lock_version: number;
  source: StoryOrigin;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  story_source: string | null;
  source_url: string | null;
  attribution_note: string | null;
  translations: Record<string, string>;
  cover: string | null;
  reading_minutes: number | null;
  featured: boolean;
  featured_at: Date | null;
  review_status: StoryReviewStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  translation_group: string | null;
  recordable_count: number;
  recorded_count: number;
}

const STORY_COLUMNS = `s.id, s.slug, s.dialect, s.language, s.level, s.title, s.summary, s.body, s.word_count, s.length, s.glossary,
  s.status, s.lock_version, s.source, s.published_at, s.created_at, s.updated_at,
  s.category, s.tradition, s.author, s.story_source, s.source_url, s.attribution_note, s.translations, s.cover, s.reading_minutes,
  s.featured, s.featured_at, s.review_status, s.reviewed_by, s.reviewed_at, s.review_note, s.translation_group, ${AUDIO_COUNT_SQL}`;

function trimmedOrNull(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * What is stored: titles, options and translations trimmed, an empty optional
 * field as null, the text (and each translation) with one kind of line
 * ending, a blank translation dropped. Validation runs on this, so what is
 * checked is what is saved. Whatever a client sent for a gloss's dictionary
 * link is dropped here: the server resolves it when the story is saved.
 */
export function tidyStory<T extends StoryInput>(story: T): T {
  const translations: Record<string, string> = {};
  for (const [locale, text] of Object.entries(story.translations ?? {})) {
    const t = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').trim() : '';
    if (t) translations[locale] = t;
  }
  return {
    ...story,
    language: story.language ?? 'ku',
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
    category: trimmedOrNull(story.category),
    tradition: (story.tradition ?? 'original').trim(),
    author: trimmedOrNull(story.author),
    source: trimmedOrNull(story.source),
    sourceUrl: trimmedOrNull(story.sourceUrl),
    attributionNote: trimmedOrNull(story.attributionNote),
    translations,
    cover: trimmedOrNull(story.cover),
    readingMinutes: story.readingMinutes ?? null,
  };
}

/**
 * A story's content in one fixed order — jsonb does not keep the key order it
 * was given — for telling whether an import or a save changed what a
 * reviewer read. The content is what the reader meets: title, summary, text,
 * glossary (terms and meanings, not their dictionary links), questions,
 * translations. Where the story is filed and who it is attributed to are not
 * content, and changing them does not undo a review.
 */
export function canonicalContent(story: StoryInput): string {
  return JSON.stringify([
    story.dialect,
    story.level,
    story.title,
    story.summary,
    story.body,
    story.glossary.map((g) => [g.term, Object.entries(g.meanings).sort(([a], [b]) => a.localeCompare(b))]),
    story.questions.map((q) => [
      q.kind,
      q.prompt,
      q.promptEn,
      q.options,
      q.correctIndex,
      q.explanation,
      q.explanationEn,
      q.evidenceParagraph,
      q.evidenceSentence,
    ]),
    Object.entries(story.translations ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
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

/** The stored story as `validateStory` and the importer see it. */
export function storyInputOf(row: StoryRow, questions: readonly StoryQuestionInput[]): StoryInput {
  return {
    dialect: row.dialect,
    language: row.language,
    level: row.level,
    title: row.title,
    summary: row.summary,
    body: row.body,
    glossary: row.glossary,
    questions: [...questions],
    category: row.category,
    tradition: row.tradition,
    author: row.author,
    source: row.story_source,
    sourceUrl: row.source_url,
    attributionNote: row.attribution_note,
    translations: row.translations ?? {},
    cover: row.cover,
    readingMinutes: row.reading_minutes,
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
  return status === 'published' && questions ? { ...head, ...storyInputOf(row, questions) } : head;
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
 * The glossary with each term linked to its dictionary entry, when it is a
 * headword in the story's variety: the term normalised as the dictionary
 * normalises its headwords (letters only, case folded; `letterKey`) and
 * matched exactly, so "sêv" is not linked to "sev". Several entries for one
 * headword take the first by spelling. A term that is no headword keeps no
 * link at all, so a stored glossary without matches reads as it was written.
 */
export async function matchGlossary(db: Executor, dialect: StoryDialect, glossary: readonly StoryGlossEntry[]): Promise<StoryGlossEntry[]> {
  const keys = glossary.map((g) => letterKey(g.term));
  const wanted = [...new Set(keys.filter((k) => k !== ''))];
  const byKey = new Map<string, string>();
  if (wanted.length > 0) {
    const res = await db.query<{ id: string; headword_normalized: string }>(
      `SELECT id, headword_normalized FROM dict_entries
        WHERE headword_normalized = ANY($1::text[]) AND dialect = ANY($2::text[])
        ORDER BY headword, id`,
      [wanted, dictionaryDialectsOf(dialect)],
    );
    for (const r of res.rows) if (!byKey.has(r.headword_normalized)) byKey.set(r.headword_normalized, r.id);
  }
  return glossary.map((g, i) => {
    const entryId = byKey.get(keys[i]!);
    return entryId ? { term: g.term, meanings: g.meanings, entryId } : { term: g.term, meanings: g.meanings };
  });
}

/** How many fixed values `saveStory` binds, so a caller's own `set` clause can number its parameters after them (`saveParam`). */
const SAVE_VALUES = 20;

/** The placeholder of the i-th (from 1) extra parameter a caller adds to `saveStory`'s `set`. */
export function saveParam(i: number): string {
  return `$${1 + SAVE_VALUES + i}`;
}

/**
 * Write a story's content and its whole bank into an existing row or a new
 * one, inside the caller's transaction. Does not validate (the caller has)
 * and does not touch status or lock_version beyond what `set` says.
 *
 * Used by the admin routes, the importer and the starter seeding, so a story
 * is stored the same way whichever door it came in by: the word count, the
 * length, the recording keys and the glossary's dictionary links always
 * match the text.
 */
export async function saveStory(
  db: Executor,
  story: StoryDraft,
  target:
    | { id: string; set?: string; params?: unknown[] }
    | { insert: { source: StoryOrigin; createdBy: string | null; skipIfSlugTaken?: boolean } },
): Promise<string | null> {
  const facts = storyTextFacts(story.dialect, story.body);
  const glossary = await matchGlossary(db, story.dialect, story.glossary);
  const values = [
    story.slug,
    story.dialect,
    story.language ?? 'ku',
    story.level,
    story.title,
    story.summary,
    story.body,
    facts.wordCount,
    facts.length,
    JSON.stringify(glossary),
    facts.sentenceKeys,
    story.category,
    story.tradition,
    story.author,
    story.source,
    story.sourceUrl,
    story.attributionNote,
    JSON.stringify(story.translations ?? {}),
    story.cover,
    story.readingMinutes,
  ];
  let id: string;
  if ('insert' in target) {
    // seeding races another instance booting at the same time: the loser's insert is simply nothing
    const res = await db.query<{ id: string }>(
      `INSERT INTO stories (slug, dialect, language, level, title, summary, body, word_count, length, glossary, sentence_keys,
                            category, tradition, author, story_source, source_url, attribution_note, translations, cover, reading_minutes,
                            source, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $22)
       ${target.insert.skipIfSlugTaken ? 'ON CONFLICT (slug) DO NOTHING' : ''}
       RETURNING id`,
      [...values, target.insert.source, target.insert.createdBy],
    );
    if (!res.rows[0]) return null;
    id = res.rows[0].id;
  } else {
    const extra = target.params ?? [];
    await db.query(
      `UPDATE stories SET slug = $2, dialect = $3, language = $4, level = $5, title = $6, summary = $7, body = $8, word_count = $9,
              length = $10, glossary = $11::jsonb, sentence_keys = $12, category = $13, tradition = $14, author = $15, story_source = $16,
              source_url = $17, attribution_note = $18, translations = $19::jsonb, cover = $20, reading_minutes = $21
              ${target.set ? `, ${target.set}` : ''}
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
  // a draft can be published straight away: one editor who is also the reviewer (once a reviewer has approved it)
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

/** A category as an editor writes it. */
export interface CategoryInput {
  name: Record<string, string>;
  position?: number | null;
}

/** The stories a category holds, when it cannot be deleted for them. */
export class CategoryInUse extends AppError {
  constructor(count: number) {
    super('IN_USE', 409, `${count} stor${count === 1 ? 'y is' : 'ies are'} filed under this category — move them first, or force the delete`, { count });
  }
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

  /** Stories by filter, a page at a time, each with what stands between it and publishing. */
  async list(filter: AdminStoryFilter = {}): Promise<{ stories: AdminStorySummary[]; total: number }> {
    const limit = Math.min(ADMIN_LIST_MAX, Math.max(1, filter.limit ?? ADMIN_LIST_DEFAULT));
    const offset = Math.max(0, filter.offset ?? 0);
    const q = filter.q?.trim();
    const res = await this.pool.query<StoryRow & { total: number }>(
      `SELECT ${STORY_COLUMNS}, (count(*) OVER ())::int AS total FROM stories s
       WHERE ($1::text IS NULL OR s.status = $1) AND ($2::text IS NULL OR s.dialect = $2)
         AND ($3::smallint IS NULL OR s.level = $3) AND ($4::text IS NULL OR s.category = $4)
         AND ($5::text IS NULL OR s.review_status = $5) AND ($6::boolean IS NULL OR s.featured = $6)
         AND ($7::text IS NULL OR s.title ILIKE $7 OR s.slug ILIKE $7)
       ORDER BY s.dialect, ${STORY_ORDER_SQL}
       LIMIT $8 OFFSET $9`,
      [
        filter.status ?? null,
        filter.dialect ?? null,
        filter.level ?? null,
        filter.category ?? null,
        filter.review ?? null,
        filter.featured ?? null,
        q ? `%${escapeLike(q)}%` : null,
        limit,
        offset,
      ],
    );
    const questions = await this.questionsOf(this.pool, res.rows.map((r) => r.id));
    return {
      total: res.rows[0]?.total ?? 0,
      stories: res.rows.map((row) => {
        const bank = questions.get(row.id) ?? [];
        const problems = validateStory(storyInputOf(row, bank), 'publish');
        return {
          id: row.id,
          slug: row.slug,
          dialect: row.dialect,
          language: row.language,
          level: row.level,
          cefr: cefrOfLevel(row.level),
          title: row.title,
          status: row.status,
          origin: row.source,
          wordCount: row.word_count,
          length: row.length,
          questionCount: bank.length,
          lockVersion: row.lock_version,
          publishedAt: row.published_at?.toISOString() ?? null,
          updatedAt: row.updated_at.toISOString(),
          category: row.category,
          tradition: row.tradition,
          reviewStatus: row.review_status,
          featured: row.featured,
          audio: audioCoverage(row.recorded_count, row.recordable_count),
          translationGroup: row.translation_group,
          problems: { errors: problems.errors.length, warnings: problems.warnings.length },
        };
      }),
    };
  }

  /** One story with its questions, its dictionary links, its recordings and its other versions, as the editor opens it. */
  async get(id: string, db: Executor = this.pool): Promise<AdminStory | null> {
    if (!UUID_RE.test(id)) return null;
    const res = await db.query<StoryRow & { reviewer_username: string | null }>(
      `SELECT ${STORY_COLUMNS}, ru.username AS reviewer_username
         FROM stories s LEFT JOIN users ru ON ru.id = s.reviewed_by WHERE s.id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    const linked = row.glossary.filter((g): g is StoryGlossEntry & { entryId: string } => typeof g.entryId === 'string' && UUID_RE.test(g.entryId));
    const [questions, audio, versions, headwords] = await Promise.all([
      this.questionsOf(db, [id]).then((m) => m.get(id) ?? []),
      storySentenceRecordings(db, row.body),
      row.translation_group
        ? db.query<AdminStoryVersion>(
            `SELECT id, slug, title, dialect, language, status FROM stories WHERE translation_group = $1 AND id <> $2 ORDER BY dialect, language, slug`,
            [row.translation_group, id],
          )
        : null,
      linked.length > 0
        ? db.query<{ id: string; headword: string }>(`SELECT id, headword FROM dict_entries WHERE id = ANY($1::uuid[])`, [
            [...new Set(linked.map((g) => g.entryId))],
          ])
        : null,
    ]);
    const headwordOf = new Map(headwords?.rows.map((r) => [r.id, r.headword]) ?? []);
    return {
      id: row.id,
      slug: row.slug,
      dialect: row.dialect,
      language: row.language,
      level: row.level,
      cefr: cefrOfLevel(row.level),
      title: row.title,
      summary: row.summary,
      body: row.body,
      glossary: row.glossary,
      questions,
      category: row.category,
      tradition: row.tradition,
      author: row.author,
      source: row.story_source,
      sourceUrl: row.source_url,
      attributionNote: row.attribution_note,
      translations: row.translations ?? {},
      cover: row.cover,
      readingMinutesOverride: row.reading_minutes,
      status: row.status,
      origin: row.source,
      wordCount: row.word_count,
      length: row.length,
      readingMinutes: row.reading_minutes ?? readingMinutes(row.dialect, row.word_count),
      lockVersion: row.lock_version,
      publishedAt: row.published_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      featured: row.featured,
      featuredAt: row.featured_at?.toISOString() ?? null,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by ? { id: row.reviewed_by, username: row.reviewer_username } : null,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      reviewNote: row.review_note,
      translationGroup: row.translation_group,
      versions: versions?.rows ?? [],
      // an entry deleted since the save is no match any more
      glossaryMatches: linked.flatMap((g) => {
        const headword = headwordOf.get(g.entryId);
        return headword === undefined ? [] : [{ term: g.term, entryId: g.entryId, headword }];
      }),
      audio,
      problems: validateStory(storyInputOf(row, questions), 'publish'),
    };
  }

  /** A new draft. Without a slug it gets one from its title (`storySlugFor`), made unique. */
  async create(input: StoryInput & { slug?: string | null }, ctx: ActionContext, options: SaveOptions = {}): Promise<AdminStory> {
    const story = tidyStory(input);
    const validation = validateStory(story, 'draft');
    if (validation.errors.length > 0) throw invalid(validation);
    const id = await this.tx(async (client) => {
      const slug = input.slug ?? (await this.freeSlug(client, storySlugFor(story.title, story.dialect)));
      let created: string;
      try {
        created = (await saveStory(client, { ...story, slug }, { insert: { source: 'admin', createdBy: ctx.adminId } }))!;
      } catch (err) {
        throw this.saveError(err, slug);
      }
      if (options.sameStoryAs !== undefined) await this.linkVersions(client, created, options.sameStoryAs);
      return created;
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

  /** What Postgres refused a save for, in the editor's terms: an address in use, a category that is not there. */
  private saveError(err: unknown, slug: string): unknown {
    if (pgCode(err) === PG_UNIQUE_VIOLATION) return new AppError('SLUG_TAKEN', 409, `another story already uses the address “${slug}”`);
    if (pgCode(err) === PG_FOREIGN_KEY_VIOLATION && /category/.test((err as { constraint?: string }).constraint ?? '')) {
      return new AppError('INVALID', 422, 'the story has 1 problem to fix first', {
        errors: [{ code: 'CATEGORY_UNKNOWN', path: 'category', message: 'there is no category with this slug' }],
        warnings: [],
      });
    }
    return err;
  }

  /**
   * Replace a draft (or a story in review) with what the editor sent, if
   * nobody changed it since they loaded it. A change to the content of an
   * approved story takes its approval away: the reviewer read something else.
   */
  async update(id: string, input: StoryDraft, lockVersion: number, ctx: ActionContext, options: SaveOptions = {}): Promise<AdminStory> {
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
      const before = (await this.questionsOf(client, [id])).get(id) ?? [];
      const contentChanged = canonicalContent(storyInputOf(current, before)) !== canonicalContent(story);
      const resetReview = contentChanged && current.review_status === 'approved';
      try {
        await saveStory(client, story, {
          id,
          set:
            `lock_version = lock_version + 1, updated_by = ${saveParam(1)}` +
            (resetReview ? `, review_status = 'unreviewed', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL` : ''),
          params: [ctx.adminId],
        });
      } catch (err) {
        throw this.saveError(err, story.slug);
      }
      if (options.sameStoryAs !== undefined) await this.linkVersions(client, id, options.sameStoryAs);
    });
    return (await this.get(id))!;
  }

  /**
   * Join or leave a translation group. Joining another story's group makes
   * one for it when it has none; two stories in one group are one story told
   * twice, so a story cannot join its own.
   */
  private async linkVersions(client: Executor, id: string, otherId: string | null): Promise<void> {
    if (otherId === null) {
      await client.query(`UPDATE stories SET translation_group = NULL WHERE id = $1`, [id]);
      return;
    }
    if (otherId === id) throw new AppError('BAD_REQUEST', 400, 'a story cannot be another version of itself');
    if (!UUID_RE.test(otherId)) throw new AppError('NOT_FOUND', 404, 'no such story to link to');
    const other = await client.query<{ translation_group: string | null }>(`SELECT translation_group FROM stories WHERE id = $1 FOR UPDATE`, [otherId]);
    if (!other.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such story to link to');
    let group = other.rows[0].translation_group;
    if (!group) {
      group = randomUUID();
      await client.query(`UPDATE stories SET translation_group = $2 WHERE id = $1`, [otherId, group]);
    }
    await client.query(`UPDATE stories SET translation_group = $2 WHERE id = $1`, [id, group]);
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
   *
   * Publishing needs the reviewer's approval first (409 NOT_REVIEWED): the
   * whole-story check says the story is complete, the review says someone
   * read it.
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
      const validation = validateStory(storyInputOf(row, questions!), 'publish');
      if (validation.errors.length > 0) throw invalid(validation);
    }
    if (publishing && row.review_status !== 'approved') {
      throw new AppError('NOT_REVIEWED', 409, 'a reviewer has to approve the story before it is published');
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
   * Approve a story, or withdraw its approval, with a note. Approval is what
   * publishing waits for; withdrawing it from a live story is refused, since
   * the story would go on being read — unpublish it first, which says so.
   */
  async review(id: string, input: { approved: boolean; note?: string | null }, ctx: ActionContext & { lockVersion: number }): Promise<AdminStory> {
    await this.tx(async (client) => this.reviewIn(client, id, input, ctx));
    return (await this.get(id))!;
  }

  /** `review` inside the caller's transaction (the importer approves what it publishes, as the editor it publishes for). */
  async reviewIn(
    client: Executor,
    id: string,
    input: { approved: boolean; note?: string | null },
    ctx: ActionContext & { lockVersion: number },
  ): Promise<void> {
    const row = await this.lockStory(client, id, ctx.lockVersion);
    if (row.status === 'archived') throw new AppError('BAD_STATE', 409, 'an archived story is not reviewed');
    if (!input.approved && row.status === 'published') {
      throw new AppError('BAD_STATE', 409, 'unpublish the story before withdrawing its approval');
    }
    const status: StoryReviewStatus = input.approved ? 'approved' : 'unreviewed';
    const note = trimmedOrNull(input.note);
    const after = await client.query<{ lock_version: number }>(
      `UPDATE stories SET review_status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4,
              lock_version = lock_version + 1, updated_by = $3
       WHERE id = $1 RETURNING lock_version`,
      [id, status, ctx.adminId, note],
    );
    await this.audit.record(client, {
      adminId: ctx.adminId,
      action: 'story.review',
      targetType: 'story',
      targetId: id,
      before: { slug: row.slug, reviewStatus: row.review_status, reviewNote: row.review_note, lockVersion: row.lock_version },
      after: { slug: row.slug, reviewStatus: status, reviewNote: note, lockVersion: after.rows[0]!.lock_version },
      reason: ctx.reason ?? null,
      requestId: ctx.requestId ?? null,
    });
  }

  /** Put a story in the library's Featured row, or take it out. A live story's row changes at once. */
  async feature(id: string, featured: boolean, ctx: ActionContext & { lockVersion: number }): Promise<AdminStory> {
    const live = await this.tx(async (client) => {
      const row = await this.lockStory(client, id, ctx.lockVersion);
      if (row.status === 'archived') throw new AppError('BAD_STATE', 409, 'an archived story cannot be featured');
      const after = await client.query<{ lock_version: number }>(
        `UPDATE stories SET featured = $2,
                featured_at = CASE WHEN $2::boolean THEN COALESCE(CASE WHEN featured THEN featured_at END, now()) END,
                lock_version = lock_version + 1, updated_by = $3
         WHERE id = $1 RETURNING lock_version`,
        [id, featured, ctx.adminId],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.feature',
        targetType: 'story',
        targetId: id,
        before: { slug: row.slug, featured: row.featured, lockVersion: row.lock_version },
        after: { slug: row.slug, featured, lockVersion: after.rows[0]!.lock_version },
        requestId: ctx.requestId ?? null,
      });
      return row.status === 'published';
    });
    if (live) await bustStoryLists(this.cache);
    return (await this.get(id))!;
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
          before: { ...storyInputOf(row, questions), slug: row.slug, status: row.status, origin: row.source },
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

  // ── categories ────────────────────────────────────────────────────────────

  async listCategories(): Promise<StoryCategory[]> {
    const res = await this.pool.query<StoryCategory>(`SELECT slug, name, position FROM story_categories ORDER BY position, slug`);
    return res.rows;
  }

  /** A category's name as stored: every language trimmed, a blank one dropped, English required. */
  private categoryName(name: Record<string, string>): StoryCategory['name'] {
    const errors: StoryValidation['errors'] = [];
    const out: Record<string, string> = {};
    for (const [locale, text] of Object.entries(name)) {
      if (!isAppLocale(locale)) {
        errors.push({ code: 'CATEGORY_LOCALE', path: `name.${locale}`, message: `“${locale}” is not a language the app is offered in` });
        continue;
      }
      const t = typeof text === 'string' ? text.trim() : '';
      if (t.length > STORY_CATEGORY_NAME_MAX) {
        errors.push({ code: 'CATEGORY_NAME_TOO_LONG', path: `name.${locale}`, message: `keep a name to ${STORY_CATEGORY_NAME_MAX} characters` });
      }
      if (t) out[locale] = t;
    }
    if (!out.en) errors.push({ code: 'CATEGORY_NAME_EMPTY', path: 'name.en', message: 'give the category an English name' });
    if (errors.length > 0) throw new AppError('INVALID', 422, `the category has ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix first`, { errors, warnings: [] });
    return out as StoryCategory['name'];
  }

  /** A new category, at the end of the list unless a position is given. The library's filters change at once. */
  async createCategory(slug: string, input: CategoryInput, ctx: ActionContext): Promise<StoryCategory> {
    const name = this.categoryName(input.name);
    const category = await this.tx(async (client) => {
      let res: pg.QueryResult<StoryCategory>;
      try {
        res = await client.query<StoryCategory>(
          `INSERT INTO story_categories (slug, name, position)
           VALUES ($1, $2::jsonb, COALESCE($3::int, (SELECT COALESCE(max(position), -1) + 1 FROM story_categories)))
           RETURNING slug, name, position`,
          [slug, JSON.stringify(name), input.position ?? null],
        );
      } catch (err) {
        if (pgCode(err) === PG_UNIQUE_VIOLATION) throw new AppError('SLUG_TAKEN', 409, `there is already a category “${slug}”`);
        throw err;
      }
      const created = res.rows[0]!;
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.category.create',
        targetType: 'story_category',
        targetId: slug,
        before: null,
        after: created,
        requestId: ctx.requestId ?? null,
      });
      return created;
    });
    await bustStoryLists(this.cache);
    return category;
  }

  async updateCategory(slug: string, input: CategoryInput, ctx: ActionContext): Promise<StoryCategory> {
    const name = this.categoryName(input.name);
    const category = await this.tx(async (client) => {
      const before = await client.query<StoryCategory>(`SELECT slug, name, position FROM story_categories WHERE slug = $1 FOR UPDATE`, [slug]);
      if (!before.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such category');
      const res = await client.query<StoryCategory>(
        `UPDATE story_categories SET name = $2::jsonb, position = COALESCE($3::int, position) WHERE slug = $1 RETURNING slug, name, position`,
        [slug, JSON.stringify(name), input.position ?? null],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.category.update',
        targetType: 'story_category',
        targetId: slug,
        before: before.rows[0],
        after: res.rows[0]!,
        requestId: ctx.requestId ?? null,
      });
      return res.rows[0]!;
    });
    await bustStoryLists(this.cache);
    return category;
  }

  /**
   * Delete a category. One with stories filed under it is refused with how
   * many (409 IN_USE) unless forced, when those stories are left unfiled —
   * the table sets their category to null — and have to be filed again
   * before they can be published anew.
   */
  async deleteCategory(slug: string, force: boolean, ctx: ActionContext): Promise<{ slug: string; deleted: true; unfiled: number }> {
    const unfiled = await this.tx(async (client) => {
      const before = await client.query<StoryCategory>(`SELECT slug, name, position FROM story_categories WHERE slug = $1 FOR UPDATE`, [slug]);
      if (!before.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such category');
      const used = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM stories WHERE category = $1`, [slug]);
      const count = used.rows[0]!.n;
      if (count > 0 && !force) throw new CategoryInUse(count);
      await client.query(`DELETE FROM story_categories WHERE slug = $1`, [slug]);
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.category.delete',
        targetType: 'story_category',
        targetId: slug,
        before: { ...before.rows[0], stories: count },
        after: null,
        reason: count > 0 ? `forced: ${count} stories left unfiled` : null,
        requestId: ctx.requestId ?? null,
      });
      return count;
    });
    await bustStoryLists(this.cache);
    return { slug, deleted: true, unfiled };
  }
}

/** The CEFR name of a stored level, or null for a level outside the scale (a row written before the scale, or by hand). */
function cefrOfLevel(level: number): CefrLevel | null {
  return level >= 1 && level <= 5 && Number.isInteger(level) ? cefrOf(level as 1 | 2 | 3 | 4 | 5) : null;
}
