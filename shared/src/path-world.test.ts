import { describe, expect, it } from 'vitest';
import { PATH_GEOMETRY, PATH_MASCOT, PATH_RETURN, lessonPath, mascotSpot, type PathSkill } from './lesson-path.js';
import { PATH_SCENES, PATH_SCENE_BOX, PATH_SCENE_IDS } from './art/path-scenes.js';
import { PATH_SEAL } from './art/path-land.js';
import { characterArt, cropBox, sampleKeys } from './characters/index.js';
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
  PATH_STAMP_SHADOW,
  PATH_STAMP_REPRESS,
  PATH_REPRESS_SHADOW,
  PATH_WAX_GOLD,
  PATH_WAX_FIRE,
  flickerAt,
  waxGlintAt,
  PATH_APPLE_REACH,
  PATH_START_WORDS,
  landmarkBox,
  pathLand,
  pathScene,
  sceneBeat,
  sceneBeatMs,
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

  it('flies the pigeon in from the edge to land on its twig, teeter, settle and leave by the edge, all in one flight', () => {
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
    // it faces in on the way in and turns round to fly back out by the edge it came from
    const face = (t: number): number => PATH_PIGEON_FLIGHT.face.filter(([k]) => k <= t).at(-1)![1];
    expect(face(0)).toBe(1);
    expect(face(from)).toBe(1);
    expect(face(1)).toBe(-1);
    expect(PATH_PIGEON_FLIGHT.x[0]![1]).toBeLessThan(0);
    expect(PATH_PIGEON_FLIGHT.x[PATH_PIGEON_FLIGHT.x.length - 1]![1]).toBeLessThan(0);
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

describe('the scenes’ figures through all their motion', () => {
  const times = Array.from({ length: 101 }, (_, i) => i / 100);
  // A point of the figure's box, from the middle of its foot, as it stands in the scene: stretched, then leant.
  const placed = (scene: 'apple' | 'tea' | 'slate', u: number, v: number, stretch: number, turn: number): [number, number] => {
    const { ax, ay, lean } = PATH_SCENES[scene].actor;
    const a = ((lean + turn) * Math.PI) / 180;
    const [x, y] = [u, v * stretch];
    return [ax + x * Math.cos(a) - y * Math.sin(a), ay + x * Math.sin(a) + y * Math.cos(a)];
  };

  it('keeps each character’s head, the top of its drawing, inside its scene at every moment, never cut by the scene’s top or far side', () => {
    for (const scene of ['apple', 'tea', 'slate'] as const) {
      const { who, actor } = PATH_SCENES[scene];
      const frame = cropBox(characterArt(who as 'hevalo' | 'hamo' | 'xezo'), actor.crop);
      const w = (actor.h * frame.w) / frame.h;
      for (const t of times) {
        // Only Hevalo reaches for his apple; the others lean in as they stand. Room for a nod or a tilt on top: 10 points.
        const stretch = scene === 'apple' ? sampleKeys(PATH_APPLE_REACH.stretch, t) : 1;
        const turn = scene === 'apple' ? sampleKeys(PATH_APPLE_REACH.turn, t) : 0;
        for (const u of [-w / 2, w / 2]) {
          const [x, y] = placed(scene, u, -actor.h, stretch, turn);
          expect(y, `${scene} at ${t}`).toBeGreaterThanOrEqual(10);
          expect(x, `${scene} at ${t}`).toBeLessThanOrEqual(PATH_SCENE_BOX.w - 10);
        }
      }
    }
  });

  it('keeps the pigeon inside its scene but for the edge it flies in and out by', () => {
    const { ax, ay, h } = PATH_SCENES.letter.actor;
    for (const t of times) {
      const [x, y] = [sampleKeys(PATH_PIGEON_FLIGHT.x, t), sampleKeys(PATH_PIGEON_FLIGHT.y, t)];
      // its 64-point canvas, its feet at the perch
      const top = ay - (h * 100) / 120 + y;
      expect(top, `${t}`).toBeGreaterThanOrEqual(0);
      expect(top + h, `${t}`).toBeLessThanOrEqual(PATH_SCENE_BOX.h);
      expect(ax + x + h / 2, `${t}`).toBeLessThanOrEqual(PATH_SCENE_BOX.w);
    }
  });
});

describe('a finished stop’s wax seal', () => {
  const { pressAt, blobY, blobShown, splat, splash, splashShown, melt, flow, poured, toolY, toolShown, tilt, squash } = PATH_STAMP_MOMENT;
  const at = (track: readonly (readonly [number, number])[], t: number): number => sampleKeys(track, t);
  const first = (track: readonly (readonly [number, number])[], v: number): number => track.find(([, x]) => x === v)![0];

  it('drops, splashes, melts the tile and flows out into the seal before the stamp comes, then presses halfway through', () => {
    // the drop falls faster and faster, lands, flattens and throws its droplets out, and the wax flows out round, overrunning
    // a little, before the stamp shows; the tile melts away under it once it has landed, gone before the stamp comes
    const landed = first(blobY, 0);
    const fall = blobY.filter(([t]) => t > 0.02 && t <= landed);
    for (let i = 1; i < fall.length - 1; i++) {
      const speed = (k: number): number => (fall[k]![1] - fall[k - 1]![1]) / (fall[k]![0] - fall[k - 1]![0]);
      expect(speed(i + 1)).toBeGreaterThan(speed(i));
    }
    expect(at(blobShown, landed)).toBe(1);
    expect(Math.min(...splat.map(([, v]) => v))).toBeLessThan(at(splat, landed - 0.02));
    expect(at(splashShown, landed - 0.005)).toBe(0);
    expect(at(splashShown, landed + 0.02)).toBeGreaterThan(0);
    expect(splash[splash.length - 1]![1]).toBeGreaterThan(1);
    expect(splashShown[splashShown.length - 1]![1]).toBe(0);
    expect(first(poured, 1)).toBeGreaterThan(landed);
    expect(Math.max(...flow.map(([, v]) => v))).toBeGreaterThan(1);
    const covered = flow.find(([, v]) => v >= 1)![0];
    expect(covered).toBeLessThan(first(toolShown, 1));
    expect(at(blobShown, covered)).toBe(0);
    expect(at(melt, landed)).toBe(0);
    expect(first(melt, 1)).toBeLessThan(first(toolShown, 1));
    expect(melt[melt.length - 1]![1]).toBe(1);
    // it draws up before it presses, comes down faster and faster, and lifts past where it settles
    const before = toolY.filter(([t]) => t >= 0.44 && t <= pressAt);
    expect(Math.min(...toolY.filter(([t]) => t > 0.3 && t < 0.44).map(([, v]) => v))).toBeGreaterThan(before[0]![1]);
    const speed = (i: number): number => (before[i]![1] - before[i - 1]![1]) / (before[i]![0] - before[i - 1]![0]);
    for (let i = 2; i < before.length; i++) expect(speed(i)).toBeGreaterThan(speed(i - 1));
    expect(Math.min(...toolY.filter(([t]) => t > pressAt).map(([, v]) => v))).toBeLessThan(toolY[toolY.length - 1]![1]);
    // the seal squashes and the wax spreads a little again as the stamp lands
    expect(Math.max(...flow.filter(([t]) => t > pressAt).map(([, v]) => v))).toBeGreaterThan(1);
    // at the press the stamp is down, the sun pressed in under it
    expect(at(toolY, pressAt)).toBe(0);
    // it comes in leaning, is straight from its draw-up through the press, and rocks a little and settles as it lifts
    expect(at(tilt, 0.3)).toBeLessThan(-2);
    for (const t of [0.44, pressAt, 0.58]) expect(at(tilt, t)).toBe(0);
    expect(Math.max(...tilt.filter(([t]) => t > pressAt).map(([, v]) => v))).toBeGreaterThan(0);
    expect(Math.max(...tilt.map(([, v]) => Math.abs(v)))).toBeLessThan(10);
    expect(tilt[tilt.length - 1]![1]).toBe(0);
    expect(Math.min(...squash.map(([, v]) => v))).toBeLessThan(1);
    expect(squash[squash.length - 1]![1]).toBe(1);
    expect(flow[flow.length - 1]![1]).toBe(1);
    // the stamp is out of sight before it starts and after it lifts away
    expect(toolShown[0]![1]).toBe(0);
    expect(toolShown[toolShown.length - 1]![1]).toBe(0);
  });

  it('casts the stamp’s shadow on the seal, faint while it hovers and darkest and smallest as it presses', () => {
    const { shown, size } = PATH_STAMP_SHADOW;
    const at2 = (keys: readonly (readonly [number, number])[], t: number): number => sampleKeys(keys, t);
    expect(at2(shown, 0)).toBe(0);
    expect(at2(shown, 1)).toBe(0);
    expect(at2(shown, pressAt)).toBe(Math.max(...shown.map(([, v]) => v)));
    expect(at2(size, pressAt)).toBe(Math.min(...size.map(([, v]) => v)));
    expect(at2(shown, 0.4)).toBeLessThan(at2(shown, pressAt) / 2);
  });

  it('presses a seal again a round later: in, up, down hard so the seal squashes a little, and away', () => {
    const { pressAt: at2, toolY: y, toolShown: shown2, tilt: lean, squash: sq, ms } = PATH_STAMP_REPRESS;
    expect(at(y, at2)).toBe(0);
    expect(at(lean, at2)).toBe(0);
    expect(at(lean, 0.1)).toBeLessThan(-2);
    expect(lean[lean.length - 1]![1]).toBe(0);
    expect(Math.min(...sq.map(([, v]) => v))).toBeGreaterThan(Math.min(...squash.map(([, v]) => v)));
    expect(Math.min(...sq.map(([, v]) => v))).toBeLessThan(1);
    expect(shown2[0]![1]).toBe(0);
    expect(shown2[shown2.length - 1]![1]).toBe(0);
    // shorter than the first sealing, and pressed before the bar starts its next round
    expect(ms).toBeLessThan(PATH_STAMP_MOMENT.ms);
    expect(PATH_RETURN.finishAtMs + ms * at2).toBeLessThan(PATH_RETURN.nextAtMs);
    // its shadow darkest while it is pressed down
    expect(at(PATH_REPRESS_SHADOW.shown, at2 + 0.04)).toBe(Math.max(...PATH_REPRESS_SHADOW.shown.map(([, v]) => v)));
  });

  it('passes one flame up over the seal once the third sun is pressed in, the wax gold under it, and lets it settle', () => {
    const { ms, outAt, front, rise, wide, lick, shown, flicker } = PATH_WAX_FIRE;
    const at = (track: readonly (readonly [number, number])[], t: number): number => sampleKeys(track, t);
    // about a second and a quarter: lit under the seal's foot, so none of it is gold yet, and out past its top, all gold
    expect(ms).toBeGreaterThanOrEqual(1000);
    expect(ms).toBeLessThanOrEqual(1500);
    const [top, foot] = [PATH_SEAL.cy - PATH_SEAL.r, PATH_SEAL.cy + PATH_SEAL.r];
    expect(at(front, 0)).toBeGreaterThan(foot);
    expect(at(front, 1)).toBeLessThan(top);
    // it only ever rises, gliding: slow to start, quickest over the middle, slow again past the top, never jerking
    const steps = front.slice(1).map(([, y], i) => front[i]![1] - y);
    for (const step of steps) expect(step).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i]! - steps[i - 1]!)).toBeLessThan(0.6);
    const crossed = (y: number): number => front.find(([, v]) => v <= y)![0];
    const crossing = (crossed(top) - crossed(foot)) * ms;
    expect(crossing).toBeGreaterThan(600);
    expect(crossing).toBeLessThan(1000);
    // the flame stands on the front while it crosses, burning, no wider than the seal there, and always on the wax
    for (const t of [0.3, 0.5, 0.6]) {
      expect(at(rise, t)).toBeCloseTo(at(front, t) - PATH_SEAL.cy, 1);
      expect(at(wide, t)).toBeLessThanOrEqual(1);
      expect(at(lick, t)).toBeGreaterThan(0.7);
      expect(at(shown, t)).toBe(1);
    }
    for (const [, y] of rise) {
      expect(PATH_SEAL.cy + y).toBeGreaterThan(top);
      expect(PATH_SEAL.cy + y).toBeLessThan(foot);
    }
    expect(at(wide, 1)).toBeLessThan(at(wide, 0.75));
    // it lights from nothing and goes out to nothing, calmly, its licks sinking as it fades after its firm tap
    expect(lick[0]![1]).toBe(0);
    expect(shown[0]![1]).toBe(0);
    expect(lick[lick.length - 1]![1]).toBeLessThan(0.2);
    expect(shown[shown.length - 1]![1]).toBe(0);
    expect(at(lick, outAt)).toBeLessThan(at(lick, 0.5));
    expect(at(shown, outAt)).toBeGreaterThan(0.9);
    // its three layers flicker with the small flame's own motion, each on its own clock
    expect(new Set([flicker.shell.periodMs, flicker.body.periodMs, flicker.heart.periodMs]).size).toBe(3);
    expect(new Set([0, 0.25, 0.5, 0.75].map((t) => flickerAt(flicker.shell, t).sy)).size).toBeGreaterThan(1);
    // and nothing else: no ring of flame, sparks or flash
    expect(Object.keys(PATH_WAX_FIRE).sort()).toEqual(['flicker', 'front', 'lick', 'ms', 'outAt', 'rise', 'shown', 'wide']);
  });

  it('turns gold once the third sun is pressed in, and glints at each stop’s own time within its round', () => {
    expect(PATH_WAX_GOLD.afterMs).toBeGreaterThanOrEqual(0);
    expect(PATH_WAX_GOLD.glintMs).toBeLessThan(PATH_WAX_GOLD.everyMs / 4);
    const starts = ['s:a', 's:b', 's:c', 's:d'].map(waxGlintAt);
    for (const v of starts) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(PATH_WAX_GOLD.everyMs);
    }
    expect(new Set(starts).size).toBe(starts.length);
    expect(waxGlintAt('s:a')).toBe(waxGlintAt('s:a'));
  });
});
