import { describe, expect, it } from 'vitest';
import { detentHeights, dragOffset, restingOffsets, settleSheet } from './sheetMotion';

describe('the heights a sheet rests at', () => {
  it('makes medium half the screen and large the tallest a sheet may be', () => {
    expect(detentHeights(['medium', 'large'], 800)).toEqual([400, 720]);
  });

  it('takes shares of the screen, sorted, never past the tallest, and each once', () => {
    expect(detentHeights([0.95, 0.3, 'large'], 800)).toEqual([240, 720]);
  });

  it('has none for a sheet as tall as its content', () => {
    expect(detentHeights(undefined, 800)).toEqual([]);
    expect(detentHeights([], 800)).toEqual([]);
  });

  it('rests a sheet with medium and large 320 points lower at medium', () => {
    expect(restingOffsets([400, 720])).toEqual([0, 320]);
    expect(restingOffsets([])).toEqual([0]);
  });
});

describe('a sheet under a finger', () => {
  const sheet = { stops: [0, 320], height: 720, dismissible: true };

  it('follows the finger one to one between its resting places, and down towards closing', () => {
    expect(dragOffset(320, -100, sheet)).toBe(220);
    expect(dragOffset(320, 150, sheet)).toBe(470);
  });

  it('gives with the rubber band above the tallest', () => {
    // 100 points past the top of a 720-point sheet shows as 51.1
    expect(dragOffset(0, -100, sheet)).toBeCloseTo(-51.1, 1);
    expect(dragOffset(0, -100, sheet)).toBeGreaterThan(-100);
  });

  it('gives below the lowest too while it may not close', () => {
    expect(dragOffset(320, 100, { ...sheet, dismissible: false })).toBeCloseTo(371.1, 1);
  });
});

describe('a sheet let go', () => {
  const sheet = { stops: [0, 320], height: 720, dismissible: true };

  it('settles at the nearest resting place when let go slowly', () => {
    expect(settleSheet(100, 0, sheet)).toBe(0);
    expect(settleSheet(250, 0, sheet)).toBe(320);
  });

  it('follows a flick up to large from near medium', () => {
    // 280 − 249.5 = 30.5: nearer the top
    expect(settleSheet(280, -500, sheet)).toBe(0);
  });

  it('closes when let go past half of what shows at medium, or flicked down from it', () => {
    // 400 points show at medium; half of them is 200 below the medium offset
    expect(settleSheet(519, 0, sheet)).toBe(320);
    expect(settleSheet(521, 0, sheet)).toBe('close');
    expect(settleSheet(340, 500, sheet)).toBe('close');
  });

  it('never closes a sheet that may not close', () => {
    expect(settleSheet(700, 2000, { ...sheet, dismissible: false })).toBe(320);
  });

  it('closes a sheet as tall as its content past half its height', () => {
    const plain = { stops: [0], height: 300, dismissible: true };
    expect(settleSheet(140, 0, plain)).toBe(0);
    expect(settleSheet(160, 0, plain)).toBe('close');
  });
});
