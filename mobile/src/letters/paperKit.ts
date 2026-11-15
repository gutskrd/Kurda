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
 * The phone's own arithmetic for a sheet of letter paper (shared
 * letter-paper.ts is the sheet itself and its limits): how a drawing is kept,
 * undone and done again, how a finger's path becomes a stroke, where the
 * writing sits on the rules, how long the sheet has to be, and where a note
 * goes. Pure, so the tests can ask it directly; the composer
 * (LetterComposer.tsx) only wires it to fingers.
 *
 * Everything here is in the page's own units (shared PAPER_W wide): the sheet
 * is the same page on every phone and is only drawn at a different size.
 */

/** The three widths each drawing tool comes in, inside what the server allows for it (shared STROKE_WIDTHS). */
export type PenSize = 's' | 'm' | 'l';
export const PEN_SIZES: readonly PenSize[] = ['s', 'm', 'l'];
export const PEN_WIDTHS: Readonly<Record<DrawTool, Readonly<Record<PenSize, number>>>> = {
  pen: { s: 3, m: 5, l: 8 },
  brush: { s: 16, m: 28, l: 44 },
  marker: { s: 10, m: 16, l: 26 },
};

/** A width the server takes for the tool, whatever was asked. */
export function widthFor(tool: DrawTool, size: PenSize): number {
  const [min, max] = STROKE_WIDTHS[tool];
  return Math.max(min, Math.min(max, PEN_WIDTHS[tool][size]));
}

/**
 * The fewest page units between two points a finger leaves. A phone reports
 * a moving finger about every hundredth of a second, far more often than a
 * smooth line needs, and every point is counted against what a letter can
 * carry; a wide brush needs fewer than a fine pen.
 */
const STEP: Readonly<Record<DrawTool, number>> = { pen: 5, brush: 9, marker: 7 };

/**
 * About what one point costs of a letter's room as it is sent (shared
 * DECOR_BYTES_MAX counts the decor as JSON): two numbers of up to four digits
 * and their commas. Kept a little generous, so a drawing is said to be full
 * before the server would say it is too big.
 */
const BYTES_A_POINT = 10;
/** The room kept free of drawing for the paper and the notes, in bytes. */
const BYTES_KEPT = 2048;

/** One thing done to a drawing, kept so it can be undone: a stroke added, or every stroke cleared away. */
type Step = { kind: 'add'; stroke: PaperStroke } | { kind: 'clear'; strokes: readonly PaperStroke[] };

/** A drawing as it is being made: its strokes, what was done to make them (newest last), and what was undone (most recent last). */
export interface Drawing {
  strokes: readonly PaperStroke[];
  done: readonly Step[];
  undone: readonly Step[];
}

export const EMPTY_DRAWING: Drawing = { strokes: [], done: [], undone: [] };

/** How many points the strokes hold in all (a point is two numbers). */
export function pointsIn(strokes: readonly PaperStroke[]): number {
  return strokes.reduce((n, s) => n + s.points.length / 2, 0);
}

/**
 * How many more points this letter can carry: what the server counts
 * (DECOR_POINTS_MAX), and what its size allows (DECOR_BYTES_MAX), whichever
 * comes first, and none once there are as many strokes as a letter may have.
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

/** Every stroke taken away at once; undoing it brings them all back. Nothing to clear is no step. */
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

/** How far down a drawing or a note may go: a long letter has a second page, and no more. */
export const DRAWING_DEEPEST = PAPER_H * PAPER_PAGES;

/** A point on the sheet, kept inside it (and inside the pages a drawing may cover) and made whole page units, as the server keeps them. */
export function onSheet(x: number, y: number, length: number): [number, number] {
  return [Math.round(Math.max(0, Math.min(PAPER_W, x))), Math.round(Math.max(0, Math.min(length, DRAWING_DEEPEST, y)))];
}

