/**
 * Detective's cases (api/content/games/detective/kmr.json and ckb.json), kept as their files say until a person changes
 * one in the admin.
 *
 * A case is written in the app's languages only (title, suspects, questions, solution and hints, each in all nine), and
 * its evidence names lines the course already has instead of holding Kurdish: a lesson conversation line by
 * conversation and English, or a published story sentence by story, paragraph and position (`storySentences`, as the
 * reader and studio cut them). Seeding copies each line's Kurdish, speaker and recording key from its source; a line's
 * meaning is the lesson's English, overridden by the case's own translations (story sentences have no English, so the
 * case gives it).
 *
 * A case's row has `origin` `starter:<slug>`, as the first case had when seeded once (games/starters.ts), so that row
 * is kept current here. A case with no row goes in published; one nobody changed (`updated_by`) is updated to its file
 * on every start; one a person changed is theirs. A case removed from its file, or marked `"retired": true`, is
 * archived if unchanged. Seeded cases are recorded in `content_seeds` under both the starter name and this file's.
 *
 * A case whose lines are missing (course or story not seeded yet) waits for a later start; one failing its checks is
 * logged and skipped. Nothing here throws: a broken file must not stop the API.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  EVIDENCE_KINDS,
  GAME_DIALECTS,
  checkGameContent,
  conversationLineKey,
  isSpeakerId,
  isStoryHeading,
  lessonAudioKey,
  storyParagraphs,
  storySentences,
  storySpelling,
  type GameDialect,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { conversationPayloadSchema } from '../content/exercises.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';

export const DETECTIVE_CASE_FILES: Readonly<Record<GameDialect, URL>> = {
  kmr: new URL('../../content/games/detective/kmr.json', import.meta.url),
  ckb: new URL('../../content/games/detective/ckb.json', import.meta.url),
};

/** The one-time seeding's name for a case (games/starters.ts), and this file's. */
const starterName = (slug: string): string => `game_content:starter:${slug}`;
const caseName = (slug: string): string => `game_content:detective-case:${slug}`;
const originOf = (slug: string): string => `starter:${slug}`;

const meanings = z.record(z.string(), z.string());
const conversationLine = z.object({ conversation: z.string(), en: z.string(), meanings: meanings.optional() });
const storyLine = z.object({
  story: z.string(),
  paragraph: z.number().int().min(0),
  sentence: z.number().int().min(0),
  en: z.string(),
  /** the sentence's first words, so a story edited since is noticed rather than quoted wrong */
  opens: z.string().optional(),
  meanings: meanings.optional(),
});
const caseSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  dialect: z.enum(GAME_DIALECTS),
  level: z.number().int().min(1).max(5),
  retired: z.boolean().optional(),
  title: meanings,
  intro: meanings,
  suspects: z.array(z.object({ id: z.string(), name: z.string(), about: meanings, portrait: z.string().optional() })),
  evidence: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(EVIDENCE_KINDS),
      from: z.string().optional(),
      line: z.union([storyLine, conversationLine]),
    }),
  ),
  steps: z.array(z.object({ prompt: meanings, options: z.array(meanings), correctIndex: z.number().int(), evidence: z.array(z.string()) })),
  culprit: z.string(),
  /** cards no step proves but the solution names, there for colour (Baran is honest): the content checks need to know */
  background: z.array(z.string()).default([]),
  solution: meanings,
  hints: z.array(meanings).default([]),
});
const fileSchema = z.object({ cases: z.array(caseSchema) });
export type DetectiveCase = z.infer<typeof caseSchema>;
export type DetectiveCaseFile = z.infer<typeof fileSchema>;

export function readCaseFile(raw: unknown): { ok: true; file: DetectiveCaseFile } | { ok: false; issues: string } {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, file: parsed.data };
}

/** A conversation as the database holds it: its exercise and its payload. */
export interface CaseConversation {
  exerciseId: string;
  payload: unknown;
}

/** A published story a case quotes, by its slug: its id and its body. */
export interface CaseStory {
  id: string;
  body: string;
}

/** The same English, give or take spacing and the kind of apostrophe. */
const sameEnglish = (a: string, b: string): boolean => {
  const key = (s: string) => s.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  return key(a) === key(b);
};

const isStoryLine = (l: DetectiveCase['evidence'][number]['line']): l is z.infer<typeof storyLine> => 'story' in l;

/**
 * A case with its evidence filled in from conversations and stories (pure, for tests): the payload, or the lines not
 * found. A conversation line is found by its English (the lesson's own, so unambiguous); a story sentence by position,
 * checked against its first words when the case gives them.
 */
