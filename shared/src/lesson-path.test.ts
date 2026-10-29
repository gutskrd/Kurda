import { describe, expect, it } from 'vitest';
import {
  PATH_GEOMETRY,
  PATH_JUMP,
  PATH_MASCOT,
  UNIT_TONES,
  jumpMistakesAllowed,
  jumpPassed,
  jumpPlan,
  lean,
  lessonPath,
  lessonStates,
  mascotSpot,
  nextLaunch,
  pathChanges,
  pathSnapshot,
  stopKeys,
  type PathSkill,
  type PathSkillState,
} from './lesson-path.js';

const lesson = (id: string, completed = false) => ({ lessonId: id, title: `Lesson ${id}`, completed });

const skill = (id: string, state: PathSkillState, done = 0, count = 2, over: Partial<PathSkill> = {}): PathSkill => ({
  skillId: id,
  title: `Skill ${id}`,
  state,
  strength: 0,
  hasGrammar: false,
  firstLessonId: `${id}-1`,
  lessons: Array.from({ length: count }, (_, i) => lesson(`${id}-${i + 1}`, i < done)),
  ...over,
});

const map = (...units: PathSkill[][]) => ({ units: units.map((skills, i) => ({ unitId: `u${i + 1}`, title: `Unit ${i + 1}`, skills })) });

const skills = (path: ReturnType<typeof lessonPath>) =>
  path.units.flatMap((u) => u.stops.map((p) => p.stop)).filter((s) => s.kind === 'skill');

describe('lessonStates', () => {
  it('marks what is done, the one lesson up next, and closes the rest', () => {
    expect(lessonStates(skill('a', 'unlocked', 1, 3))).toEqual(['done', 'next', 'locked']);
  });

  it('opens nothing in a skill that is not open yet, but keeps what was finished', () => {
    expect(lessonStates(skill('a', 'locked', 1, 2))).toEqual(['done', 'locked']);
    expect(lessonStates({ state: 'unlocked' })).toEqual([]);
  });
});

describe('lessonPath — which skill is which', () => {
  it('makes the very first skill current for somebody new, and closes the rest', () => {
    const path = lessonPath(map([skill('a', 'unlocked'), skill('b', 'locked')], [skill('c', 'locked')]));
    expect(skills(path).map((s) => s.kind === 'skill' && s.state)).toEqual(['current', 'locked', 'locked']);
    expect(path.current).toBe('s:a');
    expect(path.focus).toBe('s:a');
  });

  it('is part-way: done skills behind, the first open unfinished one current, its lessons counted', () => {
    const path = lessonPath(
      map([skill('a', 'gold', 2), skill('b', 'decayed', 2)], [skill('c', 'unlocked', 1, 4), skill('d', 'locked')]),
    );
    const [a, b, c, d] = skills(path);
    expect(a).toMatchObject({ state: 'done', finish: 'strong', launch: 'a-1' });
    // a skill gone rusty is done, not current: the learner is not sent back to it
    expect(b).toMatchObject({ state: 'done', finish: 'refresh' });
    expect(c).toMatchObject({ state: 'current', lessonsDone: 1, lessonsTotal: 4, launch: 'c-2', number: 1 });
    expect(d).toMatchObject({ state: 'locked', launch: null });
    expect(d?.kind === 'skill' && d.after?.skillId).toBe('c');
    expect(path.current).toBe('s:c');
    expect({ done: path.done, total: path.total }).toEqual({ done: 2, total: 4 });
  });

  it('calls a second open skill available, not current (a placement test opens several)', () => {
    const path = lessonPath(map([skill('a', 'unlocked'), skill('b', 'unlocked'), skill('c', 'locked')]));
    expect(skills(path).map((s) => s.kind === 'skill' && s.state)).toEqual(['current', 'available', 'locked']);
  });

  it('skips an open skill with nothing published when choosing the current one', () => {
    const empty = skill('a', 'unlocked', 0, 0, { firstLessonId: null });
    const path = lessonPath(map([empty, skill('b', 'unlocked')]));
    expect(skills(path)[0]).toMatchObject({ state: 'available', launch: null });
    expect(path.current).toBe('s:b');
  });

  it('still reads a map without lessons listed', () => {
    const bare = { ...skill('a', 'unlocked'), lessons: undefined };
    const path = lessonPath(map([bare]));
    expect(skills(path)[0]).toMatchObject({ state: 'current', lessonsTotal: 0, launch: 'a-1' });
  });

  it('opens on the last trophy of a finished course', () => {
    const path = lessonPath(map([skill('a', 'completed', 2)], [skill('b', 'gold', 2)]));
    expect(path.current).toBeNull();
    expect(path.focus).toBe('t:u2');
  });

  it('opens on the first stop when nothing is open at all', () => {
    expect(lessonPath(map([skill('a', 'locked')])).focus).toBe('s:a');
    expect(lessonPath(map()).focus).toBeNull();
  });
});

