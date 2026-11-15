/**
 * The Hevalo book laid out as a PDF: A5 pages on warm paper, headings in
 * Fraunces and reading text in Literata (both under the SIL Open Font
 * Licence, shipped by their packages), and the app's own drawings — the
 * characters, and each chapter's landmark on its ground — drawn as vectors,
 * so they print sharp at any size.
 *
 * The order: a cover; a letter from Hamo; the alphabet with a word and an
 * English sound for each letter; the people of the road; then each chapter —
 * an opening page with its landmark and what it teaches, a page or two for
 * each part (words, the grammar, a conversation with Hamo, sentences to read
 * aloud), Hamo's story with its English under each paragraph and its
 * questions, and practice — and at the back the word list and the answers.
 */
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { LATIN_LETTERS, ALPHABET_MEANINGS, characterSvg, likeFor, pathGroundColour, pathLandmarkSvg, type CharacterId } from '@kurda/shared';
import { roadBookWordList, type BookChapter } from './road-book.js';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string): string => require.resolve(`@expo-google-fonts/${pkg}/${file}`);
const FONTS = {
  display: font('fraunces', '600SemiBold/Fraunces_600SemiBold.ttf'),
  displayLight: font('fraunces', '400Regular_Italic/Fraunces_400Regular_Italic.ttf'),
  body: font('literata', '400Regular/Literata_400Regular.ttf'),
  italic: font('literata', '400Regular_Italic/Literata_400Regular_Italic.ttf'),
  bold: font('literata', '700Bold/Literata_700Bold.ttf'),
} as const;

/** A5, in points. */
const W = 419.53;
const H = 595.28;
const M = { left: 46, right: 46, top: 50, bottom: 58 } as const;
const TEXT_W = W - M.left - M.right;

const PAPER = '#FBF6EC';
const INK = '#2B241F';
const MUTED = '#7B6F64';
const RULE = '#E4D9C6';
const ACCENT = '#A2512E';

