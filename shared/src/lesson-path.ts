/**
 * The lesson path: a course map (GET /courses/:id/map) laid out as one winding line of skills, a chapter at a time, in
 * sections. Both apps only paint what this returns, so they agree on the current skill, each stop's state, ring and
 * place, where units end, which units make a section and each unit's colour.
 *
 * The path is a line of skills (topics, to a learner), each holding its lessons. A unit (a chapter) is its skills plus one
 * closing stop: its story, or a chest where it has none. Units are grouped into sections by their level in the course plan
 * (A1, A2, B1), so a learner sees one stretch of the road at a time.
 */
import { TOPIC_STARS, nextInRound, topicRounds, type TopicRounds } from './lesson-rounds.js';

/** A skill's state as the server sends it (api/src/coursemap/node-state.ts). */
export type PathSkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/**
 * What a lesson is, as the map tells it from its exercises (`lessonKind`): `words`, it brings new words; `talk`, it holds
 * a conversation to take part in; `practice`, it goes over words already met.
 */
export const LESSON_KINDS = ['words', 'talk', 'practice'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/** A lesson's kind from its exercises: a conversation makes it a talk, new words make it words, and the rest is practice. */
export function lessonKind({ talk, fresh }: { talk: boolean; fresh: number }): LessonKind {
  if (talk) return 'talk';
  return fresh > 0 ? 'words' : 'practice';
}

/** One lesson of a skill, as the map lists it. */
export interface PathLesson {
  lessonId: string;
  title: string;
  completed: boolean;
  /** how many times this learner finished it; older responses omit it, and a completed lesson then reads as once */
  times?: number;
  /** what the lesson is; older responses omit it */
  kind?: LessonKind;
}

/** What the path needs of a skill; each app passes its own, richer type through. */
export interface PathSkill {
  skillId: string;
  title: string;
  state: PathSkillState;
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  /** the skill's published lessons in order; older responses may omit them */
  lessons?: readonly PathLesson[];
  /** Its rounds and filled ring pieces (`topicRounds`) as the server counted them; worked out from `lessons` when absent. */
  rounds?: number;
  pieces?: number;
}

export interface PathUnitInput<S extends PathSkill> {
  unitId: string;
  title: string;
  skills: readonly S[];
  /** the story that closes the unit, once learners can read it */
  story?: { slug: string; title: string } | null;
  /** Its level in the course plan ('A1', 'A2', 'B1', …); a level's units make a section. Null in a course without levels: one section. */
  level?: string | null;
}

export interface PathMapInput<S extends PathSkill> {
  units: readonly PathUnitInput<S>[];
  /** Skills up to this place in the course (from 1, in course order) are open because a test let the learner through; 0 or absent when none did. */
  unlockedThrough?: number;
}

/**
 * A lesson in a skill: `done`, finished and open to replay; `next`, the first unfinished one of an open skill; `locked`,
 * the rest, since lessons are taken in order.
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
 * A skill on the path: `done`, every lesson finished; `current`, the first open unfinished skill from where a test last
 * let the learner through; `available`, open but not next (a placement test can open several, and jumped-over skills stay
 * open); `locked`, not open yet.
 */
export type StopState = 'done' | 'current' | 'available' | 'locked';

/** How a finished skill is holding up in reviews: strong (the server's gold), steady, or due a refresh (the server's decayed). */
export type Finish = 'strong' | 'steady' | 'refresh';

export interface SkillStop<S extends PathSkill> {
  kind: 'skill';
  key: string;
  skill: S;
  /** its place in its unit, from 1, shown on an open stop */
  number: number;
  state: StopState;
  /** set on a finished skill only */
  finish: Finish | null;
  lessonsDone: number;
  lessonsTotal: number;
  /** Full rounds of its lessons played, 0 to `TOPIC_STARS`: the stars it wears. Done once it has one. */
  rounds: number;
  /** Ring pieces filled of `lessonsTotal`: the finished lessons of the round in play, or all of them once every round is played. */
  pieces: number;
  /**
   * The lesson the stop opens: the next unfinished one, or once all are done the one finished fewest times, so replays fill
   * the next round. Null for a locked skill or one with nothing published.
   */
  launch: string | null;
  /** What the lesson it opens is, shown on the stop to do now; null without one, or from a server too old to say. */
  launchKind: LessonKind | null;
  /** the skill whose finishing opens this one; named on a locked stop */
  after: S | null;
}

/**
 * Review as a stop: only when words are due, and just before the current skill rather than in every unit, since review
 * draws words from the whole course.
 */
export interface ReviewStop {
  kind: 'review';
  key: 'review';
  due: number;
}

/** A unit's closing prize where it has no story (another course, or a chapter whose story is not out), earned when every skill is done. */
export interface TrophyStop {
  kind: 'trophy';
  key: string;
  earned: boolean;
  /** the unit it closes, from 1 */
  unitNumber: number;
}

/**
 * The story that closes a unit, told by Hamo, in place of the trophy. It opens when every skill of the unit is done and
 * is drawn as won from then, so it rewards the chapter rather than skipping it.
 */
export interface StoryStop {
  kind: 'story';
  key: string;
  slug: string;
  title: string;
  open: boolean;
  /** the unit it closes, from 1 */
  unitNumber: number;
}

export type PathStop<S extends PathSkill> = SkillStop<S> | ReviewStop | TrophyStop | StoryStop;

/** A stop and where it sits. */
export interface PlacedStop<S extends PathSkill> {
  stop: PathStop<S>;
  /** Across, in points, from the path's middle toward the end of a line of text; the apps mirror it for right-to-left. */
  x: number;
  /** Down, in points: the stop's centre from the top of its unit's path. */
  y: number;
  /** The line in from the previous stop: walked once both ends are reached, else ahead. Null for a unit's first stop. */
  trail: 'walked' | 'ahead' | null;
}

/** The unit colours the apps know; the values are art/path-land.ts's `PATH_STOP_TONES`. */
export const UNIT_TONES = ['meadow', 'river', 'clay', 'dusk', 'pine', 'rose', 'saffron', 'pomegranate'] as const;
export type UnitTone = (typeof UNIT_TONES)[number];

/**
 * The order units take their colours in, so each chapter the road enters turns a new colour: meadow green, iris, teal,
 * sky, rose, Newroz orange and pomegranate. Saffron is never dealt to a unit, since a yellow stop would be taken for a
 * finished one's gold.
 */
export const UNIT_TONE_ORDER: readonly UnitTone[] = ['meadow', 'dusk', 'pine', 'river', 'rose', 'clay', 'pomegranate'];

/** The colour of a course's unit, by its place in the course from 0. */
export function unitTone(index: number): UnitTone {
  return UNIT_TONE_ORDER[index % UNIT_TONE_ORDER.length]!;
}

export interface PathUnit<S extends PathSkill> {
  unitId: string;
  title: string;
  /** from 1, through the whole course, as the book and the stories number chapters */
  number: number;
  tone: UnitTone;
  /** the section it is in, from 1 */
  section: number;
  /**
   * The learner may test out to here (`jumpPlan`): a later unit whose first skill is still closed. The offer is made on
   * that skill's stop (`jumpKey`), or on its section's card while the section is shut.
   */
  jump: boolean;
  /** the stop that offers the jump: the unit's first skill, when `jump` */
  jumpKey: string | null;
  stops: PlacedStop<S>[];
  /** the height the unit's path needs, in points */
  height: number;
  /** skills finished, of `total` */
  done: number;
  total: number;
  /** the unit's skill names in order: what it covers, in one line */
  topics: string[];
  /** the skills with a grammar note, for the unit's guide; empty when there is none */
  guide: S[];
}

/** Where a section stands: `done`, every skill finished; `open`, begun or opened by a test; `locked`, nothing open yet. */
export type SectionState = 'done' | 'open' | 'locked';

/** A stretch of the course: its units of one level, shown together, with the other sections folded away as cards. */
export interface PathSection<S extends PathSkill> {
  /** `x:` and its number */
  key: string;
  /** from 1 */
  number: number;
  /** the level its units share in the course plan ('A1'), or null in a course without levels */
  level: string | null;
  units: PathUnit<S>[];
  state: SectionState;
  /** units with every skill done, of `units.length` */
  unitsDone: number;
  /** skills finished, of `total` */
  done: number;
  total: number;
  /** the unit a test opens from this section's card: its first, while the section is shut and that unit can be jumped to */
  jumpTo: PathUnit<S> | null;
}

export interface LessonPath<S extends PathSkill> {
  units: PathUnit<S>[];
  /** the units in their sections, in order; one section for a course without levels */
  sections: PathSection<S>[];
  /** the section the learner is in, from 0: the one holding `focus` */
  section: number;
  /** the current skill's key, if any skill is open and unfinished */
  current: string | null;
  /** The stop the map opens on: the current skill; else, with nothing open left, the furthest stop reached; else the first. */
  focus: string | null;
  /** skills finished in the whole course, of `total` */
  done: number;
  total: number;
}

/**
 * The path's measurements in points, shared so both apps space it alike: `node` a stop's button, `step` between stop
 * centres, `sway` how far a stop leans off the middle, `lift` the extra room above the current skill (and a jumpable unit's
 * first skill) for its bubble, `pad` the room above the first stop and below the last, where the landmark stands
 * (path-world.ts).
 */
export const PATH_GEOMETRY = { node: 72, step: 104, sway: 72, lift: 64, pad: 92 } as const;

/** Where a stop leans by its place in its unit: a soft zigzag that every unit starts again from the middle. */
const LEAN = [0, -1, 0, 1] as const;

export function lean(index: number): number {
  return LEAN[((index % LEAN.length) + LEAN.length) % LEAN.length]!;
}

/**
 * Where a new learner's first `count` stops stand, the first raised for its Start bubble, laid out as `place` lays the
 * real road: the road's loading placeholder in both apps, so the stops drop into place when the course arrives.
 */
export function openingStops(count: number): { stops: { x: number; y: number }[]; height: number } {
  const { step, sway, lift, pad } = PATH_GEOMETRY;
  const stops = Array.from({ length: count }, (_, i) => ({ x: lean(i) * sway, y: pad + lift + i * step }));
  return { stops, height: count > 0 ? stops[count - 1]!.y + pad : 0 };
}

const FINISHED: ReadonlySet<PathSkillState> = new Set(['completed', 'gold', 'decayed']);

function finishOf(state: PathSkillState): Finish | null {
  if (state === 'gold') return 'strong';
  if (state === 'decayed') return 'refresh';
  if (state === 'completed') return 'steady';
  return null;
}

/** How many times a lesson was finished: the server's count, or once for a completed lesson in an older response. */
function timesOf(lesson: PathLesson): number {
  return lesson.times ?? (lesson.completed ? 1 : 0);
}

/** A skill's rounds and filled pieces: the server's, capped to what a ring shows, or worked out from its lessons. */
function roundsOf(skill: PathSkill): TopicRounds {
  const lessons = skill.lessons ?? [];
  if (typeof skill.rounds === 'number' && typeof skill.pieces === 'number') {
    const rounds = Math.max(0, Math.min(TOPIC_STARS, Math.floor(skill.rounds)));
    return { rounds, pieces: Math.max(0, Math.min(lessons.length, Math.floor(skill.pieces))) };
  }
  return topicRounds(lessons.map(timesOf));
}

/** The lesson to open from a skill that is open, or null. */
function launchOf(skill: PathSkill): string | null {
  if (skill.state === 'locked') return null;
  const lessons = skill.lessons ?? [];
  return lessons[nextInRound(lessons.map(timesOf))]?.lessonId ?? skill.firstLessonId;
}

/** Whether an open skill is still to finish; one with no lessons published has nothing to do yet. */
function unfinished(skill: PathSkill): boolean {
  if (FINISHED.has(skill.state)) return false;
  const lessons = skill.lessons;
  return lessons ? lessons.length > 0 && lessons.some((l) => !l.completed) : skill.firstLessonId !== null;
}

/**
 * Lays a course map out as a path. With `due` review words waiting (GET /practice/due), a review stop goes just before the
 * current skill, or just after the last skill finished when nothing open is left. `offerJumps` adds room above each
 * jumpable unit's first stop for the offer's bubble; only a client that draws the offer asks. Each unit's stops are its
 * skills, then its story or trophy; grammar notes are its heading's guide, not a stop.
 */
export function lessonPath<S extends PathSkill>(map: PathMapInput<S>, { due = 0, offerJumps = false }: { due?: number; offerJumps?: boolean } = {}): LessonPath<S> {
  const { currentSkill, lastDone, here } = whereIs(map);
  // Review sits before the skill to do now, or after the last one done.
  const reviewBefore = due > 0 && currentSkill ? currentSkill : null;
  const reviewAfter = due > 0 && !currentSkill && lastDone ? lastDone : null;
  const sectionOf = sectionNumbers(map.units);

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
      const { rounds, pieces } = roundsOf(skill);
      const launch = launchOf(skill);
      stops.push({
        kind: 'skill',
        key: `s:${skill.skillId}`,
        skill,
        number: i + 1,
        state,
        finish: finishOf(skill.state),
        lessonsDone: lessons.filter((l) => l.completed).length,
        lessonsTotal: lessons.length,
        rounds,
        pieces,
        launch,
        launchKind: lessons.find((l) => l.lessonId === launch)?.kind ?? null,
        after: previous,
      });
      if (reviewAfter === skill) stops.push({ kind: 'review', key: 'review', due });
      previous = skill;
    });
    const unitDone = unit.skills.filter((s) => FINISHED.has(s.state)).length;
    done += unitDone;
    total += unit.skills.length;
    if (unit.skills.length > 0) {
      // The unit's prize: its story, opened when every skill is done; a unit without one keeps its trophy.
      const won = unitDone === unit.skills.length;
      if (unit.story) stops.push({ kind: 'story', key: `b:${unit.unitId}`, slug: unit.story.slug, title: unit.story.title, open: won, unitNumber: u + 1 });
      else stops.push({ kind: 'trophy', key: `t:${unit.unitId}`, earned: won, unitNumber: u + 1 });
    }
    const jump = offerJumps && u > here && opensOnJump(unit.skills[0]);
    const jumpKey = jump ? `s:${unit.skills[0]!.skillId}` : null;
    const { placed, height } = place(stops, jumpKey);
    return {
      unitId: unit.unitId,
      title: unit.title,
      number: u + 1,
      tone: unitTone(u),
      section: sectionOf[u]!.number,
      jump,
      jumpKey,
      stops: placed,
      height,
      done: unitDone,
      total: unit.skills.length,
      topics: unit.skills.map((s) => s.title),
      guide: unit.skills.filter((s) => s.hasGrammar),
    };
  });

  const current = currentSkill ? `s:${currentSkill.skillId}` : null;
  const focus = current ?? frontier(units);
  const sections = sectionsOf(units, sectionOf.map((s) => s.level));
  const section = Math.max(
    0,
    sections.findIndex((s) => s.units.some((u) => u.stops.some((p) => p.stop.key === focus))),
  );
  return { units, sections, section, current, focus, done, total };
}