describe('lessonPath — milestones', () => {
  it('ends every unit with its trophy, earned once every skill in it is done', () => {
    const path = lessonPath(map([skill('a', 'completed', 2), skill('b', 'gold', 2)], [skill('c', 'unlocked')], []));
    expect(path.units.map((u) => u.stops.at(-1)?.stop)).toEqual([
      { kind: 'trophy', key: 't:u1', earned: true, unitNumber: 1 },
      { kind: 'trophy', key: 't:u2', earned: false, unitNumber: 2 },
      undefined,
    ]);
  });

  it('puts review just before the current skill, and only with words due', () => {
    const m = map([skill('a', 'completed', 2), skill('b', 'unlocked')]);
    expect(lessonPath(m).units[0]!.stops.map((p) => p.stop.key)).toEqual(['s:a', 's:b', 't:u1']);
    expect(lessonPath(m, { due: 5 }).units[0]!.stops.map((p) => p.stop.key)).toEqual(['s:a', 'review', 's:b', 't:u1']);
    expect(lessonPath(m, { due: 5 }).units[0]!.stops[1]!.stop).toEqual({ kind: 'review', key: 'review', due: 5 });
  });

  it('puts review after the last skill done when nothing open is left to do', () => {
    const path = lessonPath(map([skill('a', 'completed', 2)], [skill('b', 'decayed', 2), skill('c', 'locked')]), { due: 3 });
    expect(stopKeys(path)).toEqual(['s:a', 't:u1', 's:b', 'review', 's:c', 't:u2']);
  });
});

describe('lessonPath — the way it winds', () => {
  it('starts each unit in the middle and leans start, middle, end in turn', () => {
    expect([0, 1, 2, 3, 4, 5].map(lean)).toEqual([0, -1, 0, 1, 0, -1]);
    const path = lessonPath(map([skill('a', 'unlocked'), skill('b', 'locked'), skill('c', 'locked')], [skill('d', 'locked')]));
    expect(path.units[0]!.stops.map((p) => p.x)).toEqual([0, -PATH_GEOMETRY.sway, 0, PATH_GEOMETRY.sway]);
    expect(path.units[1]!.stops[0]!.x).toBe(0);
  });

  it('spaces stops a step apart, with room above the current skill for its bubble', () => {
    const { step, lift, pad } = PATH_GEOMETRY;
    const path = lessonPath(map([skill('a', 'completed', 2), skill('b', 'unlocked'), skill('c', 'locked')]));
    const ys = path.units[0]!.stops.map((p) => p.y);
    expect(ys).toEqual([pad, pad + step + lift, pad + 2 * step + lift, pad + 3 * step + lift]);
    expect(path.units[0]!.height).toBe(ys.at(-1)! + pad);
  });

  it('walks the line up to the current skill, and leaves the rest ahead', () => {
    const path = lessonPath(map([skill('a', 'completed', 2), skill('b', 'unlocked'), skill('c', 'locked')]), { due: 2 });
    expect(path.units[0]!.stops.map((p) => [p.stop.key, p.trail])).toEqual([
      ['s:a', null],
      ['review', 'walked'],
      ['s:b', 'walked'],
      ['s:c', 'ahead'],
      ['t:u1', 'ahead'],
    ]);
  });
});

