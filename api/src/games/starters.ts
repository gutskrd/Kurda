/**
 * Starter content written for the learning games, seeded once each: today,
 * Kurdish Detective's first case (api/content/games).
 *
 * A starter case is written in the interface languages only — its title,
 * suspects, questions and solution — and its evidence names lines of the
 * course's own conversations by the conversation and the line's English
 * rather than holding any Kurdish. Seeding copies each line's Kurdish, its
 * English, who says it and the key its recording is filed under from the
 * conversation as it is in the database (published, else its newest
 * version), so nothing Kurdish is written for the game. The row goes in
 * published, as the rest of the starter library does (starter-library.ts):
 * `source = 'starter'`, approved with no reviewer named, which the admin
 * panel shows as not yet read by a person.
 *
 * Each starter is seeded once, as the starter stories are (stories/import.ts):
 * a row in `content_seeds` remembers it, so a starter an editor deleted stays
 * gone. One whose lines are not in the database yet (the course not seeded)
 * waits for a later start; one that fails its kind's checks is logged and
 * skipped. Nothing here throws: a broken file must not stop the API starting.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { EVIDENCE_KINDS, GAME_DIALECTS, checkGameContent, conversationLineKey, isSpeakerId } from '@kurda/shared';
import { conversationPayloadSchema } from '../content/exercises.js';

export const STARTER_GAME_FILES = [new URL('../../content/games/detective.json', import.meta.url)];

const seedName = (slug: string): string => `game_content:starter:${slug}`;

const meanings = z.record(z.string(), z.string());
const fileSchema = z.object({
  cases: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
      dialect: z.enum(GAME_DIALECTS),
      level: z.number().int().min(1).max(5),
      title: meanings,
      intro: meanings,
      suspects: z.array(z.object({ id: z.string(), name: z.string(), about: meanings, portrait: z.string().optional() })),
      evidence: z.array(
        z.object({
          id: z.string(),
          kind: z.enum(EVIDENCE_KINDS),
          from: z.string().optional(),
          /** the conversation (its own id) and the English of the line in it */
          line: z.object({ conversation: z.string(), en: z.string() }),
        }),
      ),
      steps: z.array(z.object({ prompt: meanings, options: z.array(meanings), correctIndex: z.number().int(), evidence: z.array(z.string()) })),
      culprit: z.string(),
      solution: meanings,
      hints: z.array(meanings).default([]),
    }),
  ),
});
export type StarterCase = z.infer<typeof fileSchema>['cases'][number];

/** A conversation as the database holds it: its exercise and its payload. */
export interface StoredConversation {
  exerciseId: string;
  payload: unknown;
}

/** The same English, give or take spacing and the kind of apostrophe. */
const sameEnglish = (a: string, b: string): boolean => {
  const key = (s: string) => s.normalize('NFC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  return key(a) === key(b);
};

/**
 * A starter case with its evidence filled in from the conversations (pure,
 * for the tests): the case file's payload, or the lines that could not be
 * found. The English is the lesson's own, so a line found is the line meant.
 */
export function resolveStarterCase(
  starter: StarterCase,
  conversations: ReadonlyMap<string, StoredConversation>,
): { ok: true; payload: unknown } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const evidence = starter.evidence.map((e) => {
    const stored = conversations.get(e.line.conversation);
    const parsed = stored ? conversationPayloadSchema.safeParse(stored.payload) : null;
    const lines = parsed?.success ? parsed.data.lines : [];
    const index = lines.findIndex((l) => typeof l.en === 'string' && sameEnglish(l.en, e.line.en));
    const line = lines[index];
    if (!stored || !parsed?.success || !line) {
      missing.push(`${e.line.conversation}: ${e.line.en}`);
      return null;
    }
    const character = parsed.data.speakers[line.speaker]?.character;
    return {
      id: e.id,
      kind: e.kind,
      ku: line.text,
      meanings: { en: line.en! },
      ...(isSpeakerId(character) ? { speaker: character } : {}),
      ...(e.from ? { from: e.from } : {}),
      recording: conversationLineKey(parsed.data.id, line.speaker, line.text) || undefined,
      origin: { type: 'conversation', ref: `${stored.exerciseId}:${index}` },
    };
  });
  if (missing.length > 0) return { ok: false, missing };
  const { title, intro, suspects, steps, culprit, solution, hints } = starter;
  const payload = { title, intro, suspects, evidence, steps, culprit, solution, hints };
  // as it will be stored: what is not there is left out, not written as undefined
  return { ok: true, payload: JSON.parse(JSON.stringify(payload)) as unknown };
}

/** Every conversation the starters name, as the database holds it: a published version first, else the newest. */
async function conversationsNamed(pool: pg.Pool, ids: readonly string[]): Promise<Map<string, StoredConversation>> {
  const res = await pool.query<{ conversation: string; id: string; payload: unknown }>(
    `SELECT DISTINCT ON (e.payload->>'id') e.payload->>'id' AS conversation, e.id, e.payload
       FROM exercises e JOIN lessons l ON l.id = e.lesson_id
      WHERE e.type = 'conversation' AND e.payload->>'id' = ANY($1::text[])
      ORDER BY e.payload->>'id', (l.status = 'published') DESC, l.version DESC, e.id`,
    [ids],
  );
  return new Map(res.rows.map((r) => [r.conversation, { exerciseId: r.id, payload: r.payload }]));
}

export async function seedStarterGameContent(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  files: readonly URL[] = STARTER_GAME_FILES,
): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];
  try {
    const cases: StarterCase[] = [];
    for (const file of files) {
      try {
        const parsed = fileSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
        if (parsed.success) cases.push(...parsed.data.cases);
        else log.warn({ file: file.pathname, issues: parsed.error.issues.slice(0, 10) }, 'starter game content file is not readable; skipped');
      } catch (err) {
        log.warn({ err, file: file.pathname }, 'starter game content file could not be read; skipped');
      }
    }
    if (cases.length === 0) return { seeded };
    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [cases.map((c) => seedName(c.slug))]);
    const marked = new Set(done.rows.map((r) => r.name));
    const waiting = cases.filter((c) => !marked.has(seedName(c.slug)));
    if (waiting.length === 0) return { seeded };
    const conversations = await conversationsNamed(pool, [...new Set(waiting.flatMap((c) => c.evidence.map((e) => e.line.conversation)))]);

    for (const starter of waiting) {
      const resolved = resolveStarterCase(starter, conversations);
      if (!resolved.ok) {
        log.info({ slug: starter.slug, missing: resolved.missing.slice(0, 5) }, 'starter case waits for its lessons');
        continue;
      }
      const checked = checkGameContent('case_file', starter.dialect, resolved.payload);
      if (!checked.ok) {
        log.warn({ slug: starter.slug, issues: checked.issues.slice(0, 10) }, 'starter case has errors; not seeded until they are fixed');
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query(
          `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
           VALUES ('case_file', $1, $2, $3::jsonb, 'starter', $4, 'published', 'approved', now(), now())
           ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING
           RETURNING id`,
          [starter.dialect, starter.level, JSON.stringify(checked.payload), `starter:${starter.slug}`],
        );
        await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(starter.slug)]);
        await client.query('COMMIT');
        if ((row.rowCount ?? 0) > 0) seeded.push(starter.slug);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, slug: starter.slug }, 'starter case could not be seeded');
      } finally {
        client.release();
      }
    }
    if (seeded.length > 0) log.info({ seeded }, 'starter game content seeded');
  } catch (err) {
    log.warn({ err }, 'starter game content could not be seeded');
  }
  return { seeded };
}