/** A colour made darker by `k` (0–1), for text on a chapter's own ground. */
function deepen(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = (s: number): string => Math.round(((v >> s) & 255) * (1 - k)).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

/** A sound hint with its marked letters, "f[a]ther", as plain text with the sound in capitals: "fAther" reads badly, so the marks are dropped. */
function soundHint(letter: string): string {
  const like = likeFor(letter, 'en');
  return like ? `${like.before}${like.sound ?? ''}${like.after}` : '';
}

export interface RoadBookOptions {
  chapters: readonly BookChapter[];
  /** who the people of the road are, in the plan's words */
  characters: Readonly<Record<string, string>>;
  /** the address printed on the cover and the colophon */
  site?: string;
}

type Doc = InstanceType<typeof PDFDocument>;

class Book {
  readonly doc: Doc;
  /** what each page's footer says, by page */
  private readonly footers: Array<string | null> = [];
  /** the next page's paper and footer: a page the text flows onto keeps the last page's */
  private next: { footer: string | null; paper: string } = { footer: null, paper: PAPER };

  constructor(title: string) {
    this.doc = new PDFDocument({ size: 'A5', autoFirstPage: false, bufferPages: true, margins: { ...M }, info: { Title: title, Author: 'Hevalo', Subject: 'Learning Kurmancî' } });
    this.doc.registerFont('display', FONTS.display);
    this.doc.registerFont('displayItalic', FONTS.displayLight);
    this.doc.registerFont('body', FONTS.body);
    this.doc.registerFont('italic', FONTS.italic);
    this.doc.registerFont('bold', FONTS.bold);
    // the drawings' dotted lines are dashes of no length with round caps, which the PDF writer refuses: a hair of length draws the same dot
    const dash = this.doc.dash.bind(this.doc);
    const hair = (v: number): number => (v > 0 ? v : 0.01);
    this.doc.dash = ((length: number | number[], options?: { space?: number; phase?: number }) =>
      dash((Array.isArray(length) ? length.map(hair) : hair(length)) as number, options)) as typeof this.doc.dash;
    // every page, the ones the book asks for and the ones a long text flows onto, on paper and with its footer
    this.doc.on('pageAdded', () => {
      const { x, y } = this.doc;
      this.doc.save().rect(0, 0, W, H).fill(this.next.paper).restore();
      this.doc.x = x;
      this.doc.y = y;
      this.footers.push(this.next.footer);
      this.next = { footer: this.next.footer, paper: PAPER };
    });
  }

  page(footer: string | null, paper = PAPER): void {
    this.next = { footer, paper };
    this.doc.addPage();
    this.doc.x = M.left;
    this.doc.y = M.top;
  }

  /** Room for `h` more points on this page, or a new page with the same footer. */
  room(h: number): void {
    if (this.doc.y + h > H - M.bottom) this.page(this.next.footer);
  }

  svg(svg: string, x: number, y: number, w: number, h: number): void {
    SVGtoPDF(this.doc, svg, x, y, { width: w, height: h, preserveAspectRatio: 'xMidYMid meet' });
  }

  heading(text: string, size = 17, color = INK): void {
    this.room(size * 2.4);
    this.doc.font('display').fontSize(size).fillColor(color).text(text, M.left, this.doc.y, { width: TEXT_W });
    this.doc.moveDown(0.35);
  }

  /** A small heading, never left alone at the foot of a page: it keeps room for what it heads. */
  label(text: string, color = ACCENT, keep = 72): void {
    this.room(keep);
    this.doc.font('bold').fontSize(7.5).fillColor(color).text(text.toUpperCase(), M.left, this.doc.y, { width: TEXT_W, characterSpacing: 1.2 });
    this.doc.moveDown(0.3);
  }

  /** A little Markdown: paragraphs, "- " lists, **bold** and *italic*. */
  md(text: string, size = 10, color = INK): void {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n');
      const bullets = lines.every((l) => /^\s*[-•]\s+/.test(l));
      if (bullets) {
        for (const l of lines) this.runs(l.replace(/^\s*[-•]\s+/, ''), size, color, 12);
      } else {
        this.runs(lines.join(' '), size, color, 0);
      }
      this.doc.moveDown(0.35);
    }
  }

  private runs(text: string, size: number, color: string, indent: number): void {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).filter((p) => p !== '');
    this.room(size * 2);
    const x = M.left + indent;
    if (indent > 0) this.doc.font('body').fontSize(size).fillColor(ACCENT).text('•', M.left + 2, this.doc.y, { continued: false, lineBreak: false });
    const y = this.doc.y;
    parts.forEach((p, i) => {
      const bold = p.startsWith('**');
      const italic = !bold && p.startsWith('*');
      const plain = bold ? p.slice(2, -2) : italic ? p.slice(1, -1) : p;
      const options = { width: TEXT_W - indent, continued: i < parts.length - 1, lineGap: 1.6 };
      this.doc.font(bold ? 'bold' : italic ? 'italic' : 'body').fontSize(size).fillColor(color);
      // only the first run is placed; the rest follow on from it (a run given an empty place would lose its options)
      if (i === 0) this.doc.text(plain, x, y, options);
      else this.doc.text(plain, options);
    });
  }

  rule(): void {
    this.room(14);
    const y = this.doc.y + 4;
    this.doc.save().moveTo(M.left, y).lineTo(W - M.right, y).lineWidth(0.6).strokeColor(RULE).stroke().restore();
    this.doc.y = y + 8;
  }

  /** Every page's footer: the running title on the left and the page number on the right, from the second page on. */
  finish(): Buffer[] {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      const label = this.footers[i - range.start];
      if (label === null || label === undefined) continue;
      this.doc.switchToPage(i);
      // in the bottom margin, where text would otherwise start a new page: this page's own margins, never the shared ones
      this.doc.page.margins = { ...this.doc.page.margins, bottom: 0 };
      const y = H - M.bottom + 26;
      this.doc.font('italic').fontSize(7.5).fillColor(MUTED);
      this.doc.text(label, M.left, y, { width: TEXT_W / 2, lineBreak: false });
      this.doc.text(String(i + 1), M.left + TEXT_W / 2, y, { width: TEXT_W / 2, align: 'right', lineBreak: false });
    }
    return [];
  }
}

