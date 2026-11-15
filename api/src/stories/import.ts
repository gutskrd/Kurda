/**
 * Stories from JSON files: the `stories:import` command, and the starter
 * stories the API seeds on its own.
 *
 * Both read the same format (schema.ts) and store through `saveStory`, with
 * the same `validateStory` — a file the command accepts is one the admin
 * panel could have produced, and the reverse.
 *
 * Starter stories (api/content/stories: kurmanci.json, sorani.json, the
 * road's chapter stories and the legends) are the app's own library, and the
 * owner wants learners to have them, so each arrives published and approved,
 * marked `source = 'starter'`. A story a file says too little for to publish
 * waits as a draft until its file is fixed. Each is seeded once and
 * remembered in `content_seeds`, so a starter an editor archived or deleted
 * stays gone after the next restart, and a starter added to the files later
 * still arrives.
 *
 * Until a person changes a starter in the admin panel (every admin action
 * sets `updated_by`), its file is where it is written: a later start brings
 * the stored story up to the file, so a correction to the Kurdish reaches the
 * app with the next deploy. Once a native speaker has touched it, the panel
 * is where it lives and the file no longer speaks for it. The review of each
 * translation stays as the reviewers left it, or unreviewed: publishing is
 * not a claim that a native speaker has checked the text.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import {
  validateStory,
  type StoryGlossEntry,
  type StoryInput,
  type StoryLanguage,
  type StoryMetaTranslation,
  type StoryNoteInput,
  type StoryReflectionInput,
  type StorySourceInput,
  type StoryTradition,
  type StoryTranslationReviewEntry,
  type StoryValidationStage,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { StoryAdminService, canonicalContent, reviewAfterChange, saveStory, tidyStory, type StoryDraft } from './admin-service.js';
import { storyFileSchema, storyInputFrom } from './schema.js';
import { bustStoryLists, type QuestionRow } from './service.js';

export interface StoryImportIssue {
  /** `stories[3] (kmr-qelema-sin).questions[2].options[1]` */
  path: string;
  message: string;
}

export type StoryImportOutcome = 'created' | 'updated' | 'unchanged' | 'kept';

export interface StoryImportResult {
  ok: boolean;
  dryRun: boolean;
  /** errors: with any, nothing was written */
  issues: StoryImportIssue[];
  warnings: StoryImportIssue[];
  stories: Array<{
    slug: string;
    outcome: StoryImportOutcome;
    /** 'kept': why the stored story was left as it is */
    note?: string;
    /** published by this run (--publish) */
    published: boolean;
  }>;
}

/** Parse and check a whole file: the stories, or every problem with where it is. */
export function parseStoryFile(
  raw: unknown,
  stage: StoryValidationStage,
): { drafts: StoryDraft[]; issues: StoryImportIssue[]; warnings: StoryImportIssue[] } {
  const parsed = storyFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      drafts: [],
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      warnings: [],
    };
  }
  const drafts: StoryDraft[] = [];
  const issues: StoryImportIssue[] = [];
  const warnings: StoryImportIssue[] = [];
  const slugs = new Set<string>();
  parsed.data.stories.forEach((content, i) => {
    const at = `stories[${i}] (${content.slug})`;
    if (slugs.has(content.slug)) issues.push({ path: `${at}.slug`, message: 'another story in this file has the same slug' });
    slugs.add(content.slug);
    const draft = tidyStory({ ...storyInputFrom(content), slug: content.slug });
    const { errors, warnings: advice } = validateStory(draft, stage);
    for (const e of errors) issues.push({ path: `${at}.${e.path}`, message: e.message });
    for (const w of advice) warnings.push({ path: `${at}.${w.path}`, message: w.message });
    drafts.push(draft);
  });
  return { drafts, issues, warnings };
}

interface StoredRow {
  id: string;
  status: string;
  /** who last changed it in the admin panel; null when a file (this command, the seeding) wrote it last */
  updated_by: string | null;
  /** whether a reviewer approved the content as it stands */
  review_status: 'unreviewed' | 'approved';
  dialect: StoryDraft['dialect'];
  language: StoryLanguage;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  story_source: string | null;
  source_url: string | null;
  attribution_note: string | null;
  translations: Record<string, string>;
  cover: string | null;
  reading_minutes: number | null;
  meta_translations: Record<string, StoryMetaTranslation> | null;
  reflections: StoryReflectionInput[] | null;
  notes: StoryNoteInput[] | null;
  sources: StorySourceInput[] | null;
  translation_review: Record<string, StoryTranslationReviewEntry> | null;
}

