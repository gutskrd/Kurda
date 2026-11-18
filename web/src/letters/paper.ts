import {
  DECOR_BYTES_MAX,
  DECOR_POINTS_MAX,
  DECOR_STROKES_MAX,
  DEFAULT_PAPER,
  NOTE_TURN_MAX,
  NOTES_MAX,
  PAPER_H,
  PAPER_PAGES,
  PAPER_W,
  STROKE_WIDTHS,
  decorBytes,
  type DecorProblem,
  type DrawTool,
  type LetterDecor,
  type LetterPaper,
  type PaperNote,
  type PaperStroke,
} from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { lastAnswer, remember } from '../lib/apiMemory';

/**
 * The composer's paper state and arithmetic: pointer positions, remaining drawing capacity, and new note placement.
 * The page, limits and colours come from shared/src/letter-paper.ts; everything is in page units (PAPER_W wide), so a
 * drawing lines up with the words at any size.
 */

/** What the composer can undo: the lines drawn and the notes placed. The paper is a choice made again, not a step to take back. */
export interface Drawing {
  strokes: PaperStroke[];
  notes: PaperNote[];
}

export const NO_DRAWING: Drawing = { strokes: [], notes: [] };

/** The page's foot when a letter runs on to its last sheet: nothing is drawn or placed below it. */
export const PAGE_FOOT = PAPER_H * PAPER_PAGES;

/** How wide each tool draws when it is first picked up: a writing pen, a brush for colour, a marker for underlining. */
export const START_WIDTH: Readonly<Record<DrawTool, number>> = { pen: 4, brush: 26, marker: 16 };

/** A width kept inside what its tool draws (shared STROKE_WIDTHS). */
export function widthFor(tool: DrawTool, width: number): number {
  const [min, max] = STROKE_WIDTHS[tool];
  return Math.max(min, Math.min(max, Math.round(width)));
}

/** Every point drawn so far, all lines together: the measure DECOR_POINTS_MAX is held to. */
export function pointsUsed(strokes: readonly PaperStroke[]): number {
  let n = 0;
  for (const s of strokes) n += s.points.length / 2;
  return n;
}

/**
 * How many more points a new line may have: the points left under the limit, capped near the size limit by the bytes
 * left at about ten per point.
 */
export function pointsLeft(decor: LetterDecor): number {
  if (decor.strokes.length >= DECOR_STROKES_MAX) return 0;
  const byCount = DECOR_POINTS_MAX - pointsUsed(decor.strokes);
  const byBytes = Math.floor((DECOR_BYTES_MAX - decorBytes(decor) - 80) / 10);
  return Math.max(0, Math.min(byCount, byBytes));
}

/** A note turned no further than the page allows, to a whole degree. */
export const turnFor = (turn: number): number => Math.max(-NOTE_TURN_MAX, Math.min(NOTE_TURN_MAX, Math.round(turn)));

/** A point kept on the page: across it, and down it no further than `foot`. */
export function onPage(x: number, y: number, foot: number): { x: number; y: number } {
  return { x: Math.max(0, Math.min(PAPER_W, Math.round(x))), y: Math.max(0, Math.min(foot, Math.round(y))) };
}

/** Where on the page a pointer is, in page units, from the sheet's place on the screen. */
export function pagePoint(rect: { left: number; top: number; width: number }, clientX: number, clientY: number): { x: number; y: number } {
  const scale = rect.width > 0 ? PAPER_W / rect.width : 1;
  return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
}

/** Whether there is room for another note. */
export const roomForNote = (notes: readonly PaperNote[]): boolean => notes.length < NOTES_MAX;

/** What to tell the writer about paper, a drawing or notes that cannot go as they are. */
export const DECOR_PROBLEM: Readonly<Record<DecorProblem, MessageKey>> = {
  shape: 'letters.paper.problem.drawing',
  'too-big': 'letters.paper.drawFull',
  'too-many-strokes': 'letters.paper.drawFull',
  'too-many-points': 'letters.paper.drawFull',
  'stroke-width': 'letters.paper.problem.drawing',
  'off-page': 'letters.paper.problem.drawing',
  'too-many-notes': 'letters.paper.note.full',
  'note-empty': 'letters.paper.problem.noteEmpty',
  'note-long': 'letters.paper.problem.noteLong',
  'note-contact': 'letters.paper.problem.noteContact',
  'note-link': 'letters.paper.problem.noteLink',
  'drawing-not-here': 'letters.paper.drawNotHere',
};

/**
 * The default paper when the page does not specify one: the last written on, learned from the server and set by each
 * sent letter. Kept in the tab's API memory (lib/apiMemory.ts), so it is cleared on sign-out.
 */
const PAPER_KEY = '#letters/paper';

export function rememberPaper(who: string | null, paper: LetterPaper | null | undefined): void {
  if (who && paper) remember(who, PAPER_KEY, paper);
}

export function rememberedPaper(who: string | null): LetterPaper {
  return (who ? lastAnswer<LetterPaper>(who, PAPER_KEY)?.data : undefined) ?? DEFAULT_PAPER;
}