/**
 * Each unit's section, from 1, and the section's level. A run of units of one level is a section; a unit without a level
 * joins the one before it (or the first with one), so it never splits a section; a course without levels is one section.
 */
function sectionNumbers(units: readonly PathUnitInput<PathSkill>[]): Array<{ number: number; level: string | null }> {
  const given = units.map((u) => (typeof u.level === 'string' && u.level.trim() !== '' ? u.level.trim() : null));
  const first = given.find((l) => l !== null) ?? null;
  let level: string | null = first;
  let number = 1;
  return given.map((l, i) => {
    if (l !== null && l !== level) {
      if (i > 0) number += 1;
      level = l;
    }
    return { number, level };
  });
}

/** The units gathered into their sections, each with how far the learner is through it. */
function sectionsOf<S extends PathSkill>(units: PathUnit<S>[], levels: readonly (string | null)[]): PathSection<S>[] {
  const sections: PathSection<S>[] = [];
  units.forEach((unit, u) => {
    let section = sections[unit.section - 1];
    if (!section) {
      section = { key: `x:${unit.section}`, number: unit.section, level: levels[u] ?? null, units: [], state: 'locked', unitsDone: 0, done: 0, total: 0, jumpTo: null };
      sections.push(section);
    }
    section.units.push(unit);
  });
  for (const section of sections) {
    const skills = section.units.flatMap((u) => u.stops.map((p) => p.stop)).filter((s): s is SkillStop<S> => s.kind === 'skill');
    section.done = skills.filter((s) => s.state === 'done').length;
    section.total = skills.length;
    section.unitsDone = section.units.filter((u) => u.total > 0 && u.done === u.total).length;
    section.state = section.total > 0 && section.done === section.total ? 'done' : skills.every((s) => s.state === 'locked') ? 'locked' : 'open';
    const first = section.units[0];
    section.jumpTo = section.state === 'locked' && first?.jump ? first : null;
  }
  return sections;
}