/** Every column `storedInput` reads, besides the questions. */
const STORED_COLUMNS = `id, status, updated_by, review_status, dialect, language, level, title, summary, body, glossary, category, tradition, author,
  story_source, source_url, attribution_note, translations, cover, reading_minutes,
  meta_translations, reflections, notes, sources, translation_review`;

/**
 * The stored story in the file's own shape, so "unchanged" compares what the
 * file says with what is there — every field the file can set, the library
 * fields included: a file that only adds a category to a story is a change.
 */
async function storedInput(db: pg.PoolClient, row: StoredRow): Promise<StoryInput> {
  const questions = await db.query<QuestionRow>(`SELECT * FROM story_questions WHERE story_id = $1 ORDER BY position`, [row.id]);
  const content = {
    dialect: row.dialect,
    language: row.language,
    level: row.level,
    title: row.title,
    summary: row.summary,
    body: row.body,
    glossary: row.glossary,
    questions: questions.rows.map((q) => ({
      kind: q.kind,
      prompt: q.prompt,
      promptEn: q.prompt_en,
      options: q.options,
      correctIndex: q.correct_index,
      explanation: q.explanation,
      explanationEn: q.explanation_en,
      evidenceParagraph: q.evidence_paragraph,
      evidenceSentence: q.evidence_sentence,
      translations: q.translations ?? {},
    })),
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
  return content;
}

/**
 * `canonicalContent` plus the library fields, which the importer owns as much
 * as the text — the sources among them. The per-language review counts only
 * when the file says something about it; a file that does not leaves the
 * stored review to follow from what changed.
 */
function canonicalFile(story: StoryInput, withReview = true): string {
  const review = Object.entries(story.translationReview ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([locale, r]) => [locale, r.status, r.by ?? null, r.at ?? null, r.note ?? null]);
  return JSON.stringify([
    canonicalContent(story),
    story.language ?? 'ku',
    story.category,
    story.tradition,
    story.author,
    story.source,
    story.sourceUrl,
    story.attributionNote,
    story.cover,
    story.readingMinutes,
    (story.sources ?? []).map((src) => [src.title, src.author ?? null, src.url ?? null, src.type, src.note ?? null]),
    withReview ? review : null,
  ]);
}

export interface StoryImportOptions {
  /** do everything, report it, then roll it all back */
  dryRun?: boolean;
  /** publish every story the file created or that is a draft, after the full check */
  publish?: boolean;
  /** the editor (a user id) who publishes: required with `publish`, for the story and its audit */
  publishedBy?: string;
  source?: 'admin' | 'starter';
  /** also replace a draft someone has changed in the admin panel */
  force?: boolean;
  /** the API's cache, so a story published here reaches the hub at once */
  cache?: Cache | null;
}

/**
 * Import a file of stories, all or nothing, idempotent by slug: a new slug
 * is created as a draft, a draft whose content changed is updated (and its
 * lock version bumped, so an editor with it open reloads before saving over
 * it), and a story in review, published or archived is never overwritten —
 * people are looking at it. A draft that was approved loses the approval when
 * its content is replaced, as it does when an editor changes it in the panel:
 * the approval was given to the text that is gone, and publishing asks only
 * whether the story is approved.
 *
 * Nor, without `force`, is a draft someone changed in the admin panel: a
 * native speaker correcting a starter there must not lose the corrections to
 * the next import of the file. The importer knows them by `updated_by`, which
 * every admin action sets and every import clears. (An editor whose account
 * is deleted leaves it null, and their drafts unprotected.)
 *
 * With `publish`, every story the file created or that is a draft is
 * approved and published through the admin's own review and status change,
 * as `publishedBy` — the editor named has read the file — so it is checked,
 * attributed and audited like a publish in the panel, and the hub's cached
 * list is emptied once it is committed. A dry run does everything inside a
 * transaction it then rolls back, so it reports exactly what a real run
 * would do.
 */
export async function importStories(pool: pg.Pool, raw: unknown, options: StoryImportOptions = {}): Promise<StoryImportResult> {
  const dryRun = options.dryRun === true;
  const publish = options.publish === true;
  if (publish && !options.publishedBy) throw new Error('importStories: publishing needs publishedBy, the editor who publishes');
  const { drafts, issues, warnings } = parseStoryFile(raw, publish ? 'publish' : 'draft');
  const result: StoryImportResult = { ok: issues.length === 0, dryRun, issues, warnings, stories: [] };
  if (issues.length > 0) return result;

  const admin = new StoryAdminService(pool);
  let listChanged = false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const draft of drafts) {
      const found = await client.query<StoredRow>(`SELECT ${STORED_COLUMNS} FROM stories WHERE slug = $1 FOR UPDATE`, [draft.slug]);
      const row = found.rows[0];
      let id: string;
      let outcome: StoryImportOutcome;
      const stored = row && row.status === 'draft' ? await storedInput(client, row) : null;
      // a file that says nothing of who reviewed which translation leaves that to follow from what it changed
      const fileReview = draft.translationReview !== undefined;
      if (!row) {
        id = (await saveStory(client, draft, { insert: { source: options.source ?? 'admin', createdBy: null } }))!;
        outcome = 'created';
      } else if (row.status !== 'draft') {
        result.stories.push({ slug: draft.slug, outcome: 'kept', note: `${row.status.replace('_', ' ')}: not overwritten`, published: false });
        continue;
      } else if (canonicalFile(stored!, fileReview) === canonicalFile(draft, fileReview)) {
        id = row.id;
        outcome = 'unchanged';
      } else if (row.updated_by !== null && options.force !== true) {
        result.stories.push({
          slug: draft.slug,
          outcome: 'kept',
          note: 'changed in the admin panel: not overwritten (--force replaces it)',
          published: false,
        });
        continue;
      } else {
        id = row.id;
        // the content changed, so an approval of the old content goes with it (StoryAdminService.update does the same)
        const resetReview = row.review_status === 'approved';
        const review = fileReview ? draft.translationReview : reviewAfterChange(stored!, draft, row.translation_review);
        await saveStory(client, { ...draft, translationReview: review }, {
          id,
          set:
            'lock_version = lock_version + 1, updated_by = NULL' +
            (resetReview ? `, review_status = 'unreviewed', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL` : ''),
        });
        outcome = 'updated';
      }
      if (publish) {
        // the row is this transaction's since the SELECT above, so its version now is the one this run left
        const version = async () => (await client.query<{ lock_version: number }>(`SELECT lock_version FROM stories WHERE id = $1`, [id])).rows[0]!.lock_version;
        // the editor who publishes from a file has read it: their approval goes on record before the publish asks for it
        await admin.reviewIn(
          client,
          id,
          { approved: true, note: 'approved by the stories:import command' },
          { adminId: options.publishedBy!, lockVersion: await version(), reason: 'published by the stories:import command' },
        );
        listChanged =
          (await admin.transitionIn(client, id, 'publish', {
            adminId: options.publishedBy!,
            lockVersion: await version(),
            reason: 'published by the stories:import command',
          })) || listChanged;
      }
      result.stories.push({ slug: draft.slug, outcome, published: publish });
    }
    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  if (listChanged && !dryRun) await bustStoryLists(options.cache);
  return result;
}

