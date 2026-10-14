import { describe, expect, it } from 'vitest';
import { pointsOf, START_SIGMA } from '@kurda/shared';
import {
  effectivePlaces,
  expectedExtremes,
  expectedVs,
  freshState,
  idleSigma,
  rateGame,
  seasonReset,
  type GameEntry,
  type PlayerState,
} from './engine.js';

const AT = new Date('2026-10-14T12:00:00Z');
const S = '2026-Q4';

const settled = (mu: number, sigma: number, over: Partial<PlayerState> = {}): PlayerState => ({
  ...freshState(S),
  mu,
  sigma,
  ratedGames: 40,
  placementDone: true,
  lastRatedAt: AT,
  peakPoints: pointsOf(mu, sigma),
  bestPoints: pointsOf(mu, sigma),
  ...over,
});
const entry = (userId: string, state: PlayerState, place: number, over: Partial<GameEntry> = {}): GameEntry => ({
  userId,
  state,
  place,
  left: false,
  newAccount: false,
  ...over,
});

describe('rateGame (OpenSkill Plackett-Luce)', () => {
  it('matches the published 1v1 values from the default rating', () => {
    // Weng-Lin PL with μ 25, σ 25/3, β 25/6, τ 25/300: the reference numbers
    // of the openskill test-suite
    const [a, b] = rateGame({
      entries: [entry('a', freshState(S), 1), entry('b', freshState(S), 2)],
      weight: 1,
      at: AT,
    });
    expect(a!.after.mu).toBeCloseTo(27.635389493140497, 9);
    expect(a!.after.sigma).toBeCloseTo(8.06590141354368, 9);
    expect(b!.after.mu).toBeCloseTo(22.364610506859503, 9);
    expect(b!.after.sigma).toBeCloseTo(8.06590141354368, 9);
    expect(a!.pointsAfter).toBe(138);
    expect(b!.pointsAfter).toBe(0);
    expect(a!.won).toBe(true);
    expect(b!.won).toBe(false);
    expect(a!.reason).toBe('placement');
  });

  it('treats equal places as a tie: nobody wins, μ stays', () => {
    const [a, b] = rateGame({
      entries: [entry('a', freshState(S), 1), entry('b', freshState(S), 1)],
      weight: 1,
      at: AT,
    });
    expect(a!.after.mu).toBeCloseTo(25, 9);
    expect(b!.after.mu).toBeCloseTo(25, 9);
    expect(a!.won || b!.won).toBe(false);
  });

  it('ranks a group by place and puts leavers last, whatever their score said', () => {
    expect(effectivePlaces([{ place: 1, left: true }, { place: 2, left: false }, { place: 3, left: false }])).toEqual([3, 1, 2]);
    const out = rateGame({
      entries: [
        entry('quitter', settled(25, 3), 1, { left: true }),
        entry('b', settled(25, 3), 2),
        entry('c', settled(25, 3), 3),
      ],
      weight: 1,
      at: AT,
    });
    expect(out[0]!.place).toBe(3);
    expect(out[0]!.reason).toBe('left');
    expect(out[0]!.won).toBe(false);
    expect(out[1]!.won).toBe(true);
    expect(out[0]!.delta).toBeLessThan(0);
  });

  it('moves more for an upset than for an expected win', () => {
    const strong = settled(30, 2);
    const weak = settled(22, 2);
    const upset = rateGame({ entries: [entry('w', weak, 1), entry('s', strong, 2)], weight: 1, at: AT });
    const expected = rateGame({ entries: [entry('s', strong, 1), entry('w', weak, 2)], weight: 1, at: AT });
    expect(upset[0]!.delta).toBeGreaterThan(expected[0]!.delta);
    expect(upset[0]!.reason).toBe('beat-stronger');
    expect(expected[0]!.reason).toBe('expected-win');
    expect(upset[1]!.reason).toBe('lost-to-weaker');
    expect(expected[1]!.reason).toBe('lost-to-stronger');
  });

  it('applies the repeat weight to the change, not to the rating', () => {
    const full = rateGame({ entries: [entry('a', settled(25, 3), 1), entry('b', settled(25, 3), 2)], weight: 1, at: AT });
    const half = rateGame({ entries: [entry('a', settled(25, 3), 1), entry('b', settled(25, 3), 2)], weight: 0.5, at: AT });
    expect(half[0]!.after.mu - 25).toBeCloseTo((full[0]!.after.mu - 25) / 2, 9);
    expect(half[0]!.weight).toBe(0.5);
  });

  it('lets a new account move its opponents by at most half, and moves the new account fully', () => {
    const plain = rateGame({ entries: [entry('a', settled(25, 3), 1), entry('n', settled(25, 3), 2)], weight: 1, at: AT });
    const vsNew = rateGame({
      entries: [entry('a', settled(25, 3), 1), entry('n', settled(25, 3), 2, { newAccount: true })],
      weight: 1,
      at: AT,
    });
    expect(vsNew[0]!.after.mu - 25).toBeCloseTo((plain[0]!.after.mu - 25) / 2, 9);
    expect(vsNew[1]!.after.mu).toBeCloseTo(plain[1]!.after.mu, 9);
    // in a group, one new account among seven opponents limits far less
    const group = rateGame({
      entries: [
        entry('a', settled(25, 3), 1),
        ...Array.from({ length: 6 }, (_, i) => entry(`p${i}`, settled(25, 3), i + 2)),
        entry('n', settled(25, 3), 8, { newAccount: true }),
      ],
      weight: 1,
      at: AT,
    });
    expect(group[0]!.weight).toBeCloseTo(1 - 0.5 / 7, 9);
  });

  it('counts placement for five games, then shows a tier', () => {
    let a = freshState(S);
    let b = freshState(S);
    for (let i = 0; i < 5; i++) {
      const [x, y] = rateGame({ entries: [entry('a', a, 1), entry('b', b, 2)], weight: 1, at: AT });
      expect(x!.reason).toBe('placement');
      a = x!.after;
      b = y!.after;
    }
    expect(a.placementDone).toBe(true);
    expect(a.ratedGames).toBe(5);
    expect(a.wins).toBe(5);
    const [x] = rateGame({ entries: [entry('a', a, 1), entry('b', b, 2)], weight: 1, at: AT });
    expect(x!.reason).not.toBe('placement');
    expect(x!.tierBefore).not.toBeNull();
  });

  it('shields a tier just reached for three games, and only a tier', () => {
    // just over Gir's floor, shield fresh: a heavy loss cannot drop below 300
    const floorCase = settled(20.2, 4.0, { shieldGames: 3 }); // 328: Gir III
    const [lost] = rateGame({ entries: [entry('h', floorCase, 2), entry('x', settled(15, 2), 1)], weight: 1, at: AT });
    expect(lost!.pointsAfter).toBe(300);
    expect(lost!.shieldHeld).toBe(true);
    expect(lost!.reason).toBe('shield');
    expect(lost!.after.shieldGames).toBe(2);
    // without a shield the same loss falls through the floor
    const [fell] = rateGame({
      entries: [entry('h', { ...floorCase, shieldGames: 0 }, 2), entry('x', settled(15, 2), 1)],
      weight: 1,
      at: AT,
    });
    expect(fell!.pointsAfter).toBeLessThan(300);
  });

  it('starts a new shield on reaching a higher tier, not a higher division', () => {
    const nearGir = settled(19.6, 3.0); // 424: Gir II
    const desI = settled(16, 3.0); // 280: Deşt I
    const [up] = rateGame({ entries: [entry('a', desI, 1), entry('b', settled(30, 2), 2)], weight: 1, at: AT });
    expect(up!.tierBefore).toBe('dest');
    expect(up!.tierAfter).toBe('gir');
    expect(up!.after.shieldGames).toBe(3);
    const [div] = rateGame({ entries: [entry('a', nearGir, 1), entry('b', settled(19.6, 3.0), 2)], weight: 1, at: AT });
    expect(div!.tierAfter).toBe(div!.tierBefore);
    expect(div!.after.shieldGames).toBe(0);
  });

  it('records the season’s peak and the best ever', () => {
    const s = settled(25, 3, { peakPoints: 100, bestPoints: 2000 });
    const [w] = rateGame({ entries: [entry('a', s, 1), entry('b', settled(25, 3), 2)], weight: 1, at: AT });
    expect(w!.after.peakPoints).toBe(w!.pointsAfter);
    expect(w!.after.bestPoints).toBe(2000);
    expect(w!.after.seasonGames).toBe(1);
  });

  it('tells how many tiers up the strongest beaten opponent was', () => {
    const [w] = rateGame({ entries: [entry('a', settled(16, 3), 1), entry('b', settled(30, 1), 2)], weight: 1, at: AT });
    // Deşt (280) over Çiya (1080): three tiers up
    expect(w!.beatTierGap).toBe(3);
  });

  it('counts no tier gap over an opponent who walked out', () => {
    const [w] = rateGame({
      entries: [entry('a', settled(16, 3), 1), entry('b', settled(30, 1), 2, { left: true })],
      weight: 1,
      at: AT,
    });
    expect(w!.beatTierGap).toBe(0);
  });
});