export function resolveCase(
  kase: DetectiveCase,
  conversations: ReadonlyMap<string, CaseConversation>,
  stories: ReadonlyMap<string, CaseStory>,
): { ok: true; payload: unknown } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const evidence = kase.evidence.map((e) => {
    const extra = e.line.meanings ?? {};
    if (isStoryLine(e.line)) {
      const story = stories.get(e.line.story);
      const paragraph = story ? storyParagraphs(story.body)[e.line.paragraph] : undefined;
      const sentence = paragraph && !isStoryHeading(paragraph) ? storySentences(paragraph)[e.line.sentence] : undefined;
      if (!story || !sentence || (e.line.opens && !sentence.normalize('NFC').startsWith(e.line.opens.normalize('NFC').trim()))) {
        missing.push(`${e.line.story}#${e.line.paragraph}.${e.line.sentence}: ${e.line.en}`);
        return null;
      }
      const recording = lessonAudioKey(sentence);
      return {
        id: e.id,
        kind: e.kind,
        ku: sentence,
        meanings: { ...extra, en: e.line.en },
        ...(e.from ? { from: e.from } : {}),
        ...(recording ? { recording } : {}),
        origin: { type: 'story', ref: `${story.id}:${e.line.paragraph}` },
      };
    }
    const line0 = e.line;
    const stored = conversations.get(line0.conversation);
    const parsed = stored ? conversationPayloadSchema.safeParse(stored.payload) : null;
    const lines = parsed?.success ? parsed.data.lines : [];
    const index = lines.findIndex((l) => typeof l.en === 'string' && sameEnglish(l.en, line0.en));
    const line = lines[index];
    if (!stored || !parsed?.success || !line) {
      missing.push(`${line0.conversation}: ${line0.en}`);
      return null;
    }
    const character = parsed.data.speakers[line.speaker]?.character;
    return {
      id: e.id,
      kind: e.kind,
      ku: line.text,
      meanings: { ...extra, en: line.en! },
      ...(isSpeakerId(character) ? { speaker: character } : {}),
      ...(e.from ? { from: e.from } : {}),
      recording: conversationLineKey(parsed.data.id, line.speaker, line.text) || undefined,
      origin: { type: 'conversation', ref: `${stored.exerciseId}:${index}` },
    };
  });
  if (missing.length > 0) return { ok: false, missing };
  const { title, intro, suspects, steps, culprit, solution, hints } = kase;
  const payload = { title, intro, suspects, evidence, steps, culprit, solution, hints };
  // as it will be stored: what is not there is left out, not written as undefined
  return { ok: true, payload: JSON.parse(JSON.stringify(payload)) as unknown };
}

/** Every conversation the cases name, as the database holds it: a published version first, else the newest. */
async function conversationsNamed(pool: pg.Pool, ids: readonly string[]): Promise<Map<string, CaseConversation>> {
  if (ids.length === 0) return new Map();
  const res = await pool.query<{ conversation: string; id: string; payload: unknown }>(
    `SELECT DISTINCT ON (e.payload->>'id') e.payload->>'id' AS conversation, e.id, e.payload
       FROM exercises e JOIN lessons l ON l.id = e.lesson_id
      WHERE e.type = 'conversation' AND e.payload->>'id' = ANY($1::text[])
      ORDER BY e.payload->>'id', (l.status = 'published') DESC, l.version DESC, e.id`,
    [ids],
  );
  return new Map(res.rows.map((r) => [r.conversation, { exerciseId: r.id, payload: r.payload }]));
}

/** Every published, approved story the cases quote, by slug. */
async function storiesNamed(pool: pg.Pool, dialect: GameDialect, slugs: readonly string[]): Promise<Map<string, CaseStory>> {
  if (slugs.length === 0) return new Map();
  const res = await pool.query<{ id: string; slug: string; body: string }>(
    `SELECT id, slug, body FROM stories WHERE dialect = $1 AND slug = ANY($2::text[]) AND status = 'published' AND review_status = 'approved'`,
    [storySpelling(dialect), slugs],
  );
  return new Map(res.rows.map((r) => [r.slug, { id: r.id, body: r.body }]));
}

/** A value as text with its keys in order, so a row read back from jsonb compares equal to the file it came from. */
function stable(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sorted(x)]),
          )
        : v;
  return JSON.stringify(sorted(value));
}

export interface CaseSeedResult {
  seeded: string[];
  refreshed: string[];
  archived: string[];
  waiting: string[];
}

