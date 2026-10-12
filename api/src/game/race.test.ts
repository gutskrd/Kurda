import { describe, expect, it } from 'vitest';
import {
  countCorrect,
  HUMAN_WPM_CEILING,
  MIN_RACE_MS,
  raceXp,
  RACE_MAX_BONUS_XP,
  RACE_PARTICIPATION_XP,
  scoreRace,
} from './race.js';

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

  /*
   * The regression that made a race unwinnable after one slip: positions were
   * compared one by one, so one missed letter early on made every later letter
   * wrong — a run that only missed its first letter scored 0 of 26.
   */
  it('counts one missed letter once, not against everything after it', () => {
    const text = 'ez ji welatê xwe hez dikim';
    expect(countCorrect(text, text.slice(1))).toBe(25);
    expect(countCorrect(text, 'ez ji wlatê xwe hez dikim')).toBe(25);
    // one letter too many, or a space too many, costs nothing that was typed right
    expect(countCorrect(text, 'ez ji wellatê xwe hez dikim')).toBe(26);
    expect(countCorrect(text, 'ez ji wel atê xwe hez dikim')).toBe(26);
  });

  it('only counts letters in order, so wandering text does not score', () => {
    // every letter of the text is in here, just not in its order
    expect(countCorrect('welat', 'talew')).toBeLessThanOrEqual(2);
  });
});

describe('scoring what a keyboard actually sends', () => {
  const target = 'ez ji welatê xwe hez dikim';

  /*
   * A race text saved decomposed (e + U+0302) could never be typed: every
   * keyboard sends the precomposed ê, so it read 27 characters against 26 and
   * scored 0.41 for a perfect run.
   */
  it('scores a perfect run on a text stored decomposed as perfect', () => {
    const s = scoreRace({ target: 'ez ji welate\u0302 xwe hez dikim', typed: target, elapsedMs: 30_000 });
    expect(s.accuracy).toBe(1);
    expect(s.perfect).toBe(true);
    expect(s.correctChars).toBe(26);
  });

  it('scores a curly apostrophe, a dash and a no-break space as the characters a keyboard has', () => {
    const s = scoreRace({
      target: 'Ez’ê bêm — sibê\u00a0were, heval.',
      typed: "Ez'ê bêm - sibê were, heval.",
      elapsedMs: 30_000,
    });
    expect(s.accuracy).toBe(1);
    expect(s.perfect).toBe(true);
  });

  it('reads a Turkish keyboard’s ı as i', () => {
    expect(scoreRace({ target: 'dibistan û malbat', typed: 'dıbıstan û malbat', elapsedMs: 10_000 }).perfect).toBe(true);
  });

  it('scores one missed letter as one letter missed', () => {
    const s = scoreRace({ target, typed: target.slice(1), elapsedMs: 30_000 });
    expect(s.correctChars).toBe(25);
    expect(s.accuracy).toBeCloseTo(25 / 26, 5);
    expect(s.errors).toBe(1);
    expect(s.perfect).toBe(false);
    expect(s.score).toBeGreaterThan(0);
  });

  /*
   * The race ended the moment a dead key's ˆ arrived on a text ending in î,
   * before the i did. The app should not send it; if it does, the accent is
   * not a character, and the letter it was waiting for is simply missing.
   */
  it('does not score a dead key’s accent as a character', () => {
    const s = scoreRace({ target: 'ez kurd im û ez kurdî', typed: 'ez kurd im û ez kurdˆ', elapsedMs: 10_000 });
    expect(s.correctChars).toBe(20);
    expect(s.errors).toBe(0);
    expect(s.perfect).toBe(false);
  });

  it('counts what was typed beyond the text against the accuracy', () => {
    const clean = scoreRace({ target, typed: target, elapsedMs: 30_000 });
    const padded = scoreRace({ target, typed: `${target} xxxxxx`, elapsedMs: 30_000 });
    expect(padded.correctChars).toBe(clean.correctChars);
    expect(padded.accuracy).toBeLessThan(clean.accuracy);
  });

  describe('accent modes', () => {
    const plain = 'ez ji welate xwe hez dikim';

    it('strict: ê typed as e is a mistake', () => {
      const s = scoreRace({ target, typed: plain, elapsedMs: 30_000, accentMode: 'strict' });
      expect(s.correctChars).toBe(25);
      expect(s.accentMisses).toBe(1);
      expect(s.perfect).toBe(false);
    });

    it('forgiving: ê typed as e counts, the miss is counted, and the run is not perfect', () => {
      const s = scoreRace({ target, typed: plain, elapsedMs: 30_000, accentMode: 'forgiving' });
      expect(s.correctChars).toBe(26);
      expect(s.accuracy).toBe(1);
      expect(s.accentMisses).toBe(1);
      expect(s.accented).toBe(1);
      expect(s.perfect).toBe(false);
    });

    it('hidden: the accents are not compared at all', () => {
      const s = scoreRace({ target, typed: plain, elapsedMs: 30_000, accentMode: 'hidden' });
      expect(s.correctChars).toBe(26);
      expect(s.accentMisses).toBe(0);
      expect(s.perfect).toBe(true);
    });

    it('is forgiving when a caller does not say', () => {
      expect(scoreRace({ target, typed: plain, elapsedMs: 30_000 }).correctChars).toBe(26);
    });

    it('folds the Soranî pairs in a Soranî race', () => {
      const s = scoreRace({
        target: 'ڕێگای گوڵ و باخچە',
        typed: 'ریگای گول و باخچە',
        elapsedMs: 10_000,
        dialect: 'sorani',
        accentMode: 'forgiving',
      });
      expect(s.accuracy).toBe(1);
      expect(s.accentMisses).toBe(3);
    });
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
    // 5000 characters at 200 wpm takes five minutes; typing them inside the
    // clock floor would be a paste, which is scored separately below
    const huge = scoreRace({ target: 'a'.repeat(5000), typed: 'a'.repeat(5000), elapsedMs: 300_000 });
    expect(huge.implausible).toBe(false);
    expect(raceXp(huge)).toBe(RACE_PARTICIPATION_XP + RACE_MAX_BONUS_XP);
  });
});

