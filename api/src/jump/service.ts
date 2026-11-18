import type pg from 'pg';
import { PATH_JUMP, jumpMistakesAllowed, jumpPlan } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { CourseMapService } from '../coursemap/service.js';
import { PracticeService, type PracticeSessionView } from '../practice/service.js';
import { localDate, safeTimeZone } from '../streaks/streak-logic.js';
import { pickJumpItems } from './pick.js';

/** A test to jump ahead, ready to play: a practice session, and what it is for. */
export interface JumpTest extends PracticeSessionView {
  jump: {
    unitId: string;
    /** from 1: "Unit 3" */
    unitNumber: number;
    unitTitle: string;
    /** mistakes this test allows (shared `jumpMistakesAllowed`) */
    mistakesAllowed: number;
    /** tests still to start at this unit today, after this one */
    triesLeft: number;
  };
}

interface TodayRow {
  timezone: string;
  session_id: string | null;
  created_at: Date | null;
  completed_at: Date | null;
}

/** Seconds until the learner's next midnight, when the day's tests come round again. */
function secondsToMidnight(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.max(1, 86_400 - (part('hour') * 3600 + part('minute') * 60 + part('second')));
}

/**
 * Jumping ahead on the lesson path: a short test on the skills a unit skips which, when passed, opens the course up
 * to that unit (skipped skills stay open). The test is a practice session marked in `path_jumps`, so the apps play it
 * in the lesson player and it is graded like any session, second tries counting for nothing;
 * `PracticeService.complete` decides it. Which units can be jumped to is the shared `jumpPlan` rule over the
 * learner's course map. Tests are limited per unit per local day (`PATH_JUMP.triesPerDay`); one left unfinished today
 * is reopened rather than counted twice.
 */
export class PathJumpService {
  private readonly maps: CourseMapService;
  private readonly practice: PracticeService;
  private readonly now: () => Date;

  constructor(
    private readonly pool: pg.Pool,
    deps: { maps?: CourseMapService; practice?: PracticeService; now?: () => Date } = {},
  ) {
    this.maps = deps.maps ?? new CourseMapService(pool);
    this.practice = deps.practice ?? new PracticeService(pool);
    this.now = deps.now ?? (() => new Date());
  }

  async start(userId: string, courseId: string, unitId: string): Promise<JumpTest> {
    const map = await this.maps.forUser(userId, courseId);
    if (!map) throw new AppError('COURSE_NOT_FOUND', 404, 'course not found');
    const plan = jumpPlan(map, unitId);
    if (!plan) throw new AppError('JUMP_NOT_ALLOWED', 409, 'this unit cannot be jumped to');
    const index = map.units.findIndex((u) => u.unitId === unitId);
    const unit = { unitId, unitNumber: index + 1, unitTitle: map.units[index]!.title };

    // this learner's tests at this unit lately, with their time zone to say which were today
    const lately = await this.pool.query<TodayRow>(
      `SELECT u.timezone, j.session_id, j.created_at, s.completed_at
       FROM users u
       LEFT JOIN path_jumps j ON j.user_id = u.id AND j.unit_id = $2 AND j.created_at > now() - interval '2 days'
       LEFT JOIN practice_sessions s ON s.id = j.session_id
       WHERE u.id = $1
       ORDER BY j.created_at DESC`,
      [userId, unitId],
    );
    const timeZone = safeTimeZone(lately.rows[0]?.timezone);
    const now = this.now();
    const today = localDate(now, timeZone);
    const todays = lately.rows.filter((r) => r.session_id !== null && r.created_at !== null && localDate(r.created_at, timeZone) === today);
    const left = (started: number) => Math.max(0, PATH_JUMP.triesPerDay - started);

    // one left unfinished today is the same test, not another try
    const open = todays.find((r) => r.completed_at === null);
    if (open) {
      const view = await this.practice.view(open.session_id!, userId);
      return { ...view, jump: { ...unit, mistakesAllowed: jumpMistakesAllowed(view.exercises.length), triesLeft: left(todays.length) } };
    }
    if (todays.length >= PATH_JUMP.triesPerDay) {
      throw new AppError('JUMP_LIMIT', 429, 'no more tests at this unit today', {
        triesPerDay: PATH_JUMP.triesPerDay,
        retryAfterSec: secondsToMidnight(now, timeZone),
      });
    }

    // The skipped skills' visible lessons as the map lists them, never speaking, which is self-rated.
    const skillOf = new Map(plan.skipped.flatMap((skill, i) => skill.lessons.map((lesson) => [lesson.lessonId, i] as const)));
    const exercises = await this.pool.query<{ id: string; lesson_id: string }>(
      `SELECT id, lesson_id FROM exercises WHERE lesson_id = ANY($1::uuid[]) AND type <> 'speaking' ORDER BY lesson_id, position`,
      [[...skillOf.keys()]],
    );
    const bySkill: string[][] = plan.skipped.map(() => []);
    for (const row of exercises.rows) bySkill[skillOf.get(row.lesson_id)!]!.push(row.id);
    const ids = pickJumpItems(bySkill, PATH_JUMP.questions);
    const session = ids.length > 0 ? await this.practice.begin(userId, ids, { courseId, unitId, position: plan.position }) : null;
    if (!session) throw new AppError('JUMP_EMPTY', 409, 'there is nothing to test in the units this skips');
    return {
      ...session,
      completed: false,
      answered: {},
      jump: { ...unit, mistakesAllowed: jumpMistakesAllowed(session.exercises.length), triesLeft: left(todays.length + 1) },
    };
  }
}
