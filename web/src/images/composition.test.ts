import { afterEach, describe, expect, it, vi } from 'vitest';
import { aspectOf, drawOverlay, outputSize, UNTOUCHED, type Composition } from './composition';
import type { Overlay } from './filters';
import { ensureSticker } from './stickers';
import { stubImage } from './canvasStubs';
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

describe('drawOverlay', () => {
  interface Drawn {
    left: number;
    top: number;
    w: number;
    h: number;
    alpha: number;
  }

  function fakeCanvas(): { ctx: CanvasRenderingContext2D; drawn: Drawn[] } {
    const drawn: Drawn[] = [];
    const ctx = {
      globalAlpha: 1,
      save() {},
      restore() {},
      drawImage(_img: unknown, left: number, top: number, w: number, h: number) {
        drawn.push({ left, top, w, h, alpha: (this as { globalAlpha: number }).globalAlpha });
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
  }

  const overlay = (over: Partial<Overlay> = {}): Overlay => ({
    src: '/filters/test-flag.webp',
    widthShare: 0.6,
    maxHeightShare: 0.6,
    opacity: 1,
    ...over,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The bug this guards. The graded picture is cached, and the artwork loads
   * asynchronously — so the first draw happens before the flag exists. If that
   * counted as finished it would be cached, and every later draw would hit the
   * cache and hand back the same flagless picture for ever. The flag could
   * never appear, however long you waited.
   */
  it('reports itself unfinished when the artwork has not arrived', () => {
    const { ctx, drawn } = fakeCanvas();
    expect(drawOverlay(ctx, 800, 600, overlay())).toBe(false);
    expect(drawn).toEqual([]);
  });

  it('draws, and reports itself finished, once the artwork is there', async () => {
    stubImage({ width: 1000, height: 1000 });
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();

    expect(drawOverlay(ctx, 800, 600, overlay())).toBe(true);
    expect(drawn).toHaveLength(1);
  });

  it('counts a fully faded overlay as finished, not as missing', async () => {
    stubImage();
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();
    // strength turned to zero: there is nothing to draw, but nothing is pending
    expect(drawOverlay(ctx, 800, 600, overlay({ opacity: 0 }))).toBe(true);
    expect(drawn).toEqual([]);
  });

  it('anchors it to the top right corner', async () => {
    stubImage({ width: 1000, height: 1000 });
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();
    drawOverlay(ctx, 800, 600, overlay());
    expect(drawn[0]!.top).toBe(0);
    expect(drawn[0]!.left + drawn[0]!.w).toBeCloseTo(800, 6);
  });

  /**
   * Sized by width alone, a nearly square artwork hangs off the bottom of a
   * landscape crop — and a canvas clips that without saying so, which would
   * quietly cost the flag its lower half on the shape most photographs are.
   */
  it('shrinks rather than overflowing a wide picture', async () => {
    stubImage({ width: 1000, height: 1000 });
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();

    // 0.6 of 800 is 480 wide, which on a square artwork would be 480 tall —
    // taller than 0.6 of a 600px picture
    drawOverlay(ctx, 800, 600, overlay());
    expect(drawn[0]!.h).toBeLessThanOrEqual(600 * 0.6 + 0.001);
    expect(drawn[0]!.w).toBeLessThan(800 * 0.6);
    // and the proportions survive it
    expect(drawn[0]!.w / drawn[0]!.h).toBeCloseTo(1, 6);
  });

  it('carries the strength through as opacity', async () => {
    stubImage();
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();
    drawOverlay(ctx, 400, 400, overlay({ opacity: 0.35 }));
    expect(drawn[0]!.alpha).toBeCloseTo(0.35, 6);
  });
});