/**
 * The browser will not let anyone paste into the race, but the browser is not
 * the boundary — the finish endpoint takes whatever it is posted. This is where
 * a pasted run stops being worth anything.
 */
describe('a speed no person reaches', () => {
  const target = 'ez ji welatê xwe hez dikim';

  it('lets a genuinely fast human through', () => {
    // 26 characters in 1.6 seconds is about 195 wpm — near the world record,
    // and it must still count, or the rule punishes the people it is for
    const s = scoreRace({ target, typed: target, elapsedMs: 1600 });
    expect(s.wpm).toBeGreaterThan(150);
    expect(s.wpm).toBeLessThan(HUMAN_WPM_CEILING);
    expect(s.implausible).toBe(false);
    expect(s.score).toBeGreaterThan(0);
    expect(raceXp(s)).toBeGreaterThan(0);
  });

  it('refuses to rank or pay a run nobody typed', () => {
    // the whole text at once, inside the clock floor: about 1200 wpm
    const pasted = scoreRace({ target: 'a'.repeat(200), typed: 'a'.repeat(200), elapsedMs: 500 });
    expect(pasted.wpm).toBeGreaterThan(HUMAN_WPM_CEILING);
    expect(pasted.implausible).toBe(true);
    expect(pasted.score).toBe(0);
    expect(raceXp(pasted)).toBe(0);
    // and it is not celebrated as a flawless run either
    expect(pasted.perfect).toBe(false);
  });

  it('still reports the reading, so the result can say what happened', () => {
    const pasted = scoreRace({ target: 'a'.repeat(200), typed: 'a'.repeat(200), elapsedMs: 500 });
    // accuracy and speed are unchanged; only what they are worth is zero
    expect(pasted.accuracy).toBe(1);
    expect(pasted.correctChars).toBe(200);
    expect(pasted.wpm).toBeGreaterThan(1000);
  });

  it('does not fire on a slow run of any length', () => {
    expect(scoreRace({ target, typed: target, elapsedMs: 60_000 }).implausible).toBe(false);
    expect(scoreRace({ target, typed: '', elapsedMs: 500 }).implausible).toBe(false);
  });
});
