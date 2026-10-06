import type pg from 'pg';
import { lessonAudioKey, lessonAudioTargets } from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';
import type { ContentStatus } from '../content/workflow.js';

/** One lesson that uses a text, and how. */
export interface LessonAudioUsage {
  courseId: string;
  courseTitle: string;
  unitId: string;
  unitTitle: string;
  skillId: string;
  skillTitle: string;
  /** the lesson's place in its skill: with skillId, the lesson across all its versions */
  lessonPosition: number;
  /** the newest version that uses the text */
  lessonId: string;
  lessonTitle: string;
  /** of the newest version that uses the text: a draft, when an editor has added it there */
  lessonStatus: ContentStatus;
  lessonVersion: number;
  /** the published version uses it: learners meet it today */
  live: boolean;
  /** the exercise types in this lesson that use the text, without repeats */
  exerciseTypes: ExerciseType[];
  /**
   * A listening item here has no clip of its own and this text is what it
   * plays: until it is recorded, the item cannot be done at all.
   */
  listeningNeedsIt: boolean;
}

export interface LessonAudioItem {
  key: string;
  /** as the first lesson to use it writes it; as it was recorded, when no lesson does */
  text: string;
  recorded: boolean;
  url: string | null;
  durationMs: number | null;
  updatedAt: string | null;
  /** lessons that use it, in course order: the first is where the studio files it */
  usedIn: LessonAudioUsage[];
  /** recorded, but no lesson uses it any more (or it was added by hand) */
  unused: boolean;
}

export interface LessonAudioList {
  items: LessonAudioItem[];
  summary: { needed: number; recorded: number; missing: number; unused: number };
}

interface ExerciseRow {
  course_id: string;
  course_title: string;
  unit_id: string;
  unit_title: string;
  skill_id: string;
  skill_title: string;
  lesson_id: string;
  lesson_position: number;
  lesson_title: string;
  status: ContentStatus;
  version: number;
  type: ExerciseType;
  payload: unknown;
}

interface RecordingRow {
  key: string;
  text: string;
  url: string;
  duration_ms: number;
  updated_at: Date;
}

/** Whether a listening payload has no clip of its own, and plays the text keyed `key` instead. */
function playsWithoutClip(payload: unknown, key: string): boolean {
  const p = (payload ?? {}) as { audioUrl?: unknown; accepted?: unknown };
  const first = Array.isArray(p.accepted) ? p.accepted[0] : undefined;
  return !p.audioUrl && typeof first === 'string' && lessonAudioKey(first) === key;
}

/**
 * The lessons' side of the audio studio: every Kurdish text a lesson wants
 * heard, whether it has a recording yet, and which lessons use it.
 */
export class LessonAudioService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Walks every lesson in every course. For each lesson slot (skill and
   * position) it reads two versions, which are usually one: the newest that
   * is not archived — a draft, so editors can record before they publish —
   * and the newest published one, which is what learners play meanwhile. A
   * text either of them uses is needed; a recording neither uses is unused.
   *
   * Rows come in course order, newest version first within a slot, so the
   * first usage of a text is where it first appears in the course.
   */
  async list(): Promise<LessonAudioList> {
    const [exercises, recordings] = await Promise.all([
      this.pool.query<ExerciseRow>(
        `WITH current AS (
           (SELECT DISTINCT ON (skill_id, position) id FROM lessons
            WHERE status <> 'archived' ORDER BY skill_id, position, version DESC)
           UNION
           (SELECT DISTINCT ON (skill_id, position) id FROM lessons
            WHERE status = 'published' ORDER BY skill_id, position, version DESC)
         )
         SELECT c.id course_id, c.title_en course_title, u.id unit_id, u.title_en unit_title,
                s.id skill_id, s.title_en skill_title,
                l.id lesson_id, l.position lesson_position, l.title_en lesson_title, l.status, l.version,
                e.type, e.payload
         FROM current
         JOIN lessons l ON l.id = current.id
         JOIN skills s ON s.id = l.skill_id
         JOIN units u ON u.id = s.unit_id
         JOIN courses c ON c.id = u.course_id
         JOIN exercises e ON e.lesson_id = l.id
         ORDER BY c.slug, u.position, s.position, l.position, l.version DESC, e.position`,
      ),
      this.pool.query<RecordingRow>(`SELECT key, text, url, duration_ms, updated_at FROM lesson_audio`),
    ]);

    const items = new Map<string, LessonAudioItem>();
    // one usage per lesson slot, even when the draft and the live version both use the text
    const usageBySlot = new Map<string, LessonAudioUsage>();
    for (const row of exercises.rows) {
      for (const text of lessonAudioTargets(row.type, row.payload)) {
        const key = lessonAudioKey(text);
        let item = items.get(key);
        if (!item) {
          item = { key, text, recorded: false, url: null, durationMs: null, updatedAt: null, usedIn: [], unused: false };
          items.set(key, item);
        }
        const slot = `${key}\u0000${row.skill_id}\u0000${row.lesson_position}`;
        let usage = usageBySlot.get(slot);
        if (!usage) {
          usage = {
            courseId: row.course_id,
            courseTitle: row.course_title,
            unitId: row.unit_id,
            unitTitle: row.unit_title,
            skillId: row.skill_id,
            skillTitle: row.skill_title,
            lessonPosition: row.lesson_position,
            lessonId: row.lesson_id,
            lessonTitle: row.lesson_title,
            lessonStatus: row.status,
            lessonVersion: row.version,
            live: false,
            exerciseTypes: [],
            listeningNeedsIt: false,
          };
          usageBySlot.set(slot, usage);
          item.usedIn.push(usage);
        }
        if (row.status === 'published') usage.live = true;
        if (!usage.exerciseTypes.includes(row.type)) usage.exerciseTypes.push(row.type);
        if (row.type === 'listening' && playsWithoutClip(row.payload, key)) usage.listeningNeedsIt = true;
      }
    }
    const needed = items.size;

    let recorded = 0;
    const unused: LessonAudioItem[] = [];
    for (const r of recordings.rows) {
      const found = items.get(r.key);
      const recording = { recorded: true, url: r.url, durationMs: r.duration_ms, updatedAt: r.updated_at.toISOString() };
      if (found) {
        Object.assign(found, recording);
        recorded += 1;
      } else {
        unused.push({ key: r.key, text: r.text, ...recording, usedIn: [], unused: true });
      }
    }
    unused.sort((a, b) => a.text.localeCompare(b.text));

    return {
      items: [...items.values(), ...unused],
      summary: { needed, recorded, missing: needed - recorded, unused: unused.length },
    };
  }
}