describe('lessonPath — units', () => {
  it('numbers units, gives each a colour in turn, and says what each covers', () => {
    const units = Array.from({ length: UNIT_TONES.length + 1 }, (_, i) => [skill(`s${i}`, 'locked', 0, 2, { hasGrammar: i === 0 })]);
    const path = lessonPath(map(...units));
    expect(path.units.map((u) => u.number)).toEqual(units.map((_, i) => i + 1));
    expect(path.units[0]!.tone).toBe(UNIT_TONES[0]);
    // the colours come round again rather than running out
    expect(path.units[UNIT_TONES.length]!.tone).toBe(UNIT_TONES[0]);
    expect(path.units[0]!.topics).toEqual(['Skill s0']);
    expect(path.units[0]!.guide.map((s) => s.skillId)).toEqual(['s0']);
    expect(path.units[1]!.guide).toEqual([]);
  });

  it('counts skills done per unit', () => {
    const path = lessonPath(map([skill('a', 'completed', 2), skill('b', 'unlocked')]));
    expect(path.units[0]).toMatchObject({ done: 1, total: 2 });
  });
});

describe('jumping ahead', () => {
  // three units of two: the learner is in the first, part-way through its second skill
  const course = (over: { unlockedThrough?: number } = {}) => ({
    ...map(
      [skill('a', 'completed', 2), skill('b', 'unlocked', 1)],
      [skill('c', 'locked'), skill('d', 'locked')],
      [skill('e', 'locked'), skill('f', 'locked')],
    ),
    ...over,
  });

  it('offers every later unit whose first skill is closed, never the one the learner is in', () => {
    expect(lessonPath(course()).units.map((u) => u.jump)).toEqual([false, true, true]);
  });

  it('gives the first stop of a unit on offer room above it for its bubble', () => {
    const { pad, lift } = PATH_GEOMETRY;
    const path = lessonPath(course());
    expect(path.units[1]!.stops[0]!.y).toBe(pad + lift);
    expect(path.units[0]!.stops[0]!.y).toBe(pad);
  });

  it('offers nothing past a unit already open, or a first skill with nothing published', () => {
    const open = map([skill('a', 'unlocked')], [skill('c', 'unlocked')]);
    expect(lessonPath(open).units.map((u) => u.jump)).toEqual([false, false]);
    const empty = map([skill('a', 'unlocked')], [skill('c', 'locked', 0, 0, { firstLessonId: null })]);
    expect(lessonPath(empty).units[1]!.jump).toBe(false);
  });

  it('plans the test on the unfinished skills it skips, and the place in the course it opens up to', () => {
    const plan = jumpPlan(course(), 'u3');
    expect(plan?.position).toBe(5);
    expect(plan?.skipped.map((s) => s.skillId)).toEqual(['b', 'c', 'd']);
    expect(jumpPlan(course(), 'u2')).toMatchObject({ position: 3 });
  });

  it('refuses the unit the learner is in, one behind them, one open already, and one not in the course', () => {
    expect(jumpPlan(course(), 'u1')).toBeNull();
    expect(jumpPlan(course(), 'nowhere')).toBeNull();
    const opened = map([skill('a', 'unlocked')], [skill('c', 'unlocked')]);
    expect(jumpPlan(opened, 'u2')).toBeNull();
  });

  it('moves the learner on once a test has let them through, the skills skipped left open', () => {
    // as the server sends it after a pass: up to the third unit's first skill open
    const after = course({ unlockedThrough: 5 });
    after.units[1]!.skills = [skill('c', 'unlocked'), skill('d', 'unlocked')];
    after.units[2]!.skills = [skill('e', 'unlocked'), skill('f', 'locked')];
    const path = lessonPath(after);
    expect(path.current).toBe('s:e');
    expect(skills(path).map((s) => s.kind === 'skill' && s.state)).toEqual(['done', 'available', 'available', 'available', 'current', 'locked']);
    expect(path.units.map((u) => u.jump)).toEqual([false, false, false]);
  });

  it('goes back to a skipped skill once everything from the jump on is done', () => {
    const after = map([skill('a', 'unlocked')], [skill('c', 'completed', 2)]);
    expect(lessonPath({ ...after, unlockedThrough: 2 }).current).toBe('s:a');
  });

  it('passes a test of ten with two mistakes at most, and a shorter one with one in five', () => {
    expect(PATH_JUMP).toMatchObject({ questions: 10, maxMistakes: 2 });
    expect(jumpPassed(8, 10)).toBe(true);
    expect(jumpPassed(7, 10)).toBe(false);
    expect(jumpMistakesAllowed(6)).toBe(1);
    expect(jumpPassed(5, 6)).toBe(true);
    expect(jumpPassed(3, 4)).toBe(false);
    expect(jumpPassed(0, 0)).toBe(false);
  });
});

