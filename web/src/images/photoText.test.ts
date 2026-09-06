import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_TEXT,
  ROTATION_RANGE,
  SIZE_RANGE,
  clampText,
  drawComposition,
  fontStack,
  layoutLines,
  type TextLayer,
} from './photoText';
import { stubCanvas } from './canvasStubs';

afterEach(() => vi.restoreAllMocks());

/** A context whose text width is proportional to the string, so wrapping bites. */
const measuring = (perChar = 10): CanvasRenderingContext2D =>
  ({ measureText: (t: string) => ({ width: t.length * perChar }) }) as CanvasRenderingContext2D;

describe('layoutLines', () => {
  it('keeps the line breaks the author typed', () => {
    // someone writing a couplet means those two lines
    expect(layoutLines(measuring(), 'Baran dibare\nser bajêr', 10_000)).toEqual(['Baran dibare', 'ser bajêr']);
  });

  it('wraps a line that would run off the picture', () => {
    const lines = layoutLines(measuring(), 'one two three four five six', 100);
    expect(lines.length).toBeGreaterThan(1);
    // no line may exceed the width it was given
    for (const line of lines) expect(line.length * 10).toBeLessThanOrEqual(100);
  });

  it('never drops a word while wrapping', () => {
    const words = 'alpha beta gamma delta epsilon zeta';
    expect(layoutLines(measuring(), words, 90).join(' ').split(' ').filter(Boolean)).toEqual(words.split(' '));
  });

  it('keeps a deliberate blank line', () => {
    // an empty line between stanzas is part of the poem
    expect(layoutLines(measuring(), 'a\n\nb', 10_000)).toEqual(['a', '', 'b']);
  });

  it('does not loop forever on a word wider than the picture', () => {
    const lines = layoutLines(measuring(), 'supercalifragilistic', 30);
    expect(lines).toEqual(['supercalifragilistic']);
  });
});

describe('clampText', () => {
  it('holds size and rotation inside what the controls offer', () => {
    const wild = clampText({ ...DEFAULT_TEXT, size: 99, rotation: 900, x: -4, y: 8 });
    expect(wild.size).toBe(SIZE_RANGE.max);
    expect(wild.rotation).toBe(ROTATION_RANGE.max);
    expect(wild.x).toBe(0);
    expect(wild.y).toBe(1);
  });

  it('leaves a sensible layer untouched', () => {
    const fine: TextLayer = { ...DEFAULT_TEXT, size: 0.1, rotation: -12, x: 0.4, y: 0.6 };
    expect(clampText(fine)).toEqual(fine);
  });
});

describe('fontStack', () => {
  it('falls back rather than returning nothing for an unknown face', () => {
    expect(fontStack('sans')).toContain('sans-serif');
    expect(fontStack('nope' as never).length).toBeGreaterThan(0);
  });
});

describe('drawComposition', () => {
  const image = {} as CanvasImageSource;

  it('draws the picture at its own resolution', () => {
    const { calls } = stubCanvas();
    const canvas = document.createElement('canvas');
    drawComposition(canvas, image, 1200, 900, null);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(900);
    expect(calls).toContain('drawImage');
    // no words asked for, so none drawn
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(false);
  });

  it('draws each line of the words', () => {
    const { calls } = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, {
      ...DEFAULT_TEXT,
      value: 'Çiya\nWelat',
    });
    expect(calls).toContain('fillText:Çiya');
    expect(calls).toContain('fillText:Welat');
  });

  it('treats blank words as no words at all', () => {
    const { calls } = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, { ...DEFAULT_TEXT, value: '   ' });
    // a plate and a shadow behind nothing would be a mark on the picture
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(false);
    expect(calls).not.toContain('fill');
  });

  it('turns the words when asked, and leaves them straight when not', () => {
    const turned = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, { ...DEFAULT_TEXT, value: 'hi', rotation: 30 });
    expect(turned.calls).toContain('rotate:0.524');

    vi.restoreAllMocks();
    const straight = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, { ...DEFAULT_TEXT, value: 'hi', rotation: 0 });
    expect(straight.calls).toContain('rotate:0.000');
  });

  it('draws the backing plate only when it is wanted', () => {
    const withPlate = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, { ...DEFAULT_TEXT, value: 'hi', plate: true });
    expect(withPlate.calls).toContain('fill');

    vi.restoreAllMocks();
    const without = stubCanvas();
    drawComposition(document.createElement('canvas'), image, 900, 700, { ...DEFAULT_TEXT, value: 'hi', plate: false });
    expect(without.calls).not.toContain('fill');
  });

  it('sizes the words against the shorter edge, so a layout travels', () => {
    // composed on a phone, stored at full size — the words must land in the same
    // place relative to the picture either way
    const wide = stubCanvas();
    const canvas = document.createElement('canvas');
    drawComposition(canvas, image, 2000, 500, { ...DEFAULT_TEXT, value: 'hi', size: 0.1 });
    const ctx = canvas.getContext('2d')!;
    expect(ctx.font).toContain('50px'); // 500 * 0.1, not 2000 * 0.1
    expect(wide.calls).toContain('fillText:hi');
  });
});
