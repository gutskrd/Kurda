import { describe, expect, it } from 'vitest';
import { FIRE_STAGES, type FireLevel, type FireStage } from '../fire-stages.js';
import {
  FIRE_CYCLE_MS,
  FIRE_GROW_STOPS,
  FIRE_LOOP_STOPS,
  FIRE_RISE_STOPS,
  FIRE_SMALL,
  FIRE_SMALL_VIEW,
  FIRE_VIEW,
  calmMotion,
  fireColours,
  fireDrawing,
  fireGrowth,
  fireOutlineBox,
  firePoseAt,
  fireSamples,
  fireStops,
  type FireBox,
  type FireColours,
  type FireDrawing,
  type FireMotion,
} from './fire.js';
import { HALO_RAYS } from './fire-shapes.js';

const BIG = 190;
const lvl = (stage: FireStage, growth = 0): FireLevel => ({ stage, growth });
const LIT = FIRE_STAGES.filter((s) => s !== 'cold');
const drawn = (stage: FireStage, growth = 0, size = BIG): FireDrawing => fireDrawing(lvl(stage, growth), size);

/** Every outline in a drawing, with what it is. */
function outlines(d: FireDrawing): { name: string; d: string }[] {
  return [
    ...d.tongues.map((t) => ({ name: t.id, d: t.d })),
    ...d.wisps.map((w, i) => ({ name: `wisp ${i}`, d: w.d })),
    ...d.drifts.map((w, i) => ({ name: `${w.kind} ${i}`, d: w.d })),
    ...[...d.back, ...d.front].map((b, i) => ({ name: `${b.part} ${i}`, d: b.d })),
  ];
}

/** Every moving part of a drawing, with what it is. */
function motions(d: FireDrawing): { name: string; motion: FireMotion }[] {
  return [
    ...d.tongues.map((t) => ({ name: t.id, motion: t.motion })),
    ...d.wisps.map((w, i) => ({ name: `wisp ${i}`, motion: w.motion })),
    ...d.embers.map((e, i) => ({ name: `ember ${i}`, motion: e.motion })),
    ...d.drifts.map((w, i) => ({ name: `${w.kind} ${i}`, motion: w.motion })),
    ...(d.glow ? [{ name: 'glow', motion: d.glow.motion }] : []),
    ...(d.halo?.motion ? [{ name: 'halo', motion: d.halo.motion }] : []),
    ...(d.cinder ? [{ name: 'cinder', motion: d.cinder.motion }] : []),
  ];
}

const inside = (b: FireBox, view: FireBox, name: string): void => {
  expect(b.x, name).toBeGreaterThanOrEqual(view.x);
  expect(b.x + b.w, name).toBeLessThanOrEqual(view.x + view.w);
  expect(b.y, name).toBeGreaterThanOrEqual(view.y);
  expect(b.y + b.h, name).toBeLessThanOrEqual(view.y + view.h);
};

/** How grey a colour is: the spread between its strongest and weakest channel, 0 to 255. */
function chroma(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(...c) - Math.min(...c);
}

const warm = (hex: string): boolean => parseInt(hex.slice(1, 3), 16) > parseInt(hex.slice(5, 7), 16);
const flameColours = (c: FireColours): string[] => Object.values(c.tongues).flat();

