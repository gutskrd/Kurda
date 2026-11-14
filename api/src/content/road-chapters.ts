/**
 * The Kurmanji Road's chapters, and each one going online by itself.
 *
 * A chapter is one unit of the road's course: four parts of four lessons,
 * seeded as drafts (road-seed.ts). It goes online as a whole, the moment the
 * last recording it needs is made: every lesson in it is published together,
 * so a learner never meets half a chapter, or a chapter with silent lines.
 * What it needs is every recording its lessons play — each exercise's model
 * (`lessonAudioTargets`) and each conversation's lines (`conversationClips`),
 * keyed as the studio files them.
 *
 * Only a chapter that is not online yet goes online this way, and only its
 * lessons still at their first version (draft or in review) are published:
 * a lesson an editor is reworking after it went out (a later version) stays
 * theirs, through the usual review. A chapter with nothing to record never
 * goes online by itself, since there is nothing to wait for.
 *
 * `publishRecordedChapters` checks every chapter and publishes the ready ones;
 * `RoadChapterWatch` runs it after each take is saved, one run at a time, so
 * a burst of takes costs one check after another, never two at once.
 */
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { conversationClips, lessonAudioKey, lessonAudioTargets } from '@kurda/shared';
import { ROAD_COURSE } from './road-seed.js';

type Log = Pick<FastifyBaseLogger, 'info' | 'warn'>;

/** A chapter as the console shows it. */
export interface RoadChapter {
  position: number;
  titleKu: string;
  titleEn: string;
  /** places that hold a lesson */
  lessons: number;
  /** of them, places with a published lesson */
  published: number;
  /** the recordings the chapter's lessons play */
  lines: number;
  /** of them, recorded */
  recorded: number;
  /** a published lesson at every place: learners see the whole chapter */
  online: boolean;
}

interface PlaceRow {
  unit: number;
  title_ku: string;
  title_en: string;
  /** the newest version at the place that is not archived */
  lesson_id: string;
  version: number;
  status: string;
  /** some version at the place is published */
  out: boolean;
  exercises: Array<{ type: string; payload: unknown }>;
}