/**
 * The pen on the paper: the points a finger has left so far, in page units,
 * x, y, x, y… It takes a new point only once the finger has gone far enough
 * from the last one, and none past what the letter can still carry, so a
 * stroke simply ends there rather than being refused after it was drawn.
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
    /** points the letter can still carry */
    room: number,
  ) {
    this.points = [...onSheet(x, y, length)];
    this.step = STEP[tool];
    this.most = Math.max(1, room);
  }

  /** Follow the finger to (x, y); whether the line took a new point. */
  to(x: number, y: number): boolean {
    if (this.points.length / 2 >= this.most) return false;
    const [px, py] = onSheet(x, y, this.length);
    const lx = this.points[this.points.length - 2]!;
    const ly = this.points[this.points.length - 1]!;
    if (Math.hypot(px - lx, py - ly) < this.step) return false;
    this.points.push(px, py);
    return true;
  }

  /** Whether the line has gone anywhere from where the finger touched down. */
  get moved(): boolean {
    return this.points.length > 2;
  }

  /** The stroke as it is kept: near-duplicate points dropped, and a touch that never moved is a dot. */
  done(): PaperStroke {
    const kept = this.points.length > 4 ? simplifyStroke(this.points) : this.points;
    const points = kept.length >= 4 ? kept : [kept[0] ?? 0, kept[1] ?? 0, kept[0] ?? 0, kept[1] ?? 0];
    return { tool: this.tool, color: this.color, width: this.width, points: [...points] };
  }
}

/**
 * Where the writing's first line begins, in page units from the top of the
 * sheet. Its baseline sits on the first rule (shared PAPER_TOP), and a line
 * of text is set in the middle of its line's height on both phones, the
 * letters' tops about a third of their size above the middle; so the line
 * starts half a rule and that third above the rule it sits on.
 */
export const WRITING_TOP = Math.round(PAPER_TOP - PAPER_RULE / 2 - PAPER_TEXT * 0.35);
/** The room kept under the last line of writing, and so how far the sheet runs on past it. */
export const WRITING_FOOT = PAPER_RULE * 2;

/** Where the writing is, across the page: inset from both edges, and on 'margin' paper beginning a little after its red line. */
export function writingInsets(style: PaperStyle): { left: number; right: number } {
  return { left: style === 'margin' ? PAPER_MARGIN_X + 30 : PAPER_SIDE, right: PAPER_SIDE };
}

/**
 * How many pages the sheet is: one, or two when the writing (`writing`, how
 * far down the page it reaches, in page units) or something drawn or placed
 * reaches past the first. Writing longer still makes the sheet longer still,
 * a page at a time, though only the first two may be drawn on.
 */
export function pagesFor(writing: number, strokes: readonly PaperStroke[], notes: readonly PaperNote[]): number {
  const byWriting = Math.ceil((writing + WRITING_FOOT) / PAPER_H);
  let deepest = 0;
  for (const s of strokes) for (let i = 1; i < s.points.length; i += 2) deepest = Math.max(deepest, s.points[i]!);
  for (const n of notes) deepest = Math.max(deepest, n.y);
  return Math.max(1, byWriting, Math.min(PAPER_PAGES, Math.ceil(deepest / PAPER_H)));
}

/** How wide a note may be before it goes on to another line, in page units. */
export const NOTE_WIDTH = 640;
/** How much one press turns a note, in degrees. */
export const NOTE_TURN_STEP = 5;

/**
 * Where a new note goes, unless a finger put it somewhere: under the writing,
 * toward the end of the line, each next one a little lower than the last,
 * and never off the sheet.
 */
export function placeForNote(notes: readonly PaperNote[], writing: number, length: number): { x: number; y: number } {
  const under = Math.max(PAPER_TOP + PAPER_RULE, writing + PAPER_RULE * 1.5) + notes.length * PAPER_RULE * 1.5;
  return { x: Math.round(PAPER_W * 0.6), y: Math.round(Math.max(PAPER_RULE, Math.min(length - PAPER_RULE * 2, under))) };
}

/** A note moved to (x, y), its middle kept on the sheet. */
export function moveNote(note: PaperNote, x: number, y: number, length: number): PaperNote {
  const [nx, ny] = onSheet(x, y, length);
  return { ...note, x: nx, y: ny };
}

/** A note turned a step one way (1) or the other (-1), no further than it may go. */
export function turnNote(note: PaperNote, way: 1 | -1): PaperNote {
  return { ...note, turn: Math.max(-NOTE_TURN_MAX, Math.min(NOTE_TURN_MAX, note.turn + way * NOTE_TURN_STEP)) };
}
