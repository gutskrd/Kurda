/**
 * The Hevalo book laid out as a PDF: an illustrated coursebook of the
 * Kurmanji Road, A5 on warm paper, made on request from the course's own
 * files (road-book.ts gathers them; this file sets the book in order).
 *
 * The order: a cover; a letter from Hamo and how to read the book; the
 * contents; the passport of the road, with a stamp to cancel for each
 * chapter; the alphabet in pictures; the people of the road; then each
 * chapter (chapter.ts) — an opening page under its landmark, its four parts
 * lesson by lesson, the story Hamo tells, practice for a pencil, and its
 * stamp — and at the back the answers, the word list and the author's note.
 * What the book says in its own words is in prose.ts.
 *
 * Each chapter wears one of the app's hues (pictures.ts), and an apple sits
 * in the corner of every one of its pages, a bite smaller every few pages:
 * the deer who is never hungry, he says, has been at it again.
 *
 * Pages are broken by rule (flow.ts): everything is measured first, so a
 * heading never ends a page and a list never leaves one line behind; and
 * since the whole book is measured before a page is drawn, the contents and
 * every chapter's opening page can say where things are.
 */
import { HUES, bookAppleSvg, bookPostmarkSvg, letterBirdSvg, likeFor, pathLandmarkSvg, stampBox, stampShapeFor, stampSvg, BOOK_APPLE_BITES, type BookPose, type CharacterId } from '@kurda/shared';
import { chapterSheets } from './chapter.js';
import { keepList, paginate } from './flow.js';
import { STAMP, T, VIOLET, castArt, display, displayItalic, drawPicture, drawStamp, furnish, heavy, hueOf, label, runSheets, squareArt, type Block, type Places, type Sheet } from './page.js';
import { chapterHue, pictureForName, pictureForWord, type BookPicture } from './pictures.js';
import { AUTHOR, FRIENDS, LETTER } from './prose.js';
import { chapterWords, roadBookAlphabet, roadBookWordList, type BookChapter, type BookName, type BookWord } from './road-book.js';
import { INK, PAGE, Press, TEXT, type Line, type Span, type Type } from './sheet.js';

/** How many chapters the whole road has: a book of fewer is a book still growing, and says so on its last page. */
const ROAD_CHAPTERS = 12;

export interface RoadBookOptions {
  chapters: readonly BookChapter[];
  /** everyone the chapters speak of, in the plan's words (`roadBookCast`) */
  people?: readonly BookName[];
  /** the address printed on the cover and the last page */
  site?: string;
}

/** A line of the plan's that this book teaches, with its meaning, or null when these chapters do not have it. */
function taught(chapters: readonly BookChapter[], ku: string): BookWord | null {
  for (const c of chapters) for (const w of chapterWords(c)) if (w.ku === ku) return w;
  return null;
}

// ───────────────────────────────────────────────────────────── the cover

function coverSheet(press: Press, chapters: readonly BookChapter[], site: string): Sheet {
  return {
    furniture: null,
    draw: (): void => {
      const doc = press.doc;
      // the hill the three of them stand on, in the app's own violet
      doc.save().ellipse(PAGE.w / 2 + 30, PAGE.h + 150, 420, 340).fill(VIOLET.wash).restore();
      doc.save().ellipse(PAGE.w / 2 - 60, PAGE.h + 196, 400, 330).fill(VIOLET.tint).restore();
      press.line('HEVALO’S BOOK', TEXT.x, 46, label(VIOLET.deep, 7.4));
      const title = heavy(41, INK.ink);
      press.line('Rêya', TEXT.x, 62, title);
      press.line('Kurmancî', TEXT.x, 62 + 43, title);
      press.line('The Kurmanji Road', TEXT.x, 158, displayItalic(15.5, VIOLET.deep));
      const about = press.para('Every lesson of the road with Hamo, Xezal and Hevalo, in words and pictures.', 168, { ...T.body, color: INK.soft });
      press.set(about.lines, TEXT.x, 185, { ...T.body, color: INK.soft });

      // the stamp a letter from Sêvan would carry, a little askew, its postmark, and the bird that brought it
      const first = chapters[0]?.number ?? 1;
      const k = 1.02;
      const [sx, sy] = [274, 50];
      doc.save();
      doc.rotate(6, { origin: [sx + 50 * k, sy + 63 * k] });
      // on paper a stamp's light is a faint halo: the shelf's glow, made for a screen, prints as a heavy coloured blur
      const box = stampBox(STAMP.w, STAMP.h, 0.2);
      const paper = press.art('stamp|cover', box.width, box.height, () => stampSvg({ width: STAMP.w, height: STAMP.h, paper: VIOLET.tint, glow: VIOLET.base, strength: 0.2, edge: VIOLET.base, ...stampShapeFor(STAMP.w) }));
      press.place(paper, sx - box.inset * k, sy - box.inset * k, box.width * k);
      // the deer in the stamp's picture window, which his chest runs out of at the foot, as a portrait on a stamp does, rather than ending in a cut
      const deer = castArt(press, 'hevalo', 'caught');
      const win = { x: sx + 9 * k, y: sy + 9 * k, w: 82 * k, h: 86 * k };
      const dw = 80 * k;
      press.box(win.x, win.y, win.w, win.h, 4 * k, VIOLET.wash);
      press.within(win.x, win.y, win.w, win.h, 4 * k, () => press.place(deer, sx + 50 * k - dw / 2, win.y + win.h + 4 * k - (dw * deer.h) / deer.w, dw));
      press.line('SÊVAN', sx, sy + 102 * k, label(VIOLET.deep, 8.4), 'center', STAMP.w * k);
      doc.restore();
      press.place(squareArt(press, `postmark|${chapterHue(first)}`, () => bookPostmarkSvg({ ink: HUES.light[chapterHue(first)].deep })), 226, 24, 88, { turn: -12 });
      press.place(squareArt(press, 'bird|letter', () => letterBirdSvg({ bird: 2, pose: 'wings-up', letter: true })), 196, 196, 68);

      // the three friends a few steps in front of the blue gate: the gate stands further up the hill and larger, so a door is a door beside them
      const ground = 502;
      press.place(squareArt(press, 'landmark|gate|orchard', () => pathLandmarkSvg({ landmark: 'gate', ground: 'orchard' })), 132, ground - 300, 300);
      const stand = (who: CharacterId, pose: string, x: number, h: number, forward = 0): void => {
        const art = castArt(press, who, pose, 'full');
        press.place(art, x, ground + forward - h, (h * art.w) / art.h);
      };
      stand('xezo', 'smiling', 40, 160, 6);
      stand('hamo', 'proud', 108, 190, 8);
      // the deer a step nearer than the gate, so its tree is behind his antlers and not round his shoulders
      stand('hevalo', 'caught', 346, 130, 22);

      const span = chapters.length === 0 ? '' : chapters.length === 1 ? `Chapter ${chapters[0]!.number} · ${chapters[0]!.titleKu}` : `Chapters ${chapters[0]!.number} to ${chapters.at(-1)!.number}`;
      const pill = display(10.5, VIOLET.deep);
      const w = press.measure(span, pill.font, pill.size) + 28;
      press.box((PAGE.w - w) / 2, 526, w, 22, 11, INK.card);
      press.line(span, (PAGE.w - w) / 2, 526 + 11 - pill.lead / 2, pill, 'center', w);
      press.line(site, TEXT.x, 557, { ...T.tiny, color: VIOLET.deep }, 'center', TEXT.w);
    },
  };
}

