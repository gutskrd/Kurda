/**
 * Reads what the recording script is made of (recording/script.ts) — every
 * lesson version a learner or an editor can reach, the stories, the learning
 * games' spoken lines, the course's voice plan and any Road lesson still only
 * in its files — and what has been recorded, for the "Record by person" page.
 *
 * The script changes only when content does, and building it walks every
 * lesson, so it is kept for a minute and built by one request at a time; the
 * takes are read fresh on every request, so a take made a moment ago shows as
 * done at once. Nothing here writes.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { isSpeakerId, type SpeakerId } from '@kurda/shared';
import { ROAD_DIR, readRoadFiles, roadSeedName } from '../content/road-seed.js';
import { buildScript, peopleOf, ROAD_COURSE, type ExerciseInput, type LineStore, type Person, type PlanInput, type ScriptLine, type VoiceId } from './script.js';
import { voicesOf } from './links.js';

/** How long a built script is kept. */
export const SCRIPT_TTL_MS = 60_000;

/** A take of a line, as the page shows it. */
export interface Take {
  url: string;
  durationMs: number | null;
  updatedAt: string;
  /** the character it is saved as said by */
  speaker: SpeakerId | null;
  /** who recorded it, by username; null when the account is gone */
  by: string | null;
}

export interface BuiltScript {
  lines: ScriptLine[];
  people: Person[];
  byId: ReadonlyMap<string, ScriptLine>;
}

interface ExerciseRow {
  course_slug: string;
  course_title: string;
  course_dialect: string;
  unit_position: number;
  unit_title: string;
  skill_position: number;
  lesson_id: string;
  lesson_position: number;
  lesson_title: string;
  status: string;
  version: number;
  exercise_position: number;
  type: string;
  payload: unknown;
}

interface RawPlan {
  characters?: Record<string, string>;
  units?: Array<{ skills?: Array<{ lessons?: Array<{ new?: Array<{ ku?: unknown; en?: unknown }> }> }> }>;
}

/** The voice plan's people and words; a plan that cannot be read leaves the three characters, in the studio's order. */
export function planFrom(raw: unknown): PlanInput {
  const plan = (typeof raw === 'object' && raw !== null ? raw : {}) as RawPlan;
  const about: Partial<Record<SpeakerId, string>> = {};
  const characters: SpeakerId[] = [];
  for (const [id, text] of Object.entries(plan.characters ?? {})) {
    if (!isSpeakerId(id)) continue;
    characters.push(id);
    if (typeof text === 'string') about[id] = text;
  }
  const words = (plan.units ?? []).flatMap((u) =>
    (u.skills ?? []).flatMap((s) =>
      (s.lessons ?? []).flatMap((l) =>
        (l.new ?? []).flatMap((w) => (typeof w.ku === 'string' && typeof w.en === 'string' ? [{ ku: w.ku, en: w.en }] : [])),
      ),
    ),
  );
  return { characters: characters.length > 0 ? characters : ['hamo', 'xezo', 'hevalo'], about, words };
}

export interface RecordingPeopleOptions {
  /** where the Road's plan and unit files are */
  roadDir?: URL;
  /**
   * List the Road lessons that are only in the files: not seeded (a file the
   * seeder refused, or one deployed since it ran) and with nothing else at
   * their place. Off under test, where the seeding is off too.
   */
  withRoadFiles?: boolean;
  ttlMs?: number;
}

