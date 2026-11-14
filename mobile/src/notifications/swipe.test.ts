import { describe, expect, it } from 'vitest';
import { SWIPE, swipeClaims, swipeOffset, swipeRest, swipeTakesAway } from './swipe';

describe('a notification row pulled aside', () => {
  it('opens on two buttons’ width and is taken away past most of the row, as on the website', () => {
    expect(SWIPE.open).toBe(168);
    expect(SWIPE.away).toBe(0.62);
  });

  it('decides in the first few points whether it is a pull aside or the list scrolling', () => {
    expect(swipeClaims(4, 1)).toBeNull();
    expect(swipeClaims(-8, 2)).toBe(true);
    expect(swipeClaims(9, 0)).toBe(true);
    // up or down first is a scroll, and stays one
    expect(swipeClaims(3, 12)).toBe(false);
    expect(swipeClaims(9, 11)).toBe(false);
    // diagonal but more across than down still pulls the row
    expect(swipeClaims(14, 11)).toBe(true);
  });

  it('follows the finger, gives a little past its stops, and never leaves its own width', () => {
    expect(swipeOffset(0, -100, 360)).toBe(-100);
    // the wrong way it hardly moves
    expect(swipeOffset(0, 50, 360)).toBe(10);
    // past open it still goes, a little slower
    expect(swipeOffset(-SWIPE.open, -50, 360)).toBe(-SWIPE.open - 40);
    expect(swipeOffset(0, -900, 360)).toBe(-360);
  });

  it('rests open past halfway, closed short of it, and is taken away most of the way across', () => {
    expect(swipeRest(-60, 360)).toBe('closed');
    expect(swipeRest(-90, 360)).toBe('open');
    expect(swipeRest(-200, 360)).toBe('open');
    expect(swipeTakesAway(-224, 360)).toBe(true);
    expect(swipeRest(-224, 360)).toBe('away');
  });

  it('opens or closes on a flick wherever it is let go, but takes nothing away on one', () => {
    expect(swipeRest(-30, 360, -900)).toBe('open');
    expect(swipeRest(-150, 360, 900)).toBe('closed');
    expect(swipeRest(-150, 360, -5000)).toBe('open');
    // a flick the wrong way at rest opens nothing
    expect(swipeRest(0, 360, -900)).toBe('closed');
  });
});