// ───────────────────────────────────────────────────────────── a letter from Hamo

const HOW: ReadonlyArray<readonly [BookPicture | 'bubble' | 'words' | 'pairs', string]> = [
  [{ kind: 'cast', who: 'hevalo', pose: 'curious' }, 'Every lesson opens with its little scene. Read it first: it tells you where you are and who is up to what.'],
  ['bubble', 'The line in the speech bubble is Hamo’s. Say it out loud, as he says it in the app, until it comes out by itself.'],
  ['words', 'New words come with a picture where there is one. A small m or f marks a masculine or a feminine noun: Kurdish cares.'],
  ['pairs', 'Kurdish stands on the left and English on the right, everywhere. Cover the right side with your hand and see how far you get.'],
  [{ kind: 'spot', spot: 'notebook' }, 'Each chapter ends with a story, pencil practice, and a stamp for your passport. The answers wait at the back.'],
];

function letterSheet(press: Press, chapters: readonly BookChapter[]): Sheet {
  const hello = taught(chapters, 'silav');
  const welcome = taught(chapters, 'Bi xêr hatî!');
  return {
    furniture: { chapter: null, section: 'A letter from Hamo', bites: null, plain: true },
    draw: (): void => {
      let y = TEXT.top + 6;
      press.disc(TEXT.x + TEXT.w - 44, y + 44, 44, VIOLET.wash);
      press.within(TEXT.x + TEXT.w - 88, y, 88, 88, 44, () => press.place(castArt(press, 'hamo', 'proud'), TEXT.x + TEXT.w - 85, y + 8, 84));
      press.line(hello ? 'Silav!' : 'Hello!', TEXT.x, y + 14, heavy(31, INK.ink));
      if (welcome) {
        const w = press.line(welcome.ku, TEXT.x, y + 53, displayItalic(13.5, VIOLET.deep));
        press.line('Welcome!', TEXT.x + w + 8, y + 57, T.english);
      }
      // the letter and how to read the book share one page, so the letter runs close under its greeting
      y += 97;
      const letter: Type = { ...T.body, size: 9, lead: 12.6 };
      for (const p of LETTER) {
        const para = press.para(p, TEXT.w, letter);
        press.set(para.lines, TEXT.x, y, letter);
        y += para.height + 6.5;
      }
      press.line('Hamo', TEXT.x, y, displayItalic(18, VIOLET.deep), 'right', TEXT.w - 6);
      y += 36;

      press.line('HOW TO READ THIS BOOK', TEXT.x, y, label(VIOLET.deep));
      press.rule(TEXT.x, y + 12.5, TEXT.w, VIOLET.wash, 0.9);
      y += 20;
      for (const [icon, text] of HOW) {
        const para = press.para(text, TEXT.w - 44, T.note);
        const h = Math.max(28, para.height);
        const [ix, iy] = [TEXT.x + 2, y + (h - 28) / 2];
        if (icon === 'bubble') {
          press.bubble(ix + 2, iy + 5, 26, 16, VIOLET.wash, { side: 'left', at: 9 });
          press.rule(ix + 8, iy + 11, 14, VIOLET.deep, 1.1);
          press.rule(ix + 8, iy + 15.5, 9, VIOLET.deep, 1.1);
        } else if (icon === 'words') {
          press.box(ix, iy + 3, 28, 22, 6, VIOLET.wash);
          press.line('m', ix + 4.5, iy + 8.5, { font: 'bold', size: 8, color: VIOLET.deep, lead: 11 });
          press.line('f', ix + 18, iy + 8.5, { font: 'bold', size: 8, color: VIOLET.deep, lead: 11 });
        } else if (icon === 'pairs') {
          press.box(ix, iy + 4, 13, 20, 3, INK.ink);
          press.box(ix + 15, iy + 4, 13, 20, 3, VIOLET.wash);
        } else drawPicture(press, icon, ix, iy, 28, VIOLET);
        press.set(para.lines, TEXT.x + 42, y + (h - para.height) / 2, T.note);
        y += h + 5;
      }
    },
  };
}

