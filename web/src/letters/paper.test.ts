import { describe, it, expect } from 'vitest';
import { DECOR_POINTS_MAX, DECOR_STROKES_MAX, DEFAULT_PAPER, PAPER_W, decorBytes, type LetterDecor, type PaperStroke } from '@kurda/shared';
import { PAGE_FOOT, onPage, pagePoint, pointsLeft, pointsUsed, widthFor } from './paper';

/*
 * The sums under the letter's paper: where a pointer is on the page, and how
 * much more drawing a letter can still carry before the page is full.
 */

const line = (points: number): PaperStroke => ({ tool: 'pen', color: 'navy', width: 4, points: Array.from({ length: points * 2 }, (_, i) => (i % 2 ? 100 : i % 1000)) });
const decor = (strokes: PaperStroke[]): LetterDecor => ({ paper: DEFAULT_PAPER, strokes, notes: [] });

describe('the letter’s paper, in sums', () => {
  it('finds a pointer on the page in its own units, whatever size the sheet is shown at', () => {
    expect(pagePoint({ left: 20, top: 100, width: 500 }, 270, 350)).toEqual({ x: 500, y: 500 });
    expect(pagePoint({ left: 0, top: 0, width: 2000 }, 1000, 100)).toEqual({ x: 500, y: 50 });
  });

  it('keeps a point on the page, down to its foot', () => {
    expect(onPage(-20, 40.4, 1414)).toEqual({ x: 0, y: 40 });
    expect(onPage(PAPER_W + 5, 5000, PAGE_FOOT)).toEqual({ x: PAPER_W, y: PAGE_FOOT });
  });

  it('keeps each tool to the widths it draws', () => {
    expect(widthFor('pen', 40)).toBe(10);
    expect(widthFor('brush', 2)).toBe(12);
    expect(widthFor('marker', 16.4)).toBe(16);
  });

  it('counts the points left before the page is full, by count and by size', () => {
    expect(pointsLeft(decor([]))).toBeGreaterThan(5000);
    const half = decor([line(1000), line(1000)]);
    expect(pointsUsed(half.strokes)).toBe(2000);
    // whichever limit comes first: the points, or the bytes they would take
    expect(pointsLeft(half)).toBeLessThanOrEqual(DECOR_POINTS_MAX - 2000);
    expect(decorBytes(half) + pointsLeft(half) * 10).toBeLessThanOrEqual(64 * 1024);
    expect(pointsLeft(decor([line(DECOR_POINTS_MAX)]))).toBe(0);
    expect(pointsLeft(decor(Array.from({ length: DECOR_STROKES_MAX }, () => line(2))))).toBe(0);
  });
});
