import { describe, expect, it } from 'vitest';
import { PATH_GEOMETRY, PATH_MASCOT, lessonPath, mascotSpot, type PathSkill } from './lesson-path.js';
import { PATH_SCENE_IDS } from './art/path-scenes.js';
import {
  PATH_LANDMARKS,
  PATH_LANDS,
  PATH_PIGEON_FLIGHT,
  PATH_SCENE_MOTION,
  PATH_SCENE_ORDER,
  PATH_SCENERY,
  PATH_SCENERY_SPOT,
  PATH_SCENE_REACH,
  PATH_STAMP_MOMENT,
  PATH_APPLE_REACH,
  PATH_START_WORDS,
  landmarkBox,
  pathLand,
  pathScene,
  sceneBeat,
  sceneBeatMs,
  stopPrints,
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

  it('gives each of the twelve chapters a scene of its own people, each of the four three times, and starts again after them', () => {
    expect(PATH_SCENE_ORDER).toHaveLength(12);
    for (const scene of PATH_SCENE_IDS) expect(PATH_SCENE_ORDER.filter((s) => s === scene), scene).toHaveLength(3);
    // Hevalo after apples in the first chapter, where they go missing; Xezo at her slate in the chapter of school
    expect(pathScene(0)).toBe('apple');
    expect(pathScene(10)).toBe('slate');
    expect(pathScene(12)).toBe(pathScene(0));
    expect(pathScene(-1)).toBe(pathScene(11));
  });

  it('leans the scene in from the edge across from a leaning stop, and stands the chest on the open side, never on the line', () => {
    const { scene, chest } = unitScenery(stops);
    // the fourth stop leans to the end, so the scene leans in from the start; the second leans to the start, the chest the other way
    expect(scene).toEqual({ side: -1, y: stops[3]!.y });
    expect(chest).toEqual({ x: PATH_SCENERY_SPOT.chestAcross, y: stops[1]!.y });
    for (const stop of stops) expect(Math.abs(chest!.x - stop.x) >= PATH_GEOMETRY.node || Math.abs(chest!.y - stop.y) >= PATH_GEOMETRY.node).toBe(true);
  });

  it('keeps a scene off every stop beside it, from a phone’s narrow screen to a wide page', () => {
    const { scene } = unitScenery(stops);
    for (const width of [360, 390, 430, 720]) {
      const { across, up, down } = PATH_SCENE_REACH;
      const box: PathBox = { x: scene!.side * (width / 2 - across / 2), y: scene!.y - up, w: across, h: up + down };
      for (const stop of stops) expect(overlap(box, stopBox(stop)), `${width}`).toBe(false);
    }
  });

  it('leaves out whatever would stand on Hevalo beside the stop to do now, and his apple where he is already', () => {
    expect(unitScenery(stops, stops[1]!).chest).toBeNull();
    expect(unitScenery(stops, stops[3]!).scene).toBeNull();
    expect(unitScenery(stops, stops[3]!).chest).not.toBeNull();
    expect(unitScenery(stops, stops[1]!, 'apple').scene).toBeNull();
    expect(unitScenery(stops, stops[1]!, 'tea').scene).not.toBeNull();
    expect(unitScenery(stops, null, 'apple').scene).not.toBeNull();
    // a short unit has room for its scene but not a chest; a unit of three keeps them on opposite sides
    expect(unitScenery(stops.slice(0, 2))).toEqual({ scene: { side: 1, y: stops[1]!.y }, chest: null });
    const three = unitScenery(stops.slice(0, 3));
    expect(three.scene!.side).toBe(-Math.sign(three.chest!.x));
  });

  it('leaves the scene out where the bubble over the stop to do now would reach it on a narrow screen, and keeps it on a wide one', () => {
    expect(unitScenery(stops, stops[4]!, 'tea', 360).scene).toBeNull();
    expect(unitScenery(stops, stops[4]!, 'tea', 720).scene).toEqual({ side: -1, y: stops[3]!.y });
    // with no width known, only Hevalo is kept clear of
    expect(unitScenery(stops, stops[4]!, 'tea').scene).not.toBeNull();
  });
});

