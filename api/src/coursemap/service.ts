import type pg from 'pg';
import { roadStoryChapter, topicRounds } from '@kurda/shared';
import { ROAD_COURSE } from '../content/road-seed.js';
import { skillStrength } from '../placement/skill-strength.js';
import { PUBLISHED_SQL } from '../stories/service.js';
import { isUnlocked, skillState, type SkillState } from './node-state.js';

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}

/** One lesson in a skill, as the map lists it. */
export interface LessonNode {
  lessonId: string;
  position: number;
  title: string;
  /** this learner has finished this lesson — this version or an earlier one */
  completed: boolean;
  /** how many times they have finished it, any version, replays included */
  times: number;
}

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  strength: number;
  hasGrammar: boolean;
  /** first incomplete published lesson to launch (or null if none published) */
  firstLessonId: string | null;
  /** the skill's published lessons in order, so a map can show each one */
  lessons: LessonNode[];
  /**
   * Full rounds of its lessons played (0–3, the stars on its stop) and the
   * pieces of its ring filled, by the shared rule (`topicRounds`), so both
   * apps draw the same ring.
   */
  rounds: number;
  pieces: number;
}

/** The story that closes a chapter of the road, once it is out for learners to read. */
export interface UnitStory {
  slug: string;
  title: string;
}

/**
 * The chapter after the last one online: there to say what comes next while
 * it is still being made. `recordedBy` names who is recording it, for a
 * course whose chapters go online as their recordings are done (the road,
 * which Hamo records); null for any other course.
 */
export interface UpcomingUnit {
  number: number;
  title: string;
  recordedBy: 'hamo' | null;
}

export interface CourseMap {
  course: { id: string; title: string };
  /**
   * The course's units up to the last one with a lesson out: a unit still
   * being made at the end is not shown as empty stops, it is `upcoming`.
   * `level` is the unit's level in the course plan ('A1'), which the path
   * groups units into sections by; null where the course gives none.
   */
  units: Array<{ unitId: string; title: string; level: string | null; skills: SkillNode[]; story: UnitStory | null }>;
  upcoming: UpcomingUnit | null;
  /**
   * Skills up to this level are open because a test let the learner through
   * (placement, or jumping ahead); 0 for none. The apps read it to put the
   * learner where the test left them (shared `lessonPath`).
   */
  unlockedThrough: number;
}

interface SkillRow {
  skill_id: string;
  skill_title: string;
  has_grammar: boolean;
  unit_id: string;
  unit_title: string;
  unit_position: number;
  unit_level: string | null;
}

/**
 * Course map with per-skill lock/complete/gold/decay state (KUR-040), how
 * many times each lesson was finished and so each skill's rounds and ring
 * (shared `topicRounds`), and each unit's level, which the lesson path
 * groups units into sections by.
 */
export class CourseMapService {
  /** `roadCourse`: the slug of the course whose chapters end with Hamo's stories (a test names its own) */
  constructor(
    private readonly pool: pg.Pool,
    private readonly roadCourse: string = ROAD_COURSE,
  ) {}