describe('idle σ and the season reset', () => {
  it('grows σ by 0.1 per whole idle week, capped at the start', () => {
    const last = new Date('2026-09-01T12:00:00Z');
    expect(idleSigma(2, last, new Date('2026-09-07T12:00:00Z'))).toBe(2);
    expect(idleSigma(2, last, new Date('2026-09-22T12:00:00Z'))).toBeCloseTo(2.3, 9);
    expect(idleSigma(8.3, last, new Date('2027-09-22T12:00:00Z'))).toBe(START_SIGMA);
    expect(idleSigma(2, null, AT)).toBe(2);
  });

  it('feeds the idle σ into the next game, so a returning player moves faster', () => {
    const fresh = rateGame({
      entries: [entry('a', settled(25, 2), 1), entry('b', settled(25, 2), 2)],
      weight: 1,
      at: AT,
    });
    const away = rateGame({
      entries: [entry('a', settled(25, 2, { lastRatedAt: new Date('2026-06-01T00:00:00Z') }), 1), entry('b', settled(25, 2), 2)],
      weight: 1,
      at: AT,
    });
    expect(away[0]!.after.mu - 25).toBeGreaterThan(fresh[0]!.after.mu - 25);
  });

  it('raises σ to at least 4, keeps μ and restarts the season counters', () => {
    const r = seasonReset(settled(30, 2, { seasonGames: 12, seasonWins: 8, peakPoints: 999 }), '2027-Q1');
    expect(r.mu).toBe(30);
    expect(r.sigma).toBe(4);
    expect(r.seasonId).toBe('2027-Q1');
    expect(r.seasonGames).toBe(0);
    expect(r.peakPoints).toBe(pointsOf(30, 4));
    expect(r.ratedGames).toBe(40);
    expect(r.placementDone).toBe(true);
    expect(seasonReset(settled(30, 5), '2027-Q1').sigma).toBe(5);
  });
});

describe('expected gains', () => {
  it('promises more for beating a stronger player than a weaker one', () => {
    const me = { state: settled(25, 2), newAccount: false };
    const strong = expectedVs(me, { state: settled(30, 2), newAccount: false }, 1, AT);
    const weak = expectedVs(me, { state: settled(20, 2), newAccount: false }, 1, AT);
    expect(strong.win).toBeGreaterThan(weak.win);
    expect(strong.lose).toBeGreaterThan(weak.lose); // losing to the stronger costs less
    expect(weak.lose).toBeLessThan(0);
  });

  it('shrinks with damping and is zero when the game would not count', () => {
    const me = { state: settled(25, 2), newAccount: false };
    const opp = { state: settled(25, 2), newAccount: false };
    expect(expectedVs(me, opp, 0, AT)).toEqual({ win: 0, lose: 0 });
  });

  it('gives first and last for a group', () => {
    const lobby = [settled(25, 2), settled(25, 2), settled(25, 2)].map((state) => ({ state, newAccount: false }));
    const { first, last } = expectedExtremes(lobby, 1, AT);
    expect(first).toBeGreaterThan(0);
    expect(last).toBeLessThan(0);
  });
});
