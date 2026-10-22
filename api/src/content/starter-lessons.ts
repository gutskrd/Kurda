/**
 * Starter lessons: complete lessons the API ships with (api/content/lessons),
 * written out in full and left as drafts for the team to record and publish.
 * The first is a conversation lesson, so the people recording it only have to
 * open it and say their lines.
 *
 * Each is seeded once, as the starter stories are (stories/import.ts): a row
 * in `content_seeds` remembers it, so a starter an editor deleted stays gone
 * rather than coming back on the next restart. It goes in at the end of the
 * skill its file names, in the course its file names; until that course is
 * loaded there is nowhere to put it, and it is tried again on the next start.
 * Nothing here throws: a broken file must not stop the API from starting.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { InvalidExercisePayloadError, validateExercisePayload } from './exercises.js';
import type { ExerciseType } from './repository.js';

export const STARTER_LESSON_FILE = new URL('../../content/lessons/starter.json', import.meta.url);

const TYPES = ['multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing', 'conversation'] as const satisfies readonly ExerciseType[];

const fileSchema = z.object({
  lessons: z.array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
      /** the course's slug */
      course: z.string().min(1),
      /** the skill's English title; the course's first skill when none has it */
      skill: z.string().min(1),
      titleKu: z.string().min(1).max(200),
      titleEn: z.string().min(1).max(200),
      exercises: z.array(z.object({ type: z.enum(TYPES), payload: z.unknown() })).min(1).max(50),
    }),
  ),
});

type Starter = z.infer<typeof fileSchema>['lessons'][number];

const seedName = (slug: string): string => `lessons:starter:${slug}`;

/** Where a starter goes: the skill its file names in its course, else the course's first. Null when the course is not loaded. */
async function skillFor(client: pg.PoolClient, starter: Starter): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id
      WHERE c.slug = $1
      ORDER BY lower(s.title_en) = lower($2) DESC, u.position, s.position
      LIMIT 1`,
    [starter.course, starter.skill],
  );
  return rows[0]?.id ?? null;
}

/**
 * Seed every starter lesson not seeded yet, each as a draft at the end of its
 * skill. Two instances starting together (a deploy's overlap) both try; the
 * marker is written first in the same transaction, so the second waits on the
 * first and then finds it done.
 */
export async function seedStarterLessons(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  file: URL = STARTER_LESSON_FILE,
): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];
  try {
    const parsed = fileSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    if (!parsed.success) {
      log.warn({ file: file.pathname, issues: parsed.error.issues.slice(0, 10) }, 'starter lessons file is not readable; skipped');
      return { seeded };
    }
    const starters = parsed.data.lessons.filter((starter) => {
      try {
        starter.exercises.forEach((ex) => validateExercisePayload(ex.type, ex.payload));
        return true;
      } catch (err) {
        const issues = err instanceof InvalidExercisePayloadError ? err.issues : String(err);
        log.warn({ slug: starter.slug, issues }, 'starter lesson has errors; not seeded until they are fixed');
        return false;
      }
    });
    if (starters.length === 0) return { seeded };

    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [starters.map((s) => seedName(s.slug))]);
    const marked = new Set(done.rows.map((r) => r.name));
    for (const starter of starters) {
      if (marked.has(seedName(starter.slug))) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const skillId = await skillFor(client, starter);
        if (!skillId) {
          await client.query('ROLLBACK');
          log.info({ slug: starter.slug, course: starter.course }, 'starter lesson waits for its course to be loaded');
          continue;
        }
        const mine = await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING name`, [seedName(starter.slug)]);
        if (mine.rowCount === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        const lesson = await client.query<{ id: string; position: number }>(
          `INSERT INTO lessons (skill_id, position, title_ku, title_en)
           VALUES ($1, (SELECT coalesce(max(position), 0) + 1 FROM lessons WHERE skill_id = $1), $2, $3)
           RETURNING id, position`,
          [skillId, starter.titleKu, starter.titleEn],
        );
        const { id, position } = lesson.rows[0]!;
        for (const [i, ex] of starter.exercises.entries()) {
          await client.query(`INSERT INTO exercises (lesson_id, position, type, payload) VALUES ($1, $2, $3, $4)`, [
            id,
            i + 1,
            ex.type,
            JSON.stringify(validateExercisePayload(ex.type, ex.payload)),
          ]);
        }
        await client.query('COMMIT');
        seeded.push(starter.slug);
        log.info({ slug: starter.slug, lessonId: id, position }, 'seeded a starter lesson as a draft');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, slug: starter.slug }, 'starter lesson could not be seeded');
      } finally {
        client.release();
      }
    }
  } catch (err) {
    log.warn({ err }, 'seeding the starter lessons failed');
  }
  return { seeded };
}