/**
 * Where the learner is: the current skill (the first open unfinished one from where a test last let them through, else
 * from the start), the last one finished, and the unit they are in.
 */
function whereIs<S extends PathSkill>(map: PathMapInput<S>): { currentSkill: S | null; lastDone: S | null; here: number } {
  const all = map.units.flatMap((u) => u.skills);
  const toDo = (s: S) => s.state === 'unlocked' && unfinished(s) && launchOf(s) !== null;
  const through = Math.max(0, (map.unlockedThrough ?? 0) - 1);
  const currentSkill = all.slice(through).find(toDo) ?? all.find(toDo) ?? null;
  const lastDone = [...all].reverse().find((s) => FINISHED.has(s.state)) ?? null;
  const at = currentSkill ?? lastDone;
  return { currentSkill, lastDone, here: Math.max(0, at ? map.units.findIndex((u) => u.skills.includes(at)) : 0) };
}

/** Whether a unit's first skill is closed and has lessons for a passed test to open. */
function opensOnJump(first: PathSkill | undefined): boolean {
  if (!first || first.state !== 'locked') return false;
  return first.lessons ? first.lessons.length > 0 : first.firstLessonId !== null;
}

/**
 * The jump-ahead test's numbers, as the server keeps them and the apps say them: at most this many questions (fewer when
 * fewer skills are skipped), the mistakes a full test allows, and the tests a learner may start at one unit a day, so
 * passing is learning, not retried luck.
 */