function cover(book: Book, chapters: readonly BookChapter[], site: string): void {
  const { doc } = book;
  book.page(null, '#F4EBDA');
  const first = chapters[0]?.land ?? { landmark: 'gate' as const, ground: 'orchard' as const, host: 'hamo' as const };
  const ground = pathGroundColour(first.ground);
  // the ground the three of them stand on, under the village gate
  doc.save().ellipse(W / 2, 410, 190, 46).fill(ground).restore();
  book.svg(pathLandmarkSvg({ landmark: first.landmark, size: 240 }), W / 2 - 120, 170, 240, 240);
  const stand = (id: CharacterId, x: number, h: number): void => book.svg(characterSvg(id, { crop: 'full' }), x, 430 - h, h * 0.62, h);
  stand('xezo', 52, 200);
  stand('hamo', 150, 236);
  stand('hevalo', 268, 170);
  doc.font('display').fontSize(36).fillColor(INK).text('Rêya Kurmancî', M.left, 64, { width: TEXT_W, align: 'center' });
  doc.font('displayItalic').fontSize(14).fillColor(ACCENT).text('Pirtûka Hevalo · The Kurmanji Road', M.left, 110, { width: TEXT_W, align: 'center' });
  const span = chapters.length === 0 ? '' : chapters.length === 1 ? `Chapter ${chapters[0]!.number}` : `Chapters ${chapters[0]!.number}–${chapters.at(-1)!.number}`;
  doc.font('body').fontSize(10).fillColor(MUTED).text(span, M.left, 470, { width: TEXT_W, align: 'center' });
  doc.font('italic').fontSize(9).fillColor(MUTED).text(`Learn Kurmancî with Hamo, Xezal and Hevalo · ${site}`, M.left, 520, { width: TEXT_W, align: 'center' });
}

function letter(book: Book): void {
  const { doc } = book;
  book.page('Rêya Kurmancî');
  book.svg(characterSvg('hamo', { crop: 'bust', mouth: 'grin' }), W - M.right - 92, M.top - 6, 92, 92);
  doc.font('display').fontSize(22).fillColor(INK).text('Silav, hevalê min!', M.left, M.top + 20, { width: TEXT_W - 100 });
  doc.moveDown(1.6);
  book.md(
    [
      'I am **Hamo**, from Sêvan, a village of apple orchards under the mountains. You will hear my voice all along this road: every word in the lessons is me, saying it the way we say it at home.',
      'This book walks the road with you. Each chapter has its **words**, the **grammar** in a few lines, a **conversation** we have together, sentences to **read aloud**, and a **story** I tell at the end of it. Read everything aloud, even when you are alone: Kurdish lives in the mouth, not only on the page.',
      'Do the practice with a pencil and check yourself at the back of the book. When something will not stay in your head, go back to the app, listen to me say it, and say it after me. Then come back here tomorrow and try again: what you remember on the second day is yours.',
      'And if you see a young deer with round cheeks near the apple trees, that is **Hevalo**. Do not believe him when he says he is not hungry.',
      '*Bi xêr hatî* — welcome.',
    ].join('\n\n'),
    10.5,
  );
  doc.moveDown(0.6);
  doc.font('displayItalic').fontSize(16).fillColor(ACCENT).text('— Hamo', { width: TEXT_W, align: 'right' });
}