  /** Courses that have at least one published lesson. */
  async listCourses(): Promise<CourseSummary[]> {
    const res = await this.pool.query<{ id: string; slug: string; title_en: string; dialect: string }>(
      `SELECT DISTINCT c.id, c.slug, c.title_en, c.dialect
       FROM courses c
       JOIN units u ON u.course_id = c.id
       JOIN skills s ON s.unit_id = u.id
       JOIN lessons l ON l.skill_id = s.id AND l.status = 'published'
       ORDER BY c.slug ASC`,
    );
    return res.rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title_en, dialect: r.dialect }));
  }

  async forUser(userId: string, courseId: string): Promise<CourseMap | null> {
    const course = await this.pool.query<{ title_en: string; slug: string }>(
      `SELECT title_en, slug FROM courses WHERE id = $1`,
      [courseId],
    );
    if (course.rowCount === 0) return null;
    const road = course.rows[0]!.slug === this.roadCourse;

    const [skills, lessons, completed, reviews, progress, stories] = await Promise.all([
      this.pool.query<SkillRow>(
        `SELECT s.id skill_id, s.title_en skill_title, (s.grammar_md IS NOT NULL) has_grammar,
                u.id unit_id, u.title_en unit_title, u.position unit_position, u.cefr unit_level
         FROM skills s JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1
         ORDER BY u.position ASC, s.position ASC`,
        [courseId],
      ),
      // the learner-visible published lesson per (skill, position)
      this.pool.query<{ id: string; skill_id: string; position: number; title_en: string }>(
        `SELECT DISTINCT ON (l.skill_id, l.position) l.id, l.skill_id, l.position, l.title_en
         FROM lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1 AND l.status = 'published'
         ORDER BY l.skill_id, l.position, l.version DESC`,
        [courseId],
      ),
      // how many times each lesson was finished, by place, not by row: a
      // corrected version of a lesson is a new row at the same place, and to
      // the learner who finished the old one it is still the lesson they
      // finished (as `LessonSlot` in content/sessions.ts) — keyed by row, a
      // content fix re-locked the rest of the course behind a lesson they had
      // already done. Every replay is a session of its own, so the count is
      // the rounds the rings show; one read for the whole map.
      this.pool.query<{ skill_id: string; position: number; times: number }>(
        `SELECT l.skill_id, l.position, count(*)::int times
         FROM lesson_sessions ls
         JOIN lessons l ON l.id = ls.lesson_id
         JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE ls.user_id = $1 AND ls.completed_at IS NOT NULL AND u.course_id = $2
         GROUP BY l.skill_id, l.position`,
        [userId, courseId],
      ),
      this.pool.query<{ skill_id: string; easiness: number; repetitions: number }>(
        `SELECT l.skill_id, r.easiness, r.repetitions
         FROM review_items r
         JOIN exercises e ON e.id::text = r.item_id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE r.user_id = $1 AND u.course_id = $2`,
        [userId, courseId],
      ),
      this.pool.query<{ unlocked_through_position: number }>(
        `SELECT unlocked_through_position FROM user_course_progress WHERE user_id = $1 AND course_id = $2`,
        [userId, courseId],
      ),
      // the road's chapters each end with a story Hamo tells (road-NN-…), shown once learners can read it
      road
        ? this.pool.query<{ slug: string; title: string }>(`SELECT s.slug, s.title FROM stories s WHERE s.slug LIKE 'road-%' AND ${PUBLISHED_SQL}`)
        : Promise.resolve({ rows: [] as Array<{ slug: string; title: string }> }),
    ]);
    const storyOf = new Map<number, UnitStory>();
    for (const st of stories.rows) {
      const n = roadStoryChapter(st.slug);
      if (n !== null) storyOf.set(n, { slug: st.slug, title: st.title });
    }

    const timesAt = new Map(completed.rows.map((r) => [`${r.skill_id}:${r.position}`, r.times]));
    const lessonsBySkill = new Map<string, LessonNode[]>();
    for (const l of lessons.rows) {
      const list = lessonsBySkill.get(l.skill_id) ?? [];
      const times = timesAt.get(`${l.skill_id}:${l.position}`) ?? 0;
      list.push({ lessonId: l.id, position: l.position, title: l.title_en, completed: times > 0, times });
      lessonsBySkill.set(l.skill_id, list);
    }
    const reviewsBySkill = new Map<string, Array<{ easiness: number; repetitions: number }>>();
    for (const r of reviews.rows) {
      const list = reviewsBySkill.get(r.skill_id) ?? [];
      list.push({ easiness: r.easiness, repetitions: r.repetitions });
      reviewsBySkill.set(r.skill_id, list);
    }
    const unlockedThrough = progress.rows[0]?.unlocked_through_position ?? 0;

    const units: Array<CourseMap['units'][number] & { position: number }> = [];
    let previousCompleted = false;
    skills.rows.forEach((s, i) => {
      const level = i + 1;
      const skillLessons = (lessonsBySkill.get(s.skill_id) ?? []).sort((a, b) => a.position - b.position);
      const completedSkill = skillLessons.length > 0 && skillLessons.every((l) => l.completed);
      const firstIncomplete = skillLessons.find((l) => !l.completed);
      const strength = skillStrength(reviewsBySkill.get(s.skill_id) ?? []);
      const unlocked = isUnlocked(level, previousCompleted, unlockedThrough);

      const node: SkillNode = {
        skillId: s.skill_id,
        level,
        title: s.skill_title,
        state: skillState({ unlocked, completed: completedSkill, strength }),
        strength,
        hasGrammar: s.has_grammar,
        firstLessonId: firstIncomplete?.lessonId ?? skillLessons[0]?.lessonId ?? null,
        lessons: skillLessons,
        ...topicRounds(skillLessons.map((l) => l.times)),
      };

      let unit = units.find((u) => u.unitId === s.unit_id);
      if (!unit) {
        unit = {
          unitId: s.unit_id,
          title: s.unit_title,
          level: s.unit_level,
          skills: [],
          story: storyOf.get(s.unit_position) ?? null,
          position: s.unit_position,
        };
        units.push(unit);
      }
      unit.skills.push(node);
      previousCompleted = completedSkill;
    });

    // the course ends, for the learner, at its last unit with a lesson out; the one after it is on its way
    let shown = units.length;
    while (shown > 0 && units[shown - 1]!.skills.every((sk) => sk.lessons.length === 0)) shown -= 1;
    const next = units[shown];
    const upcoming: UpcomingUnit | null = next ? { number: next.position, title: next.title, recordedBy: road ? 'hamo' : null } : null;

    return {
      course: { id: courseId, title: course.rows[0]!.title_en },
      units: units.slice(0, shown).map(({ position: _position, ...unit }) => unit),
      upcoming,
      unlockedThrough,
    };
  }
}
