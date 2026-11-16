import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
import { FRESH_MS, forgetOrigin, notePress, originOf, resetOrigins, startPlace, startScale } from './origin';

const card = { x: 16, y: 324, width: 175, height: 91 };

beforeEach(resetOrigins);

describe('where a page grows from', () => {
  it('is the thing that was pressed just before the page opened', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1050)).toEqual(card);
  });

  it('is nothing for a page that no press opened', () => {
    expect(originOf('page-1', 1000)).toBeNull();
  });

  /*
   * A page that arrives long after a press (after a request, a timer) was
   * not opened by that press in any way the eye would follow.
   */
  it('is nothing once the press is no longer fresh', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1000 + FRESH_MS + 1)).toBeNull();
  });

  it('still counts a press at the very edge of fresh', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1000 + FRESH_MS)).toEqual(card);
  });

  /*
   * The stack asks about a page every time it draws, and the page itself
   * asks again: the answer is the one given first, however late it is asked.
   */
  it('gives a page the same answer every time it asks', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1010)).toEqual(card);
    expect(originOf('page-1', 9000)).toEqual(card);
    resetOrigins();
    expect(originOf('page-2', 1000)).toBeNull();
    notePress(card, 1100);
    expect(originOf('page-2', 1110)).toBeNull();
  });

  it('lets one press open one page: a second page pushed straight after grows from nothing', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1010)).toEqual(card);
    expect(originOf('page-2', 1020)).toBeNull();
  });

  it('takes the latest of two presses', () => {
    const other = { x: 200, y: 400, width: 170, height: 90 };
    notePress(card, 1000);
    notePress(other, 1100);
    expect(originOf('page-1', 1110)).toEqual(other);
  });

  it('does not keep a press on something with no size, which has no place to grow from', () => {
    notePress({ x: 0, y: 0, width: 0, height: 0 }, 1000);
    expect(originOf('page-1', 1010)).toBeNull();
  });

  it('forgets a page that has gone, so its key can be asked about afresh', () => {
    notePress(card, 1000);
    expect(originOf('page-1', 1010)).toEqual(card);
    forgetOrigin('page-1');
    expect(originOf('page-1', 1020)).toBeNull();
  });
});

describe('how big a page starts', () => {
  it('is the pressed thing’s own share of the screen', () => {
    expect(startScale(195, 390)).toBeCloseTo(0.5);
  });

  it('is never a speck, however small the button it grows from', () => {
    expect(startScale(44, 390)).toBeCloseTo(0.3);
  });

  it('is never more than the page itself', () => {
    expect(startScale(500, 390)).toBe(1);
    expect(startScale(100, 0)).toBe(1);
  });
});

describe('where a page starts', () => {
  it('has its top corner on the card’s own, at the card’s share of the screen', () => {
    expect(startPlace(card, 390)).toEqual({ x: 16, y: 324, scale: 175 / 390 });
  });

  /*
   * The magnifier is 44 points wide at the far edge of the bar. A page a
   * third of the screen wide starting at its left edge would hang off the
   * side of the screen, so it starts as far over as still fits.
   */
  it('keeps a page growing from a button at the far edge on the screen', () => {
    const place = startPlace({ x: 330, y: 60, width: 44, height: 44 }, 390);
    expect(place.scale).toBeCloseTo(0.3);
    expect(place.x).toBeCloseTo(390 * 0.7);
    expect(place.x + 390 * place.scale).toBeLessThanOrEqual(390);
    expect(place.y).toBe(60);
  });

  it('starts on the screen for something pressed partly off it', () => {
    expect(startPlace({ x: -20, y: -8, width: 200, height: 100 }, 390)).toMatchObject({ x: 0, y: 0 });
  });
});