function alphabet(book: Book): void {
  const { doc } = book;
  book.page('Rêya Kurmancî · Alfabe');
  book.label('Alfabe · The alphabet');
  book.heading('Thirty-one letters, one sound each', 17);
  book.md('Kurmancî is written as it is said: each letter has one sound. The ones with a hat are long, **ê î û**; **ç ş** are *ch* and *sh*; **x** is the *ch* of Scottish *loch*; **q** is a *k* made deep in the throat. Here is each letter with a word Hamo uses every day.', 9.5);
  doc.moveDown(0.4);
  const cols = 3;
  const cellW = TEXT_W / cols;
  const cellH = 46;
  let y = doc.y;
  LATIN_LETTERS.forEach((l, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) y += cellH;
    if (y + cellH > H - M.bottom) {
      book.page('Rêya Kurmancî · Alfabe');
      y = M.top;
    }
    const x = M.left + col * cellW;
    doc.font('display').fontSize(18).fillColor(ACCENT).text(`${l.upper}${l.id}`, x, y, { width: 40, lineBreak: false });
    doc.font('bold').fontSize(9.5).fillColor(INK).text(l.word, x + 40, y + 2, { width: cellW - 44, lineBreak: false });
    doc.font('italic').fontSize(8).fillColor(MUTED).text(ALPHABET_MEANINGS[l.meaning].en, x + 40, y + 14, { width: cellW - 44, lineBreak: false });
    doc.font('body').fontSize(7).fillColor(MUTED).text(`as in ${soundHint(l.id)}`, x, y + 27, { width: cellW - 8, height: 18, ellipsis: true });
  });
  doc.y = y + cellH;
}

function people(book: Book, characters: Readonly<Record<string, string>>): void {
  const { doc } = book;
  book.page('Rêya Kurmancî · The people of the road');
  book.label('The people of the road');
  const who: Array<[CharacterId, string, string]> = [
    ['hamo', 'Hamo', characters.hamo ?? ''],
    ['xezo', 'Xezal', characters.xezo ?? ''],
    ['hevalo', 'Hevalo', characters.hevalo ?? ''],
  ];
  for (const [id, name, about] of who) {
    book.room(150);
    const y = doc.y;
    book.svg(characterSvg(id, { crop: 'bust' }), M.left, y, 84, 84);
    doc.font('display').fontSize(16).fillColor(INK).text(name, M.left + 96, y + 4, { width: TEXT_W - 96 });
    // the first three sentences: who they are, not the whole plan
    const short = about.split(/(?<=\.)\s+/).slice(0, 3).join(' ');
    doc.font('body').fontSize(9).fillColor(INK).text(short, M.left + 96, doc.y + 2, { width: TEXT_W - 96, lineGap: 1.4 });
    doc.y = Math.max(doc.y, y + 92) + 12;
  }
}

function opener(book: Book, c: BookChapter): void {
  const { doc } = book;
  const ground = pathGroundColour(c.land.ground);
  book.page(`Beş ${c.number} · ${c.titleKu}`);
  // the chapter's land across the top of the page, its landmark standing on it
  doc.save().rect(0, 0, W, 200).fill(ground).restore();
  doc.save().rect(0, 192, W, 8).fill(deepen(ground, 0.12)).restore();
  book.svg(pathLandmarkSvg({ landmark: c.land.landmark, size: 176 }), W / 2 - 88, 22, 176, 176);
  book.svg(characterSvg(c.land.host === 'xezo' ? 'xezo' : 'hamo', { crop: 'full' }), W - M.right - 64, 84, 64, 116);
  doc.y = 216;
  book.label(`Beş ${c.number} · Chapter ${c.number} · ${c.cefr}`, deepen(ground, 0.45));
  doc.font('display').fontSize(28).fillColor(INK).text(c.titleKu, M.left, doc.y, { width: TEXT_W });
  doc.font('displayItalic').fontSize(13).fillColor(MUTED).text(c.titleEn, M.left, doc.y, { width: TEXT_W });
  doc.moveDown(0.6);
  book.md(c.summary, 9.2);
  book.rule();
  book.label('In this chapter');
  for (const p of c.parts) {
    book.room(20);
    doc.font('bold').fontSize(10).fillColor(INK).text(`${p.position}. ${p.titleKu}`, M.left, doc.y, { continued: true, width: TEXT_W });
    doc.font('italic').fontSize(10).fillColor(MUTED).text(`  ${p.titleEn}`, { width: TEXT_W });
    doc.moveDown(0.15);
  }
}

