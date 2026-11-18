/**
 * Story writing for the admin panel: drafts, review, publishing, and the library's categories.
 *
 *   draft ──submit──▶ in_review ──publish──▶ published ──unpublish──▶ draft
 *     └──────────────publish──────────────────▲      any ──archive──▶ archived
 *
 * Only drafts and stories in review can be edited; a published story is unpublished first (games under way keep their
 * own copy), so learners always read exactly what someone published. Every change carries the editor's `lockVersion`
 * and a stale one is refused, so editors cannot silently overwrite each other.
 *
 * Review is separate from publication: only an approved story can be published. A content change (title, summary, text,
 * glossary, questions, reflections, notes, translations) resets an approved story to unreviewed; a filing change
 * (category, tradition, attribution, sources, cover, reading time) does not.
 *
 * Translations have two ways in. The whole-story save (`update`, draft or in review only) takes them with everything
 * else and counts a changed translation as changed content. `saveTranslation` corrects one language in any status but
 * archived, without unpublishing: the Kurdish approval stays and that language is marked unreviewed until
 * `reviewTranslation`. Either way every changed language is marked unreviewed.
 *
 * `validateStory` (@kurda/shared) decides what may be saved: a draft may be unfinished but not broken; submitting and
 * publishing need the whole story. The importer and starter seeding also store through `saveStory`, so all three write
 * stories the same way and link glossary terms that are headwords to their dictionary entries.
 *
 * Publishing, unpublishing, archiving, deleting, reviewing, featuring and category changes are audited with the whole
 * story before and after on its live side, beside the one-line audit of every admin call.
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
  tidyQuestionTranslations,
  tidyStoryCompanions,
  validateStory,
  type AppLocale,
  type CefrLevel,
  type StoryAudioCoverage,
  type StoryCategory,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryInput,
  type StoryLanguage,
  type StoryLength,
  type StoryMetaTranslation,
  type StoryNoteInput,
  type StoryNoteTranslation,
  type StoryQuestionInput,
  type StoryQuestionTranslation,
  type StoryReflectionInput,
  type StorySourceInput,
  type StoryTradition,
  type StoryTranslationReviewEntry,
  type StoryTranslationReviewStatus,
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
   * Another story's id: this one joins its translation group (the same story in another variety). Null leaves the
   * group; omitted, the group is unchanged.
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
  /** by interface language, the title and summary */
  metaTranslations: Record<string, StoryMetaTranslation>;
  /** open questions to think about after reading, each with its translations */
  reflections: StoryReflectionInput[];
  notes: StoryNoteInput[];
  sources: StorySourceInput[];
  /** by interface language, whether a native speaker has read its translation; a language with none is unreviewed */
  translationReview: Record<string, StoryTranslationReviewEntry>;
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
  meta_translations: Record<string, StoryMetaTranslation> | null;
  reflections: StoryReflectionInput[] | null;
  notes: StoryNoteInput[] | null;
  sources: StorySourceInput[] | null;
  translation_review: Record<string, StoryTranslationReviewEntry> | null;
  recordable_count: number;
  recorded_count: number;
}

const STORY_COLUMNS = `s.id, s.slug, s.dialect, s.language, s.level, s.title, s.summary, s.body, s.word_count, s.length, s.glossary,
  s.status, s.lock_version, s.source, s.published_at, s.created_at, s.updated_at,
  s.category, s.tradition, s.author, s.story_source, s.source_url, s.attribution_note, s.translations, s.cover, s.reading_minutes,
  s.featured, s.featured_at, s.review_status, s.reviewed_by, s.reviewed_at, s.review_note, s.translation_group,
  s.meta_translations, s.reflections, s.notes, s.sources, s.translation_review, ${AUDIO_COUNT_SQL}`;

function trimmedOrNull(v: string | null | undefined): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : null;
}


