/**
 * The lesson path: a course map read as one winding line of skills.
 *
 * Both apps draw the same path from the same course map (GET
 * /courses/:id/map), so the rules live here once: which skill is the one to
 * do now, what every other one is (done, open, still closed), where the
 * milestones go, which colour each unit takes, and where on the page each
 * stop sits. The browser and the phone only paint what this returns, so they
 * cannot disagree about which skill is "current" or which way the path turns.
 *
 * The words are the server's: the path is a line of *skills*, each a round
 * stop named by its title, and each skill holds its *lessons*, which the card
 * a stop opens lists and counts.
 */

/** A skill's state as the server sends it (api/src/coursemap/node-state.ts). */
export type PathSkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/** One lesson of a skill, as the map lists it. */
export interface PathLesson {
  lessonId: string;
  title: string;
  completed: boolean;
}

/** What the path needs of a skill; each app passes its own, richer type through. */
export interface PathSkill {
  skillId: string;
  title: string;
  state: PathSkillState;
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  /** the skill's published lessons in order; an older response may not carry them */
  lessons?: readonly PathLesson[];
}

export interface PathUnitInput<S extends PathSkill> {
  unitId: string;
  title: string;
  skills: readonly S[];
}

export interface PathMapInput<S extends PathSkill> {
  units: readonly PathUnitInput<S>[];
}

/**
 * A lesson in a skill:
 *   done   — finished, and open to play again;
 *   next   — the first unfinished lesson of a skill that is open;
 *   locked — the rest: the lessons of a skill not open yet, and those after
 *            `next`, which are taken in order.
 */
export type LessonState = 'done' | 'next' | 'locked';

export function lessonStates(skill: Pick<PathSkill, 'state' | 'lessons'>): LessonState[] {
  let nextGiven = skill.state === 'locked';
  return (skill.lessons ?? []).map((lesson) => {
    if (lesson.completed) return 'done';
    if (nextGiven) return 'locked';
    nextGiven = true;
    return 'next';
  });
}

/**
 * A skill on the path:
 *   done      — every lesson in it finished;
 *   current   — the one to do now: the first open skill not yet finished;
 *   available — open but not the one up next (a placement test can open
 *               several at once);
 *   locked    — not open yet.
 */
export type StopState = 'done' | 'current' | 'available' | 'locked';

/**
 * How a finished skill is holding up, from its reviews: strong (the server's
 * gold), steady, or ready for a refresh (the server's decayed).
 */
export type Finish = 'strong' | 'steady' | 'refresh';

export interface SkillStop<S extends PathSkill> {
  kind: 'skill';
  key: string;
  skill: S;
  /** its place in its unit, from 1 — the number on an open stop */
  number: number;
  state: StopState;
  /** set on a finished skill only */
  finish: Finish | null;
  lessonsDone: number;
  lessonsTotal: number;
  /**
   * The lesson the stop's button opens: the next unfinished one, or the
   * first again once all are done. Null for a locked skill, and for one with
   * nothing published yet.
   */
  launch: string | null;
  /** the skill that opens this one when finished; named on a locked one */
  after: S | null;
}

/**
 * Review, as a stop on the path: there only when the learner has words due,
 * because then it is real work waiting, and placed where the learner is —
 * just before the current skill — rather than in every unit, since a review
 * takes words from the whole course, not from one unit.
 */
export interface ReviewStop {
  kind: 'review';
  key: 'review';
  due: number;
}

/** The end of a unit: earned when every skill in it is done. */
export interface TrophyStop {
  kind: 'trophy';
  key: string;
  earned: boolean;
  /** the unit it closes, from 1 */
  unitNumber: number;
}

export type PathStop<S extends PathSkill> = SkillStop<S> | ReviewStop | TrophyStop;

/** A stop and where it sits. */
export interface PlacedStop<S extends PathSkill> {
  stop: PathStop<S>;
  /**
   * Across: from the middle of the path, toward the end of the line a reader
   * reads (right in English, left in Soranî), in points. The apps mirror it
   * for right-to-left by drawing in logical (start/end) terms.
   */
  x: number;
  /** Down: the stop's centre from the top of its unit's path, in points. */
  y: number;
  /**
   * The line in from the stop before it: walked when both ends have been
   * reached, ahead otherwise. Null for a unit's first stop, which the
   * unit's banner leads into.
   */
  trail: 'walked' | 'ahead' | null;
}