describe('the fire as drawn', () => {
  it('is made of closed outlines, each one shape, and every part stays inside its box at every stage', () => {
    for (const stage of FIRE_STAGES)
      for (const growth of [0, 1]) {
        const d = drawn(stage, growth);
        expect(d.view).toEqual(FIRE_VIEW);
        for (const { name, d: path } of outlines(d)) {
          const tag = `${stage} ${growth} ${name}`;
          expect(path.startsWith('M'), tag).toBe(true);
          expect(path.endsWith('Z'), tag).toBe(true);
          // one outline per path: a second move would start a second shape
          expect(path.match(/M/g)?.length, tag).toBe(1);
          inside(fireOutlineBox(path), FIRE_VIEW, tag);
        }
        if (d.glow) inside({ x: d.glow.cx - d.glow.rx, y: d.glow.cy - d.glow.ry, w: d.glow.rx * 2, h: d.glow.ry * 2 }, FIRE_VIEW, `${stage} glow`);
        if (d.halo) inside({ x: d.halo.cx - d.halo.reach, y: d.halo.cy - d.halo.reach, w: d.halo.reach * 2, h: d.halo.reach * 2 }, FIRE_VIEW, `${stage} halo`);
        // a spark never flies out of the box, however high it climbs
        for (const e of d.embers)
          for (const p of e.motion.poses) inside({ x: e.cx + (p.x ?? 0) - e.r, y: e.cy + (p.y ?? 0) - e.r, w: e.r * 2, h: e.r * 2 }, FIRE_VIEW, `${stage} ember`);
      }
  });

  it('grows stage by stage: each flame taller than the one before, low in the box at first and filling it at the last', () => {
    const heights = LIT.map((s) => drawn(s).flame.h);
    for (let i = 1; i < heights.length; i++) expect(heights[i], LIT[i]).toBeGreaterThan(heights[i - 1]! * 1.06);
    const share = (s: FireStage): number => (drawn(s).flame.h + FIRE_VIEW.h - drawn(s).root[1]) / FIRE_VIEW.h;
    expect(share('spark')).toBeLessThan(0.32);
    expect(share('campfire')).toBeGreaterThan(0.5);
    expect(share('campfire')).toBeLessThan(0.65);
    expect(share('newroz')).toBeGreaterThan(0.85);
    // and never wider than the box
    for (const s of LIT) expect(drawn(s, 1).flame.w).toBeLessThanOrEqual(FIRE_VIEW.w);
  });

  it('grows a little every day within a stage, by about a tenth, stopping short of nothing it should', () => {
    for (const s of LIT) {
      const [none, half, full] = [0, 0.5, 1].map((g) => drawn(s, g).flame.h);
      expect(half, s).toBeGreaterThan(none!);
      expect(full, s).toBeGreaterThan(half!);
      expect(full! / none!, s).toBeGreaterThan(1.05);
      expect(full! / none!, s).toBeLessThan(1.15);
    }
    // a level from a strange count is still a fire
    expect(drawn('campfire', Number.NaN).flame).toEqual(drawn('campfire', 0).flame);
  });

  it('keeps the logs where they lie at every stage, so the ground never moves', () => {
    const logs = (d: FireDrawing): string[] => d.front.filter((p) => p.group === 'hearth' && (p.part === 'bark' || p.part === 'barkShade' || p.part === 'cut')).map((p) => p.d);
    const first = logs(drawn('cold'));
    expect(first.length).toBe(4);
    for (const s of LIT) for (const g of [0, 1]) expect(logs(drawn(s, g)), s).toEqual(first);
  });

  it('gives every stage what it promises', () => {
    const ids = (s: FireStage): string[] => drawn(s).tongues.map((t) => t.id);
    const groups = (s: FireStage): string[] => [...new Set([...drawn(s).back, ...drawn(s).front].map((p) => p.group))].sort();
    const cold = drawn('cold');
    // cold: charred logs over ash, one ember, a thread of smoke, and no flame at all
    expect(cold.tongues).toEqual([]);
    expect(cold.cinder).not.toBeNull();
    expect(cold.drifts.map((d) => d.kind)).toEqual(['smoke', 'smoke']);
    expect(cold.front.some((p) => p.part === 'ash')).toBe(true);
    expect(cold.front.filter((p) => p.part === 'char').length).toBeGreaterThan(0);
    expect([cold.glow, cold.halo, cold.embers.length]).toEqual([null, null, 0]);
    // a spark: one young flame, a core and a heart, a spark now and then
    expect(ids('spark')).toEqual(['flame', 'heart']);
    expect(drawn('spark').embers).toHaveLength(1);
    expect(drawn('spark').wisps).toHaveLength(0);
    expect(ids('kindling')).toEqual(['outer', 'core', 'heart']);
    expect(ids('campfire')).toEqual(['back', 'outer', 'flame', 'core', 'heart']);
    for (const s of ['bigfire', 'bonfire', 'blaze', 'newroz'] as const) expect(ids(s)).toEqual(['back', 'left', 'right', 'outer', 'flame', 'core', 'heart']);
    // more sparks the bigger it gets
    const sparks = LIT.map((s) => drawn(s).embers.length);
    for (let i = 1; i < sparks.length; i++) expect(sparks[i], LIT[i]).toBeGreaterThan(sparks[i - 1]!);
    // more wood from the bonfire, the stones round the blaze, the sun behind the Newroz fire
    expect(groups('bigfire')).toEqual(['hearth']);
    expect(groups('bonfire')).toEqual(['hearth', 'log']);
    expect(groups('blaze')).toEqual(['hearth', 'log', 'stones']);
    expect(drawn('blaze').back.every((p) => p.group === 'stones')).toBe(true);
    expect(drawn('bonfire').drifts.map((d) => d.kind)).toEqual(['heat', 'heat']);
    expect(drawn('blaze').halo).toBeNull();
    expect(drawn('newroz').halo?.rays).toBeTruthy();
    expect(drawn('newroz').embers.some((e) => e.gold)).toBe(true);
    expect(drawn('blaze').embers.some((e) => e.gold)).toBe(false);
    // the hottest glows pulse, deeper than a breath
    const swing = (s: FireStage): number => Math.max(...drawn(s).glow!.motion.poses.map((p) => p.sx ?? 1)) - Math.min(...drawn(s).glow!.motion.poses.map((p) => p.sx ?? 1));
    expect(swing('blaze')).toBeGreaterThan(swing('campfire'));
    // the Newroz fire is crowned: its back flame stands taller than the blaze's
    const back = (s: FireStage): number => fireOutlineBox(drawn(s).tongues[0]!.d).y;
    expect(back('newroz')).toBeLessThan(back('blaze'));
  });

  it('lays each stage of tongues back to front, the inner ones narrower, each rooted where it is drawn', () => {
    for (const s of LIT) {
      const d = drawn(s);
      const nested = d.tongues.filter((t) => ['outer', 'flame', 'core', 'heart'].includes(t.id));
      for (let i = 1; i < nested.length; i++) {
        const [outer, inner] = [fireOutlineBox(nested[i - 1]!.d), fireOutlineBox(nested[i]!.d)];
        expect(inner.x, `${s} ${nested[i]!.id}`).toBeGreaterThan(outer.x);
        expect(inner.x + inner.w, `${s} ${nested[i]!.id}`).toBeLessThan(outer.x + outer.w);
        expect(inner.y, `${s} ${nested[i]!.id}`).toBeGreaterThan(outer.y);
      }
      for (const t of d.tongues) {
        const b = fireOutlineBox(t.d);
        // a tongue leans and stretches about its root: the bottom of its own outline, not somewhere in the air
        expect(t.origin[1], `${s} ${t.id}`).toBeCloseTo(b.y + b.h, 0);
        expect(t.origin[0], `${s} ${t.id}`).toBeGreaterThan(b.x);
        expect(t.origin[0], `${s} ${t.id}`).toBeLessThan(b.x + b.w);
      }
    }
  });

  it('gives every moving part a period that divides the loop, a phase within it and a pose for each stop', () => {
    for (const s of FIRE_STAGES)
      for (const size of [BIG, FIRE_SMALL])
        for (const { name, motion } of motions(drawn(s, 0, size))) {
          expect(motion.periodMs, `${s} ${name}`).toBeGreaterThan(0);
          expect(FIRE_CYCLE_MS % motion.periodMs, `${s} ${name}`).toBe(0);
          expect(motion.phase, `${s} ${name}`).toBeGreaterThanOrEqual(0);
          expect(motion.phase, `${s} ${name}`).toBeLessThan(1);
          expect(motion.poses.length, `${s} ${name}`).toBe(fireStops(motion).length);
        }
  });

  it('never moves two neighbouring tongues on the same period, so the layers slide against each other', () => {
    for (const s of LIT) {
      const tongues = drawn(s).tongues;
      for (let i = 1; i < tongues.length; i++) expect(tongues[i]!.motion.periodMs, `${s} ${tongues[i]!.id}`).not.toBe(tongues[i - 1]!.motion.periodMs);
    }
  });

  it('only flickers in place: a tongue never fades, and whatever rises is unseen where it starts again', () => {
    for (const s of FIRE_STAGES) {
      const d = drawn(s);
      for (const t of d.tongues) for (const p of t.motion.poses) expect(p.o ?? 1).toBe(1);
      for (const part of [...d.wisps, ...d.embers, ...d.drifts]) {
        expect(part.motion.kind).toBe('rise');
        expect(part.motion.poses[0]!.o, s).toBe(0);
        expect(part.motion.poses.at(-1)!.o, s).toBe(0);
      }
    }
  });

  it('flickers a young flame quicker than a grown one', () => {
    expect(drawn('spark').tongues[0]!.motion.periodMs).toBeLessThan(drawn('campfire').tongues.find((t) => t.id === 'flame')!.motion.periodMs);
  });

  it('turns the sun round by one long and one short ray each time round the clock, so the turn never shows a seam', () => {
    const halo = drawn('newroz').halo!;
    expect(HALO_RAYS % 2).toBe(0);
    expect(halo.motion!.poses[0]!.r).toBe(0);
    expect(halo.motion!.poses.at(-1)!.r).toBeCloseTo(720 / HALO_RAYS);
    // a slow turn: a whole one takes over a minute
    expect((FIRE_CYCLE_MS * HALO_RAYS) / 2).toBeGreaterThan(60_000);
  });
});

