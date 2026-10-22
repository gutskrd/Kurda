import type pg from 'pg';
import {
  LESSON_AUDIO_TEXT_MAX,
  conversationClips,
  conversationLineKey,
  lessonAudioKey,
  lessonAudioTargets,
  normalizeKurdish,
  storyAudioSentences,
  storyParagraphs,
  type ConversationPayload,
  type LipsyncData,
  type SpeakerId,
  type StoryDialect,
} from '@kurda/shared';
import type { ExerciseType } from '../content/repository.js';
import type { ContentStatus } from '../content/workflow.js';
import { playsRecordingOf } from './publish-guard.js';

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
  /** who is shown saying it, or null for no character (and for no recording) */
  speaker: SpeakerId | null;
  /** it has a mouth timeline; PATCH /admin/audio/lesson sets one for a recording made without */
  hasLipsync: boolean;
  /** the stored timeline (null for none), only when the list is asked for it (`withLipsync`) */
  lipsync?: LipsyncData | null;
  /**
   * A conversation's line: which conversation, and who says it (by place, and
   * by name as the conversation writes it). Recorded with `&line=`, and filed
   * under that part only. Absent for a plain text, and for an unused
   * recording, whose conversation is no longer known.
   */
  line?: { conversation: string; part: number; name: string; character: SpeakerId | null };
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

interface StoryRow {
  id: string;
  dialect: StoryDialect;
  title: string;
  status: Exclude<ContentStatus, 'archived'>;
  body: string;
}

const STORY_COURSE_TITLE: Record<StoryDialect, string> = {
  kurmanci: 'Stories — Kurmancî',
  sorani: 'Stories — Soranî',
};

interface RecordingRow {
  key: string;
  text: string;
  url: string;
  duration_ms: number;
  updated_at: Date;
  speaker: SpeakerId | null;
  has_lipsync: boolean;
  /** only when asked for */
  lipsync: LipsyncData | null;
}

/** A text a lesson or story needs, before anything is known of its recording. */
function unrecorded(key: string, text: string): LessonAudioItem {
  return {
    key,
    text,
    recorded: false,
    url: null,
    durationMs: null,
    updatedAt: null,
    speaker: null,
    hasLipsync: false,
    usedIn: [],
    unused: false,
  };
}

/** Whether a listening payload has no clip of its own, and plays the text keyed `key` instead. */
function playsWithoutClip(payload: unknown, key: string): boolean {
  const text = playsRecordingOf(payload);
  return text !== null && lessonAudioKey(text) === key;
}

