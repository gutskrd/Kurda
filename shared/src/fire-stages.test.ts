import { describe, expect, it } from 'vitest';
import { COLD_FIRE, FIRE_STAGES, FIRE_STAGE_DAYS, fireGrewToday, fireLevel, fireStageIndex, nextFireStage, runFireLevel, stageBefore } from './fire-stages.js';

describe('the streak fire stages', () => {
  it('is cold with no streak, and for anything that is not a count of days', () => {
    expect(fireLevel(0)).toEqual(COLD_FIRE);
    expect(fireLevel(-3)).toEqual(COLD_FIRE);
    expect(fireLevel(Number.NaN)).toEqual(COLD_FIRE);
  });

  it('grows quickly at first and further apart later', () => {
    const at = (days: number) => fireLevel(days).stage;
    expect([1, 2, 3, 6, 7, 13, 14, 29, 30, 99, 100, 364, 365, 2000].map(at)).toEqual([
      'spark',
      'spark',
      'kindling',
      'kindling',
      'campfire',
      'campfire',
      'bigfire',
      'bigfire',
      'bonfire',
      'bonfire',
      'blaze',
      'blaze',
      'newroz',
      'newroz',
    ]);
  });

  it('reaches every stage on its own day, smallest first', () => {
    const days = FIRE_STAGES.map((s) => FIRE_STAGE_DAYS[s]);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    for (const stage of FIRE_STAGES) expect(fireLevel(FIRE_STAGE_DAYS[stage])).toEqual({ stage, growth: 0 });
  });

  it('still grows a little every day between stages, and never past full', () => {
    expect(fireLevel(7).growth).toBe(0);
    expect(fireLevel(10).growth).toBeCloseTo(3 / 7);
    expect(fireLevel(13).growth).toBeCloseTo(6 / 7);
    expect(fireLevel(30 + 35).growth).toBeCloseTo(35 / 70);
    expect(fireLevel(365 + 365).growth).toBe(1);
    expect(fireLevel(5000).growth).toBe(1);
    for (let d = 1; d < 800; d++) {
      const [a, b] = [fireLevel(d), fireLevel(d + 1)];
      if (a.stage === b.stage) expect(b.growth).toBeGreaterThanOrEqual(a.growth);
      else expect(fireStageIndex(b.stage)).toBe(fireStageIndex(a.stage) + 1);
    }
  });

  it('says the stage reached on the day the fire grew, and nothing on other days', () => {
    expect(fireGrewToday(0)).toBeNull();
    expect(fireGrewToday(1)).toBe('spark');
    expect(fireGrewToday(2)).toBeNull();
    expect(fireGrewToday(7)).toBe('campfire');
    expect(fireGrewToday(100)).toBe('blaze');
    expect(fireGrewToday(365)).toBe('newroz');
    expect(fireGrewToday(366)).toBeNull();
    expect(stageBefore('spark')).toBe('cold');
    expect(stageBefore('newroz')).toBe('blaze');
    expect(stageBefore('cold')).toBe('cold');
  });

  it('names the next stage and the day it comes, until the Newroz fire', () => {
    expect(nextFireStage(0)).toEqual({ stage: 'spark', at: 1 });
    expect(nextFireStage(4)).toEqual({ stage: 'campfire', at: 7 });
    expect(nextFireStage(30)).toEqual({ stage: 'blaze', at: 100 });
    expect(nextFireStage(364)).toEqual({ stage: 'newroz', at: 365 });
    expect(nextFireStage(365)).toBeNull();
  });

  it('grows with a run of right answers, faster, and never into the Newroz fire', () => {
    const at = (run: number) => runFireLevel(run).stage;
    expect([0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 500].map(at)).toEqual([
      'cold',
      'spark',
      'spark',
      'kindling',
      'kindling',
      'campfire',
      'campfire',
      'bigfire',
      'bonfire',
      'blaze',
      'blaze',
    ]);
    expect(runFireLevel(7).growth).toBeCloseTo(2 / 5);
    expect(runFireLevel(500).growth).toBe(1);
  });
});