describe('the light version', () => {
  it('is drawn at the small size and under, in the same box at every stage, so the text beside it never moves', () => {
    for (const s of FIRE_STAGES) {
      const small = drawn(s, 0, FIRE_SMALL);
      expect(small.small, s).toBe(true);
      expect(small.view, s).toEqual(FIRE_SMALL_VIEW);
      expect(small.tongues.map((t) => t.id)).toEqual(['outer', 'core', 'heart']);
      expect([small.wisps.length, small.embers.length, small.drifts.length, small.front.length, small.glow, small.cinder]).toEqual([0, 0, 0, 0, null, null]);
      for (const t of small.tongues) inside(fireOutlineBox(t.d), FIRE_SMALL_VIEW, `${s} ${t.id}`);
      if (small.halo) inside({ x: small.halo.cx - small.halo.r, y: small.halo.cy - small.halo.r, w: small.halo.r * 2, h: small.halo.r * 2 }, FIRE_SMALL_VIEW, `${s} halo`);
    }
    expect(drawn('campfire', 0, FIRE_SMALL + 1).small).toBe(false);
  });

  it('shows the stage: the young flames smaller, the full flame from the campfire, a white-blue heart at the blaze and gold behind the Newroz fire', () => {
    const full = drawn('campfire', 0, FIRE_SMALL).flame.h;
    expect(drawn('spark', 0, FIRE_SMALL).flame.h / full).toBeCloseTo(0.6, 1);
    expect(drawn('kindling', 0, FIRE_SMALL).flame.h / full).toBeCloseTo(0.8, 1);
    for (const s of ['bigfire', 'bonfire', 'blaze', 'newroz', 'cold'] as const) expect(drawn(s, 0, FIRE_SMALL).flame.h, s).toBe(full);
    expect(fireColours({ stage: 'blaze', scheme: 'light' }).tongues.heart).toHaveLength(3);
    expect(drawn('newroz', 0, FIRE_SMALL).halo).not.toBeNull();
    expect(drawn('blaze', 0, FIRE_SMALL).halo).toBeNull();
    // no streak yet: the familiar grey flame, standing still
    expect(drawn('cold', 0, FIRE_SMALL).moving).toBe(false);
    expect(drawn('spark', 0, FIRE_SMALL).moving).toBe(true);
  });

  it('flickers by only part as much', () => {
    const outer = drawn('campfire').tongues.find((t) => t.id === 'outer')!.motion;
    const calm = calmMotion(outer, 0.5);
    outer.poses.forEach((p, i) => {
      expect(calm.poses[i]!.sy! - 1).toBeCloseTo((p.sy! - 1) * 0.5);
      expect(calm.poses[i]!.skew!).toBeCloseTo(p.skew! * 0.5);
    });
    expect(calm.periodMs).toBe(outer.periodMs);
    const small = drawn('campfire', 0, FIRE_SMALL).tongues.find((t) => t.id === 'outer')!.motion;
    expect(Math.max(...small.poses.map((p) => p.sy ?? 1))).toBeLessThan(Math.max(...outer.poses.map((p) => p.sy ?? 1)));
  });
});

