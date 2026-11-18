import {
  DECOR_BYTES_MAX,
  DECOR_POINTS_MAX,
  DECOR_STROKES_MAX,
  NOTE_TURN_MAX,
  PAPER_H,
  PAPER_MARGIN_X,
  PAPER_PAGES,
  PAPER_RULE,
  PAPER_SIDE,
  PAPER_TEXT,
  PAPER_TOP,
  PAPER_W,
  STROKE_WIDTHS,
  decorBytes,
  simplifyStroke,
  type DrawTool,
  type LetterDecor,
  type Paint,
  type PaperNote,
  type PaperStroke,
  type PaperStyle,
} from '@kurda/shared';

/**
 * The phone's arithmetic for a sheet of letter paper (shared letter-paper.ts defines the sheet and its limits):
 * drawing history, turning a finger's path into a stroke, writing position, sheet length, and note placement. Pure,
 * so tests call it directly; LetterComposer.tsx wires it to touches. Everything is in page units (shared PAPER_W
 * wide), so the sheet is the same page on every phone.
 */

/** The three widths each drawing tool comes in, within what the server allows (shared STROKE_WIDTHS). */
export type PenSize = 's' | 'm' | 'l';
export const PEN_SIZES: readonly PenSize[] = ['s', 'm', 'l'];
export const PEN_WIDTHS: Readonly<Record<DrawTool, Readonly<Record<PenSize, number>>>> = {
  pen: { s: 3, m: 5, l: 8 },
  brush: { s: 16, m: 28, l: 44 },
  marker: { s: 10, m: 16, l: 26 },
};

/** A width the server accepts for the tool. */
export function widthFor(tool: DrawTool, size: PenSize): number {
  const [min, max] = STROKE_WIDTHS[tool];
  return Math.max(min, Math.min(max, PEN_WIDTHS[tool][size]));
}

/**
 * The minimum page-unit distance between kept points. Phones report a moving finger about every 10 ms, far more
 * than a smooth line needs, and every point counts against a letter's limit; wider tools need fewer.
 */
const STEP: Readonly<Record<DrawTool, number>> = { pen: 5, brush: 9, marker: 7 };

/**
 * Approximate bytes per point in the sent JSON (shared DECOR_BYTES_MAX): two numbers of up to four digits and their
 * commas. Slightly generous, so the drawing reads as full before the server would refuse it.
 */
const BYTES_A_POINT = 10;
/** Bytes kept free of drawing for the paper and the notes. */
const BYTES_KEPT = 2048;

/** One undoable action: a stroke added, or every stroke cleared. */
type Step = { kind: 'add'; stroke: PaperStroke } | { kind: 'clear'; strokes: readonly PaperStroke[] };

/** A drawing in progress: its strokes, the actions that made them (newest last), and what was undone (latest last). */
export interface Drawing {
  strokes: readonly PaperStroke[];
  done: readonly Step[];
  undone: readonly Step[];
}

export const EMPTY_DRAWING: Drawing = { strokes: [], done: [], undone: [] };

/** The total points in the strokes (a point is two numbers). */
function pointsIn(strokes: readonly PaperStroke[]): number {
  return strokes.reduce((n, s) => n + s.points.length / 2, 0);
}

/**
 * How many more points this letter can take: the lower of the point limit (DECOR_POINTS_MAX) and the size limit
 * (DECOR_BYTES_MAX), and none once the stroke limit is reached.
 */
export function pointsLeft(decor: LetterDecor): number {
  if (decor.strokes.length >= DECOR_STROKES_MAX) return 0;
  const byCount = DECOR_POINTS_MAX - pointsIn(decor.strokes);
  const bySize = Math.floor((DECOR_BYTES_MAX - BYTES_KEPT - decorBytes(decor)) / BYTES_A_POINT);
  return Math.max(0, Math.min(byCount, bySize));
}

/** Whether there is room for another stroke of at least a dot. */
export function canDrawMore(decor: LetterDecor): boolean {
  return pointsLeft(decor) >= 2;
}

export function addStroke(drawing: Drawing, stroke: PaperStroke): Drawing {
  return { strokes: [...drawing.strokes, stroke], done: [...drawing.done, { kind: 'add', stroke }], undone: [] };
}

/** Clears every stroke as one undoable step; nothing to clear adds no step. */
export function clearDrawing(drawing: Drawing): Drawing {
  if (drawing.strokes.length === 0) return drawing;
  return { strokes: [], done: [...drawing.done, { kind: 'clear', strokes: drawing.strokes }], undone: [] };
}

export function undo(drawing: Drawing): Drawing {
  const step = drawing.done[drawing.done.length - 1];
  if (!step) return drawing;
  const strokes = step.kind === 'add' ? drawing.strokes.slice(0, -1) : step.strokes;
  return { strokes, done: drawing.done.slice(0, -1), undone: [...drawing.undone, step] };
}

export function redo(drawing: Drawing): Drawing {
  const step = drawing.undone[drawing.undone.length - 1];
  if (!step) return drawing;
  const strokes = step.kind === 'add' ? [...drawing.strokes, step.stroke] : [];
  return { strokes, done: [...drawing.done, step], undone: drawing.undone.slice(0, -1) };
}

