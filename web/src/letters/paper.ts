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
 * The letter's paper in the browser: what the composer keeps while a letter
 * is made, and the few sums the sheet needs — where a pointer is on the page,
 * how much more drawing a letter can carry, where a new note goes.
 *
 * The page itself, its limits and its colours are the shared contract
 * (shared/src/letter-paper.ts). A letter is laid out in the page's own units,
 * PAPER_W across whatever size it shows at, so a flower drawn beside a word
 * on a wide screen is beside the same word on a phone.
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
 * How many more points a new line may have before the letter could not carry
 * it: the points left under the limit, and — near the size limit, which a
 * drawing reaches first when it is mostly long lines — about as many as the
 * bytes left would hold, at the ten or so each point costs.
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
 * The paper the composer opens on when the page that holds it does not say:
 * the one last written on. The letters page learns it from the server (the
 * paper you last wrote on) and every letter sent sets it, so a
 * correspondence opened from there starts on your own paper too. It is kept
 * with the tab's other answers (lib/apiMemory.ts), so it belongs to the
 * account it was learned for and goes when that account signs out.
 */
const PAPER_KEY = '#letters/paper';

export function rememberPaper(who: string | null, paper: LetterPaper | null | undefined): void {
  if (who && paper) remember(who, PAPER_KEY, paper);
}

export function rememberedPaper(who: string | null): LetterPaper {
  return (who ? lastAnswer<LetterPaper>(who, PAPER_KEY)?.data : undefined) ?? DEFAULT_PAPER;
}
