import { describe, expect, it } from 'vitest';
import { FIRE_LOGS, FIRE_VIEW, fireDrawing } from './art/fire.js';
import { CELEBRATE_MS } from './celebration.js';
import { WINDOW_PLACE, WINDOW_VIEW } from './characters/window.js';
import { FIRE_GREW_READ_MS, FLAME_IGNITE, RUN_MOMENT_MS, fireBesideWindow, fireLadder, flameMoment, runMoment } from './fire-moments.js';
import { FIRE_GROW, fireLevel, runFireLevel } from './fire-stages.js';

describe('the flame on the day the streak was kept', () => {
  it('grows from yesterday on the day the fire grew, and stays until its line is read', () => {
    const first = flameMoment(1);
    expect(first).toEqual({
      level: fireLevel(1),
      from: fireLevel(0),
      grew: 'spark',
      landsAtMs: FIRE_GROW.delayMs + FIRE_GROW.ms,
      overMs: FIRE_GROW.delayMs + FIRE_GROW.ms + FIRE_GREW_READ_MS,
      zoom: first.zoom,
    });
    expect(flameMoment(7)).toMatchObject({ level: { stage: 'campfire', growth: 0 }, from: fireLevel(6), grew: 'campfire' });
    expect(flameMoment(365)).toMatchObject({ grew: 'newroz', from: { stage: 'blaze' } });
    // the line is up before the moment moves on
    expect(first.overMs - first.landsAtMs).toBe(FIRE_GREW_READ_MS);
  });

  it('is the fire of today for the one celebration, once it has lit, on any other day', () => {
    for (const days of [2, 6, 12, 45, 400]) {
      expect(flameMoment(days)).toMatchObject({ level: fireLevel(days), from: null, grew: null, overMs: FLAME_IGNITE.atMs + CELEBRATE_MS });
    }
  });

  it('draws the first days closer, so a spark is a moment too, and every day a fire as tall as the day before or taller', () => {
    expect(flameMoment(1).zoom).toBeGreaterThan(1.2);
    expect(flameMoment(7).zoom).toBe(1);
    expect(flameMoment(400).zoom).toBe(1);
    const seen = (days: number): number => fireDrawing(fireLevel(days), FIRE_VIEW.h).flame.h * flameMoment(days).zoom;
    for (let days = 2; days <= 400; days++) expect(seen(days), `day ${days}`).toBeGreaterThanOrEqual(seen(days - 1));
  });
});

describe('the flame lighting up', () => {
  const { atMs, popMs, pop, dim, floodMs } = FLAME_IGNITE;

  it('opens dim, then lights a moment later, the pop at its height just as the growth starts', () => {
    expect(dim).toBeGreaterThan(0);
    expect(dim).toBeLessThan(0.5);
    expect(atMs).toBeGreaterThan(200);
    const height = pop.reduce((a, b) => (b.sy > a.sy ? b : a));
    expect(atMs + height.at * popMs).toBeCloseTo(FIRE_GROW.delayMs, -1);
    // the warm light is all there before the moment could be over
    expect(atMs + floodMs).toBeLessThan(atMs + CELEBRATE_MS);
  });

  it('squashes down first, then pops up past its size and settles at it', () => {
    expect(pop[0]).toEqual({ at: 0, sx: 1, sy: 1 });
    expect(pop.at(-1)).toEqual({ at: 1, sx: 1, sy: 1 });
    expect(pop.map((p) => p.at)).toEqual([...pop.map((p) => p.at)].sort((a, b) => a - b));
    const lowest = pop.findIndex((p) => p.sy < 1);
    const highest = pop.findIndex((p) => p.sy > 1);
    expect(lowest).toBeGreaterThan(0);
    expect(highest).toBeGreaterThan(lowest);
    // wider as it squashes, narrower as it stretches: about as much fire all through
    expect(pop[lowest]!.sx).toBeGreaterThan(1);
    expect(pop[highest]!.sx).toBeLessThan(1);
  });
});