/**
 * Where the starter stories are, beside the other content the API ships with:
 * the starter stories, the stories Hamo tells at the end of each chapter of
 * the road (road.json), which go online with their chapter (content/road-chapters.ts),
 * and the legends (legends.json): long tellings in sections, with their notes,
 * sources and translations.
 */
export const STARTER_STORY_FILES = ['kurmanci.json', 'sorani.json', 'road.json', 'legends.json'].map(
  (name) => new URL(`../../content/stories/${name}`, import.meta.url),
);

const seedName = (slug: string): string => `stories:starter:${slug}`;

/**
 * Seed the starter stories, each once, and keep the ones nobody has changed
 * in the panel as their files say (see the top of the file). Runs at every
 * start and costs a few queries once everything is seeded and current. A
 * story that fails the draft check is skipped and logged — it is seeded on a
 * later start, once its file is fixed — and nothing here ever throws: a
 * broken content file must not stop the API from starting.
 *
 * A starter is published, and approved, only once its file passes the check
 * a publish in the panel makes; a published one is brought up to its file
 * only by a file that still passes it, so learners never meet half a story.
 *
 * Two instances starting together (a deploy's overlap) both try the same
 * slugs; the insert skips a slug that exists, the marker insert skips a
 * marker that exists, and each story is brought up to its file under a row
 * lock, so neither fails and nothing is doubled.
 */