function part(book: Book, c: BookChapter, p: BookChapter['parts'][number]): void {
  const { doc } = book;
  const accent = deepen(pathGroundColour(c.land.ground), 0.45);
  book.page(`Beş ${c.number} · ${c.titleKu}`);
  book.label(`Beş ${c.number} · part ${p.position}`, accent);
  doc.font('display').fontSize(20).fillColor(INK).text(p.titleKu, M.left, doc.y, { width: TEXT_W });
  doc.font('displayItalic').fontSize(12).fillColor(MUTED).text(p.titleEn, { width: TEXT_W });
  doc.moveDown(0.7);

  if (p.words.length > 0) {
    book.label('Peyv · Words', accent);
    const half = TEXT_W / 2;
    let y = doc.y;
    p.words.forEach((w, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += 26;
      if (y + 26 > H - M.bottom) {
        book.page(`Beş ${c.number} · ${c.titleKu}`);
        y = M.top;
      }
      const x = M.left + col * half;
      doc.font('bold').fontSize(9.6).fillColor(INK).text(w.ku, x, y, { width: half - 30, lineBreak: false, ellipsis: true });
      if (w.gender) doc.font('italic').fontSize(7).fillColor(accent).text(w.gender, x + half - 24, y + 1.5, { width: 16, lineBreak: false });
      doc.font('italic').fontSize(8).fillColor(MUTED).text(w.en, x, y + 11.5, { width: half - 10, height: 12, ellipsis: true });
    });
    doc.y = y + 30;
  }

  if (p.grammarMd.trim() !== '') {
    book.rule();
    book.label('Rêziman · Grammar', accent);
    book.md(p.grammarMd, 9.4);
  }

  if (p.dialogue) {
    book.rule();
    book.label(`Axaftin · Talk with Hamo${p.dialogue.title ? ` · ${p.dialogue.title}` : ''}`, accent);
    for (const l of p.dialogue.lines) {
      book.room(30);
      const y = doc.y;
      doc.font('bold').fontSize(8).fillColor(l.learner ? ACCENT : accent).text(l.who, M.left, y + 1, { width: 50, lineBreak: false });
      doc.font('body').fontSize(9.8).fillColor(INK).text(l.text, M.left + 54, y, { width: TEXT_W - 54 });
      if (l.en) doc.font('italic').fontSize(8).fillColor(MUTED).text(l.en, M.left + 54, doc.y, { width: TEXT_W - 54 });
      doc.moveDown(0.3);
    }
  }

  if (p.sentences.length > 0) {
    book.rule();
    book.label('Bi dengekî bilind bixwîne · Read aloud', accent);
    for (const s of p.sentences) {
      book.room(28);
      doc.font('body').fontSize(9.8).fillColor(INK).text(s.ku, M.left, doc.y, { width: TEXT_W });
      doc.font('italic').fontSize(8).fillColor(MUTED).text(s.en, { width: TEXT_W });
      doc.moveDown(0.3);
    }
  }
}