describe('the fire beside Hevalo at his window', () => {
  const tall = 160;
  const at = fireBesideWindow(tall);
  const unit = at.fire / FIRE_VIEW.h;
  const windowWide = (tall * WINDOW_VIEW.w) / WINDOW_VIEW.h;
  // laid out from the fire's left edge, the window after it, as in a page read from the left
  const windowLeft = FIRE_VIEW.w * unit - at.over;
  const wallCorner = windowLeft + WINDOW_PLACE.wall.left * windowWide;
  const logs = { left: FIRE_LOGS.x * unit, right: (FIRE_LOGS.x + FIRE_LOGS.w) * unit };

  it('lays its logs across the wall corner, most of them in the room in front of it', () => {
    expect(logs.right).toBeGreaterThan(wallCorner);
    expect(logs.left).toBeLessThan(wallCorner);
    expect((logs.right - wallCorner) / (logs.right - logs.left)).toBeCloseTo(0.25, 9);
  });

  it('lays them on the floor a little below the wall, nearer to us than it', () => {
    // from the window box's foot, up
    const wallFoot = (1 - WINDOW_PLACE.wall.foot) * tall;
    const logsFoot = (FIRE_VIEW.h - FIRE_LOGS.y - FIRE_LOGS.h) * unit - at.drop;
    expect(logsFoot).toBeLessThan(wallFoot);
    expect(wallFoot - logsFoot).toBeLessThan(tall * 0.05);
  });

  it('draws the fire a little shorter than the window, and puts each as far either side of their middle as they stand apart', () => {
    expect(at.fire).toBeGreaterThan(tall * 0.8);
    expect(at.fire).toBeLessThan(tall);
    const fireMiddle = (FIRE_VIEW.w * unit) / 2;
    const windowMiddle = windowLeft + windowWide / 2;
    expect(at.windowAside + at.fireAside).toBeCloseTo(windowMiddle - fireMiddle, 9);
    // the two together centred: as far out past the fire as past the window
    expect(windowMiddle - at.windowAside).toBeCloseTo(fireMiddle + at.fireAside, 9);
  });

  it('keeps the Newroz fire clear of his face: its flame ends short of the middle of the window', () => {
    const newroz = fireDrawing({ stage: 'newroz', growth: 1 }, at.fire);
    const right = FIRE_VIEW.w / 2 + newroz.flame.w / 2;
    expect(right * unit).toBeLessThan(windowLeft + windowWide * 0.35);
  });
});

describe('a milestone in a run of right answers', () => {
  it('grows its fire from the run before where the run reached a new stage, and holds until it has', () => {
    for (const [count, before, after] of [
      [5, 'kindling', 'campfire'],
      [10, 'campfire', 'bigfire'],
      [15, 'bigfire', 'bonfire'],
      [20, 'bonfire', 'blaze'],
    ] as const) {
      const moment = runMoment(count);
      expect(moment.level.stage).toBe(after);
      expect(moment.from).toEqual(runFireLevel(count - 1));
      expect(moment.from?.stage).toBe(before);
      expect(moment.ms).toBeGreaterThan(FIRE_GROW.delayMs + FIRE_GROW.ms);
    }
  });

  it('is simply the fire of the run for about a second once it is a blaze', () => {
    expect(runMoment(25)).toEqual({ level: runFireLevel(25), from: null, ms: RUN_MOMENT_MS });
    expect(runMoment(30).from).toBeNull();
  });
});

describe('the ladder of stages', () => {
  const places = (days: number) => fireLadder(days).map((s) => `${s.stage}:${s.place}`);

  it('climbs from the spark to the Newroz fire, each stage on its own day', () => {
    expect(fireLadder(0).map((s) => [s.stage, s.day])).toEqual([
      ['spark', 1],
      ['kindling', 3],
      ['campfire', 7],
      ['bigfire', 14],
      ['bonfire', 30],
      ['blaze', 100],
      ['newroz', 365],
    ]);
  });

  it('has every stage ahead while the logs are cold', () => {
    expect(fireLadder(0).every((s) => s.place === 'ahead')).toBe(true);
  });

  it('marks the stages reached, the one burning now and the ones ahead', () => {
    expect(places(9)).toEqual(['spark:reached', 'kindling:reached', 'campfire:now', 'bigfire:ahead', 'bonfire:ahead', 'blaze:ahead', 'newroz:ahead']);
    expect(places(120).filter((p) => p.endsWith(':now'))).toEqual(['blaze:now']);
    expect(places(800).at(-1)).toBe('newroz:now');
  });

  it('draws the stage burning now as the fire of today, and every other as its stage begins', () => {
    const ladder = fireLadder(9);
    expect(ladder.find((s) => s.place === 'now')?.level).toEqual(fireLevel(9));
    expect(ladder.find((s) => s.stage === 'bonfire')?.level).toEqual({ stage: 'bonfire', growth: 0 });
    expect(ladder.find((s) => s.stage === 'spark')?.level).toEqual({ stage: 'spark', growth: 0 });
  });
});