export class RecordingPeopleService {
  private memo: { at: number; value: Promise<BuiltScript> } | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly options: RecordingPeopleOptions = {},
  ) {}

  /** The script, built at most once a minute however many ask. */
  script(): Promise<BuiltScript> {
    const now = Date.now();
    if (this.memo && now - this.memo.at < (this.options.ttlMs ?? SCRIPT_TTL_MS)) return this.memo.value;
    const value = this.build();
    const memo = { at: now, value };
    this.memo = memo;
    // a failed build is not kept: the next request tries again
    value.catch(() => {
      if (this.memo === memo) this.memo = null;
    });
    return value;
  }

  /** Forget the built script, so the next request reads the content again. */
  forget(): void {
    this.memo = null;
  }

  private async build(): Promise<BuiltScript> {
    const roadDir = this.options.roadDir ?? ROAD_DIR;
    const [exercises, stories, games, plan] = await Promise.all([
      this.pool.query<ExerciseRow>(
        // the lesson versions the studio lists: the newest that is not archived, and the newest published
        `WITH current AS (
           (SELECT DISTINCT ON (skill_id, position) id FROM lessons
            WHERE status <> 'archived' ORDER BY skill_id, position, version DESC)
           UNION
           (SELECT DISTINCT ON (skill_id, position) id FROM lessons
            WHERE status = 'published' ORDER BY skill_id, position, version DESC)
         )
         SELECT c.slug course_slug, c.title_en course_title, c.dialect course_dialect,
                u.position unit_position, u.title_en unit_title, s.position skill_position,
                l.id lesson_id, l.position lesson_position, l.title_en lesson_title, l.status, l.version,
                e.position exercise_position, e.type, e.payload
           FROM current
           JOIN lessons l ON l.id = current.id
           JOIN skills s ON s.id = l.skill_id
           JOIN units u ON u.id = s.unit_id
           JOIN courses c ON c.id = u.course_id
           JOIN exercises e ON e.lesson_id = l.id
          ORDER BY c.slug, u.position, s.position, l.position, l.version DESC, e.position`,
      ),
      this.pool.query<{ id: string; dialect: string; title: string; status: string; body: string }>(
        `SELECT id, dialect, title, status, body FROM stories WHERE status <> 'archived'
          ORDER BY dialect, level, array_position(ARRAY['short','medium','long'], length), title, id`,
      ),
      this.pool.query<{ id: string; kind: string; dialect: string; status: string; payload: unknown }>(
        `SELECT id, kind, dialect, status, payload FROM game_content
          WHERE status <> 'archived' AND kind = ANY($1::text[])
          ORDER BY dialect, level, created_at, id`,
        [['scenario', 'case_file', 'question_template', 'building_name']],
      ),
      readFile(new URL('plan.json', roadDir), 'utf8')
        .then((text) => planFrom(JSON.parse(text)))
        .catch(() => planFrom(null)),
    ]);

    const inputs: ExerciseInput[] = exercises.rows.map((r) => ({
      courseSlug: r.course_slug,
      courseTitle: r.course_title,
      courseDialect: r.course_dialect,
      unitPosition: r.unit_position,
      unitTitle: r.unit_title,
      skillPosition: r.skill_position,
      lessonPosition: r.lesson_position,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title,
      status: r.status,
      version: r.version,
      exercisePosition: r.exercise_position,
      type: r.type,
      payload: r.payload,
    }));
    if (this.options.withRoadFiles) inputs.push(...(await this.unseededRoad(roadDir, inputs)));

    const lines = buildScript({
      exercises: inputs,
      stories: stories.rows,
      games: games.rows,
      plan,
    });
    return { lines, people: peopleOf(lines, plan), byId: new Map(lines.map((l) => [l.id, l])) };
  }

  /**
   * The Road's lessons that are in its files and not in the course: never
   * seeded, and with no lesson at their place. A lesson the seeder put in and
   * an editor deleted since has its seed mark, and stays out, as it stays out
   * of the course. Each is listed as a draft, which is what it would be.
   */
  private async unseededRoad(dir: URL, inCourse: readonly ExerciseInput[]): Promise<ExerciseInput[]> {
    let files;
    try {
      files = await readRoadFiles(dir);
    } catch {
      return [];
    }
    if (files.lessons.length === 0) return [];
    const seeded = await this.pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name LIKE 'lessons:road:%'`);
    const marks = new Set(seeded.rows.map((r) => r.name));
    const places = new Set(inCourse.filter((e) => e.courseSlug === ROAD_COURSE).map((e) => `${e.unitPosition}:${e.skillPosition}:${e.lessonPosition}`));
    const course = files.course ?? { slug: ROAD_COURSE, dialect: 'kurmanji', titleEn: 'The Kurmanji Road' };
    return files.lessons.flatMap((lesson) => {
      if (marks.has(roadSeedName(lesson.key)) || places.has(`${lesson.unit.position}:${lesson.skill.position}:${lesson.position}`)) return [];
      return lesson.exercises.map((e) => ({
        courseSlug: ROAD_COURSE,
        courseTitle: course.titleEn,
        courseDialect: course.dialect ?? 'kurmanji',
        unitPosition: lesson.unit.position,
        unitTitle: lesson.unit.titleEn,
        skillPosition: lesson.skill.position,
        lessonPosition: lesson.position,
        lessonId: null,
        lessonTitle: lesson.titleEn,
        status: 'draft',
        version: 0,
        exercisePosition: e.position,
        type: e.type,
        payload: e.payload,
      }));
    });
  }

  /** Every key that has a take, in each store. */
  async recordedKeys(): Promise<Record<LineStore, ReadonlySet<string>>> {
    const [lesson, alphabet] = await Promise.all([
      this.pool.query<{ key: string }>(`SELECT key FROM lesson_audio`),
      this.pool.query<{ key: string }>(`SELECT key FROM alphabet_audio`),
    ]);
    return { lesson: new Set(lesson.rows.map((r) => r.key)), alphabet: new Set(alphabet.rows.map((r) => r.key)) };
  }

  /** The takes of these lines, by line id, with who recorded each. */
  async takes(lines: readonly ScriptLine[]): Promise<Map<string, Take>> {
    const keys = (store: LineStore): string[] => [...new Set(lines.filter((l) => l.store === store).map((l) => l.key))];
    type Row = { key: string; url: string; duration_ms: number | null; updated_at: Date; speaker: SpeakerId | null; username: string | null };
    const read = (sql: string, list: string[]) => (list.length === 0 ? Promise.resolve({ rows: [] as Row[] }) : this.pool.query<Row>(sql, [list]));
    const [lesson, alphabet] = await Promise.all([
      read(
        `SELECT a.key, a.url, a.duration_ms, a.updated_at, a.speaker, u.username
           FROM lesson_audio a LEFT JOIN users u ON u.id = a.recorded_by WHERE a.key = ANY($1::text[])`,
        keys('lesson'),
      ),
      read(
        `SELECT a.key, a.url, a.duration_ms, a.updated_at, a.speaker, u.username
           FROM alphabet_audio a LEFT JOIN users u ON u.id = a.updated_by WHERE a.key = ANY($1::text[])`,
        keys('alphabet'),
      ),
    ]);
    const out = new Map<string, Take>();
    const take = (r: Row): Take => ({ url: r.url, durationMs: r.duration_ms, updatedAt: r.updated_at.toISOString(), speaker: r.speaker, by: r.username });
    for (const r of lesson.rows) out.set(`lesson|${r.key}`, take(r));
    for (const r of alphabet.rows) out.set(`alphabet|${r.key}`, take(r));
    return out;
  }

  /** Whether a take of `key` in `store` is one of the lines of the voices linked to this account. */
  async mayRecord(userId: string, store: LineStore, key: string): Promise<boolean> {
    const [voices, built] = await Promise.all([voicesOf(this.pool, userId), this.script()]);
    const line = built.byId.get(`${store}|${key}`);
    return line !== undefined && voices.includes(line.voice);
  }

  async voicesOf(userId: string): Promise<VoiceId[]> {
    return voicesOf(this.pool, userId);
  }
}