export async function seedStarterStories(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  files: readonly URL[] = STARTER_STORY_FILES,
  cache: Cache | null = null,
): Promise<{ seeded: string[]; refreshed: string[]; published: string[] }> {
  const seeded: string[] = [];
  const refreshed: string[] = [];
  const published: string[] = [];
  try {
    const drafts: StoryDraft[] = [];
    // the stories whose file says everything a published story needs
    const ready = new Set<string>();
    for (const file of files) {
      try {
        const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
        const parsed = parseStoryFile(raw, 'draft');
        const broken = new Set(parsed.issues.map((i) => /^stories\[(\d+)\]/.exec(i.path)?.[1]).filter((n) => n !== undefined));
        // a file still waiting for its stories is fine; one that cannot be read is worth a word in the log
        if (parsed.drafts.length === 0 && parsed.issues.length > 0) {
          log.warn({ file: file.pathname, issues: parsed.issues.slice(0, 10) }, 'starter stories file is not readable; skipped');
        }
        parsed.drafts.forEach((draft, i) => {
          if (broken.has(String(i))) {
            const problems = parsed.issues.filter((p) => p.path.startsWith(`stories[${i}]`)).slice(0, 10);
            log.warn({ slug: draft.slug, problems }, 'starter story has errors; not seeded until they are fixed');
          } else {
            drafts.push(draft);
          }
        });
        const full = parseStoryFile(raw, 'publish');
        const unready = new Set(full.issues.map((i) => /^stories\[(\d+)\]/.exec(i.path)?.[1]).filter((n) => n !== undefined));
        full.drafts.forEach((draft, i) => {
          if (!unready.has(String(i))) ready.add(draft.slug);
        });
        const waiting = full.drafts.filter((d, i) => unready.has(String(i)) && !broken.has(String(i))).map((d) => d.slug);
        if (waiting.length > 0) log.warn({ stories: waiting }, 'starter stories not ready to publish; they wait as drafts until their file is fixed');
      } catch (err) {
        log.warn({ err, file: file.pathname }, 'starter stories file could not be read; skipped');
      }
    }
    if (drafts.length === 0) return { seeded, refreshed, published };

    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [
      drafts.map((d) => seedName(d.slug)),
    ]);
    const marked = new Set(done.rows.map((r) => r.name));
    for (const draft of drafts) {
      if (marked.has(seedName(draft.slug))) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const id = await saveStory(client, draft, { insert: { source: 'starter', createdBy: null, skipIfSlugTaken: true } });
        await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(draft.slug)]);
        await client.query('COMMIT');
        if (id) seeded.push(draft.slug);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, slug: draft.slug }, 'starter story could not be seeded');
      } finally {
        client.release();
      }
    }
    if (seeded.length > 0) log.info({ stories: seeded }, `seeded ${seeded.length} starter stories`);

    // every starter no person has changed: brought up to its file, and published once its file is ready
    for (const draft of drafts) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query<StoredRow>(
          `SELECT ${STORED_COLUMNS} FROM stories
            WHERE slug = $1 AND source = 'starter' AND updated_by IS NULL AND status IN ('draft', 'published') FOR UPDATE`,
          [draft.slug],
        );
        const row = found.rows[0];
        const isReady = ready.has(draft.slug);
        if (row && (row.status === 'draft' || isReady)) {
          const stored = await storedInput(client, row);
          const fileReview = draft.translationReview !== undefined;
          if (canonicalFile(stored, fileReview) !== canonicalFile(draft, fileReview)) {
            // a translation whose text changed is unreviewed again, as an edit in the panel leaves it
            const review = fileReview ? draft.translationReview : reviewAfterChange(stored, draft, row.translation_review);
            // the version moves, so an editor with the story open reloads before saving over it
            await saveStory(client, { ...draft, translationReview: review }, { id: row.id, set: 'lock_version = lock_version + 1, updated_at = now()' });
            refreshed.push(draft.slug);
          }
          if (row.status === 'draft' && isReady) {
            await client.query(
              `UPDATE stories SET status = 'published', published_at = now(), review_status = 'approved', reviewed_at = now(), updated_at = now()
                WHERE id = $1`,
              [row.id],
            );
            published.push(draft.slug);
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, slug: draft.slug }, 'starter story could not be brought up to its file');
      } finally {
        client.release();
      }
    }
    if (refreshed.length > 0) log.info({ stories: refreshed }, `brought ${refreshed.length} starter stories up to their files`);
    if (published.length > 0) log.info({ stories: published }, `published ${published.length} starter stories`);
    // the library's cached lists were made before these were out or changed
    if (refreshed.length + published.length > 0) await bustStoryLists(cache);
  } catch (err) {
    log.warn({ err }, 'seeding the starter stories failed');
  }
  return { seeded, refreshed, published };
}