describe('the scenes beside the road', () => {
  it('has Hevalo bite his apple four times, chewing, lick his lips at the core, and grow another', () => {
    const beats = Array.from({ length: PATH_SCENE_MOTION.beats.apple }, (_, i) => sceneBeat('apple', i));
    expect(beats.map((b) => b.bites)).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(beats.map((b) => b.act)).toEqual([null, 'chew', 'chew', 'chew', 'chew', 'tongue', null]);
    expect(beats.filter((b) => b.crumbs)).toHaveLength(4);
    expect(beats[6]!.growing).toBe(true);
    expect(sceneBeat('apple', PATH_SCENE_MOTION.beats.apple)).toEqual(beats[0]);
  });

  it('has Hamo sugar his tea four times over, pleased each time, and laugh at himself', () => {
    const beats = Array.from({ length: PATH_SCENE_MOTION.beats.tea }, (_, i) => sceneBeat('tea', i));
    expect(beats.filter((b) => b.cube)).toHaveLength(4);
    expect(beats.map((b) => b.act)).toEqual([null, 'preen', 'preen', 'preen', 'preen', 'chuckle']);
  });

  it('has Xezo chalk three letters one by one, then wipe her slate', () => {
    const beats = Array.from({ length: PATH_SCENE_MOTION.beats.slate }, (_, i) => sceneBeat('slate', i));
    expect(beats.map((b) => b.letters)).toEqual([0, 1, 2, 3, 3, 3]);
    expect(beats.map((b) => b.wiping)).toEqual([false, false, false, false, false, true]);
    expect(sceneBeat('slate', -1)).toEqual(beats[5]);
  });

  it('flies the pigeon in to land on its post, teeter, settle and leave, all in one flight', () => {
    for (const track of [PATH_PIGEON_FLIGHT.x, PATH_PIGEON_FLIGHT.y, PATH_PIGEON_FLIGHT.tilt, PATH_PIGEON_FLIGHT.shown]) {
      expect(track[0]![0]).toBe(0);
      expect(track[track.length - 1]![0]).toBe(1);
      for (let i = 1; i < track.length; i++) expect(track[i]![0]).toBeGreaterThan(track[i - 1]![0]);
    }
    const [from, to] = PATH_PIGEON_FLIGHT.perched;
    const at = (track: readonly (readonly [number, number])[], t: number): number => track.find(([k]) => k === t)?.[1] ?? NaN;
    expect(at(PATH_PIGEON_FLIGHT.x, from)).toBe(0);
    expect(at(PATH_PIGEON_FLIGHT.y, from)).toBe(0);
    expect(to).toBeGreaterThan(from);
    // out of sight before it starts again
    expect(PATH_PIGEON_FLIGHT.shown[0]![1]).toBe(0);
    expect(PATH_PIGEON_FLIGHT.shown[PATH_PIGEON_FLIGHT.shown.length - 1]![1]).toBe(0);
    expect(sceneBeat('letter', 3)).toEqual(sceneBeat('letter', 0));
  });

  it('times each beat a little differently, never far from the scene’s own beat', () => {
    const lengths = Array.from({ length: 9 }, (_, i) => sceneBeatMs('apple', i));
    expect(new Set(lengths).size).toBeGreaterThan(4);
    for (const ms of lengths) {
      expect(ms).toBeGreaterThanOrEqual(PATH_SCENE_MOTION.beatMs.apple * 0.75);
      expect(ms).toBeLessThanOrEqual(PATH_SCENE_MOTION.beatMs.apple * 1.5);
    }
    expect(sceneBeatMs('tea', 0)).not.toBe((sceneBeatMs('apple', 0) * PATH_SCENE_MOTION.beatMs.tea) / PATH_SCENE_MOTION.beatMs.apple);
    expect(sceneBeatMs('slate', -1)).toBeGreaterThan(0);
  });

  it('has Hevalo reach for his apple and bite it as the bough gives, all back where they started', () => {
    for (const track of [PATH_APPLE_REACH.turn, PATH_APPLE_REACH.tug]) {
      expect(track[0]).toEqual([0, 0]);
      expect(track[track.length - 1]).toEqual([1, 0]);
    }
    const { stretch } = PATH_APPLE_REACH;
    expect(stretch[0]).toEqual([0, 1]);
    expect(stretch[stretch.length - 1]).toEqual([1, 1]);
    // he draws back before he stretches in, and the bough is still until his teeth close on the apple
    expect(stretch[1]![1]).toBeLessThan(1);
    expect(Math.max(...stretch.map(([, v]) => v))).toBeGreaterThan(1);
    const tugs = PATH_APPLE_REACH.tug.filter(([, v]) => v !== 0);
    expect(tugs[0]![0]).toBeGreaterThan(PATH_APPLE_REACH.biteAt);
  });
});

