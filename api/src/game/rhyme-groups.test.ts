import { describe, expect, it } from 'vitest';
import { applyRulings } from './rhyme-groups.js';

const counts = (perfect: number, near: number) => ({ perfect, near });

describe('applyRulings', () => {
  it('changes nothing when a curator has ruled on nothing', () => {
    expect(applyRulings('gul', counts(10, 5), [])).toEqual({ perfect: 10, near: 5, ruledOut: 0 });
  });

  /**
   * Ruling a word out has to take it off the count it was on, or the coverage
   * page keeps promising a rhyme the game will refuse.
   */
  it('moves a ruled-out word off its count and reports it', () => {
    // kul is a perfect rhyme for gul by its ending; ruled to none
    expect(applyRulings('gul', counts(10, 5), [['kul', 'none']])).toEqual({
      perfect: 9,
      near: 5,
      ruledOut: 1,
    });
  });

  /** A word the endings reject is not "ruled out" when a curator rejects it too. */
  it('does not count a ruling that agrees with the endings', () => {
    expect(applyRulings('gul', counts(10, 5), [['roj', 'none']])).toEqual({
      perfect: 10,
      near: 5,
      ruledOut: 0,
    });
  });

  it('adds a word the endings rejected and a curator ruled in', () => {
    expect(applyRulings('gul', counts(10, 5), [['roj', 'perfect']])).toEqual({
      perfect: 11,
      near: 5,
      ruledOut: 0,
    });
  });

  it('moves a word between the two strengths', () => {
    // dil shares only -l with gul, so the endings call it near; promoted
    expect(applyRulings('gul', counts(10, 5), [['dil', 'perfect']])).toEqual({
      perfect: 11,
      near: 4,
      ruledOut: 0,
    });
  });

  /**
   * The grouped counts and the rulings are computed from different things, so a
   * curator ruling out more words than a group holds must not produce a
   * negative count on the page.
   */
  it('never reports a negative count', () => {
    expect(
      applyRulings('gul', counts(1, 0), [
        ['kul', 'none'],
        ['bul', 'none'],
        ['mul', 'none'],
      ]),
    ).toMatchObject({ perfect: 0, near: 0 });
  });
});