describe('nextLaunch', () => {
  it('is the next lesson of the skill to do now, with its title', () => {
    expect(nextLaunch(map([skill('a', 'completed', 2), skill('b', 'unlocked', 1, 3)]))).toEqual({ lessonId: 'b-2', title: 'Lesson b-2' });
  });

  it('hands on to the skill a finished one opened', () => {
    // a's last lesson was the one just played: a is done now, and b open
    expect(nextLaunch(map([skill('a', 'completed', 2), skill('b', 'unlocked')]), 'a-2')).toEqual({ lessonId: 'b-1', title: 'Lesson b-1' });
  });

  it('names the skill when its lessons are not listed', () => {
    expect(nextLaunch(map([{ ...skill('a', 'unlocked'), lessons: undefined }]))).toEqual({ lessonId: 'a-1', title: 'Skill a' });
  });

  it('is null with nothing open left, or when it would only open the lesson just played again', () => {
    expect(nextLaunch(map([skill('a', 'completed', 2)]))).toBeNull();
    expect(nextLaunch(map([skill('a', 'unlocked', 1, 3)]), 'a-2')).toBeNull();
  });
});

describe('coming back to the path', () => {
  const before = map([skill('a', 'unlocked', 1, 2), skill('b', 'locked')], [skill('c', 'locked')]);

  it('has nothing to show without a path drawn before, or when nothing changed', () => {
    expect(pathChanges(null, lessonPath(before))).toBeNull();
    expect(pathChanges(pathSnapshot(lessonPath(before)), lessonPath(before))).toBeNull();
  });

  it('notes each skill as it stood: its state and its lessons done', () => {
    expect(pathSnapshot(lessonPath(before))).toEqual({
      's:a': { state: 'current', done: 1 },
      's:b': { state: 'locked', done: 0 },
      's:c': { state: 'locked', done: 0 },
    });
  });

  it('fills the ring, finishes the skill, opens the next and moves the current one on', () => {
    const after = map([skill('a', 'completed', 2), skill('b', 'unlocked')], [skill('c', 'locked')]);
    expect(pathChanges(pathSnapshot(lessonPath(before)), lessonPath(after))).toEqual({
      ring: [{ key: 's:a', from: 0.5, to: 1 }],
      finished: ['s:a'],
      opened: ['s:b'],
      current: 's:b',
    });
  });

  it('fills the ring alone for a lesson that did not finish its skill', () => {
    const start = map([skill('a', 'unlocked', 0, 3)]);
    expect(pathChanges(pathSnapshot(lessonPath(start)), lessonPath(map([skill('a', 'unlocked', 1, 3)])))).toEqual({
      ring: [{ key: 's:a', from: 0, to: 1 / 3 }],
      finished: [],
      opened: [],
      current: null,
    });
  });

  it('leaves out skills it did not see before (a course that grew)', () => {
    const grown = map([skill('a', 'unlocked', 1, 2), skill('b', 'locked'), skill('n', 'unlocked', 1)], [skill('c', 'locked')]);
    expect(pathChanges(pathSnapshot(lessonPath(before)), lessonPath(grown))).toBeNull();
  });
});

describe('mascotSpot', () => {
  it('stands across from a stop in the middle, and on the far side from one that leans', () => {
    const { size, across, away } = PATH_MASCOT;
    expect(mascotSpot({ x: 0, y: 200 })).toEqual({ x: across, y: 200 - size / 2 });
    expect(mascotSpot({ x: PATH_GEOMETRY.sway, y: 100 })).toEqual({ x: -away, y: 100 - size / 2 });
    expect(mascotSpot({ x: -PATH_GEOMETRY.sway, y: 100 })).toEqual({ x: away, y: 100 - size / 2 });
  });
});