/** The unit colours, in the order units take them; the apps hold the colour values. */
export const UNIT_TONES = ['meadow', 'river', 'clay', 'dusk', 'pine', 'rose'] as const;
export type UnitTone = (typeof UNIT_TONES)[number];

/** The colour of a course's unit, by its place in the course from 0. */
export function unitTone(index: number): UnitTone {
  return UNIT_TONES[index % UNIT_TONES.length]!;
}

export interface PathUnit<S extends PathSkill> {
  unitId: string;
  title: string;
  /** from 1: "Unit 2" */
  number: number;
  tone: UnitTone;
  stops: PlacedStop<S>[];
  /** the height the unit's path needs, in points */
  height: number;
  /** skills finished, of `total` */
  done: number;
  total: number;
  /** the unit's skills' names, in order: what it covers, said in one line */
  topics: string[];
  /** the skills with a grammar note, for the unit's guide; empty when there is none */
  guide: S[];
}

export interface LessonPath<S extends PathSkill> {
  units: PathUnit<S>[];
  /** the current skill's key, if any skill is open and unfinished */
  current: string | null;
  /**
   * The stop the map opens on: the current skill; else, with nothing open
   * left to do, the furthest stop reached (the last trophy of a finished
   * course); else the first stop.
   */
  focus: string | null;
  /** skills finished in the whole course, of `total` */
  done: number;
  total: number;
}

/**
 * The path's measurements, in points, shared so both apps space it alike.
 * `node` is a stop's button; `step` the distance between two stops'
 * centres; `sway` how far a stop leans off the middle; `lift` the extra room
 * above the current skill for the "Start" bubble over it; `pad` the room
 * above the first stop and below the last.
 */
export const PATH_GEOMETRY = { node: 72, step: 104, sway: 72, lift: 56, pad: 60 } as const;

/**
 * Where a stop leans, by its place in its unit: middle, toward the start of
 * the line, middle, toward the end — a soft zigzag that every unit begins
 * again from the middle, under its banner.
 */
const LEAN = [0, -1, 0, 1] as const;

export function lean(index: number): number {
  return LEAN[((index % LEAN.length) + LEAN.length) % LEAN.length]!;
}

const FINISHED: ReadonlySet<PathSkillState> = new Set(['completed', 'gold', 'decayed']);

function finishOf(state: PathSkillState): Finish | null {
  if (state === 'gold') return 'strong';
  if (state === 'decayed') return 'refresh';
  if (state === 'completed') return 'steady';
  return null;
}

/** The lesson to open from a skill that is open, or null. */
function launchOf(skill: PathSkill): string | null {
  if (skill.state === 'locked') return null;
  const lessons = skill.lessons ?? [];
  const next = lessons.find((l) => !l.completed);
  return next?.lessonId ?? lessons[0]?.lessonId ?? skill.firstLessonId;
}

/** Is an open skill still to finish? (One with no lessons published has nothing to do yet.) */
function unfinished(skill: PathSkill): boolean {
  if (FINISHED.has(skill.state)) return false;
  const lessons = skill.lessons;
  return lessons ? lessons.length > 0 && lessons.some((l) => !l.completed) : skill.firstLessonId !== null;
}

/**
 * Lay a course map out as a path.
 *
 * `due` is how many review words are waiting (GET /practice/due); with any,
 * a review stop goes in just before the current skill — or, with nothing
 * open left to do, just after the last skill finished.
 */