describe('a finished stop’s stamp', () => {
  it('points Hevalo’s prints from each finished stop toward the next one on the road, mirrored right to left', () => {
    const road = [0, -1, 0, 1, 0].map((lean, i) => ({ stop: { kind: 'skill' }, x: lean * PATH_GEOMETRY.sway, y: PATH_GEOMETRY.pad + i * PATH_GEOMETRY.step }));
    const along = (k: number, sign: 1 | -1 = 1): number => stopPrints(road, k, sign).heading;
    // the road runs down the screen, so the prints point down, leaning the way the next stop leans
    const slant = (Math.atan2(PATH_GEOMETRY.sway, PATH_GEOMETRY.step) * 180) / Math.PI;
    expect(along(0)).toBeCloseTo(180 + slant, 0);
    expect(along(1)).toBeCloseTo(180 - slant, 0);
    expect(along(2)).toBeCloseTo(180 - slant, 0);
    expect(along(3)).toBeCloseTo(180 + slant, 0);
    // a right-to-left line leans the other way
    expect(along(0, -1)).toBeCloseTo(180 - slant, 0);
    // after the last stop, straight on down
    expect(along(4)).toBe(180);
  });

  it('stands Hevalo on all four at the chapter’s last topic, the pause before its milestone, and nowhere else', () => {
    const road = ['skill', 'skill', 'review', 'skill', 'story'].map((kind, i) => ({ stop: { kind }, x: 0, y: i * 100 }));
    expect(road.map((_, k) => stopPrints(road, k).rest)).toEqual([false, false, false, true, false]);
    const trophy = [{ stop: { kind: 'skill' }, x: 0, y: 0 }, { stop: { kind: 'trophy' }, x: 0, y: 100 }];
    expect(stopPrints(trophy, 0).rest).toBe(true);
  });

  it('presses halfway through its moment: the print appears and the tile squashes as it lands, and all ends as it was drawn', () => {
    const { pressAt, toolY, squash, printShown, toolShown } = PATH_STAMP_MOMENT;
    const at = (track: readonly (readonly [number, number])[], t: number): number | undefined => track.find(([k]) => k === t)?.[1];
    expect(at(toolY, pressAt)).toBe(0);
    expect(at(printShown, pressAt)).toBe(0);
    expect(printShown[printShown.length - 1]![1]).toBe(1);
    expect(Math.min(...squash.map(([, v]) => v))).toBeLessThan(1);
    expect(squash[squash.length - 1]![1]).toBe(1);
    // the stamp is out of sight before it starts and after it lifts away
    expect(toolShown[0]![1]).toBe(0);
    expect(toolShown[toolShown.length - 1]![1]).toBe(0);
  });
});