/** How far down a drawing or note may go: a long letter has a second page, and no more. */
export const DRAWING_DEEPEST = PAPER_H * PAPER_PAGES;

/** A point clamped to the sheet (and the drawable pages) and rounded to whole page units, as the server keeps them. */
function onSheet(x: number, y: number, length: number): [number, number] {
  return [Math.round(Math.max(0, Math.min(PAPER_W, x))), Math.round(Math.max(0, Math.min(length, DRAWING_DEEPEST, y)))];
}

/**
 * A stroke in progress, as flat page-unit points x, y, x, y… It takes a point only once the finger has moved far
 * enough, and none beyond the letter's remaining room, so a stroke simply ends there instead of being refused later.
 */
export class PenLine {
  readonly points: number[];
  private readonly step: number;
  private readonly most: number;

  constructor(
    readonly tool: DrawTool,
    readonly color: Paint,
    readonly width: number,
    x: number,
    y: number,
    private readonly length: number,
    /** Points the letter can still take. */
    room: number,
  ) {
    this.points = [...onSheet(x, y, length)];
    this.step = STEP[tool];
    this.most = Math.max(1, room);
  }

  /** Follows the finger to (x, y); returns whether a point was taken. */
  to(x: number, y: number): boolean {
    if (this.points.length / 2 >= this.most) return false;
    const [px, py] = onSheet(x, y, this.length);
    const lx = this.points[this.points.length - 2]!;
    const ly = this.points[this.points.length - 1]!;
    if (Math.hypot(px - lx, py - ly) < this.step) return false;
    this.points.push(px, py);
    return true;
  }

  /** Whether the line has moved from where the finger touched down. */
  get moved(): boolean {
    return this.points.length > 2;
  }

  /** The finished stroke: near-duplicate points dropped, and a touch that never moved becomes a dot. */
  done(): PaperStroke {
    const kept = this.points.length > 4 ? simplifyStroke(this.points) : this.points;
    const points = kept.length >= 4 ? kept : [kept[0] ?? 0, kept[1] ?? 0, kept[0] ?? 0, kept[1] ?? 0];
    return { tool: this.tool, color: this.color, width: this.width, points: [...points] };
  }
}

/**
 * The first line's top, in page units. The baseline sits on the first rule (shared PAPER_TOP), and text is centred
 * in its line with cap tops about a third of the size above the middle, hence half a rule plus that third.
 */
export const WRITING_TOP = Math.round(PAPER_TOP - PAPER_RULE / 2 - PAPER_TEXT * 0.35);
/** The room under the last line of writing, and so how far the sheet runs past it. */
export const WRITING_FOOT = PAPER_RULE * 2;

/** The writing's horizontal insets; on 'margin' paper it starts a little after the red line. */
export function writingInsets(style: PaperStyle): { left: number; right: number } {
  return { left: style === 'margin' ? PAPER_MARGIN_X + 30 : PAPER_SIDE, right: PAPER_SIDE };
}

/**
 * The sheet's page count: two once the writing (`writing`, its depth in page units), a drawing or a note reaches
 * past the first. Longer writing adds pages one at a time, though only the first two may be drawn on.
 */
export function pagesFor(writing: number, strokes: readonly PaperStroke[], notes: readonly PaperNote[]): number {
  const byWriting = Math.ceil((writing + WRITING_FOOT) / PAPER_H);
  let deepest = 0;
  for (const s of strokes) for (let i = 1; i < s.points.length; i += 2) deepest = Math.max(deepest, s.points[i]!);
  for (const n of notes) deepest = Math.max(deepest, n.y);
  return Math.max(1, byWriting, Math.min(PAPER_PAGES, Math.ceil(deepest / PAPER_H)));
}

/** A note's maximum width before it wraps, in page units. */
export const NOTE_WIDTH = 640;
/** How far one press turns a note, in degrees. */
const NOTE_TURN_STEP = 5;

/** Where a new note goes unless placed by hand: under the writing, toward the line's end, each a little lower, never off the sheet. */
export function placeForNote(notes: readonly PaperNote[], writing: number, length: number): { x: number; y: number } {
  const under = Math.max(PAPER_TOP + PAPER_RULE, writing + PAPER_RULE * 1.5) + notes.length * PAPER_RULE * 1.5;
  return { x: Math.round(PAPER_W * 0.6), y: Math.round(Math.max(PAPER_RULE, Math.min(length - PAPER_RULE * 2, under))) };
}

/** A note moved to (x, y), its centre kept on the sheet. */
export function moveNote(note: PaperNote, x: number, y: number, length: number): PaperNote {
  const [nx, ny] = onSheet(x, y, length);
  return { ...note, x: nx, y: ny };
}

/** A note turned a step one way (1) or the other (-1), within its limit. */
export function turnNote(note: PaperNote, way: 1 | -1): PaperNote {
  return { ...note, turn: Math.max(-NOTE_TURN_MAX, Math.min(NOTE_TURN_MAX, note.turn + way * NOTE_TURN_STEP)) };
}
