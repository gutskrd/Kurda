/**
 * What every page of the book is made with: type, the app's drawings as the press lays them down, a chapter's stamp,
 * page head and foot, and the measured blocks flow.ts breaks into pages. The pages themselves are in chapter.ts
 * (chapters) and pdf.ts (front and back matter, and the whole book).
 */
import {
  BOOK_APPLE_BITES,
  HUES,
  bookAppleSvg,
  bookCastSvg,
  bookPaintSvg,
  bookPostmarkSvg,
  bookSilhouetteSvg,
  bookSpotSvg,
  characterArt,
  cropBox,
  pathLandmarkSvg,
  stampBox,
  stampShapeFor,
  stampSvg,
  treeSvg,
  wordPictureSvg,
  type BookPose,
  type CharacterId,
  type HueSteps,
} from '@kurda/shared';
import { paginate, settle, SETTLE_SHARE, type FlowItem } from './flow.js';
import { chapterEmblem, chapterHue, type BookPicture } from './pictures.js';
import type { BookChapter } from './road-book.js';
import { INK, PAGE, Press, TEXT, blend, type Stamp, type Type } from './sheet.js';

// ───────────────────────────────────────────────────────────── type

/** The book's own colour, where no chapter's hue applies: the app's violet. */
export const VIOLET = HUES.light.violet;

/** The ways text is set. Kurdish is always the darker and the larger of two; what is said about it in English is softer and smaller. */
export const T = {
  body: { font: 'body', size: 8.7, color: INK.ink, lead: 11.8 },
  note: { font: 'body', size: 8.3, color: INK.ink, lead: 10.9 },
  caption: { font: 'body', size: 8, color: INK.soft, lead: 10 },
  english: { font: 'italic', size: 7.7, color: INK.soft, lead: 9.8 },
  kurdish: { font: 'semi', size: 9, color: INK.ink, lead: 11.6 },
  tale: { font: 'body', size: 9.7, color: INK.ink, lead: 13.2 },
  taleEnglish: { font: 'italic', size: 7.7, color: INK.soft, lead: 10 },
  word: { font: 'semi', size: 9.1, color: INK.ink, lead: 11 },
  gloss: { font: 'italic', size: 7.5, color: INK.soft, lead: 9 },
  tiny: { font: 'body', size: 7.2, color: INK.soft, lead: 9.4 },
} as const satisfies Record<string, Type>;

/** Small capitals for what names a part of the page. */
export const label = (color: string, size = 6.2): Type => ({ font: 'bold', size, color, lead: size + 3.2, tracking: 0.9 });
export const display = (size: number, color: string = INK.ink): Type => ({ font: 'display', size, color, lead: size * 1.16 });
export const displayItalic = (size: number, color: string = INK.soft): Type => ({ font: 'displayItalic', size, color, lead: size * 1.2 });
export const heavy = (size: number, color: string): Type => ({ font: 'heavy', size, color, lead: size * 1.05 });

/** A chapter's hue in its four steps. */
export const hueOf = (c: Pick<BookChapter, 'number'>): HueSteps => HUES.light[chapterHue(c.number)];

// ───────────────────────────────────────────────────────────── drawings

/** A square drawing of the app's, as a stamp of the press. */
export function squareArt(press: Press, key: string, svg: () => string): Stamp {
  return press.art(key, 120, 120, svg);
}

/** One of the three friends in a pose, from the chest up or whole. */
export function castArt(press: Press, who: CharacterId, pose: string, crop: 'bust' | 'half' | 'full' = 'bust'): Stamp {
  const frame = cropBox(characterArt(who), crop);
  return press.art(`cast|${who}|${pose}|${crop}`, 120, (120 * frame.h) / frame.w, () => bookCastSvg({ who, pose: pose as BookPose, crop }));
}

/** Hevalo's apple with so many bites out of it. */
export function appleArt(press: Press, bites: number): Stamp {
  const b = Math.max(0, Math.min(BOOK_APPLE_BITES, Math.floor(bites)));
  return squareArt(press, `apple|${b}`, () => bookAppleSvg({ bites: b }));
}