function tale(book: Book, c: BookChapter): void {
  if (!c.tale) return;
  const { doc } = book;
  const accent = deepen(pathGroundColour(c.land.ground), 0.45);
  book.page(`Beş ${c.number} · ${c.titleKu}`);
  book.svg(characterSvg('hamo', { crop: 'bust', mouth: 'grin' }), W - M.right - 70, M.top - 8, 70, 70);
  book.label('Çîroka Hamo · Hamo’s story', accent);
  doc.font('display').fontSize(22).fillColor(INK).text(c.tale.title, M.left, doc.y, { width: TEXT_W - 80 });
  doc.moveDown(1);
  c.tale.paragraphs.forEach((p, i) => {
    book.room(60);
    doc.font('body').fontSize(11).fillColor(INK).text(p, M.left, doc.y, { width: TEXT_W, lineGap: 2.2 });
    const en = c.tale!.english[i];
    if (en) doc.font('italic').fontSize(8.4).fillColor(MUTED).text(en, M.left, doc.y + 3, { width: TEXT_W, lineGap: 1.2 });
    doc.moveDown(0.8);
  });
  if (c.tale.glossary.length > 0) {
    book.rule();
    book.label('Ferheng · Glossary', accent);
    for (const g of c.tale.glossary) {
      book.room(16);
      doc.font('bold').fontSize(9).fillColor(INK).text(g.term, M.left, doc.y, { continued: true });
      doc.font('italic').fontSize(9).fillColor(MUTED).text(`  ${g.en}`);
    }
  }
  if (c.tale.questions.length > 0) {
    book.rule();
    book.label('Pirs · Questions', accent);
    c.tale.questions.forEach((q, i) => {
      book.room(40);
      doc.font('bold').fontSize(9.4).fillColor(INK).text(`${i + 1}. ${q.prompt}`, M.left, doc.y, { width: TEXT_W });
      doc.font('body').fontSize(9).fillColor(INK).text(q.options.map((o, k) => `${'abcdef'[k]}) ${o}`).join('    '), M.left + 12, doc.y + 1, { width: TEXT_W - 12 });
      doc.moveDown(0.45);
    });
  }
}

function practice(book: Book, c: BookChapter): void {
  if (c.practice.length === 0) return;
  const { doc } = book;
  const accent = deepen(pathGroundColour(c.land.ground), 0.45);
  book.page(`Beş ${c.number} · ${c.titleKu}`);
  book.label(`Beş ${c.number} · Practice`, accent);
  doc.font('display').fontSize(20).fillColor(INK).text('Bi pênûsê · With a pencil', M.left, doc.y, { width: TEXT_W });
  doc.moveDown(0.6);
  const groups: Array<[string, typeof c.practice]> = [
    ['Write it in Kurdish', c.practice.filter((p) => p.direction === 'to-kurdish')],
    ['Say what it means in English', c.practice.filter((p) => p.direction === 'to-english')],
  ];
  let n = 0;
  for (const [title, items] of groups) {
    if (items.length === 0) continue;
    book.label(title, accent);
    for (const p of items) {
      n += 1;
      book.room(30);
      const y = doc.y;
      doc.font('bold').fontSize(9).fillColor(accent).text(`${n}.`, M.left, y, { width: 18, lineBreak: false });
      doc.font(p.direction === 'to-kurdish' ? 'italic' : 'body').fontSize(9.8).fillColor(INK).text(p.ask, M.left + 20, y, { width: TEXT_W - 20 });
      const line = doc.y + 9;
      doc.save().moveTo(M.left + 20, line).lineTo(W - M.right, line).lineWidth(0.5).dash(1.5, { space: 2.5 }).strokeColor(RULE).stroke().undash().restore();
      doc.y = line + 8;
    }
    doc.moveDown(0.5);
  }
}

