/**
 * The press the Hevalo book is printed on: one PDF being written, with the
 * book's type, its measure, and the app's drawings as stamps it can lay down
 * as often as it likes.
 *
 * Three things a page of the book needs that the PDF writer does not give:
 *
 *  - Text measured before it is set. A paragraph is broken into lines here
 *    (`wrap`), in mixed type where a grammar note marks its Kurdish, so its
 *    height is known before anything is drawn and the pages can be broken by
 *    rule (flow.ts) rather than wherever the paper runs out.
 *  - Every drawing made once. A character is thirty kilobytes of curves and
 *    the book shows Hamo two hundred times; each drawing is written into the
 *    file as a form the first time it is used (`art`) and only placed after
 *    that, which keeps the whole book small and quick to make.
 *  - The same few shapes everywhere: a rounded panel, a speech bubble, a
 *    dotted line to write on.
 *
 * Headings are set in Fraunces and reading text in Literata, both under the
 * SIL Open Font Licence and shipped by their packages.
 */
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string): string => require.resolve(`@expo-google-fonts/${pkg}/${file}`);

/** The book's type: Fraunces for what is announced, Literata for what is read. */
const FONTS = {
  display: font('fraunces', '600SemiBold/Fraunces_600SemiBold.ttf'),
  heavy: font('fraunces', '800ExtraBold/Fraunces_800ExtraBold.ttf'),
  displayItalic: font('fraunces', '400Regular_Italic/Fraunces_400Regular_Italic.ttf'),
  body: font('literata', '400Regular/Literata_400Regular.ttf'),
  italic: font('literata', '400Regular_Italic/Literata_400Regular_Italic.ttf'),
  semi: font('literata', '600SemiBold/Literata_600SemiBold.ttf'),
  bold: font('literata', '700Bold/Literata_700Bold.ttf'),
} as const;
export type FontKey = keyof typeof FONTS;

/** A5, in points, and the margins the text keeps: the head and the foot of a page hold its running title and its number. */
export const PAGE = { w: 419.53, h: 595.28 } as const;
export const MARGIN = { side: 36, top: 48, bottom: 44 } as const;
/** The measure: how wide the text runs, where it starts, and how much of a page's height it may take. */
export const TEXT = { x: MARGIN.side, w: PAGE.w - MARGIN.side * 2, top: MARGIN.top, room: PAGE.h - MARGIN.top - MARGIN.bottom } as const;

/** The paper and the inks: a warm cream that prints, the app's deep indigo to write in and its softer grey for what is said beside the Kurdish, and the app's own violet. */
export const INK = { paper: '#fbf6ec', ink: '#14112e', soft: '#595870', violet: '#862be2', line: '#e6dcc8', card: '#fffdf8' } as const;

