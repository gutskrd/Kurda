import { describe, it, expect, vi, afterEach } from 'vitest';
import { MAX_EDGE, canvasToFile, fitWithin, fontStack, layoutLines } from './photoText';

afterEach(() => vi.restoreAllMocks());

/** A context whose text width is proportional to the string, so wrapping bites. */
const measuring = (perChar = 10): CanvasRenderingContext2D =>
  ({ measureText: (t: string) => ({ width: t.length * perChar }) }) as CanvasRenderingContext2D;

describe('layoutLines', () => {
  it('keeps the line breaks the author typed', () => {
    // A couplet keeps its two lines.
    expect(layoutLines(measuring(), 'Baran dibare\nser bajêr', 10_000)).toEqual(['Baran dibare', 'ser bajêr']);
  });

  it('wraps a line that would run off the picture', () => {
    const lines = layoutLines(measuring(), 'one two three four five six', 100);
    expect(lines.length).toBeGreaterThan(1);
    // No line may exceed its width.
    for (const line of lines) expect(line.length * 10).toBeLessThanOrEqual(100);
  });

  it('never drops a word while wrapping', () => {
    const words = 'alpha beta gamma delta epsilon zeta';
    expect(layoutLines(measuring(), words, 90).join(' ').split(' ').filter(Boolean)).toEqual(words.split(' '));
  });

  it('keeps a deliberate blank line', () => {
    // An empty line between stanzas is part of the poem.
    expect(layoutLines(measuring(), 'a\n\nb', 10_000)).toEqual(['a', '', 'b']);
  });

  it('does not loop forever on a word wider than the picture', () => {
    const lines = layoutLines(measuring(), 'supercalifragilistic', 30);
    expect(lines).toEqual(['supercalifragilistic']);
  });
});

describe('fontStack', () => {
  it('falls back rather than returning nothing for an unknown face', () => {
    expect(fontStack('sans')).toContain('sans-serif');
    expect(fontStack('nope' as never).length).toBeGreaterThan(0);
  });
});

describe('fitWithin', () => {
  it('brings a phone photo down to the size that will be stored', () => {
    // A 12 MP photo at full resolution is about 19 MB of lossless PNG, over the server's 5 MB cap.
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 960 });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin(400, 300)).toEqual({ width: 400, height: 300 });
  });

  it('fits the longest edge whichever way round the picture is', () => {
    expect(fitWithin(900, 3000).height).toBe(MAX_EDGE);
    expect(fitWithin(3000, 900).width).toBe(MAX_EDGE);
  });
});

describe('canvasToFile', () => {
  /** A canvas whose toBlob answers with the sizes and types a test asks for. */
  function canvasThatEncodes(answers: Record<string, { size: number; type?: string } | null>) {
    const asked: string[] = [];
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((cb, type, quality) => {
      asked.push(`${String(type)}@${String(quality)}`);
      const answer = answers[String(type)];
      if (!answer) return cb(null);
      cb(new Blob([new Uint8Array(answer.size)], { type: answer.type ?? String(type) }));
    });
    return { canvas, asked };
  }

  it('prefers WebP, which keeps transparency and is smallest', async () => {
    const { canvas, asked } = canvasThatEncodes({ 'image/webp': { size: 200_000 } });
    const file = await canvasToFile(canvas, 'dimen');
    expect(file!.type).toBe('image/webp');
    expect(file!.name).toBe('dimen.webp');
    // It stopped at the first thing that worked.
    expect(asked).toHaveLength(1);
  });

  it('falls back to JPEG when WebP cannot be encoded', async () => {
    const { canvas } = canvasThatEncodes({ 'image/webp': null, 'image/jpeg': { size: 300_000 } });
    const file = await canvasToFile(canvas, 'dimen');
    expect(file!.type).toBe('image/jpeg');
    expect(file!.name).toBe('dimen.jpg');
  });

  it('does not trust a browser that quietly hands back a PNG instead', async () => {
    // Browsers may return PNG when asked for WebP, and a lossless photo must not be uploaded.
    const { canvas } = canvasThatEncodes({
      'image/webp': { size: 9_000_000, type: 'image/png' },
      'image/jpeg': { size: 250_000 },
    });
    const file = await canvasToFile(canvas, 'dimen');
    expect(file!.type).toBe('image/jpeg');
  });

  it('steps the quality down rather than exceeding the upload budget', async () => {
    const { canvas, asked } = canvasThatEncodes({ 'image/webp': { size: 200_000 }, 'image/jpeg': { size: 1 } });
    await canvasToFile(canvas, 'dimen');
    expect(asked[0]).toBe('image/webp@0.9');
  });

  it('returns the smallest it managed when nothing fits, rather than nothing', async () => {
    const { canvas } = canvasThatEncodes({
      'image/webp': { size: 9_000_000 },
      'image/jpeg': { size: 8_000_000 },
      'image/png': { size: 12_000_000 },
    });
    const file = await canvasToFile(canvas, 'dimen');
    // The server will reject it and say why; silently posting nothing is worse.
    expect(file!.size).toBe(8_000_000);
  });

  it('gives up honestly when the canvas encodes nothing at all', async () => {
    const { canvas } = canvasThatEncodes({});
    expect(await canvasToFile(canvas, 'dimen')).toBeNull();
  });
});