// ───────────────────────────────────────────────────────────── the contents

function contentsSheet(press: Press, chapters: readonly BookChapter[], places: Places): Sheet {
  return {
    furniture: { chapter: null, section: 'Contents', bites: null, plain: true },
    draw: (): void => {
      let y = TEXT.top + 2;
      press.line('What is in the book', TEXT.x, y, display(22));
      y += 38;
      const number = display(9, INK.ink);
      const entry = (text: string, x: number, at: number, page: number | undefined, after = 0): void => {
        const w = after > 0 ? after : press.line(text, x, at, { ...T.body, font: 'semi' });
        const pw = page === undefined ? 0 : press.measure(String(page), number.font, number.size);
        if (page !== undefined) press.line(String(page), TEXT.x, at + 1, number, 'right', TEXT.w);
        press.dots(x + w + 6, at + 9.6, TEXT.x + TEXT.w - pw - 6 - (x + w + 6), INK.line);
      };
      for (const [name, key] of [['The passport of the road', 'passport'], ['The alphabet', 'alphabet'], ['The people of the road', 'people']] as const) {
        entry(name, TEXT.x, y, places.get(key));
        y += 15.5;
      }
      y += 8;
      // with few chapters there is room to name each one's parts under it at leisure
      const roomy = chapters.length <= 8;
      for (const c of chapters) {
        const hue = hueOf(c);
        press.disc(TEXT.x + 8, y + 8, 8, hue.wash);
        press.line(String(c.number), TEXT.x, y + 2.6, { font: 'bold', size: 8, color: hue.deep, lead: 10.8 }, 'center', 16);
        const w = press.line(c.titleKu, TEXT.x + 24, y + 1, display(11.2, INK.ink));
        const ew = press.line(c.titleEn, TEXT.x + 24 + w + 7, y + 3.4, { ...T.english, size: 8.2 });
        entry('', TEXT.x + 24, y + 2, places.get(`${c.number}:opener`), w + 7 + ew);
        y += 16.5;
        const para = press.para(c.parts.map((p) => p.titleKu).join('\u00a0·\u2003'), TEXT.w - 24, T.tiny, roomy ? 2 : 1);
        press.set(para.lines, TEXT.x + 24, y, T.tiny);
        y += para.height + (roomy ? 10 : 4.6);
      }
      y += 6;
      for (const [name, key] of [['Answers', 'answers'], ['The word list', 'words'], ['About the author', 'author']] as const) {
        entry(name, TEXT.x, y, places.get(key));
        y += 15.5;
      }
    },
  };
}

// ───────────────────────────────────────────────────────────── the passport

function passportSheet(press: Press, chapters: readonly BookChapter[], places: Places): Sheet {
  const have = new Map(chapters.map((c) => [c.number, c]));
  return {
    furniture: { chapter: null, section: 'The passport of the road', bites: null, plain: true },
    draw: (): void => {
      let y = TEXT.top + 2;
      press.place(squareArt(press, 'bird|hello', () => letterBirdSvg({ bird: 2, pose: 'hello' })), TEXT.x + TEXT.w - 52, y - 10, 56);
      press.line('The passport of the road', TEXT.x, y, display(22));
      y += 33;
      const intro = press.para(
        'Letters in Sêvan travel by bird, and every chapter of the road has a stamp of its own. Finish a chapter, then come back here and cancel its stamp: draw the postmark in the ring and write the date under it. Colour it in, if you like. Twelve stamps, and the road is yours.',
        TEXT.w - 62,
        T.body,
      );
      press.set(intro.lines, TEXT.x, y, T.body);
      y += intro.height + 16;
      const cols = 4;
      const w = 72;
      const h = (w * STAMP.h) / STAMP.w;
      const cell = TEXT.w / cols;
      const rowH = (TEXT.top + TEXT.room - y - 4) / 3;
      for (let n = 1; n <= 12; n++) {
        const [col, row] = [(n - 1) % cols, Math.floor((n - 1) / cols)];
        const x = TEXT.x + col * cell + (cell - w) / 2;
        const top = y + row * rowH;
        const chapter = have.get(n);
        drawStamp(press, x, top, w, chapter ?? n);
        const hue = HUES.light[chapterHue(n)];
        // the ring the reader's own postmark goes in, over the stamp's corner; under the stamp where the chapter is, and a line for the date
        press.ring(x + w - 5, top + 7, 11.5, chapter ? hue.deep : '#b9ad96', 0.8, 1.6);
        const page = chapter ? places.get(`${n}:opener`) : undefined;
        press.line(chapter ? (page === undefined ? '' : `page ${page}`) : 'further up the road', x - 10, top + h + 5, { ...T.tiny, color: chapter ? hue.deep : INK.soft }, 'center', w + 20);
        press.dots(x + 4, top + h + 26, w - 8, chapter ? hue.base : INK.line);
      }
    },
  };
}

// ───────────────────────────────────────────────────────────── a word's meaning, short

/**
 * A word's meaning as short as `fits` asks, shortened only at its joints:
 * first a note in brackets at its end, then its last clause after a
 * semicolon, then after a comma, until it fits. A meaning is never cut in
 * the middle of a clause and never left empty, and a bracket it opens with
 * ("(not) at all") is part of it, not a note.
 */
