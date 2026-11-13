import { describe, expect, it } from 'vitest';
import { detentHeights, dragOffset, leaveMs, restingOffsets, settleSheet } from './sheetMotion';

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

describe('how long a sheet takes to leave', () => {
  it('takes the time anything leaving takes when nothing was moving it', () => {
    expect(leaveMs(500, 0, 200, 120)).toBe(200);
    // a flick back up that still closed it (dragged past halfway) is no speed towards leaving
    expect(leaveMs(500, -300, 200, 120)).toBe(200);
  });

  it('is sooner when the finger was already taking it faster, and never slower than that', () => {
    // 300 points at 3000 a second is a tenth of a second: not shorter than the least, though
    expect(leaveMs(300, 3000, 200, 120)).toBe(120);
    expect(leaveMs(450, 3000, 200, 120)).toBe(150);
    // a gentle let-go would take longer than everything else does: it does not
    expect(leaveMs(450, 600, 200, 120)).toBe(200);
  });

  it('has nowhere to go once it is off the screen', () => {
    expect(leaveMs(0, 0, 200, 120)).toBe(120);
    expect(leaveMs(-20, 900, 200, 120)).toBe(120);
  });
});