/** A colour part of the way from `a` to `b` (0 is `a`, 1 is `b`): the hill under a sky of the same hue, a shade for the night. */
export function blend(a: string, b: string, t: number): string {
  const at = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(at(a, i) + (at(b, i) - at(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** A way of setting text: its face, its size, its colour, and how far apart its lines sit. */
export interface Type {
  font: FontKey;
  size: number;
  color: string;
  lead: number;
  /** extra space between letters, for small capitals */
  tracking?: number;
}

/** A piece of a paragraph that is set differently from the rest of it. */
export interface Span {
  text: string;
  font?: FontKey;
  color?: string;
}

/** One line of a broken paragraph: its runs of one face each, where each starts, and how wide the line is. */
export interface Line {
  runs: Array<{ text: string; font: FontKey; color: string; x: number }>;
  width: number;
}

/** A drawing written into the file once, to be placed any number of times. */
export interface Stamp {
  name: string;
  w: number;
  h: number;
  /** the form in the file */
  ref: unknown;
}

type Doc = InstanceType<typeof PDFDocument>;

/** The parts of the PDF writer the press reaches into: the page being written, and the matrix the writer keeps beside it. */
interface Raw {
  _ctm: number[];
  page: unknown;
  ref(data?: Record<string, unknown>): { data: Record<string, unknown>; write(chunk: string): void; end(): void };
  addContent(data: string): void;
}

/** Where a baseline sits in a line box of `lead` for type of `size`: the capitals stand in the middle of the box. */
const baselineIn = (lead: number, size: number): number => lead / 2 + size * 0.35;

export class Press {
  readonly doc: Doc;
  private readonly raw: Raw;
  /** the width of each word in each face at a size of one point: text is measured far more often than it is set */
  private readonly widths = new Map<string, number>();
  private readonly stamps = new Map<string, Stamp>();
  /** how many pages have been started */
  pages = 0;

  constructor(title: string) {
    this.doc = new PDFDocument({ size: [PAGE.w, PAGE.h], autoFirstPage: false, margin: 0, info: { Title: title, Author: 'Hevalo', Subject: 'Learning Kurmancî' } });
    this.raw = this.doc as unknown as Raw;
    for (const [name, file] of Object.entries(FONTS)) this.doc.registerFont(name, file);
    // the drawings' dotted lines are dashes of no length with round caps, which the PDF writer refuses: a hair of length draws the same dot
    const dash = this.doc.dash.bind(this.doc);
    const hair = (v: number): number => (v > 0 ? v : 0.01);
    this.doc.dash = ((length: number | number[], options?: { space?: number; phase?: number }) =>
      dash((Array.isArray(length) ? length.map(hair) : hair(length)) as number, options)) as typeof this.doc.dash;
  }

  /** A new page of paper. */
  page(paper: string = INK.paper): void {
    this.doc.addPage();
    this.pages += 1;
    this.doc.save().rect(0, 0, PAGE.w, PAGE.h).fill(paper).restore();
  }

  // ───────────────────────────────────────────────────────────── text

  /** How wide `text` is in a face at a size. */
  measure(text: string, face: FontKey, size: number, tracking = 0): number {
    const key = `${face}|${text}`;
    let unit = this.widths.get(key);
    if (unit === undefined) {
      unit = this.doc.font(face).fontSize(100).widthOfString(text) / 100;
      this.widths.set(key, unit);
    }
    return unit * size + tracking * Math.max(0, text.length - 1);
  }

  /**
   * A paragraph broken into lines no wider than `width`. Words are never
   * split, a space between two spans may break and a join without one may
   * not (so a comma stays with the bold word before it), and a line that
   * would end the paragraph on a single short word takes a companion down
   * with it where it can.
   */
  wrap(text: string | readonly Span[], width: number, type: Type, maxLines = Infinity): Line[] {
    const spans: readonly Span[] = typeof text === 'string' ? [{ text }] : text;
    // a word is one or more pieces with no space between them, each in its own face
    interface Piece {
      text: string;
      font: FontKey;
      color: string;
      w: number;
    }
    const words: Array<{ pieces: Piece[]; w: number }> = [];
    let open = false;
    for (const span of spans) {
      const face = span.font ?? type.font;
      const color = span.color ?? type.color;
      for (const part of span.text.split(/(\s+)/)) {
        if (part === '') continue;
        if (/^\s+$/.test(part)) {
          open = false;
          continue;
        }
        const piece = { text: part, font: face, color, w: this.measure(part, face, type.size, type.tracking) };
        if (open && words.length > 0) {
          const last = words[words.length - 1]!;
          last.pieces.push(piece);
          last.w += piece.w;
        } else words.push({ pieces: [piece], w: piece.w });
        open = true;
      }
    }
    const space = (face: FontKey): number => this.measure(' ', face, type.size) + (type.tracking ?? 0);
    const rows: Array<Array<{ pieces: Piece[]; w: number }>> = [];
    let row: Array<{ pieces: Piece[]; w: number }> = [];
    let used = 0;
    for (const word of words) {
      const gap = row.length > 0 ? space(row[row.length - 1]!.pieces.at(-1)!.font) : 0;
      if (row.length > 0 && used + gap + word.w > width + 0.01) {
        rows.push(row);
        row = [];
        used = 0;
      }
      used += (row.length > 0 ? gap : 0) + word.w;
      row.push(word);
    }
    if (row.length > 0) rows.push(row);
    // no widow: a last line of one short word is given the word before it, when the line above can spare it
    if (rows.length > 1) {
      const last = rows[rows.length - 1]!;
      const above = rows[rows.length - 2]!;
      if (last.length === 1 && last[0]!.w < width * 0.16 && above.length > 2) last.unshift(above.pop()!);
    }
    const kept = rows.slice(0, maxLines);
    if (rows.length > kept.length && kept.length > 0) {
      const tail = kept[kept.length - 1]!;
      const end = tail[tail.length - 1]!.pieces.at(-1)!;
      end.text = `${end.text.replace(/[.,;:!?]+$/, '')}…`;
    }
    return kept.map((r) => {
      const runs: Line['runs'] = [];
      let x = 0;
      r.forEach((word, i) => {
        if (i > 0) x += space(r[i - 1]!.pieces.at(-1)!.font);
        word.pieces.forEach((piece, k) => {
          const before = runs[runs.length - 1];
          // words in one face run on as one string, so the writer sets them in one go
          if (before && before.font === piece.font && before.color === piece.color) before.text += (k === 0 ? ' ' : '') + piece.text;
          else runs.push({ text: piece.text, font: piece.font, color: piece.color, x });
          x += piece.w;
        });
      });
      return { runs, width: x };
    });
  }

  /** Lines set from their top left corner; `width` and `align` place each line in a column. */
  set(lines: readonly Line[], x: number, y: number, type: Type, align: 'left' | 'center' | 'right' = 'left', width = 0): void {
    lines.forEach((line, i) => {
      const dx = align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 0;
      const base = y + i * type.lead + baselineIn(type.lead, type.size);
      for (const run of line.runs) {
        this.doc
          .font(run.font)
          .fontSize(type.size)
          .fillColor(run.color)
          .text(run.text, x + dx + run.x, base, { lineBreak: false, baseline: 'alphabetic', characterSpacing: type.tracking ?? 0 });
      }
    });
  }

  /** One line of text that is never broken, set from its top left; returns its width. */
  line(text: string, x: number, y: number, type: Type, align: 'left' | 'center' | 'right' = 'left', width = 0): number {
    const w = this.measure(text, type.font, type.size, type.tracking);
    const dx = align === 'center' ? (width - w) / 2 : align === 'right' ? width - w : 0;
    this.doc
      .font(type.font)
      .fontSize(type.size)
      .fillColor(type.color)
      .text(text, x + dx, y + baselineIn(type.lead, type.size), { lineBreak: false, baseline: 'alphabetic', characterSpacing: type.tracking ?? 0 });
    return w;
  }

  /** A paragraph, measured: its lines and the height they take. */
  para(text: string | readonly Span[], width: number, type: Type, maxLines = Infinity): { lines: Line[]; height: number } {
    const lines = this.wrap(text, width, type, maxLines);
    return { lines, height: lines.length * type.lead };
  }

  // ───────────────────────────────────────────────────────────── drawings

  /**
   * A drawing as a form in the file: made from its SVG the first time it is
   * asked for under `key`, and the same form after that. `w` by `h` is the
   * box it is drawn into, in the form's own points; it is placed at any size.
   */
  art(key: string, w: number, h: number, svg: () => string): Stamp {
    const made = this.stamps.get(key);
    if (made) return made;
    const raw = this.raw;
    const resources = raw.ref();
    const form = raw.ref({ Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, w, h], Resources: resources });
    form.write('');
    const page = { width: w, height: h, write: (data: string) => form.write(data), fonts: {}, xobjects: {}, ext_gstates: {}, patterns: {} };
    const [savedPage, savedMatrix] = [raw.page, raw._ctm];
    raw.page = page;
    // a page is written top-down by a flip the writer puts at its head; a form needs the same, and the writer has to know of it, since it places gradients by its own copy of the matrix
    raw.addContent(`1 0 0 -1 0 ${h} cm`);
    raw._ctm = [1, 0, 0, -1, 0, h];
    try {
      SVGtoPDF(this.doc, svg(), 0, 0, { width: w, height: h, preserveAspectRatio: 'xMidYMid meet' });
    } finally {
      raw.page = savedPage;
      raw._ctm = savedMatrix;
    }
    for (const [name, held] of [['Font', page.fonts], ['XObject', page.xobjects], ['ExtGState', page.ext_gstates], ['Pattern', page.patterns]] as const) {
      if (Object.keys(held).length > 0) resources.data[name] = held;
    }
    resources.end();
    form.end();
    const stamp = { name: `Bk${this.stamps.size + 1}`, w, h, ref: form };
    this.stamps.set(key, stamp);
    return stamp;
  }

  /**
   * A drawing placed with its top left at (x, y), `w` wide (and as tall as
   * its own shape makes it): mirrored left to right with `flip`, turned by
   * `turn` degrees about its middle.
   */
  place(stamp: Stamp, x: number, y: number, w: number, options: { flip?: boolean; turn?: number } = {}): void {
    const k = w / stamp.w;
    const h = stamp.h * k;
    const doc = this.doc;
    doc.save();
    if (options.turn) doc.rotate(options.turn, { origin: [x + w / 2, y + h / 2] });
    if (options.flip) doc.transform(-1, 0, 0, 1, 2 * x + w, 0);
    // the form is written bottom-up in its own box: turned over again to stand on the page
    doc.transform(k, 0, 0, -k, x, y + h);
    (this.raw.page as { xobjects: Record<string, unknown> }).xobjects[stamp.name] = stamp.ref;
    this.raw.addContent(`/${stamp.name} Do`);
    doc.restore();
  }

  // ───────────────────────────────────────────────────────────── shapes

  /** A filled box with rounded corners. */
  box(x: number, y: number, w: number, h: number, r: number, fill: string): void {
    this.doc.save().roundedRect(x, y, w, h, r).fill(fill).restore();
  }

  /** What `draw` draws, kept inside a rounded box. */
  within(x: number, y: number, w: number, h: number, r: number, draw: () => void): void {
    this.doc.save();
    this.doc.roundedRect(x, y, w, h, r).clip();
    draw();
    this.doc.restore();
  }

  disc(cx: number, cy: number, r: number, fill: string): void {
    this.doc.save().circle(cx, cy, r).fill(fill).restore();
  }

  ring(cx: number, cy: number, r: number, stroke: string, width = 0.8, dash = 0): void {
    this.doc.save().circle(cx, cy, r).lineWidth(width);
    if (dash > 0) this.doc.dash(dash, { space: dash * 1.4 });
    this.doc.strokeColor(stroke).stroke().restore();
  }

  /** A hairline across. */
  rule(x: number, y: number, w: number, color: string, width = 0.6): void {
    this.doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke().restore();
  }

  /** A dotted line to write on. */
  dots(x: number, y: number, w: number, color: string): void {
    this.doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(0.7).lineCap('round').dash(0.1, { space: 2.6 }).strokeColor(color).stroke().undash().restore();
  }

  /**
   * A speech bubble: a rounded box with a small tail on its left or right
   * edge (`tail` is how far down that edge it points out), or underneath.
   */
  bubble(x: number, y: number, w: number, h: number, fill: string, tail: { side: 'left' | 'right' | 'down'; at: number } | null = null, r = 6): void {
    const doc = this.doc;
    doc.save().roundedRect(x, y, w, h, Math.min(r, h / 2)).fill(fill);
    if (tail) {
      if (tail.side === 'down') doc.moveTo(x + tail.at - 4, y + h - 0.5).lineTo(x + tail.at - 1, y + h + 5.5).lineTo(x + tail.at + 5, y + h - 0.5).fill(fill);
      else {
        const edge = tail.side === 'left' ? x + 0.5 : x + w - 0.5;
        const out = tail.side === 'left' ? -6 : 6;
        doc.moveTo(edge, y + tail.at - 3.6).lineTo(edge + out, y + tail.at + 1.2).lineTo(edge, y + tail.at + 3.8).fill(fill);
      }
    }
    doc.restore();
  }

  /** The finished file. */
  finish(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    this.doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
    });
    this.doc.end();
    return done;
  }
}
