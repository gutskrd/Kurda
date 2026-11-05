import { describe, expect, it } from 'vitest';
import { EARLIEST_BIRTH_YEAR, ageInYears } from '@kurda/shared';
import { RULER, ageAtOffset, ageRange, birthYearFrom, chosenAtOffset, offsetForAge, stepAge } from './age';

/*
 * The ruler's arithmetic: the ages it runs over, where each sits and which
 * one a scroll lands on, which scroll chooses an age, a screen reader's step,
 * and the birth year an age and a month come to — the year the server counts
 * back to the same age.
 */

const TODAY = new Date('2026-11-04T12:00:00Z');

describe('the age ruler’s arithmetic', () => {
  it('runs from one to whoever was born in the earliest year the server takes', () => {
    expect(ageRange(TODAY)).toEqual({ min: 1, max: 2026 - EARLIEST_BIRTH_YEAR });
  });

  it('puts one year a tick apart, and lands a scroll on the nearest year', () => {
    const range = ageRange(TODAY);
    expect(offsetForAge(1, range.min)).toBe(0);
    expect(offsetForAge(20, range.min)).toBe(19 * RULER.tick);
    expect(ageAtOffset(offsetForAge(34, range.min), range)).toBe(34);
    // a little past a tick is still that year; nearer the next is the next
    expect(ageAtOffset(19 * RULER.tick + RULER.tick * 0.4, range)).toBe(20);
    expect(ageAtOffset(19 * RULER.tick + RULER.tick * 0.6, range)).toBe(21);
  });

  it('never lands outside the range, however far the ruler flies', () => {
    const range = ageRange(TODAY);
    expect(ageAtOffset(-500, range)).toBe(range.min);
    expect(ageAtOffset(1e6, range)).toBe(range.max);
  });

  it('chooses no age until the ruler moves off the year it rests on, and nothing for a scroll that stays put', () => {
    const range = ageRange(TODAY);
    // at rest, on the youngest year: nobody has answered yet
    expect(chosenAtOffset(0, null, range)).toBeNull();
    expect(chosenAtOffset(RULER.tick * 0.4, null, range)).toBeNull();
    // the first year it moves to is the answer, young or old
    expect(chosenAtOffset(offsetForAge(2, range.min), null, range)).toBe(2);
    expect(chosenAtOffset(offsetForAge(34, range.min), null, range)).toBe(34);
    // once an age is chosen, coming back to the first year is a choice too, and staying on a year is none
    expect(chosenAtOffset(0, 5, range)).toBe(range.min);
    expect(chosenAtOffset(offsetForAge(34, range.min), 34, range)).toBeNull();
  });

  it('steps a year each way for a screen reader, and stops at the ends', () => {
    const range = ageRange(TODAY);
    expect(stepAge(20, 'increment', range)).toBe(21);
    expect(stepAge(20, 'decrement', range)).toBe(19);
    expect(stepAge(range.min, 'decrement', range)).toBe(range.min);
    expect(stepAge(range.max, 'increment', range)).toBe(range.max);
  });

  it('counts the birth year back from this year, one more when the birthday is still to come', () => {
    // November: a March birthday has passed, a December one has not, and one this month counts as not yet
    expect(birthYearFrom(20, 3, TODAY)).toBe(2006);
    expect(birthYearFrom(20, 12, TODAY)).toBe(2005);
    expect(birthYearFrom(20, 11, TODAY)).toBe(2005);
    // the month unchosen: this year less the age
    expect(birthYearFrom(20, null, TODAY)).toBe(2006);
  });

  it('comes to the age that was said, the way the server counts it', () => {
    for (const age of [13, 20, 47, 99]) {
      for (let month = 1; month <= 12; month++) {
        expect(ageInYears({ year: birthYearFrom(age, month, TODAY), month }, TODAY), `${age} born in month ${month}`).toBe(age);
      }
    }
  });
});
