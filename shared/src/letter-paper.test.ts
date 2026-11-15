import { describe, expect, it } from 'vitest';
import {
  DECOR_BYTES_MAX,
  DECOR_POINTS_MAX,
  DECOR_STROKES_MAX,
  DEFAULT_PAPER,
  DRAW_TOOLS,
  INKS,
  INK_CONTRAST_MIN,
  NOTES_MAX,
  NOTE_MAX,
  PAINTS,
  PAPER_H,
  PAPER_PAGES,
  PAPER_RULE,
  PAPER_STYLES,
  PAPER_TONES,
  PAPER_TOP,
  PAPER_W,
  STROKE_WIDTHS,
  WIDGET_EXCERPT_MAX,
  checkLetterDecor,
  contrastRatio,
  decorBytes,
  decorErrorCode,
  inkOn,
  isPlainDecor,
  isRtlText,
  paintColor,
  paperColors,
  paperOf,
  simplifyStroke,
  strokePath,
  widgetExcerpt,
  type DecorProblem,
  type LetterDecor,
  type PaperNote,
  type PaperStroke,
} from './letter-paper.js';

const paper = { style: 'margin', tone: 'sky', ink: 'teal' } as const;
const line = (over: Partial<PaperStroke> = {}): PaperStroke => ({ tool: 'pen', color: 'navy', width: 4, points: [100, 200, 140, 230, 200, 260], ...over });
const note = (over: Partial<PaperNote> = {}): PaperNote => ({ text: 'Silav hevalê min!', x: 500, y: 400, size: 'm', color: 'crimson', turn: -6, ...over });
const decor = (over: Partial<LetterDecor> = {}): LetterDecor => ({ paper, strokes: [line()], notes: [note()], ...over });
const problem = (raw: unknown, strokes = true): DecorProblem | null => {
  const r = checkLetterDecor(raw, { strokes });
  return r.ok ? null : r.problem;
};

describe('the page', () => {
  it('is one sheet of 1 : √2, written on lines a line apart from the first one down', () => {
    expect(PAPER_H / PAPER_W).toBeCloseTo(Math.SQRT2, 2);
    expect(PAPER_PAGES).toBe(2);
    expect(PAPER_TOP).toBeGreaterThan(PAPER_RULE);
    expect(PAPER_STYLES).toEqual(['plain', 'lined', 'margin', 'grid', 'dotted']);
    expect(PAPER_TONES).toHaveLength(8);
    expect(INKS).toHaveLength(8);
    // the paints begin with every ink, so a line can be drawn in the writing’s own colour
    expect(PAINTS.slice(0, INKS.length)).toEqual([...INKS]);
    expect(new Set(PAINTS).size).toBe(PAINTS.length);
    expect(DEFAULT_PAPER).toEqual({ style: 'lined', tone: 'cream', ink: 'navy' });
  });

  it('gives each tool its own widths, the brush wider than the pen', () => {
    for (const tool of DRAW_TOOLS) expect(STROKE_WIDTHS[tool][0]).toBeLessThan(STROKE_WIDTHS[tool][1]);
    expect(STROKE_WIDTHS.pen).toEqual([2, 10]);
    expect(STROKE_WIDTHS.brush).toEqual([12, 60]);
    expect(STROKE_WIDTHS.marker).toEqual([8, 30]);
  });
});

