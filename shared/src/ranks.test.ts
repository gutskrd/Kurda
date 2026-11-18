import { describe, expect, it } from 'vitest';
import { RANK_TIER_KEYS, isRankedGame, partWeightReason, progressToNext, seasonDaysLeft, seasonFrameSku, seasonOf, tierIndex, tierOf } from './ranks.js';

describe('tiers', () => {
  it('climb Deşt → Gir → Zozan → Çiya → Lûtke every 300 points', () => {
    expect([0, 299, 300, 599, 600, 899, 900, 1199, 1200, 5000].map(tierOf)).toEqual([
      'dest', 'dest', 'gir', 'gir', 'zozan', 'zozan', 'ciya', 'ciya', 'lutke', 'lutke',
    ]);
  });

  it('are ordered with the apex last', () => {
    expect(RANK_TIER_KEYS).toEqual(['dest', 'gir', 'zozan', 'ciya', 'lutke', 'sterk']);
    expect(tierIndex('dest')).toBe(0);
    expect(tierIndex('sterk')).toBe(5);
  });
});

describe('progressToNext', () => {
  it('measures the current division, three of a hundred to a tier, and names the next step', () => {
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
    expect(progressToNext(1250).next).toEqual({ tier: 'lutke', division: 2 });
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

  it('count calm whole days left', () => {
    const s = seasonOf(new Date('2026-11-01T00:00:00Z'));
    expect(seasonDaysLeft(s, new Date('2026-12-30T12:00:00Z'))).toBe(1);
    expect(seasonDaysLeft(s, new Date('2027-02-01T00:00:00Z'))).toBe(0);
  });

  it('name the frames people earned per tier, animated at the top', () => {
    expect(seasonFrameSku('gir')).toBe('frame_rank_gir');
    expect(seasonFrameSku('lutke')).toBe('frame_rank_lutke_animated');
  });
});

it('knows which games have a rank', () => {
  expect(isRankedGame('stories')).toBe(true);
  expect(isRankedGame('race')).toBe(false);
});

describe('partWeightReason', () => {
  it('names the part of the weight that applied, or nothing for a full game', () => {
    expect(partWeightReason({ damping: 1, newAccountLimit: 1 })).toBeNull();
    expect(partWeightReason({ damping: 0.5, newAccountLimit: 1 })).toBe('repeat-opponent');
    expect(partWeightReason({ damping: 1, newAccountLimit: 0.5 })).toBe('new-account');
    expect(partWeightReason({ damping: 0.25, newAccountLimit: 0.833 })).toBe('both');
  });
});
