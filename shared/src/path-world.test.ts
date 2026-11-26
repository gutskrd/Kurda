import { describe, expect, it } from 'vitest';
import { PATH_GEOMETRY, PATH_MASCOT, lessonPath, mascotSpot, type PathSkill } from './lesson-path.js';
import {
  PATH_LANDMARKS,
  PATH_LANDS,
  PATH_PEEKERS,
  PATH_SCENERY,
  PATH_SCENERY_SPOT,
  PATH_START_WORDS,
  landmarkBox,
  pathLand,
  pathPeeker,
  unitScenery,
  type PathBox,
} from './path-world.js';

const skill = (id: string, state: PathSkill['state'], grammar = false): PathSkill => ({
  skillId: id,
  title: id,
  state,
  strength: 0,
  hasGrammar: grammar,
  firstLessonId: `${id}1`,
  lessons: [{ lessonId: `${id}1`, title: id, completed: state === 'completed' }],
});

/** A unit of four skills closed by its story, the second one to do now: the shape of every unit of the road. */
function unit(current = 1) {
  const skills = [0, 1, 2, 3].map((i) => skill(`s${i}`, i < current ? 'completed' : i === current ? 'unlocked' : 'locked', i === 0));
  return lessonPath({ units: [{ unitId: 'u', title: 'U', skills, story: { slug: 'road-01-tale', title: 'Tale' } }] }).units[0]!;
}

const overlap = (a: PathBox, b: PathBox): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;
const stopBox = (s: { x: number; y: number }): PathBox => ({ x: s.x, y: s.y - PATH_GEOMETRY.node / 2, w: PATH_GEOMETRY.node, h: PATH_GEOMETRY.node + 8 });
/** Hevalo beside a stop (`mascotSpot`), drawn whole, as tall as he stands on the path. */
const hevaloBox = (s: { x: number; y: number }): PathBox => {
  const tall = 132;
  return { x: mascotSpot(s).x, y: s.y + PATH_GEOMETRY.node / 2 + 12 - tall, w: PATH_MASCOT.size, h: tall };
};

describe('the lands of the road', () => {
  it('gives the twelve units of the road twelve landmarks, and starts the year again after them', () => {
    expect(PATH_LANDS).toHaveLength(12);
    expect(new Set(PATH_LANDS.map((l) => l.landmark))).toEqual(new Set(PATH_LANDMARKS));
    expect(new Set(PATH_LANDS.map((l) => l.ground)).size).toBe(12);
    expect(pathLand(0).landmark).toBe('gate');
    expect(pathLand(6).landmark).toBe('newroz');
    expect(pathLand(12)).toBe(pathLand(0));
    expect(pathLand(-1)).toBe(pathLand(11));
    // the people of the course, not anyone else
    for (const land of PATH_LANDS) expect(['hamo', 'xezo']).toContain(land.host);
  });
});

describe('where things stand beside the path', () => {
  it('stands the landmark beside the first stop, inside the page and off every stop, on a phone and on a wide page', () => {
    for (const width of [320, 360, 390, 480, 720]) {
      const u = unit();
      const box = landmarkBox(width);
      expect(Math.abs(box.x) + box.w / 2).toBeLessThanOrEqual(width / 2);
      expect(box.w).toBeGreaterThanOrEqual(PATH_SCENERY.landmarkMin);
      expect(box.w).toBeLessThanOrEqual(PATH_SCENERY.landmark);
      // on the start side, its foot level with the first stop's
      expect(box.x).toBeLessThan(0);
      for (const p of u.stops) expect(overlap(box, stopBox(p)), `${width} ${p.stop.key}`).toBe(false);
    }
  });

  it('never stands the landmark where Hevalo stands, wherever the learner is in the unit', () => {
    for (const current of [0, 1, 2, 3]) {
      const u = unit(current);
      const here = u.stops.find((p) => p.stop.kind === 'skill' && p.stop.state === 'current')!;
      expect(overlap(landmarkBox(390), hevaloBox(here)), `current ${current}`).toBe(false);
    }
  });
});

describe('the road’s playful touches', () => {
  const stops = [0, -1, 0, 1, 0].map((lean, i) => ({ x: lean * PATH_GEOMETRY.sway, y: PATH_GEOMETRY.pad + i * PATH_GEOMETRY.step }));

  it('greets each dialect in its own words, a start and a keep-going', () => {
    expect(PATH_START_WORDS.kurmanji.start).toBe('Ji vir dest pê bike!');
    for (const words of Object.values(PATH_START_WORDS)) {
      expect(words.start.length).toBeGreaterThan(0);
      expect(words.going).not.toBe(words.start);
    }
  });

  it('sends someone different to peek beside each of four units in turn, the pigeon among them', () => {
    expect(PATH_PEEKERS.map((_, i) => pathPeeker(i))).toEqual([...PATH_PEEKERS]);
    expect(pathPeeker(PATH_PEEKERS.length)).toBe(PATH_PEEKERS[0]);
    expect(pathPeeker(-1)).toBe(PATH_PEEKERS[PATH_PEEKERS.length - 1]);
    expect(PATH_PEEKERS).toContain('pigeon');
  });

  it('stands the peeker and the chest on the open side of a leaning stop, never on the line', () => {
    const { peek, chest } = unitScenery(stops);
    // the fourth stop leans to the end, so the peeker is on the start side; the second leans to the start, the chest the other way
    expect(peek).toEqual({ x: -PATH_SCENERY_SPOT.peekAcross, y: stops[3]!.y });
    expect(chest).toEqual({ x: PATH_SCENERY_SPOT.chestAcross, y: stops[1]!.y });
    for (const spot of [peek!, chest!]) {
      for (const stop of stops) expect(Math.abs(spot.x - stop.x) >= PATH_GEOMETRY.node || Math.abs(spot.y - stop.y) >= PATH_GEOMETRY.node).toBe(true);
    }
  });

  it('leaves out whatever would stand on Hevalo beside the stop to do now', () => {
    expect(unitScenery(stops, mascotSpot(stops[1]!)).chest).toBeNull();
    expect(unitScenery(stops, mascotSpot(stops[3]!)).peek).toBeNull();
    expect(unitScenery(stops, mascotSpot(stops[3]!)).chest).not.toBeNull();
    // a short unit has room for its peeker but not a chest
    expect(unitScenery(stops.slice(0, 2))).toEqual({ peek: { x: PATH_SCENERY_SPOT.peekAcross, y: stops[1]!.y }, chest: null });
  });
});
