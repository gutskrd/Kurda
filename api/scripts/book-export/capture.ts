/**
 * The words of the Hevalo book as it prints them, page by page: every run of
 * text the press sets, with where it stands, how big it is and in what face.
 *
 * The book is printed once, as for a reader, while `Press.set` and
 * `Press.line` (the only two ways the book puts words on paper) are watched;
 * both are put back as they were when the book is done, whatever happens.
 * Watching the press rather than reading the finished PDF back keeps what the
 * book knows and a PDF forgets: which runs make one paragraph, the face each
 * is in (so its language can be told), and the book's own name for each way
 * it sets type (`T` in page.ts). Words inside a drawing are drawn by the
 * drawing and are not text the press sets, so they are not here.
 *
 * Each run's `y` is its baseline, as the press hands it to the PDF writer,
 * so runs of different sizes on one line share it.
 */
import { createHash } from 'node:crypto';
import { T } from '../../src/books/page.js';
import { Press, type FontKey, type Type } from '../../src/books/sheet.js';
import { renderRoadBook, type RoadBookOptions } from '../../src/books/pdf.js';

/** One run of text in one face, as the press set it. */
export interface TextRun {
  /** the page it is on, from 1 */
  page: number;
  /** its place among every run of the book, in the order they were set */
  seq: number;
  /** the call of the press it came from: the runs of one `set` are one paragraph */
  call: number;
  via: 'set' | 'line';
  text: string;
  /** where it starts and its baseline, in points from the page's top left */
  x: number;
  y: number;
  size: number;
  font: FontKey;
  tracking: number;
  /** how wide it is, as the press measures it */
  width: number;
  /** the book's name for its type (a key of `T`), when the type is one of those exactly */
  typeKey: keyof typeof T | null;
  /** the book's name for the type of the paragraph it is in, whatever face the run itself is in (a grammar note sets its Kurdish in other faces) */
  setIn: keyof typeof T | null;
  /** how many points apart the lines of its type sit */
  lead: number;
  align: 'left' | 'center' | 'right';
  /** the column the call was placed in, for centred and right-aligned lines */
  column: number;
  /** its line within the call, from 0 */
  line: number;
}

/** The book, and every run of text on its pages. */
export interface Capture {
  pdf: Buffer;
  pages: number;
  runs: TextRun[];
}

/** The key of `T` whose values a type has, exactly. */
function typeKeyOf(type: Type): keyof typeof T | null {
  for (const [key, known] of Object.entries(T) as Array<[keyof typeof T, Type]>) {
    if (known.font === type.font && known.size === type.size && known.color === type.color && known.lead === type.lead && (known.tracking ?? 0) === (type.tracking ?? 0)) return key;
  }
  return null;
}

type SetArgs = Parameters<Press['set']>;
type LineArgs = Parameters<Press['line']>;
type TextArgs = Parameters<Press['doc']['text']>;

/** The book printed for `options`, with the text of every page. */
export async function captureRoadBook(options: RoadBookOptions): Promise<Capture> {
  const runs: TextRun[] = [];
  const set = Press.prototype.set;
  const line = Press.prototype.line;
  let calls = 0;
  let pages = 0;

  /**
   * Runs `draw` with the writer's text calls counted: where each piece of
   * text went is taken from the writer itself, so nothing about how the
   * press places a baseline is repeated here.
   */
  const placed = (press: Press, draw: () => void): Array<{ x: number; y: number }> => {
    const doc = press.doc;
    const text = doc.text;
    const at: Array<{ x: number; y: number }> = [];
    doc.text = function (this: typeof doc, ...args: TextArgs) {
      const [, x, y] = args as unknown as [string, number, number];
      at.push({ x, y });
      return text.apply(this, args);
    } as typeof doc.text;
    try {
      draw();
    } finally {
      doc.text = text;
    }
    return at;
  };

  Press.prototype.set = function (this: Press, ...args: SetArgs): void {
    const [lines, , , type, align = 'left', width = 0] = args;
    const at = placed(this, () => set.apply(this, args));
    const call = calls++;
    let k = 0;
    lines.forEach((l, index) => {
      for (const run of l.runs) {
        const where = at[k++];
        if (!where) continue;
        runs.push({
          page: this.pages,
          seq: runs.length,
          call,
          via: 'set',
          text: run.text,
          x: where.x,
          y: where.y,
          size: type.size,
          // each run keeps its own face: a paragraph may set its Kurdish in another
          font: run.font,
          tracking: type.tracking ?? 0,
          width: this.measure(run.text, run.font, type.size, type.tracking),
          typeKey: run.font === type.font ? typeKeyOf(type) : null,
          setIn: typeKeyOf(type),
          lead: type.lead,
          align,
          column: width,
          line: index,
        });
      }
    });
    pages = Math.max(pages, this.pages);
  };

  Press.prototype.line = function (this: Press, ...args: LineArgs): number {
    const [text, , , type, align = 'left', width = 0] = args;
    let w = 0;
    const at = placed(this, () => {
      w = line.apply(this, args);
    });
    const where = at[0];
    if (where && text !== '') {
      runs.push({
        page: this.pages,
        seq: runs.length,
        call: calls++,
        via: 'line',
        text,
        x: where.x,
        y: where.y,
        size: type.size,
        font: type.font,
        tracking: type.tracking ?? 0,
        width: w,
        typeKey: typeKeyOf(type),
        setIn: typeKeyOf(type),
        lead: type.lead,
        align,
        column: width,
        line: 0,
      });
    }
    pages = Math.max(pages, this.pages);
    return w;
  };

  try {
    const pdf = await renderRoadBook(options);
    return { pdf, pages: Math.max(pages, pageCount(pdf)), runs };
  } finally {
    Press.prototype.set = set;
    Press.prototype.line = line;
  }
}

/** How many pages a PDF the press wrote has: its page tree says so in its last `/Count`. */
export function pageCount(pdf: Buffer): number {
  const counts = [...pdf.toString('latin1').matchAll(/\/Type \/Pages\b[^>]*?\/Count (\d+)/g)].map((m) => Number(m[1]));
  return counts.length > 0 ? Math.max(...counts) : 0;
}

/** A file's sha256, in hex. */
export const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