describe('the colours it burns in', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`burns warm at every stage on the ${scheme} page, with a glow and sparks`, () => {
      for (const stage of LIT) {
        const lit = fireColours({ stage, scheme });
        // every colour of the flame warm, but for the blue at the root of the hottest heart
        for (const [id, stops] of Object.entries(lit.tongues)) for (const c of id === 'heart' ? stops.slice(0, 2) : stops) if (chroma(c) > 24) expect(warm(c), `${stage} ${c}`).toBe(true);
        expect(lit.glow, stage).not.toBeNull();
        expect(lit.ember, stage).not.toBeNull();
        expect(lit.cinder, stage).toBeNull();
      }
    });

    it(`is a cold hearth on the ${scheme} page whatever the event: no glow, no sparks, a warm ember, smoke, and a grey flame beside a number`, () => {
      for (const accent of [undefined, '#8E2DE2']) {
        const cold = fireColours({ stage: 'cold', scheme, accent });
        for (const c of flameColours(cold)) expect(chroma(c), c).toBeLessThan(40);
        expect([cold.glow, cold.ember, cold.gold, cold.halo]).toEqual([null, null, null, null]);
        expect(cold.smoke).not.toBeNull();
        expect(warm(cold.cinder!.glow)).toBe(true);
        // charred wood, still wood: a little warmth left in its grey
        expect(warm(cold.base.bark[0])).toBe(true);
        expect(chroma(cold.base.bark[0])).toBeLessThan(40);
      }
    });
  }

  it('runs from deep red-orange outside to a heart nearly white', () => {
    const lit = fireColours({ stage: 'campfire', scheme: 'light' });
    const lightness = (hex: string): number => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
    const order = (['outer', 'flame', 'core', 'heart'] as const).map((id) => lightness(lit.tongues[id][0]));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('burns hottest at the blaze and the Newroz fire: a white heart with a blue root', () => {
    for (const stage of ['blaze', 'newroz'] as const)
      for (const scheme of ['light', 'dark'] as const) {
        const heart = fireColours({ stage, scheme }).tongues.heart;
        expect(heart[0]).toBe('#FFFFFF');
        const root = heart.at(-1)!;
        expect(parseInt(root.slice(5, 7), 16), root).toBeGreaterThan(parseInt(root.slice(1, 3), 16));
      }
    expect(fireColours({ stage: 'bonfire', scheme: 'light' }).tongues.heart).toHaveLength(2);
  });

  it('has gold, and the sun, only for the Newroz fire', () => {
    for (const stage of FIRE_STAGES) {
      const c = fireColours({ stage, scheme: 'dark' });
      expect(c.gold !== null, stage).toBe(stage === 'newroz');
      expect(c.halo !== null, stage).toBe(stage === 'newroz');
    }
  });

  it('takes an event accent for the flame alone, keeping the logs, the stones and the gold, and ignores one it cannot read', () => {
    for (const stage of LIT) {
      const plain = fireColours({ stage, scheme: 'dark' });
      const event = fireColours({ stage, scheme: 'dark', accent: '#8E2DE2' });
      expect(event.tongues.flame[0]).toBe('#8E2DE2');
      expect(event.glow?.colour).toBe('#8E2DE2');
      expect(event.base).toEqual(plain.base);
      expect(event.halo).toEqual(plain.halo);
      expect(event.gold).toEqual(plain.gold);
      expect(fireColours({ stage, scheme: 'dark', accent: 'violet' })).toEqual(plain);
    }
  });
});