export async function seedDetectiveCases(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  cache: Cache | null = null,
  files: Readonly<Partial<Record<GameDialect, URL>>> = DETECTIVE_CASE_FILES,
): Promise<CaseSeedResult> {
  const result: CaseSeedResult = { seeded: [], refreshed: [], archived: [], waiting: [] };
  for (const dialect of GAME_DIALECTS) {
    const url = files[dialect];
    if (!url) continue;
    try {
      let read: ReturnType<typeof readCaseFile>;
      try {
        read = readCaseFile(JSON.parse(await readFile(url, 'utf8')));
      } catch (err) {
        log.warn({ err, file: url.pathname }, 'detective cases could not be read; skipped');
        continue;
      }
      if (!read.ok) {
        log.warn({ file: url.pathname, issues: read.issues.slice(0, 600) }, 'detective cases file is not readable; skipped');
        continue;
      }
      const cases = read.file.cases.filter((c) => c.dialect === dialect);
      const live = cases.filter((c) => !c.retired);
      const [conversations, stories, marks] = await Promise.all([
        conversationsNamed(pool, [...new Set(live.flatMap((c) => c.evidence.flatMap((e) => (isStoryLine(e.line) ? [] : [e.line.conversation]))))]),
        storiesNamed(pool, dialect, [...new Set(live.flatMap((c) => c.evidence.flatMap((e) => (isStoryLine(e.line) ? [e.line.story] : []))))]),
        pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name LIKE 'game_content:%'`),
      ]);
      const marked = new Set(marks.rows.map((m) => m.name));

      for (const kase of live) {
        const resolved = resolveCase(kase, conversations, stories);
        if (!resolved.ok) {
          result.waiting.push(kase.slug);
          log.info({ slug: kase.slug, missing: resolved.missing.slice(0, 5) }, 'detective case waits for its lines');
          continue;
        }
        const checked = checkGameContent('case_file', dialect, resolved.payload);
        if (!checked.ok) {
          log.warn({ slug: kase.slug, issues: checked.issues.slice(0, 10) }, 'detective case has errors; not seeded until they are fixed');
          continue;
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const found = await client.query<{ id: string; payload: unknown; level: number; status: string; untouched: boolean }>(
            `SELECT id, payload, level, status, (updated_by IS NULL) AS untouched FROM game_content
              WHERE kind = 'case_file' AND dialect = $1 AND origin = $2 FOR UPDATE`,
            [dialect, originOf(kase.slug)],
          );
          const row = found.rows[0];
          if (!row) {
            // a case an editor deleted stays gone
            if (!marked.has(caseName(kase.slug)) && !marked.has(starterName(kase.slug))) {
              await client.query(
                `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
                 VALUES ('case_file', $1, $2, $3::jsonb, 'starter', $4, 'published', 'approved', now(), now())
                 ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING`,
                [dialect, kase.level, JSON.stringify(checked.payload), originOf(kase.slug)],
              );
              result.seeded.push(kase.slug);
            }
          } else if (row.untouched && (row.level !== kase.level || row.status !== 'published' || stable(row.payload) !== stable(checked.payload))) {
            // the version moves, so an editor with the row open reloads before saving over it
            await client.query(
              `UPDATE game_content
                  SET payload = $2::jsonb, level = $3, status = 'published', review_status = 'approved',
                      reviewed_at = COALESCE(reviewed_at, now()), published_at = COALESCE(published_at, now()), lock_version = lock_version + 1
                WHERE id = $1`,
              [row.id, JSON.stringify(checked.payload), kase.level],
            );
            result.refreshed.push(kase.slug);
          }
          await client.query(`INSERT INTO content_seeds (name) VALUES ($1), ($2) ON CONFLICT (name) DO NOTHING`, [starterName(kase.slug), caseName(kase.slug)]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          log.warn({ err, slug: kase.slug }, 'detective case could not be seeded');
        } finally {
          client.release();
        }
      }

      // a case this file seeded once that is now retired or gone: archived, unless somebody has changed it
      const active = new Set(live.map((c) => c.slug));
      const ours = [...marked].filter((n) => n.startsWith('game_content:detective-case:')).map((n) => n.slice('game_content:detective-case:'.length));
      const away = [...new Set([...ours, ...cases.filter((c) => c.retired).map((c) => c.slug)])].filter((slug) => !active.has(slug));
      if (away.length > 0) {
        const res = await pool.query<{ origin: string }>(
          `UPDATE game_content SET status = 'archived', lock_version = lock_version + 1
            WHERE kind = 'case_file' AND dialect = $1 AND origin = ANY($2::text[]) AND updated_by IS NULL AND status <> 'archived'
           RETURNING origin`,
          [dialect, away.map(originOf)],
        );
        result.archived.push(...res.rows.map((r) => r.origin.slice('starter:'.length)));
      }
    } catch (err) {
      log.warn({ err, dialect }, 'detective cases could not be seeded');
    }
  }
  if (result.seeded.length + result.refreshed.length + result.archived.length > 0) {
    log.info({ seeded: result.seeded, refreshed: result.refreshed, archived: result.archived }, 'detective cases brought up to their files');
    await Promise.all([bustGamePools(cache), bustAvailability(cache)]).catch(() => undefined);
  }
  return result;
}