/** The stamp of a drawing the book names (pictures.ts); a number has none, being set in type. A landmark casts `shade` where it stands on a page's own colour. */
function pictureArt(press: Press, picture: BookPicture, hue: HueSteps, shade?: string): Stamp | null {
  switch (picture.kind) {
    case 'word':
      return squareArt(press, `word|${picture.id}`, () => wordPictureSvg({ id: picture.id }));
    case 'spot':
      return squareArt(press, `spot|${picture.spot}`, () => bookSpotSvg({ spot: picture.spot }));
    case 'paint':
      return squareArt(press, `paint|${picture.colour}`, () => bookPaintSvg({ colour: picture.colour }));
    case 'landmark':
      return squareArt(press, `landmark|${picture.landmark}|${shade ?? ''}`, () => pathLandmarkSvg({ landmark: picture.landmark, ...(shade ? { shade } : {}) }));
    case 'cast':
      return castArt(press, picture.who, picture.pose);
    case 'sapling':
      return squareArt(press, 'sapling', () => treeSvg({ species: 'beru', stage: 2 }));
    case 'silhouette':
      return squareArt(press, `silhouette|${picture.who}|${hue.deep}`, () => bookSilhouetteSvg({ who: picture.who, deep: hue.deep, base: hue.base, paper: hue.tint }));
    case 'figure':
      return null;
  }
}

/** A drawing in a square of `size` at (x, y); a number is set as its figure on a round of the hue's wash. */
export function drawPicture(press: Press, picture: BookPicture, x: number, y: number, size: number, hue: HueSteps, shade?: string): void {
  const art = pictureArt(press, picture, hue, shade);
  if (art) {
    press.place(art, x, y, size);
    return;
  }
  if (picture.kind !== 'figure') return;
  press.disc(x + size / 2, y + size / 2, size * 0.46, hue.wash);
  const type = heavy(picture.text.length > 3 ? size * 0.3 : picture.text.length > 2 ? size * 0.36 : size * 0.48, hue.deep);
  press.line(picture.text, x, y + size / 2 - type.lead / 2, type, 'center', size);
}

// ───────────────────────────────────────────────────────────── the stamp

/**
 * A chapter stamp's design size in points, before scaling. The book's own, not the app's (`stampSize`): the app keeps
 * room for a two-line name and meaning at the reader's text size, while the printed stamp carries number and name on
 * one line and scales whole.
 */
export const STAMP = { w: 100, h: 126 } as const;

/**
 * A chapter's stamp with its paper's top left at (x, y), `w` wide: perforated paper in the chapter's tint, its drawing,
 * its number in the corner and its name along the foot in the hue's deep shade. Given only a number it is a stamp not
 * yet earned: plain paper and the number. `glow` sets its light (none in a small row); `cancelled` adds the postmark.
 */
export function drawStamp(press: Press, x: number, y: number, w: number, chapter: { number: number; titleKu: string } | number, options: { glow?: number; cancelled?: boolean } = {}): void {
  const number = typeof chapter === 'number' ? chapter : chapter.number;
  const blank = typeof chapter === 'number';
  const hue = HUES.light[chapterHue(number)];
  const glow = options.glow ?? 0;
  const k = w / STAMP.w;
  const box = stampBox(STAMP.w, STAMP.h, glow);
  const art = press.art(`stamp|${blank ? 'blank' : chapterHue(number)}|${glow}`, box.width, box.height, () =>
    stampSvg({ width: STAMP.w, height: STAMP.h, paper: blank ? '#f3ecdd' : hue.tint, glow: hue.base, strength: glow, edge: blank ? '#b9ad96' : hue.base, ...stampShapeFor(STAMP.w) }),
  );
  press.place(art, x - box.inset * k, y - box.inset * k, box.width * k);
  press.line(String(number), x + 9 * k, y + 8 * k, heavy(15 * k, blank ? '#9c917c' : hue.deep));
  if (typeof chapter === 'number') return;
  // on the stamp's paper a landmark's shade is the paper's own, a step darker, and not the meadow's green
  drawPicture(press, chapterEmblem(number), x + 17 * k, y + 20 * k, 66 * k, hue, blend(hue.tint, hue.base, 0.32));
  // the name as large as the stamp's foot has room for
  let size = 11.5 * k;
  while (size > 4 && press.measure(chapter.titleKu, 'display', size) > (STAMP.w - 16) * k) size -= 0.25;
  const name = display(size, hue.deep);
  press.line(chapter.titleKu, x, y + 106 * k - name.lead / 2, name, 'center', w);
  press.rule(x + 30 * k, y + 93.5 * k, 40 * k, hue.base, 0.9 * k);
  if (options.cancelled) {
    const mark = squareArt(press, `postmark|${chapterHue(number)}`, () => bookPostmarkSvg({ ink: hue.deep }));
    press.place(mark, x + w - 46 * k, y - 22 * k, 74 * k, { turn: -14 });
  }
}