describe('growing into the next stage', () => {
  it('grows only into a bigger fire: an earlier stage, or the same one less grown', () => {
    expect(fireGrowth(lvl('kindling'), lvl('kindling'), BIG)).toBeNull();
    expect(fireGrowth(lvl('blaze'), lvl('bonfire'), BIG)).toBeNull();
    expect(fireGrowth(lvl('cold'), lvl('cold'), BIG)).toBeNull();
    expect(fireGrowth(lvl('spark', 0.9), lvl('kindling'), BIG)).not.toBeNull();
    const day = fireGrowth(lvl('campfire', 0.2), lvl('campfire', 0.4), BIG)!;
    // a day bigger is a gentle stretch: no burst, no flash
    expect([day.burst.length, day.flash]).toEqual([0, null]);
  });

  it('starts the new flame at the size of the old one, stretches it up past its own size and settles it there', () => {
    for (const [from, to] of [
      ['spark', 'kindling'],
      ['campfire', 'bigfire'],
      ['blaze', 'newroz'],
    ] as const) {
      const g = fireGrowth(lvl(from, 0.9), lvl(to), BIG)!;
      const [a, b] = [g.from.flame, drawn(to).flame];
      expect(g.in.kind).toBe('grow');
      expect(g.in.poses).toHaveLength(FIRE_GROW_STOPS.length);
      expect(g.in.poses[0]!.sy! * b.h).toBeCloseTo(a.h, 0);
      expect(g.in.poses[0]!.o).toBe(0);
      expect(Math.max(...g.in.poses.map((p) => p.sy ?? 1))).toBeGreaterThan(1);
      expect(g.in.poses.at(-1)).toEqual({ sx: 1, sy: 1, o: 1 });
      // the old flame is the same size as the new one all the way, until it is gone behind it
      g.out.poses.forEach((p, i) => expect(p.sy! * a.h).toBeCloseTo(g.in.poses[i]!.sy! * b.h, 0));
      expect(g.out.poses.at(-1)!.o).toBe(0);
    }
  });

  it('brings in what the old fire did not have, as it grows: the third log, the stones, the sun', () => {
    expect(Object.keys(fireGrowth(lvl('bigfire'), lvl('bonfire'), BIG)!.arrive)).toEqual(['log']);
    expect(Object.keys(fireGrowth(lvl('bonfire'), lvl('blaze'), BIG)!.arrive)).toEqual(['stones']);
    expect(Object.keys(fireGrowth(lvl('campfire'), lvl('bigfire'), BIG)!.arrive)).toEqual([]);
    expect(fireGrowth(lvl('bonfire'), lvl('blaze'), BIG)!.halo).toBeNull();
    const newroz = fireGrowth(lvl('blaze'), lvl('newroz'), BIG)!;
    expect(newroz.halo?.poses[0]!.o).toBe(0);
    expect(newroz.halo?.poses.at(-1)).toEqual({ sx: 1, sy: 1, r: 0, o: 1 });
    for (const m of Object.values(fireGrowth(lvl('kindling'), lvl('blaze'), BIG)!.arrive)) {
      expect(m.poses[0]!.o).toBe(0);
      expect(m.poses.at(-1)!.o).toBe(1);
    }
  });

  it('lights cold logs: the spark grows up off them as the cold hearth and its smoke fade', () => {
    const g = fireGrowth(lvl('cold'), lvl('spark'), BIG)!;
    expect(g.fade?.poses.map((p) => p.o)).toEqual([1, 0.65, 0, 0]);
    // the smoke fades where it is, it does not stretch with the flame
    expect(g.out).toEqual(g.fade);
    expect(g.in.poses[0]!.sy).toBeLessThan(0.3);
    expect(fireGrowth(lvl('bigfire'), lvl('bonfire'), BIG)!.fade).toBeNull();
  });

  it('throws sparks up and flares its glow as it reaches a new stage, every spark kept inside the box', () => {
    for (const to of LIT) {
      const g = fireGrowth(lvl('cold'), lvl(to), BIG)!;
      expect(g.burst.length, to).toBeGreaterThan(0);
      expect(g.flash, to).not.toBeNull();
      for (const e of g.burst) {
        expect(e.motion.kind).toBe('grow');
        expect(e.motion.poses.at(-1)!.o).toBe(0);
        for (const p of e.motion.poses) inside({ x: e.cx + (p.x ?? 0) - e.r, y: e.cy + (p.y ?? 0) - e.r, w: e.r * 2, h: e.r * 2 }, FIRE_VIEW, `${to} burst`);
      }
    }
    expect(fireGrowth(lvl('blaze'), lvl('newroz'), BIG)!.burst.some((e) => e.gold)).toBe(true);
  });

  it('grows the small flame beside a number too, quietly: no sparks, no flash', () => {
    const g = fireGrowth(lvl('spark'), lvl('kindling'), FIRE_SMALL)!;
    expect(g.from.small).toBe(true);
    expect([g.burst.length, g.flash, g.fade]).toEqual([0, null, null]);
    expect(g.in.poses[0]!.sy).toBeCloseTo(0.75, 1);
  });
});