export const PATH_JUMP = { questions: 10, maxMistakes: 2, triesPerDay: 3 } as const;

/** The mistakes a test of `total` questions allows: 2 in 10, one in five of a shorter one. */
export function jumpMistakesAllowed(total: number): number {
  return Math.floor((Math.max(0, total) * PATH_JUMP.maxMistakes) / PATH_JUMP.questions);
}

/** Passed: no more mistakes than allowed, an unanswered item counting as one. */
export function jumpPassed(correct: number, total: number): boolean {
  return total > 0 && total - correct <= jumpMistakesAllowed(total);
}

/**
 * Jumping ahead to a unit: a short test on the skills it skips that, when passed, opens every skill up to the unit's first
 * (`position`, its place in the course from 1), the skipped ones staying open. `skipped` are the unfinished skills from
 * the learner's unit up to the target, in course order. Null when the unit may not be jumped to (`PathUnit.jump`).
 */
export function jumpPlan<S extends PathSkill>(map: PathMapInput<S>, unitId: string): { position: number; skipped: S[] } | null {
  const target = map.units.findIndex((u) => u.unitId === unitId);
  const { here } = whereIs(map);
  if (target <= here || !opensOnJump(map.units[target]!.skills[0])) return null;
  const first = map.units[target]!.skills[0]!;
  const skipped = map.units
    .slice(here, target)
    .flatMap((u) => u.skills)
    .filter((s) => !FINISHED.has(s.state));
  return { position: map.units.flatMap((u) => u.skills).indexOf(first) + 1, skipped };
}

