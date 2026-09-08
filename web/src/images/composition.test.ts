import { describe, expect, it } from 'vitest';
import { aspectOf, outputSize, UNTOUCHED, type Composition } from './composition';
import { MIN_EXPORT_EDGE, WHOLE_PICTURE, ZOOM_RANGE, cropRect, maxZoomFor } from './frame';
import { MAX_EDGE } from './photoText';

const at = (zoom: number): Composition['frame'] => ({ zoom, cx: 0.5, cy: 0.5 });

describe('outputSize', () => {
  it('is the whole picture when nothing has been cropped away', () => {
    expect(outputSize(1000, 750, 4 / 3, WHOLE_PICTURE)).toEqual({ width: 1000, height: 750 });
  });

  it('takes only what the shape leaves', () => {
    // a square out of a landscape picture is as wide as the picture is tall
    expect(outputSize(1600, 900, 1, WHOLE_PICTURE)).toEqual({ width: 900, height: 900 });
  });

  /**
   * The bug this replaced. The export size used to be fixed per shape and held
   * constant through the zoom, so closing in sampled fewer source pixels and
   * then stretched them back up to the same output — a five-fold upscale of a
   * fifth of the picture by the top of the range. Zooming in now yields a
   * smaller picture, never a softer one.
   */
  it('never enlarges, however far it is zoomed', () => {
    const iw = 4000;
    const ih = 3000;
    let previous = Infinity;

    for (const zoom of [1, 1.5, 2, 3, ZOOM_RANGE.max]) {
      const size = outputSize(iw, ih, 1, at(zoom));
      const crop = cropRect(iw, ih, 1, at(zoom));
      // the output is never bigger than the pixels it came from — this is the
      // whole fix, and the reason a zoomed picture stays sharp
      expect(size.width).toBeLessThanOrEqual(Math.round(crop.sw));
      // and it never grows as the crop tightens. It can hold steady rather than
      // fall while the crop is still above MAX_EDGE, because there the ceiling
      // is what decides the size, not the crop.
      expect(size.width).toBeLessThanOrEqual(previous);
      previous = size.width;
    }
  });

  it('starts shrinking once the crop drops under the ceiling', () => {
    const wide = outputSize(4000, 3000, 1, at(2));
    const tight = outputSize(4000, 3000, 1, at(ZOOM_RANGE.max));
    expect(wide.width).toBe(MAX_EDGE);
    expect(tight.width).toBeLessThan(wide.width);
    expect(tight.width).toBe(Math.round(cropRect(4000, 3000, 1, at(ZOOM_RANGE.max)).sw));
  });

  it('samples one-for-one once the crop is under the ceiling', () => {
    const iw = 4000;
    const ih = 3000;
    const crop = cropRect(iw, ih, 1, at(3));
    const size = outputSize(iw, ih, 1, at(3));
    // under MAX_EDGE, fitWithin only ever shrinks — so this is a plain copy
    expect(Math.round(crop.sw)).toBeLessThanOrEqual(MAX_EDGE);
    expect(size).toEqual({ width: Math.round(crop.sw), height: Math.round(crop.sh) });
  });

  it('still refuses to exceed the ceiling on a huge picture', () => {
    const size = outputSize(8000, 6000, 4 / 3, WHOLE_PICTURE);
    expect(Math.max(size.width, size.height)).toBe(MAX_EDGE);
  });

  it('honours a lower ceiling for something shown small', () => {
    const size = outputSize(4000, 4000, 1, WHOLE_PICTURE, 768);
    expect(size).toEqual({ width: 768, height: 768 });
  });

  /**
   * The two halves of the fix meet here: the zoom stops where the crop would
   * fall below what is worth posting, so the export can never come out tiny.
   */
  it('cannot be zoomed below the floor, however hard it is pushed', () => {
    for (const [iw, ih] of [[900, 900], [1000, 750], [4032, 3024], [640, 480]]) {
      const capped = at(maxZoomFor(iw!, ih!, 1));
      const size = outputSize(iw!, ih!, 1, capped);
      const shortest = Math.min(iw!, ih!);
      // either the floor is met, or the picture was already smaller than it
      expect(Math.max(size.width, size.height)).toBeGreaterThanOrEqual(Math.min(MIN_EXPORT_EDGE, shortest));
    }
  });

  it('keeps the shape it was framed to', () => {
    for (const zoom of [1, 2, 3]) {
      const size = outputSize(4000, 3000, 4 / 5, at(zoom));
      expect(size.width / size.height).toBeCloseTo(4 / 5, 2);
    }
  });
});

describe('aspectOf', () => {
  it('falls back to the picture’s own ratio', () => {
    expect(aspectOf(UNTOUCHED, 1600, 900)).toBeCloseTo(16 / 9, 6);
  });

  it('uses the chosen shape when there is one', () => {
    expect(aspectOf({ ...UNTOUCHED, aspectKey: 'square' }, 1600, 900)).toBe(1);
  });

  it('survives a key that is no longer in the list', () => {
    expect(aspectOf({ ...UNTOUCHED, aspectKey: 'gone' }, 1000, 500)).toBeCloseTo(2, 6);
  });
});