// ───────────────────────────────────────────────────────────── blocks and sheets

/** A piece of a run: measured, and able to draw itself with its top at `y`. */
export interface Block extends FlowItem {
  draw: (y: number) => void;
  /** what the running head says from here on */
  section?: string;
  /** a place the contents point at: its page is noted under this name */
  anchor?: string;
}

/** What stands at the head and foot of a page. */
export interface Furniture {
  /** the chapter the page belongs to, or none for the pages before and after them */
  chapter: BookChapter | null;
  section: string;
  /** how many bites are out of the apple in the corner, or null for no apple */
  bites: number | null;
  /** a page that opens under a title of its own: it has its number, and no running head over the title */
  plain?: boolean;
}

/** One page, to be drawn when every page's number is known: what stands at its head and foot (nothing, for a page that sees to its own), and the page itself. */
export interface Sheet {
  furniture: Furniture | null;
  draw: (page: number) => void;
}

/** Where things turned out to be, by name: filled in as the pages are counted, and read when they are drawn. */
export type Places = Map<string, number>;

/** A page's number in its outer corner, and Hevalo's apple beside it. */
export function footOf(press: Press, page: number, bites: number | null): void {
  const right = page % 2 === 1;
  const foot = PAGE.h - 31;
  const number = display(8.6, INK.ink);
  const apple = bites === null ? 0 : 19;
  if (right) press.line(String(page), TEXT.x, foot, number, 'right', TEXT.w - apple);
  else press.line(String(page), TEXT.x + apple, foot, number);
  if (bites !== null) press.place(appleArt(press, bites), right ? TEXT.x + TEXT.w - 15 : TEXT.x - 1, foot - 5.5, 16);
}

/** The head and the foot of a page: the chapter and what part of it this is, the page's number, and the apple. */
export function furnish(press: Press, f: Furniture, page: number): void {
  footOf(press, page, f.bites);
  if (f.plain) return;
  const hue = f.chapter ? hueOf(f.chapter) : VIOLET;
  const y = 23;
  let x = TEXT.x;
  if (f.chapter) {
    press.disc(x + 6.5, y + 4.6, 6.5, hue.wash);
    press.line(String(f.chapter.number), x, y, { font: 'bold', size: 7, color: hue.deep, lead: 9.2 }, 'center', 13);
    x += 18;
  }
  press.line(f.chapter ? f.chapter.titleKu : 'Rêya Kurmancî', x, y, { font: 'semi', size: 7.6, color: hue.deep, lead: 9.2, tracking: 0.3 });
  press.line(f.section, TEXT.x, y, { font: 'italic', size: 7.6, color: INK.soft, lead: 9.2 }, 'right', TEXT.w);
  press.rule(TEXT.x, y + 14.5, TEXT.w, hue.wash, 0.9);
}

/** What is drawn in the space a page has left over, given its top and its height, whether it is the run's last page, its place in the run and its number in the book; it draws nothing when the space is too small for it. */
export type Filler = (y: number, height: number, last: boolean, index: number, page: number) => void;

/**
 * A run of blocks broken into pages, each a sheet with its furniture. Anchors are noted as they land; a page left short
 * (beyond what the rule spreads) hands its empty foot to `filler`.
 */
export function runSheets(
  press: Press,
  blocks: readonly Block[],
  furniture: (index: number, section: string) => Furniture,
  noted: (anchor: string, index: number) => void = () => undefined,
  filler: Filler | null = null,
): Sheet[] {
  const pages = paginate(blocks, TEXT.room);
  let section = '';
  return pages.map((page, index) => {
    // the head names the part the page opens in: a part that starts lower down is named on the next page
    const first = blocks[page.from]!;
    if (first.section) section = first.section;
    const here = section;
    for (let k = page.from; k < page.to; k++) {
      const b = blocks[k]!;
      if (b.section) section = b.section;
      if (b.anchor) noted(b.anchor, index);
    }
    const last = index === pages.length - 1;
    const at = settle(blocks, page, TEXT.room, last);
    const slack = TEXT.room - page.used;
    const f = furniture(index, here);
    return {
      furniture: f,
      draw: (n: number): void => {
        for (let k = page.from; k < page.to; k++) blocks[k]!.draw(TEXT.top + at[k - page.from]!);
        if (filler && (last || slack > TEXT.room * SETTLE_SHARE)) filler(TEXT.top + page.used, slack, last, index, n);
      },
    };
  });
}