export function lessonPath<S extends PathSkill>(map: PathMapInput<S>, { due = 0 }: { due?: number } = {}): LessonPath<S> {
  const all = map.units.flatMap((u) => u.skills);
  const currentSkill = all.find((s) => s.state === 'unlocked' && unfinished(s) && launchOf(s) !== null) ?? null;
  const lastDone = [...all].reverse().find((s) => FINISHED.has(s.state)) ?? null;
  // review sits before the skill to do now, or after the last one done
  const reviewBefore = due > 0 && currentSkill ? currentSkill : null;
  const reviewAfter = due > 0 && !currentSkill && lastDone ? lastDone : null;

  let previous: S | null = null;
  let done = 0;
  let total = 0;
  const units: PathUnit<S>[] = map.units.map((unit, u) => {
    const stops: PathStop<S>[] = [];
    unit.skills.forEach((skill, i) => {
      if (reviewBefore === skill) stops.push({ kind: 'review', key: 'review', due });
      const lessons = skill.lessons ?? [];
      const finished = FINISHED.has(skill.state);
      const state: StopState = finished ? 'done' : skill.state === 'locked' ? 'locked' : skill === currentSkill ? 'current' : 'available';
      stops.push({
        kind: 'skill',
        key: `s:${skill.skillId}`,
        skill,
        number: i + 1,
        state,
        finish: finishOf(skill.state),
        lessonsDone: lessons.filter((l) => l.completed).length,
        lessonsTotal: lessons.length,
        launch: launchOf(skill),
        after: previous,
      });
      if (reviewAfter === skill) stops.push({ kind: 'review', key: 'review', due });
      previous = skill;
    });
    const unitDone = unit.skills.filter((s) => FINISHED.has(s.state)).length;
    done += unitDone;
    total += unit.skills.length;
    if (unit.skills.length > 0) {
      stops.push({ kind: 'trophy', key: `t:${unit.unitId}`, earned: unitDone === unit.skills.length, unitNumber: u + 1 });
    }
    const { placed, height } = place(stops);
    return {
      unitId: unit.unitId,
      title: unit.title,
      number: u + 1,
      tone: unitTone(u),
      stops: placed,
      height,
      done: unitDone,
      total: unit.skills.length,
      topics: unit.skills.map((s) => s.title),
      guide: unit.skills.filter((s) => s.hasGrammar),
    };
  });

  const current = currentSkill ? `s:${currentSkill.skillId}` : null;
  return { units, current, focus: current ?? frontier(units), done, total };
}

/** Reached: a stop the learner has got to — done, current, the review beside them, a trophy earned. */
function reached<S extends PathSkill>(stop: PathStop<S>): boolean {
  if (stop.kind === 'review') return true;
  if (stop.kind === 'trophy') return stop.earned;
  return stop.state === 'done' || stop.state === 'current';
}

/** Down the page, a step apart, leaning in turn; the current skill gets room above it for its bubble. */
function place<S extends PathSkill>(stops: PathStop<S>[]): { placed: PlacedStop<S>[]; height: number } {
  const { step, sway, lift, pad } = PATH_GEOMETRY;
  let y = pad;
  const placed = stops.map((stop, i): PlacedStop<S> => {
    const raised = stop.kind === 'skill' && stop.state === 'current';
    if (i > 0) y += step;
    if (raised) y += lift;
    const before = stops[i - 1];
    return {
      stop,
      x: lean(i) * sway,
      y,
      trail: before ? (reached(before) && reached(stop) ? 'walked' : 'ahead') : null,
    };
  });
  return { placed, height: placed.length > 0 ? y + pad : 0 };
}

/** With nothing open left to do: the furthest stop reached, or the very first stop. */
function frontier<S extends PathSkill>(units: PathUnit<S>[]): string | null {
  const stops = units.flatMap((u) => u.stops.map((p) => p.stop));
  const furthest = [...stops].reverse().find(reached);
  return (furthest ?? stops[0])?.key ?? null;
}

/**
 * A stop's neighbours in reading order, for moving along the path with the
 * arrow keys: every stop of every unit, top to bottom.
 */
export function stopKeys<S extends PathSkill>(path: LessonPath<S>): string[] {
  return path.units.flatMap((u) => u.stops.map((p) => p.stop.key));
}

/**
 * The lesson "Next lesson" opens when a lesson is finished: the one the
 * current skill's button opens, read from the map fetched after the lesson
 * (so a skill just finished hands on to the one it opened). Null when there
 * is nothing open left to do, or when it would only open `finished`, the
 * lesson just played, again.
 */
export function nextLaunch<S extends PathSkill>(map: PathMapInput<S>, finished: string | null = null): { lessonId: string; title: string } | null {
  const path = lessonPath(map);
  const stop = path.units.flatMap((u) => u.stops.map((p) => p.stop)).find((s) => s.key === path.current);
  if (stop?.kind !== 'skill' || !stop.launch || stop.launch === finished) return null;
  const lesson = stop.skill.lessons?.find((l) => l.lessonId === stop.launch);
  return { lessonId: stop.launch, title: lesson?.title ?? stop.skill.title };
}

