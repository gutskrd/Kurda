import { describe, expect, it } from 'vitest';
import { countCorrect, MIN_RACE_MS, raceXp, RACE_MAX_BONUS_XP, RACE_PARTICIPATION_XP, scoreRace } from './race.js';

describe('countCorrect', () => {
  it('counts characters that match in place', () => {
    expect(countCorrect('welat', 'welat')).toBe(5);
    expect(countCorrect('welat', 'welax')).toBe(4);
  });

  it('counts Kurdish letters as single characters, not code units', () => {
    // 'ê' and 'û' must each count once, or accuracy would be wrong for any
    // Kurdish text — which is all of them
    expect(countCorrect('hêvî', 'hêvî')).toBe(4);
    expect(countCorrect('hêvî', 'hevî')).toBe(3);
  });

  it('stops at the shorter of the two', () => {
    expect(countCorrect('welatê me', 'welat')).toBe(5);
    expect(countCorrect('welat', 'welatê me')).toBe(5);
  });

  it('gives nothing for an empty attempt', () => {
    expect(countCorrect('welat', '')).toBe(0);
  });
});

describe('scoreRace', () => {
  const target = 'ez ji welatê xwe hez dikim'; // 26 characters

  it('scores a perfect run', () => {
    const s = scoreRace({ target, typed: target, elapsedMs: 60_000 });
    expect(s.accuracy).toBe(1);
    expect(s.perfect).toBe(true);
    // 26 chars / 5 per word over one minute
    expect(s.wpm).toBeCloseTo(5.2, 1);
  });

  it('halving the time doubles the speed', () => {
    const slow = scoreRace({ target, typed: target, elapsedMs: 60_000 });
    const fast = scoreRace({ target, typed: target, elapsedMs: 30_000 });
    expect(fast.wpm).toBeCloseTo(slow.wpm * 2, 1);
  });

  it('measures accuracy against the target, not against what was typed', () => {
    // stopping after three characters is 12% of the text, not 100% of a short one
    const s = scoreRace({ target, typed: 'ez ', elapsedMs: 10_000 });
    expect(s.accuracy).toBeLessThan(0.2);
    expect(s.perfect).toBe(false);
  });

  it('ranks on speed weighted by accuracy, so fast nonsense loses', () => {
    const careful = scoreRace({ target, typed: target, elapsedMs: 30_000 });
    // 'q' appears nowhere in the target, so nothing lands
    const reckless = scoreRace({ target, typed: 'q'.repeat(26), elapsedMs: 10_000 });
    expect(reckless.wpm).toBe(0);
    expect(careful.score).toBeGreaterThan(reckless.score);
  });

  it('refuses to turn a zero clock into infinite speed', () => {
    const s = scoreRace({ target, typed: target, elapsedMs: 0 });
    expect(Number.isFinite(s.wpm)).toBe(true);
    // clamped to the floor, so the fastest possible reading is bounded
    expect(s.wpm).toBe(scoreRace({ target, typed: target, elapsedMs: MIN_RACE_MS }).wpm);
  });

  it('does not call a truncated attempt perfect', () => {
    const half = target.slice(0, 13);
    expect(scoreRace({ target, typed: half, elapsedMs: 20_000 }).perfect).toBe(false);
  });

  it('does not call an over-typed attempt perfect', () => {
    // every target character matched, but there is extra rubbish after it
    const s = scoreRace({ target, typed: target + ' xxxx', elapsedMs: 20_000 });
    expect(s.correctChars).toBe([...target].length);
    expect(s.perfect).toBe(false);
  });

  it('handles an empty target without dividing by zero', () => {
    const s = scoreRace({ target: '', typed: '', elapsedMs: 5000 });
    expect(s.accuracy).toBe(0);
    expect(s.perfect).toBe(false);
  });
});

describe('raceXp', () => {
  const target = 'ez ji welatê xwe hez dikim';

  it('pays nothing for typing nothing', () => {
    expect(raceXp(scoreRace({ target, typed: '', elapsedMs: 10_000 }))).toBe(0);
  });

  it('pays the entry plus a slice of the score', () => {
    const xp = raceXp(scoreRace({ target, typed: target, elapsedMs: 30_000 }));
    expect(xp).toBeGreaterThan(RACE_PARTICIPATION_XP);
  });

  it('caps the bonus, so one enormous text cannot mint XP', () => {
    const huge = scoreRace({ target: 'a'.repeat(5000), typed: 'a'.repeat(5000), elapsedMs: MIN_RACE_MS });
    expect(raceXp(huge)).toBe(RACE_PARTICIPATION_XP + RACE_MAX_BONUS_XP);
  });
});