describe('how a part moves', () => {
  const loop: FireMotion = { kind: 'loop', periodMs: 800, phase: 0, poses: [{ sy: 1 }, { sy: 1.2 }, { sy: 0.8 }, { sy: 1.1 }] };
  const rise: FireMotion = { kind: 'rise', periodMs: 1200, phase: 0, poses: [0, -6, -20, -36, -50, -60].map((y, i) => ({ y, o: i === 0 || i === 5 ? 0 : 1 })) };
  const grow: FireMotion = { kind: 'grow', periodMs: 900, phase: 0, poses: [{ sy: 0.5 }, { sy: 0.8 }, { sy: 1.1 }, { sy: 1 }] };

  it('is at each pose at its stop, and eases between them', () => {
    FIRE_LOOP_STOPS.forEach((at, i) => expect(firePoseAt(loop, at).sy).toBeCloseTo(loop.poses[i]!.sy!));
    FIRE_RISE_STOPS.slice(0, -1).forEach((at, i) => expect(firePoseAt(rise, at).y).toBeCloseTo(rise.poses[i]!.y!));
    FIRE_GROW_STOPS.forEach((at, i) => expect(firePoseAt(grow, at).sy).toBeCloseTo(grow.poses[i]!.sy!));
    // a sine ease is slow at either end of a step and fastest in its middle
    expect(firePoseAt(loop, 0.25 * 0.1).sy - 1).toBeLessThan(0.2 * 0.1);
    expect(firePoseAt(loop, 0.125).sy).toBeCloseTo(1.1);
  });

  it('loops back to its first pose by the end of its period, a rise climbs straight, and a growth stays where it ends', () => {
    expect(firePoseAt(loop, 0.999).sy).toBeCloseTo(1, 2);
    expect(firePoseAt(loop, 1).sy).toBe(1);
    expect(firePoseAt(rise, (0.12 + 0.35) / 2).y).toBeCloseTo(-13);
    expect(firePoseAt(rise, 0.999).o).toBeCloseTo(0, 1);
    expect(firePoseAt(grow, 1.5).sy).toBe(1);
    expect(firePoseAt(grow, -1).sy).toBe(0.5);
  });

  it('lays each part along one clock that loops without a seam', () => {
    for (const s of FIRE_STAGES)
      for (const { name, motion } of motions(drawn(s))) {
        const { input, poses } = fireSamples(motion);
        expect(input[0], name).toBe(0);
        expect(input.at(-1), name).toBe(1);
        for (let i = 1; i < input.length; i++) expect(input[i]!, name).toBeGreaterThan(input[i - 1]!);
        const [first, last] = [poses[0]!, poses.at(-1)!];
        const start = firePoseAt(motion, motion.phase);
        for (const f of ['x', 'y', 'sx', 'sy', 'skew', 'o'] as const) {
          expect(last[f], `${s} ${name} ${f}`).toBeCloseTo(first[f], 9);
          expect(first[f], `${s} ${name} ${f}`).toBeCloseTo(start[f], 9);
        }
      }
  });

  it('lays a growth along its own run, from its first pose to its last', () => {
    const { input, poses } = fireSamples(grow);
    expect([input[0], input.at(-1)]).toEqual([0, 1]);
    expect([poses[0]!.sy, poses.at(-1)!.sy]).toEqual([0.5, 1]);
  });
});