/**
 * What is stored: titles, options and translations trimmed, empty optional fields as null, one kind of line ending,
 * blank translations dropped. Validation runs on this, so what is checked is what is saved. Client-sent gloss
 * dictionary links are dropped; the server resolves them on save.
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
      translations: tidyQuestionTranslations(q.translations),
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
    ...tidyStoryCompanions(story),
    ...(story.translationReview !== undefined ? { translationReview: story.translationReview } : {}),
  };
}

/** A map's entries in key order, for comparing two maps whatever order jsonb kept them in. */
function sorted<T>(map: Record<string, T> | null | undefined): Array<[string, T]> {
  return Object.entries(map ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Everything of a story in one interface language, in a fixed order (text, title, summary, questions, reflections,
 * notes). Equal strings mean the same translation; any change marks the language unreviewed.
 */
export function canonicalLocale(story: StoryInput, locale: string): string {
  const meta = story.metaTranslations?.[locale];
  return JSON.stringify([
    story.translations?.[locale] ?? null,
    meta?.title ?? null,
    meta?.summary ?? null,
    story.questions.map((q) => {
      const t = q.translations?.[locale];
      return t ? [t.prompt, t.options, t.explanation ?? null] : null;
    }),
    (story.reflections ?? []).map((r) => r.translations?.[locale] ?? null),
    (story.notes ?? []).map((n) => {
      const t = n.translations?.[locale];
      return t ? [t.title, t.body] : null;
    }),
  ]);
}

/** Every interface language any part of a story is translated into. */
export function translatedLocales(story: StoryInput): string[] {
  const out = new Set<string>([...Object.keys(story.translations ?? {}), ...Object.keys(story.metaTranslations ?? {})]);
  for (const q of story.questions) for (const l of Object.keys(q.translations ?? {})) out.add(l);
  for (const r of story.reflections ?? []) for (const l of Object.keys(r.translations ?? {})) out.add(l);
  for (const n of story.notes ?? []) for (const l of Object.keys(n.translations ?? {})) out.add(l);
  return [...out].sort();
}

/**
 * The per-language review after a change: each language whose translation changed, appeared or went is unreviewed
 * again; others keep theirs. A language with nothing left keeps no entry.
 */
export function reviewAfterChange(
  before: StoryInput,
  after: StoryInput,
  review: Record<string, StoryTranslationReviewEntry> | null | undefined,
): Record<string, StoryTranslationReviewEntry> {
  const out: Record<string, StoryTranslationReviewEntry> = {};
  const now = new Set(translatedLocales(after));
  for (const locale of new Set([...translatedLocales(before), ...now, ...Object.keys(review ?? {})])) {
    if (!now.has(locale)) continue;
    const kept = review?.[locale];
    out[locale] = kept && canonicalLocale(before, locale) === canonicalLocale(after, locale) ? kept : { status: 'unreviewed' };
  }
  return out;
}

/**
 * A story's content in a fixed order (jsonb does not keep key order), for telling whether an import or save changed
 * what a reviewer read: title, summary, text, glossary (terms and meanings, not dictionary links), questions,
 * reflections, notes and their translations. Filing, attribution and sources are not content and do not undo a review.
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
    sorted(story.translations),
    (story.reflections ?? []).map((r) => r.text),
    (story.notes ?? []).map((n) => [n.kind, n.title, n.body]),
    translatedLocales(story).map((locale) => [locale, canonicalLocale(story, locale)]),
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
    translations: r.translations ?? {},
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
    metaTranslations: row.meta_translations ?? {},
    reflections: row.reflections ?? [],
    notes: row.notes ?? [],
    sources: row.sources ?? [],
    translationReview: row.translation_review ?? {},
  };
}

/**
 * A story as the audit keeps it on one side of a status change. Stories have no version history, so on the live side
 * (just published, or about to be unpublished or archived) the audit keeps the whole story with its questions, to tell
 * later what was approved and read. A draft or story in review is noted by status alone.
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
 * The glossary with each term linked to its dictionary entry when it is a headword in the story's variety: normalised
 * like headwords (letters only, case folded; `letterKey`) and matched exactly, so "sêv" does not link to "sev". Several
 * entries for one headword take the first by spelling. Unmatched terms keep no link.
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
const SAVE_VALUES = 25;

/** The placeholder of the i-th (from 1) extra parameter a caller adds to `saveStory`'s `set`. */
export function saveParam(i: number): string {
  return `$${1 + SAVE_VALUES + i}`;
}

/**
 * Write a story's content and whole bank into an existing or new row inside the caller's transaction. Does not validate
 * (the caller has) and touches status or lock_version only as `set` says.
 *
 * The admin routes, the importer and the starter seeding all store through here, so the word count, length, recording
 * keys and glossary links always match the text. The per-language review is written as the story carries it; the caller
 * decides it (`reviewAfterChange`).
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
    JSON.stringify(story.metaTranslations ?? {}),
    JSON.stringify(story.reflections ?? []),
    JSON.stringify(story.notes ?? []),
    JSON.stringify(story.sources ?? []),
    JSON.stringify(story.translationReview ?? {}),
  ];
  let id: string;
  if ('insert' in target) {
    // seeding races another instance booting at the same time: the loser's insert is simply nothing
    const res = await db.query<{ id: string }>(
      `INSERT INTO stories (slug, dialect, language, level, title, summary, body, word_count, length, glossary, sentence_keys,
                            category, tradition, author, story_source, source_url, attribution_note, translations, cover, reading_minutes,
                            meta_translations, reflections, notes, sources, translation_review,
                            source, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20,
               $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, $26, $27, $27)
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
              source_url = $17, attribution_note = $18, translations = $19::jsonb, cover = $20, reading_minutes = $21,
              meta_translations = $22::jsonb, reflections = $23::jsonb, notes = $24::jsonb, sources = $25::jsonb, translation_review = $26::jsonb
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
                                    explanation, explanation_en, evidence_paragraph, evidence_sentence, translations)
       SELECT $1::uuid, q.position, q.kind, q.prompt, q.prompt_en, q.options, q.correct_index,
              q.explanation, q.explanation_en, q.evidence_paragraph, q.evidence_sentence, COALESCE(q.translations, '{}'::jsonb)
         FROM jsonb_to_recordset($2::jsonb) AS q(position int, kind text, prompt text, prompt_en text, options jsonb, correct_index int,
                                                 explanation text, explanation_en text, evidence_paragraph int, evidence_sentence int,
                                                 translations jsonb)`,
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
            translations: q.translations ?? {},
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

/**
 * One language of a story as an editor corrects it (PUT /admin/stories/:id/translations/:locale). Each part is
 * optional: omitted stays, null (or a null list entry) removes it. Lists line up one-to-one with the story's questions,
 * reflections and notes, so they are sent whole or not at all.
 */
export interface LocaleTranslationInput {
  /** the whole text in this language, paragraph for paragraph, headings included */
  body?: string | null;
  title?: string | null;
  summary?: string | null;
  questions?: Array<StoryQuestionTranslation | null>;
  reflections?: Array<string | null>;
  notes?: Array<StoryNoteTranslation | null>;
}

/** The problems of a whole-story check that are about one language's translation, and nothing else. */
function localeProblems(problems: StoryValidation['errors'], locale: string): StoryValidation['errors'] {
  const own = new RegExp(
    `^(?:(?:translations|metaTranslations)\\.${locale}|(?:questions|reflections|notes)\\[\\d+\\]\\.translations\\.${locale})(?:$|[.[])`,
  );
  return problems.filter((p) => own.test(p.path));
}

/** `story` with one language's parts replaced by what `input` says of them. */
function withLocale(story: StoryInput, locale: string, input: LocaleTranslationInput): StoryInput {
  const put = <T>(map: Record<string, T> | undefined, value: T | null | undefined): Record<string, T> => {
    const next = { ...(map ?? {}) };
    if (value === null || value === undefined) delete next[locale];
    else next[locale] = value;
    return next;
  };
  const next: StoryInput = { ...story };
  if (input.body !== undefined) next.translations = put(story.translations, input.body);
  if (input.title !== undefined || input.summary !== undefined) {
    const was = story.metaTranslations?.[locale] ?? {};
    const meta = {
      ...was,
      ...(input.title !== undefined ? { title: input.title ?? undefined } : {}),
      ...(input.summary !== undefined ? { summary: input.summary ?? undefined } : {}),
    };
    next.metaTranslations = put(story.metaTranslations, meta);
  }
  if (input.questions) next.questions = story.questions.map((q, i) => ({ ...q, translations: put(q.translations, input.questions![i]) }));
  if (input.reflections) next.reflections = (story.reflections ?? []).map((r, i) => ({ ...r, translations: put(r.translations, input.reflections![i]) }));
  if (input.notes) next.notes = (story.notes ?? []).map((n, i) => ({ ...n, translations: put(n.translations, input.notes![i]) }));
  return next;
}

/**
 * Keep what a save left out from what is stored: per-language title and summary, reflections, notes, sources, and
 * question translations (only where the question's Kurdish is unchanged). An editor opened before these fields existed
 * must not delete them by saving.
 */
function keepUnsent<T extends StoryInput>(input: T, stored: StoryInput): T {
  const same = (a: StoryQuestionInput, b: StoryQuestionInput | undefined): boolean =>
    b !== undefined && a.prompt.trim() === b.prompt.trim() && JSON.stringify(a.options.map((o) => o.trim())) === JSON.stringify(b.options.map((o) => o.trim()));
  return {
    ...input,
    metaTranslations: input.metaTranslations ?? stored.metaTranslations,
    reflections: input.reflections ?? stored.reflections,
    notes: input.notes ?? stored.notes,
    sources: input.sources ?? stored.sources,
    questions: input.questions.map((q, i) =>
      q.translations !== undefined ? q : { ...q, translations: same(q, stored.questions[i]) ? (stored.questions[i]!.translations ?? {}) : {} },
    ),
  };
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
      metaTranslations: row.meta_translations ?? {},
      reflections: row.reflections ?? [],
      notes: row.notes ?? [],
      sources: row.sources ?? [],
      translationReview: row.translation_review ?? {},
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
    const tidy = tidyStory(input);
    // nobody has reviewed a translation that has only now been written
    const story = { ...tidy, translationReview: reviewAfterChange({ ...tidy, translations: {}, metaTranslations: {}, questions: [], reflections: [], notes: [] }, tidy, {}) };
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
   * Replace a draft or story in review with what the editor sent, if unchanged since they loaded it. A content change
   * takes an approved story's approval away, translations included (their languages are marked unreviewed). To correct
   * a translation alone, or on a published story, use `saveTranslation`.
   */
  async update(id: string, input: StoryDraft, lockVersion: number, ctx: ActionContext, options: SaveOptions = {}): Promise<AdminStory> {
    const sent = validateStory(tidyStory(input), 'draft');
    if (sent.errors.length > 0) throw invalid(sent);
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
      const stored = storyInputOf(current, before);
      const tidy = tidyStory(keepUnsent(input, stored));
      const validation = validateStory(tidy, 'draft');
      if (validation.errors.length > 0) throw invalid(validation);
      const contentChanged = canonicalContent(stored) !== canonicalContent(tidy);
      const resetReview = contentChanged && current.review_status === 'approved';
      // who reviewed which translation is never taken from the editor's save: it follows from what changed
      const story = { ...tidy, translationReview: reviewAfterChange(stored, tidy, current.translation_review) };
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
   * Join or leave a translation group. Joining a story without a group makes one; a story cannot join its own group.
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
   * The story row under FOR UPDATE after the shared checks: 404 for no such story, 409 STALE when the editor's copy is
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
   * A status change inside the caller's transaction, with every check and the audit of `transition`. Returns whether
   * the published list changed, so the caller can empty the list cache after commit. The importer's --publish goes
   * through here, so a story published from a file is checked, attributed and audited like one published in the panel.
   *
   * Publishing needs approval first (409 NOT_REVIEWED): the whole-story check says the story is complete, the review
   * says someone read it.
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
   * Approve a story, or withdraw approval, with a note. Withdrawing approval from a live story is refused; unpublish it
   * first.
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

  /**
   * Correct one language of a story (text, title, summary, questions, reflections, notes) in any status but archived,
   * without taking it offline. The Kurdish is untouched, so the approval stays; the language is marked unreviewed. Only
   * that language's problems refuse the save (422 INVALID with paths). Audited with the language before and after; a
   * live story's lists refresh at once.
   */
  async saveTranslation(
    id: string,
    locale: AppLocale,
    input: LocaleTranslationInput,
    ctx: ActionContext & { lockVersion: number },
  ): Promise<AdminStory> {
    const live = await this.tx(async (client) => {
      const row = await this.lockStory(client, id, ctx.lockVersion);
      if (row.status === 'archived') throw new AppError('NOT_EDITABLE', 409, 'an archived story cannot be edited');
      const questions = (await this.questionsOf(client, [id])).get(id) ?? [];
      const before = storyInputOf(row, questions);
      for (const [field, list, have] of [
        ['questions', input.questions, questions.length],
        ['reflections', input.reflections, before.reflections?.length ?? 0],
        ['notes', input.notes, before.notes?.length ?? 0],
      ] as const) {
        if (list && list.length !== have) {
          throw invalid({
            errors: [{ code: 'TRANSLATION_COUNT', path: field, message: `the story has ${have} ${field} and this translation ${list.length}: send one for each, in order` }],
            warnings: [],
          });
        }
      }
      const after = tidyStory(withLocale(before, locale, input));
      const checked = validateStory(after, 'draft');
      const errors = localeProblems(checked.errors, locale);
      if (errors.length > 0) throw invalid({ errors, warnings: localeProblems(checked.warnings, locale) });
      const was = canonicalLocale(before, locale);
      if (canonicalLocale(after, locale) === was) return false;

      const review = { ...(row.translation_review ?? {}) };
      if (translatedLocales(after).includes(locale)) review[locale] = { status: 'unreviewed' };
      else delete review[locale];
      const res = await client.query<{ lock_version: number }>(
        `UPDATE stories SET translations = $2::jsonb, meta_translations = $3::jsonb, reflections = $4::jsonb, notes = $5::jsonb,
                translation_review = $6::jsonb, lock_version = lock_version + 1, updated_by = $7
          WHERE id = $1 RETURNING lock_version`,
        [
          id,
          JSON.stringify(after.translations),
          JSON.stringify(after.metaTranslations ?? {}),
          JSON.stringify(after.reflections ?? []),
          JSON.stringify(after.notes ?? []),
          JSON.stringify(review),
          ctx.adminId,
        ],
      );
      // the questions keep their ids (a game's plan names them): only their translations change
      if (input.questions) {
        await client.query(
          `UPDATE story_questions q SET translations = t.translations
             FROM jsonb_to_recordset($2::jsonb) AS t(id uuid, translations jsonb)
            WHERE q.id = t.id AND q.story_id = $1`,
          [id, JSON.stringify(questions.map((q, i) => ({ id: q.id, translations: after.questions[i]!.translations ?? {} })))],
        );
      }
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.translation',
        targetType: 'story',
        targetId: id,
        before: { slug: row.slug, status: row.status, locale, translation: JSON.parse(was), review: row.translation_review?.[locale] ?? null, lockVersion: row.lock_version },
        after: { slug: row.slug, status: row.status, locale, translation: JSON.parse(canonicalLocale(after, locale)), review: review[locale] ?? null, lockVersion: res.rows[0]!.lock_version },
        reason: ctx.reason ?? null,
        requestId: ctx.requestId ?? null,
      });
      return row.status === 'published';
    });
    if (live) await bustStoryLists(this.cache);
    return (await this.get(id))!;
  }

  /**
   * Record whether a native speaker has read one language's translation, with who, when and a note. Learners see
   * translations either way; this is the editors' record. Audited.
   */
  async reviewTranslation(
    id: string,
    locale: AppLocale,
    input: { status: StoryTranslationReviewStatus; note?: string | null },
    ctx: ActionContext & { lockVersion: number },
  ): Promise<AdminStory> {
    await this.tx(async (client) => {
      const row = await this.lockStory(client, id, ctx.lockVersion);
      if (row.status === 'archived') throw new AppError('BAD_STATE', 409, 'an archived story is not reviewed');
      const questions = (await this.questionsOf(client, [id])).get(id) ?? [];
      if (!translatedLocales(storyInputOf(row, questions)).includes(locale)) {
        throw new AppError('NOTHING_TO_REVIEW', 409, 'the story has no translation in this language yet');
      }
      const note = trimmedOrNull(input.note);
      const entry: StoryTranslationReviewEntry = { status: input.status, by: ctx.adminId, at: new Date().toISOString(), ...(note ? { note } : {}) };
      const res = await client.query<{ lock_version: number }>(
        `UPDATE stories SET translation_review = jsonb_set(translation_review, ARRAY[$2::text], $3::jsonb, true),
                lock_version = lock_version + 1, updated_by = $4
          WHERE id = $1 RETURNING lock_version`,
        [id, locale, JSON.stringify(entry), ctx.adminId],
      );
      await this.audit.record(client, {
        adminId: ctx.adminId,
        action: 'story.translation.review',
        targetType: 'story',
        targetId: id,
        before: { slug: row.slug, locale, review: row.translation_review?.[locale] ?? null, lockVersion: row.lock_version },
        after: { slug: row.slug, locale, review: entry, lockVersion: res.rows[0]!.lock_version },
        reason: ctx.reason ?? null,
        requestId: ctx.requestId ?? null,
      });
    });
    return (await this.get(id))!;
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
   * Delete a story nobody has played. Games reference their story (the foreign key refuses the delete), so a used story
   * answers 409 IN_USE: archive it instead. The audit keeps the whole story so a deletion can be undone by hand.
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
   * Delete a category. One with stories is refused with their count (409 IN_USE) unless forced, when the stories are
   * left unfiled (category set to null) and must be filed again before republishing.
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
