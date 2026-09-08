import { describe, expect, it } from 'vitest';
import {
  ASPECTS,
  WHOLE_PICTURE,
  ZOOM_RANGE,
  clampFrame,
  cropRect,
  isWholePicture,
  panFrame,
  ratioFor,
  widestCrop,
  zoomFrame,
  type Frame,
} from './frame';

/** The one thing that must never break: the crop lies inside the picture. */
function expectInside(iw: number, ih: number, aspect: number, frame: Frame): void {
  const c = cropRect(iw, ih, aspect, frame);
  expect(c.sx).toBeGreaterThanOrEqual(-1e-9);
  expect(c.sy).toBeGreaterThanOrEqual(-1e-9);
  expect(c.sx + c.sw).toBeLessThanOrEqual(iw + 1e-9);
  expect(c.sy + c.sh).toBeLessThanOrEqual(ih + 1e-9);
  expect(c.sw / c.sh).toBeCloseTo(aspect, 6);
}

describe('widestCrop', () => {
  it('takes the full height of a landscape picture for a square', () => {
    expect(widestCrop(1600, 900, 1)).toEqual({ w: 900, h: 900 });
  });
  it('takes the full width of a portrait picture for a square', () => {
    expect(widestCrop(900, 1600, 1)).toEqual({ w: 900, h: 900 });
  });
  it('is the whole picture when the shape already matches', () => {
    expect(widestCrop(1600, 900, 16 / 9)).toEqual({ w: 1600, h: 900 });
  });
});

describe('cropRect', () => {
  it('covers the whole picture at zoom 1 when the shape matches', () => {
    const c = cropRect(1600, 900, 16 / 9, WHOLE_PICTURE);
    expect(c).toEqual({ sx: 0, sy: 0, sw: 1600, sh: 900 });
  });

  it('centres a square crop in a landscape picture', () => {
    const c = cropRect(1600, 900, 1, WHOLE_PICTURE);
    expect(c).toEqual({ sx: 350, sy: 0, sw: 900, sh: 900 });
  });

  it('halves the crop at zoom 2', () => {
    const c = cropRect(1600, 900, 1, { zoom: 2, cx: 0.5, cy: 0.5 });
    expect(c.sw).toBe(450);
    expect(c.sh).toBe(450);
  });

  it('stays inside the picture at every zoom and corner', () => {
    for (const [iw, ih] of [[1600, 900], [900, 1600], [1000, 1000], [4032, 3024]]) {
      for (const aspect of [1, 4 / 5, 16 / 9]) {
        for (const zoom of [1, 1.5, 3, ZOOM_RANGE.max]) {
          for (const [cx, cy] of [[0, 0], [1, 1], [0.5, 0.5], [-5, 9]]) {
            expectInside(iw!, ih!, aspect, { zoom, cx: cx!, cy: cy! });
          }
        }
      }
    }
  });
});

describe('clampFrame', () => {
  it('holds zoom inside its range', () => {
    expect(clampFrame(1000, 1000, 1, { zoom: 99, cx: 0.5, cy: 0.5 }).zoom).toBe(ZOOM_RANGE.max);
    expect(clampFrame(1000, 1000, 1, { zoom: 0.1, cx: 0.5, cy: 0.5 }).zoom).toBe(ZOOM_RANGE.min);
  });

  it('centres an axis the crop spans completely', () => {
    // a square crop of a landscape picture is as tall as the picture, so there
    // is nowhere to move it vertically however hard you drag
    const f = clampFrame(1600, 900, 1, { zoom: 1, cx: 0.5, cy: 0.9 });
    expect(f.cy).toBe(0.5);
  });

  it('leaves room to move on the axis that has slack', () => {
    const f = clampFrame(1600, 900, 1, { zoom: 1, cx: 0.9, cy: 0.5 });
    expect(f.cx).toBeLessThan(0.9);
    expect(f.cx).toBeGreaterThan(0.5);
  });
});

describe('panFrame', () => {
  it('moves the frame opposite the drag', () => {
    // dragging the picture rightwards reveals what was off to the left
    const moved = panFrame(1600, 900, 1, { zoom: 2, cx: 0.5, cy: 0.5 }, 40, 0, 400, 400);
    expect(moved.cx).toBeLessThan(0.5);
  });

  it('will not drag the crop off the picture', () => {
    let f: Frame = { zoom: 1, cx: 0.5, cy: 0.5 };
    for (let i = 0; i < 50; i++) f = panFrame(1600, 900, 1, f, 500, 500, 400, 400);
    expectInside(1600, 900, 1, f);
  });

  it('ignores a box with no size rather than dividing by zero', () => {
    const f = { zoom: 2, cx: 0.5, cy: 0.5 };
    expect(panFrame(1600, 900, 1, f, 10, 10, 0, 0)).toBe(f);
  });
});

describe('zoomFrame', () => {
  it('keeps the anchored point of the picture under the anchor', () => {
    const iw = 1600, ih = 900, aspect = 1;
    const start: Frame = { zoom: 1.2, cx: 0.5, cy: 0.5 };
    const ax = 0.2, ay = 0.8;
    const before = cropRect(iw, ih, aspect, start);
    const pointBefore = { x: before.sx + ax * before.sw, y: before.sy + ay * before.sh };

    const after = zoomFrame(iw, ih, aspect, start, 2.4, ax, ay);
    const c = cropRect(iw, ih, aspect, after);
    expect(c.sx + ax * c.sw).toBeCloseTo(pointBefore.x, 4);
    expect(c.sy + ay * c.sh).toBeCloseTo(pointBefore.y, 4);
  });

  it('zooms about the middle when given no anchor', () => {
    const f = zoomFrame(1000, 1000, 1, WHOLE_PICTURE, 2);
    expect(f.cx).toBeCloseTo(0.5, 6);
    expect(f.cy).toBeCloseTo(0.5, 6);
  });

  it('stays inside the picture when the anchor is at a corner', () => {
    const f = zoomFrame(1600, 900, 1, WHOLE_PICTURE, ZOOM_RANGE.max, 0, 0);
    expectInside(1600, 900, 1, f);
  });
});

describe('shapes', () => {
  it('falls back to the picture’s own ratio for “original”', () => {
    expect(ratioFor(null, 1600, 900)).toBeCloseTo(16 / 9, 6);
    expect(ASPECTS[0]!.ratio).toBeNull();
  });
  it('survives a zero-height picture rather than returning NaN', () => {
    expect(ratioFor(null, 100, 0)).toBe(1);
  });
  it('knows an untouched frame', () => {
    expect(isWholePicture(WHOLE_PICTURE)).toBe(true);
    expect(isWholePicture({ zoom: 1.2, cx: 0.5, cy: 0.5 })).toBe(false);
  });
});