/** Every recording these exercises play, as the studio keys them. */
export function chapterKeys(exercises: ReadonlyArray<{ type: string; payload: unknown }>): Set<string> {
  const keys = new Set<string>();
  for (const ex of exercises) {
    if (ex.type === 'conversation') {
      for (const clip of conversationClips(ex.payload)) keys.add(clip.key);
      continue;
    }
    for (const text of lessonAudioTargets(ex.type, ex.payload)) {
      const key = lessonAudioKey(text);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Every place in the course with its newest lesson that is not archived, by
 * chapter; or only chapter `unit`'s, its lessons locked first when `lock`, so
 * what is read is what the caller's transaction will publish.
 */
async function places(db: Pick<pg.Pool, 'query'>, course: string, unit: number | null = null, lock = false): Promise<Map<number, PlaceRow[]>> {
  const where = `c.slug = $1 AND ($2::int IS NULL OR u.position = $2) AND l.status <> 'archived'`;
  const from = 'lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id JOIN courses c ON c.id = u.course_id';
  if (lock) await db.query(`SELECT l.id FROM ${from} WHERE ${where} ORDER BY l.id FOR UPDATE OF l`, [course, unit]);
  const { rows } = await db.query<PlaceRow>(
    `SELECT DISTINCT ON (s.id, l.position)
            u.position unit, u.title_ku, u.title_en, l.id lesson_id, l.version, l.status,
            EXISTS (SELECT 1 FROM lessons p WHERE p.skill_id = l.skill_id AND p.position = l.position AND p.status = 'published') out,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('type', e.type, 'payload', e.payload) ORDER BY e.position)
                        FROM exercises e WHERE e.lesson_id = l.id), '[]'::jsonb) exercises
       FROM ${from}
      WHERE ${where}
      ORDER BY s.id, l.position, l.version DESC`,
    [course, unit],
  );
  const out = new Map<number, PlaceRow[]>();
  for (const r of rows) {
    const list = out.get(r.unit) ?? [];
    list.push(r);
    out.set(r.unit, list);
  }
  return out;
}

/** Which of `keys` have a take; `lock` share-locks them, so none can go before the caller commits. */
async function recorded(db: Pick<pg.Pool, 'query'>, keys: readonly string[], lock: boolean): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { rows } = await db.query<{ key: string }>(`SELECT key FROM lesson_audio WHERE key = ANY($1::text[])${lock ? ' FOR SHARE' : ''}`, [keys]);
  return new Set(rows.map((r) => r.key));
}

function summarize(position: number, list: readonly PlaceRow[], made: ReadonlySet<string>): RoadChapter & { keys: string[]; waiting: PlaceRow[] } {
  const keys = new Set<string>();
  for (const p of list) for (const k of chapterKeys(p.exercises)) keys.add(k);
  const first = list[0]!;
  return {
    position,
    titleKu: first.title_ku,
    titleEn: first.title_en,
    lessons: list.length,
    published: list.filter((p) => p.out).length,
    lines: keys.size,
    recorded: [...keys].filter((k) => made.has(k)).length,
    online: list.every((p) => p.out),
    keys: [...keys],
    // what going online publishes: each place not out yet, with its first version waiting
    waiting: list.filter((p) => !p.out),
  };
}

/** The course's chapters in order, with how far each has been recorded and whether it is online. */
export async function roadChapters(pool: pg.Pool, course: string = ROAD_COURSE): Promise<RoadChapter[]> {
  const byUnit = await places(pool, course);
  const all = [...new Set([...byUnit.values()].flatMap((list) => list.flatMap((p) => [...chapterKeys(p.exercises)])))];
  const made = await recorded(pool, all, false);
  return [...byUnit.keys()]
    .sort((a, b) => a - b)
    .map((n) => {
      const c = summarize(n, byUnit.get(n)!, made);
      return { position: c.position, titleKu: c.titleKu, titleEn: c.titleEn, lessons: c.lessons, published: c.published, lines: c.lines, recorded: c.recorded, online: c.online };
    });
}

/** Whether a chapter can go online now: not online, every waiting place at its first version, and every line recorded. */
function ready(c: ReturnType<typeof summarize>): boolean {
  return !c.online && c.lines > 0 && c.recorded === c.lines && c.waiting.every((p) => p.version === 1 && (p.status === 'draft' || p.status === 'in_review'));
}

/**
 * Publish every chapter whose recordings are all made; the chapters published,
 * by position. Each goes online in its own transaction, which locks its
 * lessons and the takes they play and checks again before it publishes.
 */
export async function publishRecordedChapters(pool: pg.Pool, log: Log, course: string = ROAD_COURSE): Promise<number[]> {
  const byUnit = await places(pool, course);
  const all = [...new Set([...byUnit.values()].flatMap((list) => list.flatMap((p) => [...chapterKeys(p.exercises)])))];
  const made = await recorded(pool, all, false);
  const candidates = [...byUnit.keys()].sort((a, b) => a - b).filter((n) => ready(summarize(n, byUnit.get(n)!, made)));

  const published: number[] = [];
  for (const n of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = (await places(client, course, n, true)).get(n);
      const chapter = now ? summarize(n, now, await recorded(client, [...new Set(now.flatMap((p) => [...chapterKeys(p.exercises)]))], true)) : null;
      if (!chapter || !ready(chapter)) {
        await client.query('ROLLBACK');
        continue;
      }
      const ids = chapter.waiting.map((p) => p.lesson_id);
      await client.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
      await client.query('COMMIT');
      published.push(n);
      log.info(
        { course, chapter: n, lessons: ids.length, recordings: chapter.lines },
        `road chapter ${n} (${chapter.titleEn}) is online: all ${chapter.lines} recordings made, ${ids.length} lessons published`,
      );
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      log.warn({ err, course, chapter: n }, 'road chapter could not go online; tried again after the next take');
    } finally {
      client.release();
    }
  }
  return published;
}

/**
 * Runs `publishRecordedChapters` when asked, one run at a time: a request
 * while a run is going makes one more run after it, however many come.
 * Never throws; a failed run is logged and the next request tries again.
 */
export class RoadChapterWatch {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly log: Log,
    private readonly course: string = ROAD_COURSE,
  ) {}

  /** Check the chapters soon; resolves when this request's run is over. */
  nudge(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = async (): Promise<void> => {
      do {
        this.again = false;
        try {
          await publishRecordedChapters(this.pool, this.log, this.course);
        } catch (err) {
          this.log.warn({ err }, 'checking the road chapters failed');
        }
      } while (this.again);
    };
    this.running = run().finally(() => {
      this.running = null;
    });
    return this.running;
  }
}