describe('the colours', () => {
  it('writes every ink legibly on every sheet, night included', () => {
    for (const tone of PAPER_TONES) {
      for (const ink of INKS) {
        const c = paperColors({ style: 'lined', tone, ink });
        expect(contrastRatio(c.ink, c.sheet), `${ink} on ${tone}`).toBeGreaterThanOrEqual(INK_CONTRAST_MIN);
        expect(contrastRatio(c.muted, c.sheet), `muted ${ink} on ${tone}`).toBeGreaterThanOrEqual(3);
        expect(c.ink).toBe(inkOn(ink, tone));
      }
    }
  });

  it('keeps the lines faint: there to write along, never louder than the writing', () => {
    for (const tone of PAPER_TONES) {
      const c = paperColors({ style: 'lined', tone, ink: 'navy' });
      for (const [what, colour] of [['rule', c.rule], ['grid', c.grid], ['margin', c.margin]] as const) {
        const ratio = contrastRatio(colour, c.sheet);
        expect(ratio, `${what} on ${tone}`).toBeGreaterThan(1.12);
        expect(ratio, `${what} on ${tone}`).toBeLessThan(2.4);
      }
      expect(contrastRatio(c.grid, c.sheet)).toBeLessThan(contrastRatio(c.rule, c.sheet));
      expect(contrastRatio(c.fibre, c.sheet)).toBeLessThan(1.12);
    }
  });

  it('draws the margin a soft red, and the night sheet dark with light ink', () => {
    const red = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const tone of PAPER_TONES) {
      const [r, g, b] = red(paperColors({ style: 'margin', tone, ink: 'navy' }).margin);
      expect(r, tone).toBeGreaterThan(g!);
      expect(r, tone).toBeGreaterThan(b!);
    }
    const night = paperColors({ style: 'lined', tone: 'night', ink: 'navy' });
    expect(contrastRatio(night.sheet, '#000000')).toBeLessThan(1.6);
    expect(contrastRatio(night.ink, '#ffffff')).toBeLessThan(contrastRatio(night.ink, '#000000'));
  });

  it('keeps a paper’s own tone on a dark screen, changing only the hairline round it', () => {
    for (const tone of PAPER_TONES) {
      const light = paperColors({ style: 'grid', tone, ink: 'plum' });
      const dark = paperColors({ style: 'grid', tone, ink: 'plum' }, 'dark');
      expect({ ...dark, edge: '' }).toEqual({ ...light, edge: '' });
    }
    // the night sheet needs its edge to be seen on a dark screen
    const night = paperColors({ style: 'plain', tone: 'night', ink: 'gold' }, 'dark');
    expect(contrastRatio(night.edge, night.sheet)).toBeGreaterThan(1.3);
  });

  it('paints an ink as it is written on that sheet, and the other paints alike on all', () => {
    expect(paintColor('navy', 'night')).toBe(inkOn('navy', 'night'));
    expect(paintColor('navy', 'cream')).toBe(inkOn('navy', 'cream'));
    expect(paintColor('sun', 'night')).toBe(paintColor('sun', 'cream'));
    for (const p of PAINTS) for (const tone of PAPER_TONES) expect(paintColor(p, tone)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('checking a decor', () => {
  it('takes a paper, a drawing and notes, and gives them back as they will be kept', () => {
    const r = checkLetterDecor(decor(), { strokes: true });
    expect(r).toEqual({ ok: true, value: decor() });
    // missing lists are empty; unknown fields go; numbers come back in whole units, the turn to a tenth
    const loose = checkLetterDecor(
      { paper: { ...paper, extra: 1 }, notes: [{ ...note(), x: 10.4, y: 20.6, turn: 3.14, colour: 'x' }], junk: true },
      { strokes: false },
    );
    expect(loose).toEqual({ ok: true, value: { paper, strokes: [], notes: [{ ...note(), x: 10, y: 21, turn: 3.1 }] } });
    expect(checkLetterDecor(decor({ strokes: [line({ width: 4.4, points: [1.2, 2.7] })] }), { strokes: true })).toMatchObject({
      ok: true,
      value: { strokes: [{ width: 4, points: [1, 3] }] },
    });
  });

  it('cleans a note’s text as a letter’s is cleaned', () => {
    const r = checkLetterDecor(decor({ notes: [note({ text: '  Silav\u0007   heval \n bi xêr hatî  ' })] }), { strokes: true });
    expect(r.ok && r.value.notes[0]!.text).toBe('Silav heval bi xêr hatî');
  });

  it('refuses what is not a decor at all', () => {
    for (const raw of [null, 'x', [], 1, {}, { paper: null }, { paper: { ...paper, style: 'wavy' } }, { paper: { ...paper, tone: 'red' } }, { paper: { ...paper, ink: 'blue' } }]) {
      expect(problem(raw), JSON.stringify(raw)).toBe('shape');
    }
    expect(problem({ paper, strokes: 'no' })).toBe('shape');
    expect(problem({ paper, notes: {} })).toBe('shape');
    expect(problem(decor({ strokes: [line({ tool: 'spray' as never })] }))).toBe('shape');
    expect(problem(decor({ strokes: [line({ color: 'black' as never })] }))).toBe('shape');
    expect(problem(decor({ strokes: [line({ points: [1, 2, 3] })] }))).toBe('shape');
    expect(problem(decor({ strokes: [line({ points: [] })] }))).toBe('shape');
    expect(problem(decor({ strokes: [line({ points: [1, Number.NaN] })] }))).toBe('shape');
    expect(problem(decor({ strokes: [line({ points: ['1', 2] as never })] }))).toBe('shape');
    expect(problem(decor({ notes: [note({ size: 'xl' as never })] }))).toBe('shape');
    expect(problem(decor({ notes: [note({ turn: 16 })] }))).toBe('shape');
    expect(problem(decor({ notes: [note({ text: 5 as never })] }))).toBe('shape');
  });

  it('holds a drawing to its limits: strokes, points, widths, the page', () => {
    expect(problem(decor({ strokes: Array.from({ length: DECOR_STROKES_MAX }, () => line({ points: [1, 2] })) }))).toBeNull();
    expect(problem(decor({ strokes: Array.from({ length: DECOR_STROKES_MAX + 1 }, () => line({ points: [1, 2] })) }))).toBe('too-many-strokes');
    const many = (n: number): number[] => Array.from({ length: n * 2 }, (_, i) => (i % 2 ? 300 : 400));
    expect(problem(decor({ strokes: [line({ points: many(DECOR_POINTS_MAX / 2) }), line({ points: many(DECOR_POINTS_MAX / 2 + 1) })] }))).toBe('too-many-points');
    for (const tool of DRAW_TOOLS) {
      const [min, max] = STROKE_WIDTHS[tool];
      expect(problem(decor({ strokes: [line({ tool, width: min })] }))).toBeNull();
      expect(problem(decor({ strokes: [line({ tool, width: max })] }))).toBeNull();
      expect(problem(decor({ strokes: [line({ tool, width: min - 1 })] }))).toBe('stroke-width');
      expect(problem(decor({ strokes: [line({ tool, width: max + 1 })] }))).toBe('stroke-width');
    }
    // a drawing may run onto a second page, not further, and never off either side
    expect(problem(decor({ strokes: [line({ points: [0, 0, PAPER_W, PAPER_H * 2] })] }))).toBeNull();
    expect(problem(decor({ strokes: [line({ points: [0, PAPER_H * 2 + 1] })] }))).toBe('off-page');
    expect(problem(decor({ strokes: [line({ points: [-1, 10] })] }))).toBe('off-page');
    expect(problem(decor({ notes: [note({ x: PAPER_W + 1 })] }))).toBe('off-page');
  });

  it('refuses the whole of it past its size as JSON', () => {
    // under the stroke and point counts, but notes and long lines together over the bytes
    const wide = Array.from({ length: 7900 * 2 }, (_, i) => (i % 2 ? 2000 + (i % 800) : 1000));
    const big = decor({ strokes: [line({ points: wide })] });
    expect(decorBytes(big)).toBeGreaterThan(DECOR_BYTES_MAX);
    expect(problem(big)).toBe('too-big');
  });

  it('holds notes to the letter’s own rules', () => {
    expect(problem(decor({ notes: Array.from({ length: NOTES_MAX }, () => note()) }))).toBeNull();
    expect(problem(decor({ notes: Array.from({ length: NOTES_MAX + 1 }, () => note()) }))).toBe('too-many-notes');
    expect(problem(decor({ notes: [note({ text: '   ' })] }))).toBe('note-empty');
    expect(problem(decor({ notes: [note({ text: 'a'.repeat(NOTE_MAX) })] }))).toBeNull();
    expect(problem(decor({ notes: [note({ text: 'a'.repeat(NOTE_MAX + 1) })] }))).toBe('note-long');
    expect(problem(decor({ notes: [note({ text: 'binivîse rojda@example.org' })] }))).toBe('note-contact');
    expect(problem(decor({ notes: [note({ text: '0750 123 4567' })] }))).toBe('note-contact');
    expect(problem(decor({ notes: [note({ text: '@rojda_99' })] }))).toBe('note-contact');
    expect(problem(decor({ notes: [note({ text: 'www.example.org' })] }))).toBe('note-link');
    // a number cut into pieces over several notes is still a number
    expect(problem(decor({ notes: [note({ text: '0750' }), note({ text: '123' }), note({ text: '4567' })] }))).toBe('note-contact');
    // a contact is named before the length, so the writer knows what to take out
    expect(problem(decor({ notes: [note({ text: `${'a'.repeat(NOTE_MAX)} rojda@example.org` })] }))).toBe('note-contact');
  });

  it('carries no drawing on a first letter to a stranger, but the paper and notes still go', () => {
    expect(problem(decor(), false)).toBe('drawing-not-here');
    expect(problem(decor({ strokes: [] }), false)).toBeNull();
  });

  it('names the error code the server answers with', () => {
    expect(decorErrorCode('note-contact')).toBe('DECOR_NOTE_CONTACT');
    expect(decorErrorCode('drawing-not-here')).toBe('DECOR_DRAWING_NOT_HERE');
    expect(decorErrorCode('shape')).toBe('DECOR_SHAPE');
  });

  it('knows a decor that says nothing more than none, and the paper of any letter', () => {
    expect(isPlainDecor({ paper: DEFAULT_PAPER, strokes: [], notes: [] })).toBe(true);
    expect(isPlainDecor({ paper: { ...DEFAULT_PAPER, ink: 'gold' }, strokes: [], notes: [] })).toBe(false);
    expect(isPlainDecor(decor({ paper: DEFAULT_PAPER, strokes: [] }))).toBe(false);
    expect(paperOf(null)).toEqual(DEFAULT_PAPER);
    expect(paperOf(decor())).toEqual(paper);
  });
});

describe('drawing a line', () => {
  it('curves smoothly through the points: from the first, through the middle of every step, to the last', () => {
    expect(strokePath({ points: [] })).toBe('');
    expect(strokePath({ points: [10, 20] })).toBe('M10 20h0.1');
    expect(strokePath({ points: [10, 20, 30, 40] })).toBe('M10 20L30 40');
    expect(strokePath({ points: [0, 0, 10, 10, 20, 0, 30, 10] })).toBe('M0 0Q10 10 15 5Q20 0 25 5L30 10');
    expect(strokePath({ points: [0, 0, 1, 1, 2, 2] })).toBe('M0 0Q1 1 1.5 1.5L2 2');
  });

  it('keeps a line as it is worth keeping: on the page, without the points that add nothing', () => {
    // a finger held still lays points on top of each other
    expect(simplifyStroke([10, 10, 10, 10, 11, 10, 50, 50])).toEqual([10, 10, 50, 50]);
    // a straight run keeps its ends only
    const straight = Array.from({ length: 40 }, (_, i) => [100 + i * 10, 200]).flat();
    expect(simplifyStroke(straight)).toEqual([100, 200, 490, 200]);
    // a curve keeps enough to stay a curve
    const arc = Array.from({ length: 60 }, (_, i) => [500 + Math.cos(i / 10) * 200, 500 + Math.sin(i / 10) * 200]).flat();
    const kept = simplifyStroke(arc);
    expect(kept.length).toBeLessThan(arc.length);
    expect(kept.length).toBeGreaterThan(10);
    expect(kept.every(Number.isInteger)).toBe(true);
    // off the page is brought back to its edge
    expect(simplifyStroke([-20, 5, 2000, 9999])).toEqual([0, 5, PAPER_W, PAPER_H * PAPER_PAGES]);
    expect(simplifyStroke([3.4, 4.6])).toEqual([3, 5]);
    // and what it gives back always passes the check
    expect(checkLetterDecor(decor({ strokes: [line({ points: simplifyStroke([-5, -5, 3000, 3000, 20, 40]) })] }), { strokes: true }).ok).toBe(true);
  });
});

describe('the widget’s words', () => {
  it('cuts a long letter at a word, within the room, and leaves a short one whole', () => {
    expect(widgetExcerpt('  Silav heval!  ')).toBe('Silav heval!');
    const long = 'Silav hevalê min, ez îro li bajêr bûm û min gelek tişt dîtin. '.repeat(8);
    const cut = widgetExcerpt(long);
    expect([...cut].length).toBeLessThanOrEqual(WIDGET_EXCERPT_MAX);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(long[cut.length - 1]).toMatch(/\s/);
    // one endless word is cut where it must be
    expect([...widgetExcerpt('a'.repeat(500))].length).toBe(WIDGET_EXCERPT_MAX);
    expect(widgetExcerpt('ب'.repeat(300)).length).toBe(WIDGET_EXCERPT_MAX);
  });

  it('knows a letter written right to left from its first letter', () => {
    expect(isRtlText('سڵاو هاوڕێ')).toBe(true);
    expect(isRtlText('  123 سڵاو')).toBe(true);
    expect(isRtlText('Silav heval')).toBe(false);
    expect(isRtlText('Silav سڵاو')).toBe(false);
    expect(isRtlText('')).toBe(false);
  });
});
