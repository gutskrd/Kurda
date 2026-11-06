import { describe, expect, it } from 'vitest';
import { PATH_GEOMETRY, lessonPath, mascotSpot, type PathSkill } from './lesson-path.js';
import {
  PATH_CAIRN,
  PATH_CAIRN_GROUNDS,
  PATH_GROUNDS,
  PATH_LANDMARKS,
  PATH_LANDS,
  PATH_MOTION,
  PATH_SCENERY,
  cairnBox,
  hopAt,
  hostBox,
  landClear,
  landmarkBox,
  mascotBox,
  pathLand,
  trailStones,
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

/** A unit of four skills with a guide, the second one to do now: the shape of every unit of the road. */
function unit(current = 1) {
  const skills = [0, 1, 2, 3].map((i) => skill(`s${i}`, i < current ? 'completed' : i === current ? 'unlocked' : 'locked', i === 0));
  return lessonPath({ units: [{ unitId: 'u', title: 'U', skills }] }, { guides: true }).units[0]!;
}

const overlap = (a: PathBox, b: PathBox): boolean => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;
const stopBox = (s: { x: number; y: number }): PathBox => ({ x: s.x, y: s.y - PATH_GEOMETRY.node / 2, w: PATH_GEOMETRY.node, h: PATH_GEOMETRY.node + 8 });

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
      expect(overlap(landmarkBox(390), mascotBox(here)), `current ${current}`).toBe(false);
    }
  });

  it('puts the unit’s person by its last stop, as Hevalo would stand there, unless Hevalo stands too close', () => {
    const u = unit(1);
    const stops = u.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    const host = hostBox(stops, 390, null)!;
    const last = stops[stops.length - 1]!;
    expect(host.by).toBe(last.key);
    expect(host.box.x).toBe(mascotSpot(last).x);
    // room above them for their words, and their feet where Hevalo's would be
    expect(host.box.h).toBe(PATH_SCENERY.host + PATH_SCENERY.bubble);
    expect(host.box.y + host.box.h).toBe(mascotBox(last).y + mascotBox(last).h);
    // Hevalo beside the last skill, a step above the chest on the same side, leaves them no room
    const lastSkill = stops[stops.length - 2]!;
    const crowded = overlap(mascotBox(lastSkill), host.box);
    expect(hostBox(stops, 390, lastSkill) === null).toBe(crowded);
    // and a unit too short for anyone to stand by has no one
    expect(hostBox(stops.slice(0, 2), 390, null)).toBeNull();
  });
});

describe('the shepherds’ cairn beside the road', () => {
  it('stands in the lands of open country only', () => {
    expect(PATH_CAIRN_GROUNDS.length).toBeGreaterThan(0);
    for (const g of PATH_CAIRN_GROUNDS) expect(PATH_GROUNDS).toContain(g);
    // the village and the town keep their own landmarks to themselves
    for (const g of ['orchard', 'meadow', 'town', 'plaza'] as const) expect(PATH_CAIRN_GROUNDS).not.toContain(g);
  });

  it('finds it room on a phone and on a wide page, inside the page and clear of the path and of everyone on it', () => {
    for (const width of [320, 360, 390, 480, 720]) {
      for (const current of [0, 1, 2, 3]) {
        const u = unit(current);
        const stops = u.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
        const box = cairnBox(stops, width);
        const at = `${width} current ${current}`;
        expect(box, at).not.toBeNull();
        expect(box!.h, at).toBeGreaterThanOrEqual(PATH_CAIRN.min);
        expect(box!.h, at).toBeLessThanOrEqual(PATH_CAIRN.size);
        expect(Math.abs(box!.x) + box!.w / 2, at).toBeLessThanOrEqual(width / 2 - PATH_SCENERY.edge);
        for (const p of stops) {
          expect(overlap(box!, stopBox(p)), `${at} on ${p.key}`).toBe(false);
          // never where Hevalo stands by any stop, wherever the learner has got to
          expect(overlap(box!, mascotBox(p)), `${at} by ${p.key}`).toBe(false);
        }
        expect(overlap(box!, landmarkBox(width)), at).toBe(false);
        const host = hostBox(stops, width, null);
        if (host) expect(overlap(box!, host.box), at).toBe(false);
        // off the whole trail, the stretches still ahead too
        const trail = trailStones(u.stops.map((p, i) => ({ ...p, trail: i === 0 ? null : ('ahead' as const) })));
        for (const s of trail) expect(Math.abs(s.x - box!.x) * 2 < box!.w + 2 * s.r && s.y + s.r > box!.y && s.y - s.r < box!.y + box!.h, `${at} on a stone`).toBe(false);
        // the same each time
        expect(cairnBox(stops, width)).toEqual(box);
      }
    }
  });

  it('keeps out of what the land asks it to, gives a unit too short none, and keeps the trees off it', () => {
    const u = unit(1);
    const stops = u.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    const free = cairnBox(stops, 390)!;
    const water = { x: 0, y: free.y + free.h / 2 - 20, w: 800, h: 40 };
    const moved = cairnBox(stops, 390, [water]);
    expect(moved).not.toBeNull();
    expect(overlap(moved!, water)).toBe(false);
    expect(cairnBox(stops.slice(0, 2), 390)).toBeNull();
    const stones = trailStones(u.stops);
    expect(landClear(stops, 390, stones, free).solid).toContainEqual(free);
    expect(landClear(stops, 390, stones).solid).not.toContainEqual(free);
  });
});

describe('the trail’s stepping stones', () => {
  it('lies stones along each stretch, none on a stop, walked where both ends have been reached', () => {
    const u = unit(2);
    const stones = trailStones(u.stops);
    expect(stones.length).toBeGreaterThan(u.stops.length * 2);
    // measured along the curve, so straight across a stone may come a few points nearer: never onto the stop's own round and lip
    for (const s of stones) {
      for (const p of u.stops) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(PATH_GEOMETRY.node / 2 + s.r);
    }
    const walked = new Set(stones.filter((s) => s.walked).map((s) => s.to));
    const expected = new Set(u.stops.filter((p) => p.trail === 'walked').map((p) => p.stop.key));
    expect(walked).toEqual(expected);
    // the same each time it is drawn
    expect(trailStones(u.stops)).toEqual(stones);
  });

  it('keeps trees off the stops, the stones and the landmark, and off where people stand', () => {
    const u = unit();
    const stops = u.stops.map((p) => ({ key: p.stop.key, x: p.x, y: p.y }));
    const stones = trailStones(u.stops);
    const { solid, tall } = landClear(stops, 390, stones);
    expect(solid).toContainEqual(landmarkBox(390));
    expect(solid.length).toBe(stops.length + stones.length + 1);
    for (const s of stops) expect(tall).toContainEqual(mascotBox(s));
  });
});

describe('the learner’s hop', () => {
  it('starts and ends on the two stops, and rises over the way between', () => {
    const from = { x: -72, y: 200 };
    const to = { x: 0, y: 360 };
    expect(hopAt(from, to, 0)).toEqual(from);
    expect(hopAt(from, to, 1)).toEqual(to);
    const top = hopAt(from, to, 0.5);
    expect(top.x).toBe(-36);
    expect(top.y).toBeLessThan((from.y + to.y) / 2 - PATH_MOTION.hop + 1);
    // and never past its ends
    expect(hopAt(from, to, 2)).toEqual(to);
  });
});