/**
 * The lessons' side of the audio studio: every Kurdish text a lesson wants
 * heard — and every sentence of a story, which the reader plays from the same
 * recordings — whether it has a recording yet, and which lessons use it.
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
   *
   * Then the stories: every sentence the reader can play (storyAudioSentences)
   * of every story that is not archived, drafts included for the same reason
   * as lessons. A story is filed as a course of its own per variety ("Stories
   * — Kurmancî"), with the story as both its unit and its one lesson, so the
   * studio groups it like any lesson; a sentence a lesson also uses stays
   * filed under the lesson, with the story as one more usage.
   *
   * With `withLipsync`, every item also carries its stored timeline, null for
   * none. Left out otherwise: a few hundred bytes a sentence, over every
   * sentence of every lesson and story, is more than the studio's other
   * screens need to load.
   */
  async list(options: { withLipsync?: boolean } = {}): Promise<LessonAudioList> {
    const withLipsync = options.withLipsync === true;
    const [exercises, stories, recordings] = await Promise.all([
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
      this.pool.query<StoryRow>(
        `SELECT id, dialect, title, status, body FROM stories WHERE status <> 'archived'
         ORDER BY dialect, level, array_position(ARRAY['short','medium','long'], length), title, id`,
      ),
      this.pool.query<RecordingRow>(
        `SELECT key, text, url, duration_ms, updated_at, speaker, lipsync IS NOT NULL AS has_lipsync,
                CASE WHEN $1::boolean THEN lipsync END AS lipsync
           FROM lesson_audio`,
        [withLipsync],
      ),
    ]);

    const items = new Map<string, LessonAudioItem>();
    // one usage per lesson slot, even when the draft and the live version both use the text
    const usageBySlot = new Map<string, LessonAudioUsage>();
    for (const row of exercises.rows) {
      const clips =
        row.type === 'conversation'
          ? conversationClips(row.payload).map((c) => ({
              text: c.text,
              key: c.key,
              line: { conversation: (row.payload as ConversationPayload).id, part: c.part, name: c.name, character: c.character },
            }))
          : lessonAudioTargets(row.type, row.payload).map((text) => ({ text, key: lessonAudioKey(text), line: undefined }));
      for (const { text, key, line } of clips) {
        let item = items.get(key);
        if (!item) {
          item = unrecorded(key, text);
          if (line) item.line = line;
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
    for (const story of stories.rows) {
      const usage: LessonAudioUsage = {
        courseId: `stories:${story.dialect}`,
        courseTitle: STORY_COURSE_TITLE[story.dialect],
        unitId: story.id,
        unitTitle: story.title,
        skillId: story.id,
        skillTitle: story.title,
        lessonPosition: 0,
        lessonId: story.id,
        lessonTitle: story.title,
        lessonStatus: story.status,
        lessonVersion: 1,
        live: story.status === 'published',
        exerciseTypes: [],
        listeningNeedsIt: false,
      };
      for (const paragraph of storyParagraphs(story.body)) {
        for (const text of storyAudioSentences(paragraph)) {
          // a sentence no recording can hold is the editor's to split (validateStory says so), not the studio's to ask for
          if (normalizeKurdish(text).length > LESSON_AUDIO_TEXT_MAX) continue;
          const key = lessonAudioKey(text);
          let item = items.get(key);
          if (!item) {
            item = unrecorded(key, text);
            items.set(key, item);
          }
          // one usage per story, however often the story says it
          if (!item.usedIn.includes(usage)) item.usedIn.push(usage);
        }
      }
    }
    const needed = items.size;
    if (withLipsync) for (const item of items.values()) item.lipsync = null;

    let recorded = 0;
    const unused: LessonAudioItem[] = [];
    for (const r of recordings.rows) {
      const found = items.get(r.key);
      const recording = {
        recorded: true,
        url: r.url,
        durationMs: r.duration_ms,
        updatedAt: r.updated_at.toISOString(),
        speaker: r.speaker,
        hasLipsync: r.has_lipsync,
        ...(withLipsync ? { lipsync: r.lipsync } : {}),
      };
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

  /**
   * One conversation, for the page its parts are recorded on: the lesson it is
   * in, the conversation as written, and each line with its recording and who
   * made it — so the people recording it, wherever they are, see each other's
   * takes come in.
   *
   * The conversation is looked up by its id in the newest version of a lesson
   * that has it and is not archived: a link sent to someone before the lesson
   * got a new version still opens the conversation they are to record. With
   * `lessonId`, in that lesson's own slot (its skill and place), else in any.
   */
  async conversation(id: string, lessonId: string | null): Promise<ConversationRecording | null> {
    const { rows } = await this.pool.query<ConversationRow>(
      `SELECT l.id lesson_id, l.title_en, l.title_ku, l.status, l.version, l.skill_id, l.position, e.position exercise_position, e.payload
         FROM exercises e
         JOIN lessons l ON l.id = e.lesson_id
        WHERE e.type = 'conversation' AND e.payload->>'id' = $1
          AND ($2::uuid IS NULL OR (l.skill_id, l.position) = (SELECT skill_id, position FROM lessons WHERE id = $2))
        ORDER BY l.status = 'archived', l.version DESC, l.id = $2 DESC NULLS LAST
        LIMIT 1`,
      [id, lessonId],
    );
    const row = rows[0];
    if (!row) return null;
    const payload = row.payload as ConversationPayload;
    const keys = payload.lines.map((line) => conversationLineKey(payload.id, line.speaker, line.text) || null);
    const recorded = await this.pool.query<{
      key: string;
      url: string;
      duration_ms: number;
      updated_at: Date;
      speaker: SpeakerId | null;
      has_lipsync: boolean;
      recorded_by: string | null;
      username: string | null;
    }>(
      `SELECT a.key, a.url, a.duration_ms, a.updated_at, a.speaker, a.lipsync IS NOT NULL AS has_lipsync,
              a.recorded_by, u.username
         FROM lesson_audio a LEFT JOIN users u ON u.id = a.recorded_by
        WHERE a.key = ANY($1::text[])`,
      [keys.filter((k): k is string => k !== null)],
    );
    const byKey = new Map(recorded.rows.map((r) => [r.key, r]));
    return {
      lesson: {
        id: row.lesson_id,
        titleEn: row.title_en,
        titleKu: row.title_ku,
        status: row.status,
        version: row.version,
        skillId: row.skill_id,
        position: row.position,
        exercisePosition: row.exercise_position,
      },
      conversation: payload,
      lines: payload.lines.map((line, index) => {
        const key = keys[index] ?? null;
        const r = key ? byKey.get(key) : undefined;
        return {
          index,
          part: line.speaker,
          key,
          recording: r
            ? {
                url: r.url,
                durationMs: r.duration_ms,
                updatedAt: r.updated_at.toISOString(),
                speaker: r.speaker,
                hasLipsync: r.has_lipsync,
                recordedBy: r.recorded_by ? { id: r.recorded_by, username: r.username ?? null } : null,
              }
            : null,
        };
      }),
    };
  }
}

interface ConversationRow {
  lesson_id: string;
  title_en: string;
  title_ku: string;
  status: ContentStatus;
  version: number;
  skill_id: string;
  position: number;
  exercise_position: number;
  payload: unknown;
}

/** GET /admin/lesson-audio/conversations/:id */
export interface ConversationRecording {
  lesson: {
    id: string;
    titleEn: string;
    titleKu: string;
    status: ContentStatus;
    version: number;
    skillId: string;
    position: number;
    /** where the conversation is among the lesson's exercises, from 1 */
    exercisePosition: number;
  };
  conversation: ConversationPayload;
  /** every line, in order, with its recording or null */
  lines: Array<{
    index: number;
    part: number;
    /** what its recording is filed under; null for a line too malformed to file */
    key: string | null;
    recording: {
      url: string;
      durationMs: number;
      updatedAt: string;
      speaker: SpeakerId | null;
      hasLipsync: boolean;
      /** who made this take: null when the account is gone */
      recordedBy: { id: string; username: string | null } | null;
    } | null;
  }>;
}