export function glossFor(en: string, fits: (text: string) => boolean): string {
  let text = en.trim();
  for (let cut = shortened(text); !fits(text) && cut !== null; cut = shortened(text)) text = cut;
  return text;
}

/** A meaning one step shorter at a joint: without a closing note in brackets, or else without its last clause after a semicolon or a comma outside brackets; null where it has no joint left. */
function shortened(text: string): string | null {
  const note = /^(.*[^\s(])\s*\([^()]*\)$/.exec(text);
  if (note) return note[1]!;
  for (const mark of [';', ',']) {
    let depth = 0;
    for (let i = text.length - 1; i > 0; i--) {
      const ch = text[i];
      if (ch === ')') depth += 1;
      else if (ch === '(') depth -= 1;
      else if (ch === mark && depth === 0) return text.slice(0, i).trim();
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────── the alphabet

function alphabetSheets(press: Press, chapters: readonly BookChapter[]): Sheet[] {
  // a letter is best shown by a thing that can be drawn: a word with a picture of its own before a number or a colour
  const drawn = roadBookAlphabet(chapters, (w) => pictureForWord(w)?.kind === 'word');
  const any = roadBookAlphabet(chapters, (w) => pictureForWord(w) !== null);
  const letters = drawn.map((l, i) => (l.word && pictureForWord(l.word) ? l : any[i]!));
  const intro = press.para(
    [
      { text: 'Kurmancî is written as it is said: one letter, one sound, nearly always. The letters with a hat are long, ' },
      { text: 'ê î û', font: 'semi' },
      { text: '; ' },
      { text: 'ç', font: 'semi' },
      { text: ' and ' },
      { text: 'ş', font: 'semi' },
      { text: ' are English ch and sh; ' },
      { text: 'x', font: 'semi' },
      { text: ' is the ch of Scottish loch, and ' },
      { text: 'q', font: 'semi' },
      { text: ' is a k made deep in the throat. Each letter is shown in a word of this book.' },
    ],
    TEXT.w,
    T.body,
  );
  const cols = 3;
  const rows = [5, 6];
  const head = 35 + intro.height + 14;
  // the cells are as tall as lets the two pages hold them all: five rows under the introduction, six on the page after
  const cell = { w: TEXT.w / cols, h: Math.min(86, (TEXT.room - head) / rows[0]!, TEXT.room / rows[1]!) };
  const hintType: Type = { ...T.tiny, size: 7, lead: 8.9 };
  const drawCell = (index: number, x: number, y: number): void => {
    const l = letters[index]!;
    const inner = cell.w - 18;
    press.box(x + 2, y, cell.w - 4, cell.h - 6, 9, index % 2 === 0 ? VIOLET.tint : INK.card);
    press.line(`${l.upper}${l.id}`, x + 9, y + 5, heavy(25, VIOLET.deep));
    const like = likeFor(l.id, 'en');
    if (like) {
      // a sound English has no word for is described instead, and a description needs no "as in" before it
      const plain = !like.sound || like.before.length > 8;
      const said: Span[] = [{ text: plain ? like.before : `as in ${like.before}` }, ...(like.sound ? [{ text: like.sound, font: 'bold' as const, color: VIOLET.deep }, { text: like.after }] : [])];
      const hint = press.para(said, inner, hintType, 3);
      press.set(hint.lines, x + 9, y + 49.5, hintType);
    }
    if (!l.word) return;
    const picture = pictureForWord(l.word);
    if (picture) drawPicture(press, picture, x + cell.w - 47, y + 3, 36, VIOLET);
    // the word with its letter marked in the app's violet, and what it means after it
    let wx = x + 9;
    const at = l.at;
    for (const [text, color] of [[l.word.ku.slice(0, at), INK.ink], [l.word.ku.slice(at, at + l.id.length), INK.violet], [l.word.ku.slice(at + l.id.length), INK.ink]] as const) {
      if (text !== '') wx += press.line(text, wx, y + 36, { ...T.word, color });
    }
    // its meaning shortened to what fits the line, at a clause, and never cut off in the middle
    const room = x + 9 + inner - wx - 5;
    const gloss = press.wrap(glossFor(l.word.en, (text) => press.measure(text, T.gloss.font, T.gloss.size) <= room), room, T.gloss, 1);
    press.set(gloss, wx + 5, y + 37.6, T.gloss);
  };
  const sheets: Sheet[] = [];
  let from = 0;
  rows.forEach((count, pageIndex) => {
    const start = from;
    const end = Math.min(letters.length, from + count * cols);
    from = end;
    sheets.push({
      furniture: { chapter: null, section: 'The alphabet', bites: null, plain: pageIndex === 0 },
      draw: (): void => {
        let y = TEXT.top;
        if (pageIndex === 0) {
          press.line('Thirty-one letters and their sounds', TEXT.x, y + 2, display(22));
          press.set(intro.lines, TEXT.x, y + 35, T.body);
          y += head;
        }
        for (let i = start; i < end; i++) drawCell(i, TEXT.x + ((i - start) % cols) * cell.w, y + Math.floor((i - start) / cols) * cell.h);
        const rest = end - start;
        if (pageIndex === 1 && rest % cols !== 0) {
          // the cells the alphabet leaves over are Hevalo's
          const [x, top] = [TEXT.x + (rest % cols) * cell.w, y + Math.floor(rest / cols) * cell.h];
          const free = (cols - (rest % cols)) * cell.w;
          // his portrait in a round of the book's violet, as the people of the road have theirs, so his tilted head is not cut at the ear
          const r = Math.min(33, (cell.h - 6) / 2);
          const [cx, cy] = [x + free - r - 8, top + (cell.h - 6) / 2];
          press.disc(cx, cy, r, VIOLET.wash);
          press.within(cx - r, cy - r, r * 2, r * 2, r, () => press.place(castArt(press, 'hevalo', 'curious'), cx - r + 3, cy - r + 7, r * 2 - 6));
          const aside = press.para('Thirty-one letters, and not one of them is an apple. Hevalo has checked.', free - r * 2 - 30, T.caption);
          press.set(aside.lines, x + 10, top + (cell.h - 6 - aside.height) / 2, T.caption);
        }
      },
    });
  });
  return sheets;
}

// ───────────────────────────────────────────────────────────── the people of the road

/** Whether someone the plan names is of Hamo's own family: marked so, or named in the plan as his father, mother, brother or sister. */
export const isFamily = (p: BookName): boolean => p.kind === 'family' || /^Hamo’s (father|mother|(\p{L}+ )?(brother|sister))\b/u.test(p.en);

/**
 * How wide each friend's bust is drawn in a round portrait 80 points across:
 * Xezal a little smaller than the others, so her hair and her chin are inside
 * the round. Each bust stands on the round's foot and runs out of it, so it
 * never ends in a cut across the round.
 */
const PORTRAIT: Readonly<Record<CharacterId, number>> = { hamo: 76, hevalo: 76, xezo: 68 };

function peopleSheets(press: Press, people: readonly BookName[]): Sheet[] {
  const named = new Set(people.map((p) => p.name));
  const friends: Array<[CharacterId, string, string, BookPose]> = [
    ['hamo', 'Hamo', FRIENDS.hamo, 'proud'],
    ['hevalo', 'Hevalo', FRIENDS.hevalo, 'caught'],
    ['xezo', 'Xezal', FRIENDS.xezo, 'smiling'],
  ];
  // a book that has not met Xezal yet does not introduce her
  const shown = friends.filter(([id, name]) => id !== 'xezo' || named.has(name) || people.length === 0);
  // Hamo's own family is his to speak of in the lessons, and is not introduced here
  const others = people.filter((p) => !friends.some(([, name]) => name === p.name) && !isFamily(p));
  const blocks: Block[] = [{ height: 30, gap: 0, keep: true, draw: (y) => void press.line('The people of the road', TEXT.x, y + 2, display(22)) }];
  shown.forEach(([id, name, about, pose], i) => {
    const text = press.para(about, TEXT.w - 94, T.body);
    const height = Math.max(80, text.height + 24);
    blocks.push({
      height,
      gap: 14,
      draw: (y) => {
        const x = i % 2 === 0 ? TEXT.x : TEXT.x + TEXT.w - 80;
        press.disc(x + 40, y + 40, 40, VIOLET.wash);
        const bust = castArt(press, id, pose);
        const bw = PORTRAIT[id];
        press.within(x, y, 80, 80, 40, () => press.place(bust, x + (80 - bw) / 2, Math.min(y + 8, y + 82 - (bw * bust.h) / bust.w), bw));
        const tx = i % 2 === 0 ? TEXT.x + 94 : TEXT.x;
        press.line(name, tx, y, display(15));
        press.set(text.lines, tx, y + 21, T.body);
      },
    });
  });
  if (others.length > 0) {
    blocks.push({
      height: 14,
      gap: 20,
      keep: true,
      draw: (y) => {
        const w = press.line('AND ALONG THE WAY', TEXT.x, y, label(VIOLET.deep));
        press.rule(TEXT.x + w + 8, y + 5, TEXT.w - w - 8, VIOLET.wash, 0.9);
      },
    });
    // two to a row, each by a round with what they are known by, large enough that the page they run on to is a page of people and not a list
    const cols = 2;
    const cw = (TEXT.w - 14) / cols;
    const r = 25;
    const about: Type = { ...T.gloss, size: 8.2, lead: 10 };
    const cells = others.map((p) => {
      const picture = pictureForName(p.name);
      const text = press.para(p.en, cw - r * 2 - 12, about, 3);
      return { p, picture, text, height: Math.max(r * 2 + 4, 17 + text.height) };
    });
    const rows: Block[] = [];
    for (let i = 0; i < cells.length; i += cols) {
      const row = cells.slice(i, i + cols);
      rows.push({
        height: Math.max(...row.map((c) => c.height)),
        gap: i === 0 ? 12 : 10,
        draw: (y) => {
          row.forEach((c, k) => {
            const x = TEXT.x + k * (cw + 14);
            press.disc(x + r, y + r, r, VIOLET.tint);
            if (c.picture) drawPicture(press, c.picture, x + 4, y + 4, r * 2 - 8, VIOLET);
            else press.line(c.p.name.slice(0, 1), x, y + r - 9, display(18, VIOLET.deep), 'center', r * 2);
            const tx = x + r * 2 + 12;
            const top = y + Math.max(0, (r * 2 - 15 - c.text.height) / 2);
            press.line(c.p.name, tx, top, { ...T.word, size: 10.4 });
            press.set(c.text.lines, tx, top + 15, about);
          });
        },
      });
    }
    blocks.push(...keepList(rows));
  }
  return runSheets(press, blocks, (index) => ({ chapter: null, section: 'The people of the road', bites: null, plain: index === 0 }));
}

// ───────────────────────────────────────────────────────────── the answers

/** The answers' pages, and how much of the last of them they fill. */
function answerSheets(press: Press, chapters: readonly BookChapter[], noted: (anchor: string, index: number) => void): { sheets: Sheet[]; used: number } {
  const blocks: Block[] = [
    {
      height: 58,
      gap: 0,
      keep: true,
      anchor: 'answers',
      draw: (y) => {
        press.line('Answers', TEXT.x, y + 2, display(22));
        press.line('No peeking, says Hamo. Hevalo is looking at the sky.', TEXT.x, y + 31, T.english);
        // the key to the conversations' answers, which are named by the lesson they close
        press.line('Conversations are listed by part and lesson: 2.3 is part 2, lesson 3.', TEXT.x, y + 43, T.english);
      },
    },
  ];
  const type: Type = { ...T.note, size: 8.1, lead: 10.8 };
  // items an en space apart, and never broken from their number
  const apart = '\u2002';
  const letters = (answers: readonly number[]): string => answers.map((a, i) => `${i + 1}${'abcdef'[a] ?? '?'}`).join(apart);
  for (const c of chapters) {
    const hue = hueOf(c);
    blocks.push({
      height: 18,
      gap: 15,
      keep: true,
      draw: (y) => {
        press.disc(TEXT.x + 8, y + 9, 8, hue.wash);
        press.line(String(c.number), TEXT.x, y + 3.6, { font: 'bold', size: 8, color: hue.deep, lead: 10.8 }, 'center', 16);
        press.line(c.titleKu, TEXT.x + 23, y + 1.4, display(11.6));
      },
    });
    const rows: Array<[string, Span[]]> = [];
    const talks = c.parts.flatMap((p) => p.lessons.filter((l) => l.dialogue?.question).map((l) => `${p.position}.${l.position}\u00a0${'abcdef'[l.dialogue!.question!.answer] ?? '?'}`));
    if (talks.length > 0) rows.push(['Conversations', [{ text: talks.join(apart) }]]);
    if (c.tale && c.tale.questions.length > 0) rows.push(['Hamo’s story', [{ text: letters(c.tale.questions.map((q) => q.answer)) }]]);
    const pr = c.practice;
    // each answer held to its number by a no-break space, so a number never ends a line without its answer
    const kurdish = (list: readonly string[]): Span[] =>
      list.flatMap((text, i): Span[] => [...(i > 0 ? [{ text: apart }] : []), { text: `${i + 1}`, font: 'bold', color: hue.deep }, { text: `\u00a0${text}`, font: 'semi' }]);
    if (pr.match.length >= 4) {
      rows.push(['Join them up', pr.match.flatMap((m, i): Span[] => [...(i > 0 ? [{ text: '\u00a0·\u2002', font: 'italic' as const, color: INK.soft }] : []), { text: m.ku, font: 'semi' }, { text: `\u00a0${m.en}`, font: 'italic', color: INK.soft }])]);
    }
    if (pr.gaps.length > 0) rows.push(['Fill the gap', kurdish(pr.gaps.map((g) => g.answer))]);
    if (pr.replies.length > 0) rows.push(['What do you say?', kurdish(pr.replies.map((r) => r.answer))]);
    if (pr.toKurdish.length > 0) rows.push(['Into Kurdish', kurdish(pr.toKurdish.map((t) => t.ku))]);
    if (pr.pictures.length >= 3) rows.push(['The pictures', kurdish(pr.pictures.map((p) => p.ku))]);
    const made: Block[] = rows.map(([name, spans], i) => {
      const para = press.para(spans, TEXT.w - 84, type);
      return {
        height: para.height,
        gap: i === 0 ? 5 : 4,
        draw: (y: number) => {
          press.line(name.toUpperCase(), TEXT.x, y + 2.2, label(hue.deep, 5.6));
          press.set(para.lines, TEXT.x + 84, y, type);
        },
      };
    });
    blocks.push(...keepList(made));
  }
  const sheets = runSheets(press, blocks, (index) => ({ chapter: null, section: 'Answers', bites: null, plain: index === 0 }), noted);
  return { sheets, used: paginate(blocks, TEXT.room).at(-1)?.used ?? 0 };
}

// ───────────────────────────────────────────────────────────── the word list

/** How much of a page the word list needs left to begin on it: its heading and a dozen words. */
const WORDS_BEGIN = 200;

/**
 * The word list, three columns to a page. Each entry is its Kurdish, its
 * gender, and what it means, run on after it and wrapped under it, so no
 * entry is ever cut short: only a long meaning is shortened, at a joint
 * (`glossFor`), to keep an entry to two lines where it can. It begins
 * `start` points down its first page, so it can follow the answers on
 * theirs; and its last page is shared out evenly among the columns, with
 * Hevalo asleep under them where they leave him room.
 */
function wordListSheets(press: Press, chapters: readonly BookChapter[], start = 0): Sheet[] {
  const words = roadBookWordList(chapters);
  if (words.length === 0) return [];
  const cols = 3;
  const gutter = 10;
  const cw = (TEXT.w - gutter * (cols - 1)) / cols;
  // the entry's own column, right of the chapter's mark: every line of an entry starts here, so a long one hangs under its word
  const indent = 13;
  const type: Type = { font: 'semi', size: 7.7, color: INK.ink, lead: 9.6 };
  const meaning = { font: 'italic' as const, color: INK.soft };
  const lines = (w: (typeof words)[number], en: string): Line[] =>
    press.wrap([{ text: w.ku }, { text: `\u2002${w.gender ? `${w.gender === 'mf' ? 'm/f' : w.gender}\u00a0·\u00a0` : ''}${en}`, ...meaning }], cw - indent, type);
  // what goes down the columns: a letter at the head of its words, then the words, each measured
  type Entry = { letter: string } | { word: (typeof words)[number]; lines: Line[] };
  const entries: Entry[] = [];
  let letter = '';
  for (const w of words) {
    const first = w.ku.replace(/^[^\p{L}]+/u, '').slice(0, 1).toUpperCase();
    if (first !== letter) {
      letter = first;
      entries.push({ letter });
    }
    const en = glossFor(w.en, (text) => lines(w, text).length <= 2);
    entries.push({ word: w, lines: lines(w, en) });
  }
  const heightOf = (e: Entry): number => ('letter' in e ? 20 : e.lines.length * type.lead + 1.4);
  const favourite = taught(chapters, 'sêv');
  const sheets: Sheet[] = [];
  let at = 0;
  let pageIndex = 0;
  while (at < entries.length) {
    const first = pageIndex === 0;
    const head = first ? TEXT.top + start : TEXT.top;
    const top = first ? head + 58 : head;
    const room = TEXT.top + TEXT.room - top;
    // the columns filled from `from`, none taller than `limit` but the last, which may run to the foot
    const fill = (from: number, limit: number): { columns: Entry[][]; next: number; foot: number } => {
      const columns: Entry[][] = [];
      let next = from;
      let foot = top;
      for (let col = 0; col < cols && next < entries.length; col++) {
        const column: Entry[] = [];
        let used = 0;
        const most = col === cols - 1 ? Math.max(limit, room) : limit;
        while (next < entries.length) {
          const e = entries[next]!;
          // a letter never ends a column: it needs its first two words under it
          let need = heightOf(e);
          if ('letter' in e) for (const after of entries.slice(next + 1, next + 3)) need += heightOf(after);
          if (used + need > most && column.length > 0) break;
          column.push(e);
          used += heightOf(e);
          next += 1;
        }
        columns.push(column);
        foot = Math.max(foot, top + used);
      }
      return { columns, next, foot };
    };
    // the last page is shared out evenly among its columns: the shortest columns that still hold every word left
    let set = fill(at, room);
    if (set.next >= entries.length) {
      let [lo, hi] = [0, room];
      while (hi - lo > 1) {
        const mid = (lo + hi) / 2;
        const tried = fill(at, mid);
        if (tried.next >= entries.length && tried.foot - top <= mid + 0.01) hi = mid;
        else lo = mid;
      }
      set = fill(at, hi);
    }
    const { columns, foot } = set;
    at = set.next;
    const ends = at >= entries.length;
    sheets.push({
      furniture: { chapter: null, section: 'The word list', bites: null, plain: first },
      draw: (): void => {
        if (first) {
          press.line('Every word of the road', TEXT.x, head + 2, display(22));
          const intro = press.para('In the order of the Kurdish alphabet, each with the chapter it is first met in. m and f mark masculine and feminine nouns.', TEXT.w, T.english);
          press.set(intro.lines, TEXT.x, head + 31, T.english);
        }
        columns.forEach((column, col) => {
          const x = TEXT.x + col * (cw + gutter);
          let y = top;
          for (const e of column) {
            if ('letter' in e) {
              press.line(e.letter, x, y + 3, display(12.5, VIOLET.deep));
              press.rule(x + 14, y + 12.5, cw - 14, VIOLET.wash, 0.8);
            } else {
              const hue = HUES.light[chapterHue(e.word.chapter)];
              press.disc(x + 5, y + 5, 5, hue.wash);
              press.line(String(e.word.chapter), x, y + 0.9, { font: 'bold', size: 5.6, color: hue.deep, lead: 8 }, 'center', 10);
              press.set(e.lines, x + indent, y, type);
            }
            y += heightOf(e);
          }
        });
        // under the last of the words, where there is room: the one who slept through them, in a round of his own
        const free = TEXT.top + TEXT.room - foot;
        if (ends && free >= 120) {
          const mid = foot + free / 2;
          const r = 34;
          press.disc(PAGE.w / 2, mid - 12, r, VIOLET.wash);
          press.within(PAGE.w / 2 - r, mid - 12 - r, r * 2, r * 2, r, () => press.place(castArt(press, 'hevalo', 'asleep'), PAGE.w / 2 - r + 3, mid - 12 - r + 7, r * 2 - 6));
          const count = `${words.length} words, and Hevalo slept through most of them.`;
          press.line(favourite ? `${count} His favourite is still ${favourite.ku}.` : count, TEXT.x, mid + r - 4, T.english, 'center', TEXT.w);
        }
      },
    });
    pageIndex += 1;
  }
  return sheets;
}

// ───────────────────────────────────────────────────────────── about the author

/** The author's own note, on a page of its own: in their words, with Hamo beside it, and signed with their name. */
function authorSheet(press: Press): Sheet {
  return {
    furniture: { chapter: null, section: 'About the author', bites: null, plain: true },
    draw: (): void => {
      let y = TEXT.top + 6;
      press.disc(TEXT.x + TEXT.w - 44, y + 44, 44, VIOLET.wash);
      press.within(TEXT.x + TEXT.w - 88, y, 88, 88, 44, () => press.place(castArt(press, 'hamo', 'plain'), TEXT.x + TEXT.w - 85, y + 8, 84));
      press.line('About the author', TEXT.x, y + 30, display(22));
      y += 112;
      const type: Type = { ...T.body, size: 9.6, lead: 14.2 };
      for (const text of AUTHOR.paragraphs) {
        const para = press.para(text, TEXT.w - 30, type);
        press.set(para.lines, TEXT.x, y, type);
        y += para.height + 10;
      }
      press.rule(TEXT.x + TEXT.w - 150, y + 14, 150, VIOLET.wash, 0.9);
      press.line(AUTHOR.name, TEXT.x, y + 22, displayItalic(14, VIOLET.deep), 'right', TEXT.w);
    },
  };
}

// ───────────────────────────────────────────────────────────── the last page

function lastSheet(press: Press, chapters: readonly BookChapter[], site: string): Sheet {
  // what the village says to someone setting off, when the book has got that far; before that, what the one who stays says
  const farewell = taught(chapters, 'Rêya te vekirî be!') ?? taught(chapters, 'Bi xêr biçî!');
  return {
    furniture: null,
    draw: (): void => {
      const doc = press.doc;
      doc.save().ellipse(PAGE.w / 2, PAGE.h + 150, 420, 330).fill(VIOLET.wash).restore();
      doc.save().ellipse(PAGE.w / 2 + 70, PAGE.h + 190, 380, 320).fill(VIOLET.tint).restore();
      // the bird that brings Sêvan's letters, perched with one in its beak: in flight its wing hides its beak, and the letter with it
      press.place(squareArt(press, 'bird|letter|perched', () => letterBirdSvg({ bird: 2, pose: 'perched', letter: true })), PAGE.w / 2 - 48, 52, 96);
      let y = 162;
      if (farewell) {
        press.line(farewell.ku, TEXT.x, y, heavy(25, INK.ink), 'center', TEXT.w);
        press.line(farewell.en.replace(/\s*\(.*$/, ''), TEXT.x, y + 36, displayItalic(12.5, VIOLET.deep), 'center', TEXT.w);
        y += 74;
      }
      const type: Type = { ...T.body, color: INK.soft };
      const about = press.para(
        `Rêya Kurmancî, the Kurmanji Road: every word, line and story as the lessons have them, with Hamo’s voice in the app at ${site}. The drawings are Hevalo’s own, made for the app and for this book. Set in Fraunces and Literata, both under the SIL Open Font Licence.${chapters.length < ROAD_CHAPTERS ? ' New chapters arrive in the book as they go online.' : ''}`,
        TEXT.w - 76,
        type,
      );
      press.set(about.lines, TEXT.x + 38, y, type, 'center', TEXT.w - 76);
      y += about.height + 22;
      const core = squareArt(press, `apple|${BOOK_APPLE_BITES}`, () => bookAppleSvg({ bites: BOOK_APPLE_BITES }));
      [-1, 0, 1].forEach((k) => press.place(core, PAGE.w / 2 - 13 + k * 34, y, 26, { turn: k * 14 }));
      press.line('No apples were left over in the making of this book.', TEXT.x, y + 34, T.english, 'center', TEXT.w);
      // Hevalo, who knows nothing about it, stands on the hill below, clear of the words
      const deer = castArt(press, 'hevalo', 'innocent', 'full');
      const dh = Math.min(158, PAGE.h - 34 - (y + 58));
      const dw = (dh * deer.w) / deer.h;
      press.place(deer, PAGE.w / 2 - dw / 2, PAGE.h - 34 - dh, dw);
    },
  };
}

// ───────────────────────────────────────────────────────────── the book

/** The book for these chapters, as PDF bytes. */
export function renderRoadBook(options: RoadBookOptions): Promise<Buffer> {
  const site = options.site ?? 'hevalo.app';
  const chapters = options.chapters;
  const press = new Press(chapters.length === 1 ? `Rêya Kurmancî · ${chapters[0]!.number} · ${chapters[0]!.titleKu}` : 'Rêya Kurmancî · Hevalo’s book', AUTHOR.name);
  const places: Places = new Map();
  const sheets: Sheet[] = [];
  /** Sheets added to the book, with the anchors among them noted at the pages they fall on (an anchor's place is counted from the first of the sheets). */
  const add = (made: Sheet[], anchors: ReadonlyArray<readonly [string, number]> = []): void => {
    for (const [anchor, index] of anchors) places.set(anchor, sheets.length + index + 1);
    sheets.push(...made);
  };

  add([coverSheet(press, chapters, site)]);
  add([letterSheet(press, chapters)]);
  add([contentsSheet(press, chapters, places)]);
  add([passportSheet(press, chapters, places)], [['passport', 0]]);
  add(alphabetSheets(press, chapters), [['alphabet', 0]]);
  add(peopleSheets(press, options.people ?? []), [['people', 0]]);
  for (const c of chapters) {
    const made = chapterSheets(press, c, places);
    add(made.sheets, made.anchors);
  }
  // the word list begins under the answers where their last page has room for it, and on a page of its own where not
  const answers: Array<[string, number]> = [];
  const back = answerSheets(press, chapters, (anchor, index) => answers.push([anchor, index]));
  const under = back.sheets.length > 0 && TEXT.room - back.used >= WORDS_BEGIN;
  const list = wordListSheets(press, chapters, under ? back.used + 30 : 0);
  if (under && list.length > 0) {
    const [above, below] = [back.sheets.pop()!, list.shift()!];
    list.unshift({ furniture: above.furniture, draw: (page) => (above.draw(page), below.draw(page)) });
  }
  add(back.sheets, answers);
  add(list, [['words', 0]]);
  add([authorSheet(press)], [['author', 0]]);
  add([lastSheet(press, chapters, site)]);

  // every page is measured and numbered by now: only then is anything drawn, so a page can say where another is
  sheets.forEach((sheet, i) => {
    press.page();
    if (sheet.furniture) furnish(press, sheet.furniture, i + 1);
    sheet.draw(i + 1);
  });
  return press.finish();
}
