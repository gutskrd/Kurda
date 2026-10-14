/**
 * Stories from JSON files: the `stories:import` command, and the starter
 * stories the API seeds on its own.
 *
 * Both read the same format (schema.ts) and store through `saveStory`, with
 * the same `validateStory` — a file the command accepts is one the admin
 * panel could have produced, and the reverse.
 *
 * Starter stories (api/content/stories/kurmanci.json and sorani.json) were
 * written by Claude. The owner's rule is that a native speaker reads and
 * publishes each one, so they arrive as drafts marked `source = 'starter'`,
 * once: each is remembered in `content_seeds`, so a starter an editor
 * archived or deleted stays gone after the next restart, and a starter added
 * to the files later still arrives.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { validateStory, type StoryGlossEntry, type StoryInput, type StoryValidationStage } from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { StoryAdminService, saveStory, tidyStory, type StoryDraft } from './admin-service.js';
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

// a story's content in one fixed order — jsonb does not keep the key order it was given
function canonical(story: StoryInput): string {
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
  ]);
}

interface StoredRow {
  id: string;
  status: string;
  /** who last changed it in the admin panel; null when a file (this command, the seeding) wrote it last */
  updated_by: string | null;
  dialect: StoryInput['dialect'];
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
}

async function storedContent(db: pg.PoolClient, row: StoredRow): Promise<string> {
  const questions = await db.query<QuestionRow>(`SELECT * FROM story_questions WHERE story_id = $1 ORDER BY position`, [row.id]);
  return canonical({
    dialect: row.dialect,
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
    })),
  });
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
 * people are looking at it.
 *
 * Nor, without `force`, is a draft someone changed in the admin panel: a
 * native speaker correcting a starter there must not lose the corrections to
 * the next import of the file. The importer knows them by `updated_by`, which
 * every admin action sets and every import clears. (An editor whose account
 * is deleted leaves it null, and their drafts unprotected.)
 *
 * With `publish`, every story the file created or that is a draft is
 * published through the admin's own status change, as `publishedBy`: checked,
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
      const found = await client.query<StoredRow>(
        `SELECT id, status, updated_by, dialect, level, title, summary, body, glossary FROM stories WHERE slug = $1 FOR UPDATE`,
        [draft.slug],
      );
      const row = found.rows[0];
      let id: string;
      let outcome: StoryImportOutcome;
      if (!row) {
        id = (await saveStory(client, draft, { insert: { source: options.source ?? 'admin', createdBy: null } }))!;
        outcome = 'created';
      } else if (row.status !== 'draft') {
        result.stories.push({ slug: draft.slug, outcome: 'kept', note: `${row.status.replace('_', ' ')}: not overwritten`, published: false });
        continue;
      } else if ((await storedContent(client, row)) === canonical(draft)) {
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
        await saveStory(client, draft, { id, set: 'lock_version = lock_version + 1, updated_by = NULL' });
        outcome = 'updated';
      }
      if (publish) {
        // the row is this transaction's since the SELECT above, so its version now is the one this run left
        const current = await client.query<{ lock_version: number }>(`SELECT lock_version FROM stories WHERE id = $1`, [id]);
        listChanged =
          (await admin.transitionIn(client, id, 'publish', {
            adminId: options.publishedBy!,
            lockVersion: current.rows[0]!.lock_version,
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

/** Where the starter stories are, beside the other content the API ships with. */
export const STARTER_STORY_FILES = ['kurmanci.json', 'sorani.json'].map(
  (name) => new URL(`../../content/stories/${name}`, import.meta.url),
);

const seedName = (slug: string): string => `stories:starter:${slug}`;

/**
 * Seed the starter stories as drafts, each once (see the top of the file).
 * Runs at every start and costs one query once everything is seeded. A story
 * that fails the draft check is skipped and logged — it is seeded on a later
 * start, once its file is fixed — and nothing here ever throws: a broken
 * content file must not stop the API from starting.
 *
 * Two instances starting together (a deploy's overlap) both try the same
 * slugs; the insert skips a slug that exists, and the marker insert skips a
 * marker that exists, so neither fails and nothing is doubled.
 */
export async function seedStarterStories(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  files: readonly URL[] = STARTER_STORY_FILES,
): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];
  try {
    const drafts: StoryDraft[] = [];
    for (const file of files) {
      try {
        const parsed = parseStoryFile(JSON.parse(await readFile(file, 'utf8')), 'draft');
        const broken = new Set(parsed.issues.map((i) => /^stories\[(\d+)\]/.exec(i.path)?.[1]).filter((n) => n !== undefined));
        if (parsed.drafts.length === 0) {
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
      } catch (err) {
        log.warn({ err, file: file.pathname }, 'starter stories file could not be read; skipped');
      }
    }
    if (drafts.length === 0) return { seeded };

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
    if (seeded.length > 0) log.info({ stories: seeded }, `seeded ${seeded.length} starter stories as drafts`);
  } catch (err) {
    log.warn({ err }, 'seeding the starter stories failed');
  }
  return { seeded };
}
