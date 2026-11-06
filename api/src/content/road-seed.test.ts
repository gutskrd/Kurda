/**
 * Reading the road's unit files, without a database: what each lesson is
 * called and where it goes, which lessons are fit to seed, and that nothing
 * a writer can put in a file — or leave out of the folder — throws.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ROAD_COURSE, parseRoadUnit, readRoadFiles, roadKey, roadSeedName, seedRoadLessons, validateRoadLesson } from './road-seed.js';
import { roadExercises, roadUnitFile } from './road-seed.fixtures.js';

describe('a road unit file', () => {
  it('gives each lesson its key, its place and its skill’s grammar note', () => {
    const parsed = parseRoadUnit(roadUnitFile(ROAD_COURSE, 3, [{ key: 'u03s1l1', position: 1 }, { position: 2 }]), 'unit-03.json');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.course).toMatchObject({ slug: ROAD_COURSE, titleEn: 'The Kurmanji Road' });
    expect(parsed.lessons.map((l) => [l.key, l.unit.position, l.skill.position, l.position])).toEqual([
      ['u03s1l1', 3, 1, 1],
      // a lesson without a key is named by its place
      ['u03s1l2', 3, 1, 2],
    ]);
    expect(parsed.lessons[0]).toMatchObject({
      file: 'unit-03.json',
      unit: { titleEn: 'Unit 3' },
      skill: { titleKu: 'Silav', grammarMd: '**Ez** means *I*.' },
      titleEn: 'Lesson 1',
    });
  });

  it('is refused whole when its structure is wrong, or it is another course’s', () => {
    const broken = roadUnitFile(ROAD_COURSE, 1, [{ position: 1 }]);
    (broken.units as Array<Record<string, unknown>>)[0]!.skills = [];
    const refused = parseRoadUnit(broken, 'unit-01.json');
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.issues.map((i) => i.path)).toEqual(['units.0.skills']);

    const other = parseRoadUnit(roadUnitFile('kurmanji-basics', 1, [{ position: 1 }]), 'unit-01.json');
    expect(!other.ok && other.issues).toEqual([{ path: 'course.slug', message: 'must be kurmanji-road, the course the road is seeded into' }]);

    const badKey = parseRoadUnit(roadUnitFile(ROAD_COURSE, 1, [{ key: 'lesson-one', position: 1 }]), 'unit-01.json');
    expect(!badKey.ok && badKey.issues[0]!.path).toBe('units.0.skills.0.lessons.0.key');
  });

  it('names its lessons as the plan does, and files their markers under the road', () => {
    expect(roadKey(1, 2, 3)).toBe('u01s2l3');
    expect(roadKey(12, 4, 4)).toBe('u12s4l4');
    expect(roadSeedName('u01s1l1')).toBe('lessons:road:u01s1l1');
    // a test's own course never touches the road's markers
    expect(roadSeedName('u01s1l1', 'road-test')).toBe('lessons:road:road-test:u01s1l1');
  });
});

describe('a road lesson’s exercises', () => {
  it('come back in order, as their schemas store them, with who records each kept', () => {
    const shuffled = [...roadExercises(1)].reverse().map((e) => (e.position === 3 ? { ...e, payload: { ...(e.payload as object), notes: 'drop me' } } : e));
    const check = validateRoadLesson({ exercises: shuffled });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.exercises.map((e) => [e.position, e.type])).toEqual([
      [1, 'match_pairs'],
      [2, 'multiple_choice'],
      [3, 'translate'],
      [4, 'conversation'],
    ]);
    expect(check.exercises.map((e) => (e.payload as { voice?: string }).voice)).toEqual(['hevalo', 'hamo', 'xezo', undefined]);
    // what the schema does not know is not stored
    expect(check.exercises[2]!.payload).toEqual({ voice: 'xezo', prompt: 'Thank you', accepted: ['Spas.', 'Spas'] });
  });

  it('name every problem by the exercise it is in', () => {
    const exercises = roadExercises(1);
    exercises[1] = { ...exercises[1]!, payload: { ...(exercises[1]!.payload as object), voice: 'kawa' } };
    exercises[2] = { ...exercises[2]!, payload: { ...(exercises[2]!.payload as object), accepted: [] } };
    exercises.push({ position: 4, type: 'riddle', payload: {} });
    const check = validateRoadLesson({ exercises });
    expect(check.ok).toBe(false);
    expect(!check.ok && check.issues.map((i) => i.path)).toEqual([
      'exercises[1].payload.voice',
      'exercises[2].payload.accepted',
      'exercises[4].position',
      'exercises[4].payload.type',
    ]);
  });
});

describe('the road’s folder', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });
  const folder = async (files: Record<string, string>): Promise<URL> => {
    dir = await mkdtemp(join(tmpdir(), 'road-files-'));
    for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
    return pathToFileURL(`${dir}/`);
  };

  it('reads the unit files in order, and leaves the plan beside them alone', async () => {
    const at = await folder({
      'unit-02.json': JSON.stringify(roadUnitFile(ROAD_COURSE, 2, [{ position: 1 }])),
      'unit-01.json': JSON.stringify(roadUnitFile(ROAD_COURSE, 1, [{ position: 1 }, { position: 2 }])),
      'plan.json': JSON.stringify({ course: 'not a unit' }),
      'notes.txt': 'not a unit either',
    });
    const read = await readRoadFiles(at);
    expect(read.files).toEqual(['unit-01.json', 'unit-02.json']);
    expect(read.lessons.map((l) => l.key)).toEqual(['u01s1l1', 'u01s1l2', 'u02s1l1']);
    expect(read.problems).toEqual([]);
  });

  it('keeps reading past a broken file, and lets one key name one lesson', async () => {
    const at = await folder({
      'unit-01.json': '{ "course": ',
      'unit-02.json': JSON.stringify(roadUnitFile(ROAD_COURSE, 2, [{ position: 1 }])),
      'unit-03.json': JSON.stringify(roadUnitFile(ROAD_COURSE, 3, [{ key: 'u02s1l1', position: 1 }, { position: 2 }])),
    });
    const read = await readRoadFiles(at);
    expect(read.lessons.map((l) => [l.key, l.file])).toEqual([
      ['u02s1l1', 'unit-02.json'],
      ['u03s1l2', 'unit-03.json'],
    ]);
    expect(read.problems.map((p) => [p.file, p.key, p.issues[0]!.message.split(':')[0]])).toEqual([
      ['unit-01.json', undefined, 'not readable JSON'],
      ['unit-03.json', 'u02s1l1', 'another lesson already has this key'],
    ]);
  });

  it('has nothing to read before the first unit is written', async () => {
    const missing = pathToFileURL(join(tmpdir(), `road-none-${Date.now().toString(36)}/`));
    expect(await readRoadFiles(missing)).toEqual({ files: [], course: null, lessons: [], problems: [] });
  });

  it('never throws at boot, whatever the folder holds, and asks the database nothing when there is nothing to seed', async () => {
    const at = await folder({ 'unit-01.json': 'not json at all' });
    const warned: unknown[] = [];
    const pool = {
      query: async () => {
        throw new Error('the database is not asked');
      },
      connect: async () => {
        throw new Error('the database is not asked');
      },
    };
    const summary = await seedRoadLessons(pool as never, { info: () => undefined, warn: (...args: unknown[]) => void warned.push(args) }, { dir: at });
    expect(summary).toEqual({ files: 1, seeded: [], occupied: [], invalid: [], failed: [], already: 0 });
    expect(warned).toHaveLength(1);
  });

  it('logs and carries on when the database fails it', async () => {
    const at = await folder({ 'unit-01.json': JSON.stringify(roadUnitFile(ROAD_COURSE, 1, [{ position: 1 }])) });
    const warned: string[] = [];
    const pool = {
      query: async () => {
        throw new Error('connection refused');
      },
    };
    const log = { info: () => undefined, warn: (_: unknown, message: string) => void warned.push(message) };
    await expect(seedRoadLessons(pool as never, log as never, { dir: at })).resolves.toMatchObject({ seeded: [] });
    expect(warned).toEqual(['seeding the road lessons failed']);
  });
});
