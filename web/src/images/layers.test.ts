import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ROTATION_RANGE,
  SIZE_RANGE,
  clampLayer,
  drawLayers,
  isPlaced,
  newId,
  signatureBox,
  type Layer,
} from './layers';
import { stubCanvas } from './canvasStubs';

afterEach(() => vi.restoreAllMocks());

const text = (over: Partial<Layer> = {}): Layer =>
  ({
    kind: 'text',
    id: newId(),
    value: 'Welat',
    font: 'sans',
    size: 0.09,
    color: '#ffffff',
    plate: false,
    rotation: 0,
    x: 0.5,
    y: 0.5,
    ...over,
  }) as Layer;

const sticker = (over: Partial<Layer> = {}): Layer =>
  ({ kind: 'sticker', id: newId(), glyph: '❤️', size: 0.14, rotation: 0, x: 0.5, y: 0.5, ...over }) as Layer;

const stroke = (over: Partial<Layer> = {}): Layer =>
  ({ kind: 'stroke', id: newId(), color: '#fff', width: 0.012, points: [{ x: 0.1, y: 0.1 }], ...over }) as Layer;

describe('clampLayer', () => {
  it('turns all the way round rather than stopping at a lean', () => {
    // the old editor allowed -45°..45°, which is a tilt, not a rotation
    expect(ROTATION_RANGE).toEqual({ min: 0, max: 360 });
    for (const [given, expected] of [[0, 0], [359, 359], [360, 0], [370, 10], [-10, 350], [725, 5]]) {
      const turned = clampLayer(text({ rotation: given })) as { rotation: number };
      expect(turned.rotation, `${given}°`).toBe(expected);
    }
  });

  it('holds size and position inside what the controls can express', () => {
    const wild = clampLayer(text({ size: 99, x: -3, y: 4 })) as { size: number; x: number; y: number };
    expect(wild.size).toBe(SIZE_RANGE.max);
    expect(wild.x).toBe(0);
    expect(wild.y).toBe(1);
  });

  it('leaves a stroke where it was drawn', () => {
    // a stroke has no centre to move and no angle to turn
    const s = stroke({ width: 99 }) as { width: number; points: unknown[] };
    const held = clampLayer(s as Layer) as { width: number; points: unknown[] };
    expect(held.width).toBeLessThan(1);
    expect(held.points).toEqual(s.points);
  });
});

describe('isPlaced', () => {
  it('separates what can be picked up from what cannot', () => {
    expect(isPlaced(text())).toBe(true);
    expect(isPlaced(sticker())).toBe(true);
    expect(isPlaced(stroke())).toBe(false);
  });
});

describe('signatureBox', () => {
  it('sits in the bottom-right corner, inset', () => {
    const box = signatureBox(1200, 900, 'hamude');
    expect(box.x + box.w).toBeLessThan(1200);
    expect(box.y + box.h).toBeLessThan(900);
    expect(box.x).toBeGreaterThan(600);
  });

  it('grows with a longer handle, so the shaded corner matches the real mark', () => {
    expect(signatureBox(1200, 900, 'averylonghandle').w).toBeGreaterThan(signatureBox(1200, 900, 'ap').w);
  });

  it('stays on the picture even when the picture is tiny', () => {
    const box = signatureBox(80, 60, 'averylonghandle');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});

describe('drawLayers', () => {
  const image = {} as CanvasImageSource;

  it('draws the picture first, then everything on it in order', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [
      text({ value: 'first' }),
      sticker({ glyph: '🔥' }),
      text({ value: 'last' }),
    ]);

    expect(calls[0]).toBe('clearRect');
    expect(calls[1]).toBe('drawImage');
    // the order they were added is the order they stack
    const drawn = calls.filter((c) => c.startsWith('fillText')).map((c) => c.replace('fillText:', ''));
    expect(drawn).toEqual(['first', '🔥', 'last']);
  });

  it('draws nothing over the signature, because the signature is not a layer', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [text({ value: 'hi' })]);
    // the mark is added afterwards by the server, which is what makes it
    // impossible to cover — nothing here can be told to draw it
    expect(calls.some((c) => c.includes('@'))).toBe(false);
  });

  it('draws a single tap as a dot rather than nothing', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [stroke({ points: [{ x: 0.4, y: 0.4 }] })]);
    // one point is a tap, and a tap should leave a mark; a path with no second
    // point strokes nothing at all
    expect(calls).toContain('lineTo');
    expect(calls).toContain('stroke');
  });

  it('draws a dragged stroke through every point it passed', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [
      stroke({ points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.25 }] }),
    ]);
    // one moveTo and a lineTo per point after it
    expect(calls.filter((c) => c === 'lineTo')).toHaveLength(2);
  });

  it('draws nothing for a stroke with no points', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [stroke({ points: [] })]);
    expect(calls).not.toContain('stroke');
  });

  it('sizes against the shorter edge, so a layout travels between screens', () => {
    stubCanvas();
    const canvas = document.createElement('canvas');
    drawLayers(canvas, image, 2000, 500, [text({ value: 'hi', size: 0.1 })]);
    // 500 * 0.1, not 2000 * 0.1
    expect(canvas.getContext('2d')!.font).toContain('50px');
  });

  it('skips words that are only whitespace', () => {
    const { calls } = stubCanvas();
    drawLayers(document.createElement('canvas'), image, 900, 700, [text({ value: '   ', plate: true })]);
    // a plate and a shadow behind nothing would be a mark on the picture
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(false);
    expect(calls).not.toContain('fill');
  });
});
