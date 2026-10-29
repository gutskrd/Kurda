import { describe, expect, it } from 'vitest';
import { CELEBRATE_MS } from './celebration.js';
import { FIRE_GREW_READ_MS, RUN_MOMENT_MS, fireLadder, flameMoment, runMoment } from './fire-moments.js';
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
    });
    expect(flameMoment(7)).toMatchObject({ level: { stage: 'campfire', growth: 0 }, from: fireLevel(6), grew: 'campfire' });
    expect(flameMoment(365)).toMatchObject({ grew: 'newroz', from: { stage: 'blaze' } });
    // the line is up before the moment moves on
    expect(first.overMs - first.landsAtMs).toBe(FIRE_GREW_READ_MS);
  });

  it('is the fire of today for the one celebration on any other day', () => {
    for (const days of [2, 6, 12, 45, 400]) {
      expect(flameMoment(days)).toMatchObject({ level: fireLevel(days), from: null, grew: null, overMs: CELEBRATE_MS });
    }
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
