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
    // A square out of a landscape picture is as wide as the picture is tall.
    expect(outputSize(1600, 900, 1, WHOLE_PICTURE)).toEqual({ width: 900, height: 900 });
  });

  // Zooming in yields a smaller picture from the crop's own pixels, never an upscaled one.
  it('never enlarges, however far it is zoomed', () => {
    const iw = 4000;
    const ih = 3000;
    let previous = Infinity;

    for (const zoom of [1, 1.5, 2, 3, ZOOM_RANGE.max]) {
      const size = outputSize(iw, ih, 1, at(zoom));
      const crop = cropRect(iw, ih, 1, at(zoom));
      // The output is never bigger than the pixels it came from.
      expect(size.width).toBeLessThanOrEqual(Math.round(crop.sw));
      // It never grows as the crop tightens; above MAX_EDGE the ceiling decides, so it may hold steady.
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
    // Under MAX_EDGE, fitWithin only shrinks, so this is a plain copy.
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

  // The zoom stops where the crop would fall below the floor, so the export is never tiny.
  it('cannot be zoomed below the floor, however hard it is pushed', () => {
    for (const [iw, ih] of [[900, 900], [1000, 750], [4032, 3024], [640, 480]]) {
      const capped = at(maxZoomFor(iw!, ih!, 1));
      const size = outputSize(iw!, ih!, 1, capped);
      const shortest = Math.min(iw!, ih!);
      // Either the floor is met, or the picture was already smaller.
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

  // The graded picture is cached, so a draw before the artwork loads must not count as finished.
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
    // Zero strength: nothing to draw, but nothing pending.
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

  // Sized by width alone, a nearly square artwork would be clipped on a landscape crop.
  it('shrinks rather than overflowing a wide picture', async () => {
    stubImage({ width: 1000, height: 1000 });
    await ensureSticker('/filters/test-flag.webp');
    const { ctx, drawn } = fakeCanvas();

    // 0.6 of 800 is 480 wide, so a square artwork would be taller than 0.6 of 600.
    drawOverlay(ctx, 800, 600, overlay());
    expect(drawn[0]!.h).toBeLessThanOrEqual(600 * 0.6 + 0.001);
    expect(drawn[0]!.w).toBeLessThan(800 * 0.6);
    // The proportions survive.
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
