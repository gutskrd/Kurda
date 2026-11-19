/**
 * The Kurmanji Road's chapters, each going online by itself.
 *
 * A chapter is one unit of the road's course (four parts of four lessons, seeded as drafts by road-seed.ts). It goes
 * online whole the moment the last recording it needs is made, so learners never meet half a chapter or silent lines.
 * It needs every recording its lessons play: each exercise's model (`lessonAudioTargets`) and each conversation's lines
 * (`conversationClips`). A line is recorded under its words, as the script files it; a take under its conversation and
 * part counts too.
 *
 * Only a chapter not yet online goes online this way, and only lessons still at their first version (draft or in
 * review) are published; a lesson an editor is reworking (a later version) goes through the usual review. A chapter
 * with nothing to record never goes online by itself.
 *
 * The chapter's story (slug naming the chapter, `road-01-…`, shared `roadStoryChapter`) belongs to it the same way: its
 * sentences are recordings the chapter waits for, and it is published and approved with the lessons. A story added to
 * an online chapter goes online once its sentences are in.
 *
 * `publishRecordedChapters` checks every chapter and publishes the ready ones; `RoadChapterWatch` runs it after each
 * saved take, one run at a time.
 */
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { conversationClips, lessonAudioKey, lessonAudioTargets, roadStoryChapter } from '@kurda/shared';
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
  /** the chapter's story, the one Hamo tells at its end, when it has one */
  story: { slug: string; title: string; online: boolean } | null;
  /** the recordings the chapter's lessons and story play */
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