/**
 * How the path stood, skill by skill: its state and its lessons done. Each
 * app keeps the last one it drew, so coming back after a lesson can show what
 * the lesson changed (`pathChanges`) rather than only the new state.
 */
export type PathSnapshot = Record<string, { state: StopState; done: number }>;

export function pathSnapshot<S extends PathSkill>(path: LessonPath<S>): PathSnapshot {
  const snapshot: PathSnapshot = {};
  for (const unit of path.units) {
    for (const { stop } of unit.stops) if (stop.kind === 'skill') snapshot[stop.key] = { state: stop.state, done: stop.lessonsDone };
  }
  return snapshot;
}

/** What moved on the path since the snapshot, in the order it is shown (`PATH_RETURN`). */
export interface PathChanges {
  /** skills with more lessons done: the share of their lessons done, then and now */
  ring: Array<{ key: string; from: number; to: number }>;
  /** skills finished since */
  finished: string[];
  /** skills opened since: closed then, open now */
  opened: string[];
  /** the skill to do now, when it is not the one it was */
  current: string | null;
}

/** What changed between the last path drawn and this one; null with nothing to compare with, or nothing changed. */
export function pathChanges<S extends PathSkill>(prev: PathSnapshot | null, path: LessonPath<S>): PathChanges | null {
  if (!prev) return null;
  const changes: PathChanges = { ring: [], finished: [], opened: [], current: null };
  const prevCurrent = Object.keys(prev).find((key) => prev[key]!.state === 'current') ?? null;
  for (const unit of path.units) {
    for (const { stop } of unit.stops) {
      const then = stop.kind === 'skill' ? prev[stop.key] : undefined;
      if (stop.kind !== 'skill' || !then) continue;
      if (stop.lessonsDone > then.done && stop.lessonsTotal > 0) {
        changes.ring.push({ key: stop.key, from: Math.min(1, then.done / stop.lessonsTotal), to: Math.min(1, stop.lessonsDone / stop.lessonsTotal) });
      }
      if (stop.state === 'done' && then.state !== 'done') changes.finished.push(stop.key);
      if ((stop.state === 'current' || stop.state === 'available') && then.state === 'locked') changes.opened.push(stop.key);
    }
  }
  if (path.current !== prevCurrent) changes.current = path.current;
  const any = changes.ring.length > 0 || changes.finished.length > 0 || changes.opened.length > 0 || changes.current !== null;
  return any ? changes : null;
}

/**
 * Coming back to the path after a lesson, in ms: the page settles first
 * (`settleMs`), then, from there, the ring fills (`ringMs`), the finished stop
 * pops and its check draws in (`finishAtMs`, a `popMs` pop), the opened stop's
 * lock gives way to its number (`openAtMs`, the glyphs crossing in `glyphMs`)
 * and it pops, and the bubble arrives at the new current stop as the page
 * scrolls to it and Hevalo cheers (`bubbleAtMs`, over `bubbleMs`). Under
 * Reduce Motion none of it plays: the path is drawn as it now is.
 */
export const PATH_RETURN = { settleMs: 300, ringMs: 600, finishAtMs: 650, popMs: 320, openAtMs: 900, glyphMs: 120, bubbleAtMs: 1100, bubbleMs: 200 } as const;

/**
 * Hevalo beside the current stop: how big he is drawn (`size`), and how far
 * from the path's middle he stands — across from a stop in the middle, or on
 * the far side from one that leans (`away`), so he never stands on the line.
 */
export const PATH_MASCOT = { size: 88, across: 110, away: 96 } as const;

/**
 * Where Hevalo stands beside a placed stop: `x` his middle, across from the
 * path's middle in the stops' own logical terms (mirrored for right-to-left as
 * they are), and `y` his top, so he stands level with the stop.
 */
export function mascotSpot(placed: { x: number; y: number }): { x: number; y: number } {
  const side = Math.sign(placed.x);
  return { x: side === 0 ? PATH_MASCOT.across : -side * PATH_MASCOT.away, y: placed.y - PATH_MASCOT.size / 2 };
}
