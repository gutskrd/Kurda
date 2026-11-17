import { describe, expect, it } from 'vitest';
import {
  decorative,
  MIN_REACH,
  MIN_TOUCH_TARGET,
  REACH_OPEN,
  reachRoom,
  reachSlop,
} from './a11y';

describe('decorative', () => {
  it('hides the element from assistive tech on both platforms', () => {
    expect(decorative()).toEqual({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('reach', () => {
  const even = (n: number) => ({ top: n, bottom: n, left: n, right: n });

  it('pads each side by half of what a control lacks of the reach', () => {
    expect(reachSlop(36, 36)).toEqual(even(6));
    expect(reachSlop(44, 44)).toEqual(even(2));
    // And so a padded control answers over exactly the reach.
    const slop = reachSlop(30, 30);
    expect(30 + slop.left + slop.right).toBe(MIN_REACH);
  });

  it('adds nothing to a side that is already the reach or more', () => {
    expect(reachSlop(48, 48)).toEqual(even(0));
    expect(reachSlop(56, 56)).toEqual(even(0));
    expect(reachSlop(120, 30)).toEqual({ top: 9, bottom: 9, left: 0, right: 0 });
  });

  it('reaches past every edge of a control that stands alone, at least by the open reach', () => {
    expect(reachSlop(44, 44, { edge: REACH_OPEN })).toEqual(even(8));
    // A small one still grows to the reach, which is further.
    expect(reachSlop(30, 30, { edge: REACH_OPEN })).toEqual(even(9));
    expect(reachSlop(56, 56, { edge: REACH_OPEN })).toEqual(even(8));
  });

  it('grows along one axis when asked', () => {
    expect(reachSlop(30, 30, { axis: 'y' })).toEqual({ top: 9, bottom: 9, left: 0, right: 0 });
    expect(reachSlop(30, 30, { axis: 'x' })).toEqual({ top: 0, bottom: 0, left: 9, right: 9 });
  });

  it('guesses nothing for a side whose size is not known', () => {
    expect(reachSlop(null, null)).toEqual(even(0));
    expect(reachSlop(null, 36)).toEqual({ top: 6, bottom: 6, left: 0, right: 0 });
    // The open reach does not depend on the size, so it still holds.
    expect(reachSlop(null, null, { edge: REACH_OPEN })).toEqual(even(8));
  });

  it('caps each side by the limit a neighbour sets, and leaves an uncapped side alone', () => {
    expect(reachSlop(30, 30, { limit: { left: 2, right: 2 } })).toEqual({ top: 9, bottom: 9, left: 2, right: 2 });
    expect(reachSlop(30, 30, { limit: { top: 0 } })).toEqual({ top: 0, bottom: 9, left: 9, right: 9 });
    expect(reachSlop(30, 30, { limit: null })).toEqual(even(9));
    // A cap never makes a reach larger.
    expect(reachSlop(44, 44, { limit: { top: 20 } })).toEqual(even(2));
  });

  it('gives a scroller room for its row’s reach without moving the row', () => {
    expect(reachRoom(6)).toEqual({ content: { paddingTop: 6, paddingBottom: 6 }, scroller: { marginTop: -6, marginBottom: -6 } });
    expect(reachRoom(6, 2)).toEqual({ content: { paddingTop: 6, paddingBottom: 2 }, scroller: { marginTop: -6, marginBottom: -2 } });
  });

  it('answers a finger over more than what is drawn', () => {
    expect(MIN_REACH).toBeGreaterThan(MIN_TOUCH_TARGET);
  });
});