/** Every recording these exercises play, each under its words. */
export function chapterKeys(exercises: ReadonlyArray<{ type: string; payload: unknown }>): Set<string> {
  const keys = new Set<string>();
  for (const ex of exercises) {
    if (ex.type === 'conversation') {
      for (const clip of conversationClips(ex.payload)) keys.add(lessonAudioKey(clip.text));
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
 * Every course place with its newest non-archived lesson, by chapter; or only chapter `unit`'s, its lessons locked
 * first when `lock`, so what is read is what the caller's transaction will publish.
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

interface StoryRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  sentence_keys: string[];
}

/**
 * The chapters' non-archived stories by chapter; or only chapter `unit`'s, locked first when `lock`. A story whose
 * length falls between bands cannot be published (the table refuses it), so it is left out rather than hold its chapter
 * back; content tests keep the road's stories in a band.
 */
async function chapterStories(db: Pick<pg.Pool, 'query'>, unit: number | null = null, lock = false): Promise<Map<number, StoryRow>> {
  const pattern = unit === null ? 'road-__-%' : `road-${String(unit).padStart(2, '0')}-%`;
  const { rows } = await db.query<StoryRow>(
    `SELECT id, slug, title, status, sentence_keys FROM stories
      WHERE slug LIKE $1 AND status IN ('draft', 'in_review', 'published') AND length IS NOT NULL
      ORDER BY slug${lock ? ' FOR UPDATE' : ''}`,
    [pattern],
  );
  const out = new Map<number, StoryRow>();
  for (const r of rows) {
    const n = roadStoryChapter(r.slug);
    // one story a chapter: the first by slug, if an editor ever made two
    if (n !== null && !out.has(n)) out.set(n, r);
  }
  return out;
}

/** Each conversation line's own key (its conversation and part) to the key of its words: a take under either serves it. */
export function lineAliases(exercises: ReadonlyArray<{ type: string; payload: unknown }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const ex of exercises) {
    if (ex.type === 'conversation') for (const clip of conversationClips(ex.payload)) out.set(clip.key, lessonAudioKey(clip.text));
  }
  return out;
}

/**
 * Which of `keys` have a take, counting a conversation line's own take for its words (`aliases`); `lock` share-locks
 * them, so none can go before the caller commits.
 */
async function recorded(db: Pick<pg.Pool, 'query'>, keys: readonly string[], lock: boolean, aliases: ReadonlyMap<string, string> = new Map()): Promise<Set<string>> {
  const asked = [...new Set([...keys, ...aliases.keys()])];
  if (asked.length === 0) return new Set();
  const { rows } = await db.query<{ key: string }>(`SELECT key FROM lesson_audio WHERE key = ANY($1::text[])${lock ? ' FOR SHARE' : ''}`, [asked]);
  const made = new Set(rows.map((r) => r.key));
  for (const [own, words] of aliases) if (made.has(own)) made.add(words);
  return made;
}

function aliasesOf(list: readonly PlaceRow[]): Map<string, string> {
  return new Map(list.flatMap((p) => [...lineAliases(p.exercises)]));
}

type Summary = RoadChapter & { keys: string[]; waiting: PlaceRow[]; waitingStory: StoryRow | null };

function keysOf(list: readonly PlaceRow[], story: StoryRow | undefined): Set<string> {
  const keys = new Set<string>();
  for (const p of list) for (const k of chapterKeys(p.exercises)) keys.add(k);
  for (const k of story?.sentence_keys ?? []) if (k) keys.add(k);
  return keys;
}

function summarize(position: number, list: readonly PlaceRow[], story: StoryRow | undefined, made: ReadonlySet<string>): Summary {
  const keys = keysOf(list, story);
  const first = list[0]!;
  return {
    position,
    titleKu: first.title_ku,
    titleEn: first.title_en,
    lessons: list.length,
    published: list.filter((p) => p.out).length,
    story: story ? { slug: story.slug, title: story.title, online: story.status === 'published' } : null,
    lines: keys.size,
    recorded: [...keys].filter((k) => made.has(k)).length,
    online: list.every((p) => p.out),
    keys: [...keys],
    // what going online publishes: each place not out yet, with its first version waiting, and the story if it waits
    waiting: list.filter((p) => !p.out),
    waitingStory: story && story.status !== 'published' ? story : null,
  };
}

/** Every chapter of the course with its story, and which of all their recordings are made. */
async function survey(
  db: Pick<pg.Pool, 'query'>,
  course: string,
  withStories: boolean,
): Promise<{ byUnit: Map<number, PlaceRow[]>; stories: Map<number, StoryRow>; made: Set<string> }> {
  const [byUnit, stories] = await Promise.all([places(db, course), withStories ? chapterStories(db) : Promise.resolve(new Map<number, StoryRow>())]);
  const all = [...new Set([...byUnit].flatMap(([n, list]) => [...keysOf(list, stories.get(n))]))];
  const aliases = new Map([...byUnit.values()].flatMap((list) => [...aliasesOf(list)]));
  return { byUnit, stories, made: await recorded(db, all, false, aliases) };
}

/**
 * The course's chapters in order, with recording progress and whether each is online. Stories are the road's
 * (`withStories`); a test's own course has none unless it says so.
 */
export async function roadChapters(pool: pg.Pool, course: string = ROAD_COURSE, withStories = course === ROAD_COURSE): Promise<RoadChapter[]> {
  const { byUnit, stories, made } = await survey(pool, course, withStories);
  return [...byUnit.keys()]
    .sort((a, b) => a - b)
    .map((n) => {
      const c = summarize(n, byUnit.get(n)!, stories.get(n), made);
      return {
        position: c.position,
        titleKu: c.titleKu,
        titleEn: c.titleEn,
        lessons: c.lessons,
        published: c.published,
        story: c.story,
        lines: c.lines,
        recorded: c.recorded,
        online: c.online,
      };
    });
}

/**
 * Whether a chapter can go online now (not online, every waiting place at its first version, every line recorded), or,
 * once online, whether a story added since can follow with all its sentences recorded.
 */
function ready(c: Summary): boolean {
  if (c.lines === 0 || c.recorded !== c.lines) return false;
  if (c.online) return c.waitingStory !== null;
  return c.waiting.every((p) => p.version === 1 && (p.status === 'draft' || p.status === 'in_review'));
}

/**
 * Publish every chapter whose recordings are all made; returns the chapters published, by position. Each goes online in
 * its own transaction, which locks its lessons and their takes and checks again before publishing.
 */
export async function publishRecordedChapters(pool: pg.Pool, log: Log, course: string = ROAD_COURSE, withStories = course === ROAD_COURSE): Promise<number[]> {
  const { byUnit, stories, made } = await survey(pool, course, withStories);
  const candidates = [...byUnit.keys()].sort((a, b) => a - b).filter((n) => ready(summarize(n, byUnit.get(n)!, stories.get(n), made)));

  const published: number[] = [];
  for (const n of candidates) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = (await places(client, course, n, true)).get(n);
      const story = withStories ? (await chapterStories(client, n, true)).get(n) : undefined;
      const chapter = now ? summarize(n, now, story, await recorded(client, [...keysOf(now, story)], true, aliasesOf(now))) : null;
      if (!chapter || !ready(chapter)) {
        await client.query('ROLLBACK');
        continue;
      }
      const ids = chapter.waiting.map((p) => p.lesson_id);
      if (ids.length > 0) await client.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
      if (chapter.waitingStory) {
        await client.query(
          `UPDATE stories SET status = 'published', published_at = now(), review_status = 'approved', reviewed_at = now(), updated_at = now() WHERE id = $1`,
          [chapter.waitingStory.id],
        );
      }
      await client.query('COMMIT');
      published.push(n);
      log.info(
        { course, chapter: n, lessons: ids.length, story: chapter.waitingStory?.slug ?? null, recordings: chapter.lines },
        `road chapter ${n} (${chapter.titleEn}) is online: all ${chapter.lines} recordings made, ${ids.length} lessons` +
          (chapter.waitingStory ? ` and its story ‘${chapter.waitingStory.title}’` : '') +
          ' published',
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
 * Runs `publishRecordedChapters` on request, one run at a time: requests during a run cause exactly one more run. Never
 * throws; a failed run is logged and the next request retries.
 */
export class RoadChapterWatch {
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly log: Log,
    private readonly course: string = ROAD_COURSE,
    private readonly withStories = course === ROAD_COURSE,
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
          await publishRecordedChapters(this.pool, this.log, this.course, this.withStories);
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
