import { describe, expect, it } from 'vitest';
import {
  RANK_TIERS,
  RANK_TIER_KEYS,
  SEASON_FRAME_SKUS,
  SEASON_REWARD_GEMS,
  divisionOf,
  isRankTier,
  isRankedGame,
  isSeasonId,
  leaveCooldownMinutes,
  pointsOf,
  previousSeasonId,
  progressToNext,
  repeatWeight,
  seasonById,
  seasonDaysLeft,
  seasonFrameSku,
  seasonOf,
  sterkTitle,
  tierFloor,
  tierIndex,
  tierOf,
} from './ranks.js';

describe('pointsOf', () => {
  it('starts everyone at 0: μ 25, σ 25/3 is exactly 0 points', () => {
    expect(pointsOf(25, 25 / 3)).toBe(0);
  });

  it('is 40 × (μ − 3σ), rounded', () => {
    expect(pointsOf(25, 1.5)).toBe(820);
    expect(pointsOf(30, 2)).toBe(960);
    expect(pointsOf(27.635389493140497, 8.06590141354368)).toBe(138);
  });

  it('never shows a negative number', () => {
    expect(pointsOf(20, 8)).toBe(0);
  });
});

describe('tiers', () => {
  it('climb Deşt → Gir → Zozan → Çiya → Lûtke every 300 points', () => {
    expect([0, 299, 300, 599, 600, 899, 900, 1199, 1200, 5000].map(tierOf)).toEqual([
      'dest', 'dest', 'gir', 'gir', 'zozan', 'zozan', 'ciya', 'ciya', 'lutke', 'lutke',
    ]);
  });

  it('have three divisions of a hundred, III first, and Lûtke I is open-ended', () => {
    expect([0, 99, 100, 199, 200, 299].map(divisionOf)).toEqual([3, 3, 2, 2, 1, 1]);
    expect([300, 450, 599].map(divisionOf)).toEqual([3, 2, 1]);
    expect([1200, 1299, 1300, 1399, 1400, 2500].map(divisionOf)).toEqual([3, 3, 2, 2, 1, 1]);
  });

  it('know their floors, Stêrk at Lûtke I', () => {
    expect(RANK_TIERS.map((t) => tierFloor(t.key))).toEqual([0, 300, 600, 900, 1200]);
    expect(tierFloor('sterk')).toBe(1400);
  });

  it('are ordered with the apex last', () => {
    expect(RANK_TIER_KEYS).toEqual(['dest', 'gir', 'zozan', 'ciya', 'lutke', 'sterk']);
    expect(tierIndex('dest')).toBe(0);
    expect(tierIndex('sterk')).toBe(5);
    expect(isRankTier('gir')).toBe(true);
    expect(isRankTier('bronze')).toBe(false);
  });
});

describe('progressToNext', () => {
  it('measures the current division and names the next step', () => {
    expect(progressToNext(150)).toEqual({
      next: { tier: 'dest', division: 1 },
      from: 100,
      to: 200,
      fraction: 0.5,
      pointsToGo: 50,
    });
  });

  it('crosses into the next tier from a tier’s first division', () => {
    const p = progressToNext(580);
    expect(p.next).toEqual({ tier: 'zozan', division: 3 });
    expect(p.pointsToGo).toBe(20);
  });

  it('stops at Lûtke I: Stêrk is by standing, not points', () => {
    expect(progressToNext(1700)).toEqual({ next: null, from: 1400, to: null, fraction: 1, pointsToGo: null });
    expect(progressToNext(1399).next).toEqual({ tier: 'lutke', division: 1 });
  });
});

describe('fairness rules', () => {
  it('damps repeat opponents 1, 1, ½, ¼, then nothing', () => {
    expect([1, 2, 3, 4, 5, 9].map(repeatWeight)).toEqual([1, 1, 0.5, 0.25, 0, 0]);
  });

  it('steps the leave cooldown 0, 10 min, 30 min, 2 h and stays there', () => {
    expect([1, 2, 3, 4, 7].map(leaveCooldownMinutes)).toEqual([0, 10, 30, 120, 120]);
  });
});

describe('seasons', () => {
  it('follow the calendar quarters in UTC with their Kurdish names', () => {
    expect(seasonOf(new Date('2026-01-01T00:00:00Z'))).toMatchObject({ id: '2026-Q1', name: 'zivistan', year: 2026 });
    expect(seasonOf(new Date('2026-05-15T12:00:00Z')).name).toBe('bihar');
    expect(seasonOf(new Date('2026-09-30T23:59:59Z')).name).toBe('havin');
    expect(seasonOf(new Date('2026-10-14T08:00:00Z'))).toEqual({
      id: '2026-Q4',
      name: 'payiz',
      year: 2026,
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('step back across a year', () => {
    expect(previousSeasonId('2027-Q1')).toBe('2026-Q4');
    expect(previousSeasonId('2026-Q3')).toBe('2026-Q2');
  });

  it('parse only real ids', () => {
    expect(isSeasonId('2026-Q4')).toBe(true);
    expect(isSeasonId('2026-Q5')).toBe(false);
    expect(() => seasonById('nope')).toThrow();
  });

  it('count calm whole days left', () => {
    const s = seasonById('2026-Q4');
    expect(seasonDaysLeft(s, new Date('2026-12-30T12:00:00Z'))).toBe(1);
    expect(seasonDaysLeft(s, new Date('2027-02-01T00:00:00Z'))).toBe(0);
  });

  it('name the Stêrk title after the season', () => {
    expect(sterkTitle('2026-Q4')).toBe('Stêrkê Payîz 2026');
  });

  it('pay a few Gems by the best tier and give a frame per tier, animated at the top', () => {
    expect(SEASON_REWARD_GEMS).toEqual({ dest: 10, gir: 20, zozan: 35, ciya: 50, lutke: 75, sterk: 100 });
    expect(seasonFrameSku('gir')).toBe('frame_rank_gir');
    expect(seasonFrameSku('lutke')).toBe('frame_rank_lutke_animated');
    expect(SEASON_FRAME_SKUS).toHaveLength(6);
  });
});

it('knows which games have a rank', () => {
  expect(isRankedGame('stories')).toBe(true);
  expect(isRankedGame('race')).toBe(false);
});