/** Whether the learner has got to a stop: done, current, the review beside them, or a prize won. */
function reached<S extends PathSkill>(stop: PathStop<S>): boolean {
  if (stop.kind === 'review') return true;
  if (stop.kind === 'trophy') return stop.earned;
  if (stop.kind === 'story') return stop.open;
  return stop.state === 'done' || stop.state === 'current';
}

/** Places stops down the page a step apart, leaning in turn, with room above the current skill and above `jumpKey` for their bubbles. */
function place<S extends PathSkill>(stops: PathStop<S>[], jumpKey: string | null): { placed: PlacedStop<S>[]; height: number } {
  const { step, sway, lift, pad } = PATH_GEOMETRY;
  let y = pad;
  const placed = stops.map((stop, i): PlacedStop<S> => {
    const raised = (stop.kind === 'skill' && stop.state === 'current') || stop.key === jumpKey;
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
 * The lesson "Next lesson" opens after a lesson, read from the map fetched afterwards so a skill just finished hands on to
 * the one it opened. Null when nothing open is left, or when it would only replay `finished`.
 */
export function nextLaunch<S extends PathSkill>(map: PathMapInput<S>, finished: string | null = null): { lessonId: string; title: string } | null {
  const path = lessonPath(map);
  const stop = path.units.flatMap((u) => u.stops.map((p) => p.stop)).find((s) => s.key === path.current);
  if (stop?.kind !== 'skill' || !stop.launch || stop.launch === finished) return null;
  const lesson = stop.skill.lessons?.find((l) => l.lessonId === stop.launch);
  return { lessonId: stop.launch, title: lesson?.title ?? stop.skill.title };
}

/**
 * How the path stood, skill by skill. Each app keeps the last one it drew so returning after a lesson can show what changed
 * (`pathChanges`). Snapshots from before rings were drawn have no rounds.
 */
export type PathSnapshot = Record<string, { state: StopState; done: number; rounds?: number; pieces?: number }>;

export function pathSnapshot<S extends PathSkill>(path: LessonPath<S>): PathSnapshot {
  const snapshot: PathSnapshot = {};
  for (const unit of path.units) {
    for (const { stop } of unit.stops) {
      if (stop.kind === 'skill') snapshot[stop.key] = { state: stop.state, done: stop.lessonsDone, rounds: stop.rounds, pieces: stop.pieces };
    }
  }
  return snapshot;
}

/** A skill's ring, at one moment: its full rounds and the pieces filled. */
export interface RingAt {
  rounds: number;
  pieces: number;
}

/** A skill's ring moving on, `of` pieces round. When `to` has more rounds than `from`, the ring filled and earned a star first. */
export interface RingChange {
  key: string;
  of: number;
  from: RingAt;
  to: RingAt;
}

/** What moved on the path since the snapshot, in the order it is shown (`PATH_RETURN`). */
export interface PathChanges {
  /** skills whose ring moved on: a piece filled, a round completed (a star), or both */
  ring: RingChange[];
  /** skills finished since, their first round whole, so they turn gold */
  finished: string[];
  /** skills opened since: closed then, open now */
  opened: string[];
  /** the skill to do now, when it is not the one it was */
  current: string | null;
}

/** Whether a ring has moved on: more rounds, or more pieces in the same round. */
function ahead(to: RingAt, from: RingAt): boolean {
  return to.rounds > from.rounds || (to.rounds === from.rounds && to.pieces > from.pieces);
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
      // A snapshot from before rings: a skill done then is taken as it is now, one not done as in its first round.
      const from: RingAt =
        then.rounds !== undefined && then.pieces !== undefined
          ? { rounds: then.rounds, pieces: then.pieces }
          : then.state === 'done'
            ? { rounds: stop.rounds, pieces: stop.pieces }
            : { rounds: 0, pieces: then.done };
      const to: RingAt = { rounds: stop.rounds, pieces: stop.pieces };
      if (stop.lessonsTotal > 0 && ahead(to, from)) changes.ring.push({ key: stop.key, of: stop.lessonsTotal, from, to });
      if (stop.state === 'done' && then.state !== 'done') changes.finished.push(stop.key);
      if ((stop.state === 'current' || stop.state === 'available') && then.state === 'locked') changes.opened.push(stop.key);
    }
  }
  if (path.current !== prevCurrent) changes.current = path.current;
  const any = changes.ring.length > 0 || changes.finished.length > 0 || changes.opened.length > 0 || changes.current !== null;
  return any ? changes : null;
}

/**
 * Returning to the path after a lesson, in ms from when it is drawn, alike on the phone and the website: the page settles
 * (`settleMs`); the bar over the stop fills (`ringMs`); a finished stop is sealed in wax (`finishAtMs`, over `stampMs`,
 * the stamp pressing halfway); a full bar starts its next round once it has pressed (`nextAtMs`); an opened stop pops as
 * its lock turns into its glyph (`openAtMs`, `popMs`, `glyphMs`); the bubble reaches the new current stop as the page
 * scrolls there (`bubbleAtMs`, `bubbleMs`); and once the wax has settled, a round's new star lights on the stop
 * (`starAtMs`, `starMs`). Under Reduce Motion nothing plays.
 */
export const PATH_RETURN = {
  settleMs: 300,
  ringMs: 400,
  finishAtMs: 700,
  stampMs: 1300,
  popMs: 320,
  nextAtMs: 1450,
  openAtMs: 1750,
  glyphMs: 120,
  bubbleAtMs: 1950,
  bubbleMs: 200,
  starAtMs: 2000,
  starMs: 280,
} as const;

/** Hevalo beside the current stop: his `size`, and how far from the middle he stands, on the far side of a leaning stop (`away`), never on the line. */
export const PATH_MASCOT = { size: 88, across: 110, away: 96 } as const;

/** Where Hevalo stands beside a placed stop: `x` his middle, in the stops' logical terms; `y` his top, level with the stop. */
export function mascotSpot(placed: { x: number; y: number }): { x: number; y: number } {
  const side = Math.sign(placed.x);
  return { x: side === 0 ? PATH_MASCOT.across : -side * PATH_MASCOT.away, y: placed.y - PATH_MASCOT.size / 2 };
}