function wordList(book: Book, chapters: readonly BookChapter[]): void {
  const { doc } = book;
  const words = roadBookWordList(chapters);
  if (words.length === 0) return;
  book.page('Rêya Kurmancî · Word list');
  book.label('Ferheng · Word list');
  book.heading('Every word of the road so far', 17);
  doc.font('italic').fontSize(8.5).fillColor(MUTED).text('In Kurdish alphabetical order, with the chapter each word is first met in. m and f mark masculine and feminine nouns.', { width: TEXT_W });
  doc.moveDown(0.6);
  const colW = TEXT_W / 2;
  const top = doc.y;
  let col = 0;
  let y = top;
  let pageTop = top;
  for (const w of words) {
    if (y + 13 > H - M.bottom) {
      if (col === 0) {
        col = 1;
        y = pageTop;
      } else {
        book.page('Rêya Kurmancî · Word list');
        col = 0;
        pageTop = M.top;
        y = pageTop;
      }
    }
    const x = M.left + col * colW;
    const kuW = colW * 0.44;
    doc.font('bold').fontSize(8).fillColor(INK).text(w.ku, x, y, { width: kuW - 4, height: 11, lineBreak: false, ellipsis: true });
    doc
      .font('italic')
      .fontSize(7.2)
      .fillColor(MUTED)
      .text(`${w.gender ? `${w.gender} · ` : ''}${w.en.replace(/\s*\(.*?\)/g, '')} · ${w.chapter}`, x + kuW, y + 0.6, { width: colW - kuW - 8, height: 11, lineBreak: false, ellipsis: true });
    y += 12.5;
  }
}

function answers(book: Book, chapters: readonly BookChapter[]): void {
  const { doc } = book;
  book.page('Rêya Kurmancî · Answers');
  book.label('Bersiv · Answers');
  book.heading('Check yourself', 17);
  for (const c of chapters) {
    book.room(40);
    doc.font('display').fontSize(12).fillColor(INK).text(`Beş ${c.number} · ${c.titleKu}`, M.left, doc.y, { width: TEXT_W });
    doc.moveDown(0.2);
    if (c.tale && c.tale.questions.length > 0) {
      doc.font('italic').fontSize(8.6).fillColor(MUTED).text(`Hamo’s story: ${c.tale.questions.map((q, i) => `${i + 1}${'abcdef'[q.answer]}`).join(', ')}`, { width: TEXT_W });
    }
    c.practice.forEach((p, i) => {
      book.room(14);
      doc.font('body').fontSize(8.6).fillColor(INK).text(`${i + 1}. ${p.answer}`, M.left, doc.y, { width: TEXT_W });
    });
    doc.moveDown(0.6);
  }
}

function colophon(book: Book, site: string): void {
  const { doc } = book;
  book.page('Rêya Kurmancî');
  doc.y = H / 2 - 60;
  doc.font('displayItalic').fontSize(14).fillColor(ACCENT).text('Bi xêr bimînî!', M.left, doc.y, { width: TEXT_W, align: 'center' });
  doc.moveDown(0.6);
  doc.font('body').fontSize(9).fillColor(MUTED).text(
    `Rêya Kurmancî — The Kurmanji Road. Written for Hevalo, with Hamo’s voice in the app at ${site}. The drawings are Hevalo’s own. Set in Fraunces and Literata, both under the SIL Open Font Licence. New chapters arrive in the book as they go online.`,
    M.left + 20,
    doc.y,
    { width: TEXT_W - 40, align: 'center', lineGap: 1.5 },
  );
}

/** The book for these chapters, as PDF bytes. */
export function renderRoadBook(options: RoadBookOptions): Promise<Buffer> {
  const site = options.site ?? 'hevalo.app';
  const chapters = options.chapters;
  const book = new Book(chapters.length === 1 ? `Rêya Kurmancî · Beş ${chapters[0]!.number}` : 'Rêya Kurmancî · Pirtûka Hevalo');
  const chunks: Buffer[] = [];
  book.doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    book.doc.on('end', () => resolve(Buffer.concat(chunks)));
    book.doc.on('error', reject);
  });
  cover(book, chapters, site);
  letter(book);
  alphabet(book);
  people(book, options.characters);
  for (const c of chapters) {
    opener(book, c);
    for (const p of c.parts) part(book, c, p);
    tale(book, c);
    practice(book, c);
  }
  wordList(book, chapters);
  answers(book, chapters);
  colophon(book, site);
  book.finish();
  book.doc.end();
  return done;
}
