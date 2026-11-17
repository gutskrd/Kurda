import { describe, expect, it } from 'vitest';
import {
  PATH_GEOMETRY,
  PATH_JUMP,
  PATH_MASCOT,
  PATH_RETURN,
  UNIT_TONE_ORDER,
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
  type PathUnitInput,
  type SkillStop,
} from './lesson-path.js';

const lesson = (id: string, completed = false, times?: number) => ({ lessonId: id, title: `Lesson ${id}`, completed, ...(times !== undefined ? { times } : {}) });

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

/** A skill whose lessons were finished these many times each, as the server counts them. */
const played = (id: string, times: number[], over: Partial<PathSkill> = {}): PathSkill => ({
  ...skill(id, times.every((t) => t > 0) ? 'completed' : 'unlocked', 0, 0),
  lessons: times.map((t, i) => lesson(`${id}-${i + 1}`, t > 0, t)),
  ...over,
});

const map = (...units: PathSkill[][]) => ({ units: units.map((skills, i) => ({ unitId: `u${i + 1}`, title: `Unit ${i + 1}`, skills })) });

const skills = (path: ReturnType<typeof lessonPath>) =>
  path.units.flatMap((u) => u.stops.map((p) => p.stop)).filter((s): s is SkillStop<PathSkill> => s.kind === 'skill');

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
    expect(skills(path).map((s) => s.state)).toEqual(['current', 'locked', 'locked']);
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
    expect(d?.after?.skillId).toBe('c');
    expect(path.current).toBe('s:c');
    expect({ done: path.done, total: path.total }).toEqual({ done: 2, total: 4 });
  });

  it('calls a second open skill available, not current (a placement test opens several)', () => {
    const path = lessonPath(map([skill('a', 'unlocked'), skill('b', 'unlocked'), skill('c', 'locked')]));
    expect(skills(path).map((s) => s.state)).toEqual(['current', 'available', 'locked']);
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
    expect(skills(path)[0]).toMatchObject({ state: 'current', lessonsTotal: 0, launch: 'a-1', rounds: 0, pieces: 0 });
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

describe('lessonPath — rings and stars', () => {
  it('fills a skill’s ring as its lessons are finished, a piece each, and counts its rounds as stars', () => {
    const path = lessonPath(
      map([played('a', [1, 1, 1, 1]), played('b', [2, 1, 2, 2]), played('c', [3, 3, 3, 3]), played('d', [1, 1, 0, 0]), played('e', [0, 0, 0, 0], { state: 'locked' })]),
    );
    expect(skills(path).map((s) => [s.state, s.rounds, s.pieces, s.lessonsTotal])).toEqual([
      ['done', 1, 0, 4],
      ['done', 1, 3, 4],
      ['done', 3, 4, 4],
      ['current', 0, 2, 4],
      ['locked', 0, 0, 4],
    ]);
  });

  it('takes the server’s numbers when it sends them, held to what a ring can show', () => {
    const sent = played('a', [1, 1], { rounds: 2, pieces: 1 });
    const wild = played('b', [1, 1], { rounds: 9, pieces: 7 });
    expect(skills(lessonPath(map([sent, wild]))).map((s) => [s.rounds, s.pieces])).toEqual([
      [2, 1],
      [3, 2],
    ]);
  });

  it('reads a lesson an older response only marks completed as finished once', () => {
    const path = lessonPath(map([skill('a', 'completed', 2, 2)]));
    expect(skills(path)[0]).toMatchObject({ rounds: 1, pieces: 0 });
  });

  it('plays a finished skill again from the lesson finished the fewest times, so the next round fills piece by piece', () => {
    const [a, b, c] = skills(lessonPath(map([played('a', [1, 1, 1, 1]), played('b', [2, 2, 1, 2]), played('c', [3, 4, 3, 3])])));
    expect([a!.launch, b!.launch, c!.launch]).toEqual(['a-1', 'b-3', 'c-1']);
  });
});

describe('lessonPath — the stops of a unit', () => {
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

  it('keeps a unit’s grammar notes off the road, for the guide its heading opens', () => {
    const grammar = { hasGrammar: true };
    const path = lessonPath(map([skill('a', 'completed', 2, 2, grammar), skill('b', 'unlocked'), skill('c', 'locked', 0, 2, grammar)], [skill('d', 'locked')]));
    expect(path.units[0]!.stops.map((p) => p.stop.kind)).toEqual(['skill', 'skill', 'skill', 'trophy']);
    expect(path.units[0]!.guide.map((s) => s.skillId)).toEqual(['a', 'c']);
    expect(path.units[1]!.guide).toEqual([]);
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
    const units = Array.from({ length: UNIT_TONE_ORDER.length + 1 }, (_, i) => [skill(`s${i}`, 'locked', 0, 2, { hasGrammar: i === 0 })]);
    const path = lessonPath(map(...units));
    expect(path.units.map((u) => u.number)).toEqual(units.map((_, i) => i + 1));
    expect(path.units[0]!.tone).toBe(UNIT_TONE_ORDER[0]);
    // the colours come round again rather than running out
    expect(path.units[UNIT_TONE_ORDER.length]!.tone).toBe(UNIT_TONE_ORDER[0]);
    expect(path.units[0]!.topics).toEqual(['Skill s0']);
    expect(path.units[0]!.guide.map((s) => s.skillId)).toEqual(['s0']);
    expect(path.units[1]!.guide).toEqual([]);
  });

  it('counts skills done per unit', () => {
    const path = lessonPath(map([skill('a', 'completed', 2), skill('b', 'unlocked')]));
    expect(path.units[0]).toMatchObject({ done: 1, total: 2 });
  });
});

describe('lessonPath — sections', () => {
  /** Units of one skill each, at these levels: the first `done` finished, the next one open, the rest closed. */
  const levelled = (levels: Array<string | null | undefined>, done = 0) => ({
    units: levels.map(
      (level, i): PathUnitInput<PathSkill> => ({
        unitId: `u${i + 1}`,
        title: `Unit ${i + 1}`,
        level,
        skills: [i < done ? skill(`k${i}`, 'completed', 2) : skill(`k${i}`, i === done ? 'unlocked' : 'locked')],
      }),
    ),
  });

  it('groups the units by their level in the course plan, in order', () => {
    const path = lessonPath(levelled(['A1', 'A1', 'A1', 'A1', 'A2', 'A2', 'A2', 'A2', 'A2', 'B1', 'B1', 'B1']));
    expect(path.sections.map((s) => [s.key, s.number, s.level, s.units.map((u) => u.number)])).toEqual([
      ['x:1', 1, 'A1', [1, 2, 3, 4]],
      ['x:2', 2, 'A2', [5, 6, 7, 8, 9]],
      ['x:3', 3, 'B1', [10, 11, 12]],
    ]);
    // a unit keeps its number in the whole course, and knows its section
    expect(path.units.map((u) => u.section)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3]);
  });

  it('is one section for a course without levels, and puts a unit without one with the unit before it', () => {
    const none = lessonPath(levelled([undefined, null, undefined]));
    expect(none.sections.map((s) => [s.level, s.units.length])).toEqual([[null, 3]]);
    const gaps = lessonPath(levelled([null, 'A1', null, 'A2', '  ']));
    expect(gaps.sections.map((s) => [s.level, s.units.map((u) => u.number)])).toEqual([
      ['A1', [1, 2, 3]],
      ['A2', [4, 5]],
    ]);
    expect(lessonPath(map()).sections).toEqual([]);
  });

  it('says where the learner is: a section finished, the one they are in, and those still shut', () => {
    const path = lessonPath(levelled(['A1', 'A1', 'A2', 'A2', 'B1'], 2), { offerJumps: true });
    expect(path.section).toBe(1);
    expect(path.sections.map((s) => [s.state, s.done, s.total, s.unitsDone])).toEqual([
      ['done', 2, 2, 2],
      ['open', 0, 2, 0],
      ['locked', 0, 1, 0],
    ]);
  });

  it('offers a test on a shut section’s card when its first unit can be jumped to, and only then', () => {
    const offered = lessonPath(levelled(['A1', 'A1', 'A2', 'A2', 'B1']), { offerJumps: true });
    expect(offered.sections.map((s) => s.jumpTo?.unitId ?? null)).toEqual([null, 'u3', 'u5']);
    // a client that does not draw the offer is not given it
    expect(lessonPath(levelled(['A1', 'A2'])).sections.map((s) => s.jumpTo)).toEqual([null, null]);
  });

  it('opens on the section of the stop the map opens on, and on the last one when the course is done', () => {
    expect(lessonPath(levelled(['A1', 'A2', 'B1'], 1)).section).toBe(1);
    const finished = lessonPath(levelled(['A1', 'A2', 'B1'], 3));
    expect(finished.focus).toBe('t:u3');
    expect(finished.section).toBe(2);
    expect(finished.sections.map((s) => s.state)).toEqual(['done', 'done', 'done']);
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
    expect(lessonPath(course(), { offerJumps: true }).units.map((u) => u.jump)).toEqual([false, true, true]);
  });

  it('offers no jump, and leaves no room for one, to a client that does not draw the offer', () => {
    const path = lessonPath(course());
    expect(path.units.map((u) => u.jump)).toEqual([false, false, false]);
    expect(path.units[1]!.stops[0]!.y).toBe(PATH_GEOMETRY.pad);
  });

  it('gives the first stop of a unit on offer room above it for its bubble', () => {
    const { pad, lift } = PATH_GEOMETRY;
    const path = lessonPath(course(), { offerJumps: true });
    expect(path.units[1]!.stops[0]!.y).toBe(pad + lift);
    expect(path.units[1]!.jumpKey).toBe('s:c');
    expect(path.units[0]!.stops[0]!.y).toBe(pad);
  });

  it('offers nothing past a unit already open, or a first skill with nothing published', () => {
    const open = map([skill('a', 'unlocked')], [skill('c', 'unlocked')]);
    expect(lessonPath(open, { offerJumps: true }).units.map((u) => u.jump)).toEqual([false, false]);
    const empty = map([skill('a', 'unlocked')], [skill('c', 'locked', 0, 0, { firstLessonId: null })]);
    expect(lessonPath(empty, { offerJumps: true }).units[1]!.jump).toBe(false);
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
    const path = lessonPath(after, { offerJumps: true });
    expect(path.current).toBe('s:e');
    expect(skills(path).map((s) => s.state)).toEqual(['done', 'available', 'available', 'available', 'current', 'locked']);
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

  it('notes each skill as it stood: its state, its lessons done, its rounds and its ring', () => {
    expect(pathSnapshot(lessonPath(before))).toEqual({
      's:a': { state: 'current', done: 1, rounds: 0, pieces: 1 },
      's:b': { state: 'locked', done: 0, rounds: 0, pieces: 0 },
      's:c': { state: 'locked', done: 0, rounds: 0, pieces: 0 },
    });
  });

  it('fills the ring whole, finishes the skill with its first star, opens the next and moves the current one on', () => {
    const after = map([skill('a', 'completed', 2), skill('b', 'unlocked')], [skill('c', 'locked')]);
    expect(pathChanges(pathSnapshot(lessonPath(before)), lessonPath(after))).toEqual({
      ring: [{ key: 's:a', of: 2, from: { rounds: 0, pieces: 1 }, to: { rounds: 1, pieces: 0 } }],
      finished: ['s:a'],
      opened: ['s:b'],
      current: 's:b',
    });
  });

  it('fills a piece alone for a lesson that did not finish its skill', () => {
    const start = map([skill('a', 'unlocked', 0, 3)]);
    expect(pathChanges(pathSnapshot(lessonPath(start)), lessonPath(map([skill('a', 'unlocked', 1, 3)])))).toEqual({
      ring: [{ key: 's:a', of: 3, from: { rounds: 0, pieces: 0 }, to: { rounds: 0, pieces: 1 } }],
      finished: [],
      opened: [],
      current: null,
    });
  });

  it('fills a piece of the next round on a gold skill played again, and earns its star when the round is whole', () => {
    const second = (times: number[]) => map([played('a', times)], [skill('z', 'unlocked')]);
    const piece = pathChanges(pathSnapshot(lessonPath(second([1, 1, 1, 1]))), lessonPath(second([2, 1, 1, 1])));
    expect(piece).toEqual({ ring: [{ key: 's:a', of: 4, from: { rounds: 1, pieces: 0 }, to: { rounds: 1, pieces: 1 } }], finished: [], opened: [], current: null });
    const star = pathChanges(pathSnapshot(lessonPath(second([2, 2, 2, 1]))), lessonPath(second([2, 2, 2, 2])));
    expect(star?.ring).toEqual([{ key: 's:a', of: 4, from: { rounds: 1, pieces: 3 }, to: { rounds: 2, pieces: 0 } }]);
    // the third star leaves the ring whole, and playing on changes nothing more
    const third = pathChanges(pathSnapshot(lessonPath(second([3, 3, 2, 3]))), lessonPath(second([3, 3, 3, 3])));
    expect(third?.ring).toEqual([{ key: 's:a', of: 4, from: { rounds: 2, pieces: 3 }, to: { rounds: 3, pieces: 4 } }]);
    expect(pathChanges(pathSnapshot(lessonPath(second([3, 3, 3, 3]))), lessonPath(second([4, 3, 3, 3])))).toBeNull();
  });

  it('reads a snapshot kept from before rings: a skill done then has no round to show, one not done fills from its lessons', () => {
    const old = { 's:a': { state: 'current' as const, done: 1 }, 's:z': { state: 'done' as const, done: 2 } };
    const now = map([skill('a', 'unlocked', 1, 3), played('z', [2, 1])]);
    expect(pathChanges(old, lessonPath(now))).toBeNull();
    expect(pathChanges(old, lessonPath(map([skill('a', 'unlocked', 2, 3), played('z', [2, 2])])))?.ring).toEqual([
      { key: 's:a', of: 3, from: { rounds: 0, pieces: 1 }, to: { rounds: 0, pieces: 2 } },
    ]);
  });

  it('leaves out skills it did not see before (a course that grew)', () => {
    const grown = map([skill('a', 'unlocked', 1, 2), skill('b', 'locked'), skill('n', 'unlocked', 1)], [skill('c', 'locked')]);
    expect(pathChanges(pathSnapshot(lessonPath(before)), lessonPath(grown))).toBeNull();
  });

  it('fills the ring before the stop turns gold, drops a star in after, and lands it before the bubble moves on', () => {
    const { settleMs, ringMs, finishAtMs, starAtMs, starMs, bubbleAtMs } = PATH_RETURN;
    expect(settleMs + ringMs).toBeLessThanOrEqual(finishAtMs);
    expect(starAtMs).toBeGreaterThan(finishAtMs);
    expect(starAtMs + starMs).toBeLessThanOrEqual(bubbleAtMs);
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

describe('a chapter’s story on the path', () => {
  const told = (n: number) => ({ slug: `road-0${n}-tale`, title: `Tale ${n}` });
  const course = (first: PathSkill[], second: PathSkill[]) => ({
    units: [
      { unitId: 'u1', title: 'Unit 1', skills: first, story: told(1) },
      { unitId: 'u2', title: 'Unit 2', skills: second, story: told(2) },
      { unitId: 'u3', title: 'Unit 3', skills: [skill('e', 'locked')], story: null },
    ],
  });

  it('closes a chapter as its prize, in the trophy’s place, shut until the chapter is done', () => {
    const path = lessonPath(course([skill('a', 'completed', 2, 2), skill('b', 'completed', 2, 2)], [skill('c', 'unlocked'), skill('d', 'locked')]));
    expect(path.units.map((u) => u.stops.slice(-2).map((p) => p.stop.key))).toEqual([['s:b', 'b:u1'], ['s:d', 'b:u2'], ['s:e', 't:u3']]);
    expect(path.units[0]!.stops.at(-1)!.stop).toEqual({ kind: 'story', key: 'b:u1', slug: 'road-01-tale', title: 'Tale 1', open: true, unitNumber: 1 });
    expect(path.units[1]!.stops.at(-1)!.stop).toMatchObject({ kind: 'story', open: false, unitNumber: 2 });
    // the line to an open story is walked; to a shut one it is still ahead
    expect(path.units[0]!.stops.at(-1)!.trail).toBe('walked');
    expect(path.units[1]!.stops.at(-1)!.trail).toBe('ahead');
  });

  it('makes a chapter of the road five stops: its four topics, then Hamo’s story', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => skill(id, i === 0 ? 'unlocked' : 'locked', 0, 4, { hasGrammar: i === 0 }));
    const path = lessonPath({ units: [{ unitId: 'u1', title: 'Hello', skills: four, story: told(1), level: 'A1' }] });
    expect(path.units[0]!.stops.map((p) => p.stop.kind)).toEqual(['skill', 'skill', 'skill', 'skill', 'story']);
    expect(path.units[0]!.guide.map((s) => s.skillId)).toEqual(['a']);
  });

  it('is where a finished course opens: the last story', () => {
    const done = () => [skill('a', 'completed', 2, 2)];
    const path = lessonPath({ units: [{ unitId: 'u1', title: 'Unit 1', skills: done(), story: told(1) }] });
    expect(path.current).toBeNull();
    expect(path.focus).toBe('b:u1');
  });

  it('leaves the snapshot, the changes and the lesson to open next to the skills alone', () => {
    const path = lessonPath(course([skill('a', 'completed', 2, 2)], [skill('c', 'unlocked')]));
    expect(Object.keys(pathSnapshot(path))).toEqual(['s:a', 's:c', 's:e']);
    expect(nextLaunch(course([skill('a', 'completed', 2, 2)], [skill('c', 'unlocked')]))).toEqual({ lessonId: 'c-1', title: 'Lesson c-1' });
  });
});
