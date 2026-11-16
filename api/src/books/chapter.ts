/**
 * A chapter of the Hevalo book, set: its opening page under its landmark,
 * then one run of blocks — for each of its four parts the grammar in a few
 * lines and its four lessons, every lesson opening with its little scene (a
 * drawing composed from the plan's beat, the beat told beside it, and the
 * line to say after Hamo in a speech bubble), then its new words with their
 * pictures, its lines to read aloud beside their English, and its
 * conversation; the story Hamo tells, with its questions; practice for a
 * pencil; and the chapter's stamp, cancelled.
 *
 * The chapter wears its hue throughout, and the apple in the corner of its
 * pages loses a bite every few pages until only the core is left.
 */
import { BOOK_APPLE_BITES, BOOK_BACKDROP, WORD_PICTURES, bookBackdropSvg, bookSpotSvg, parseMarkdown, type BookSetting, type HueSteps, type Span as MarkSpan } from '@kurda/shared';
import { keepList, paginate } from './flow.js';
import { T, appleArt, castArt, display, displayItalic, drawPicture, drawStamp, footOf, heavy, hueOf, label, runSheets, squareArt, STAMP, type Block, type Filler, type Places, type Sheet } from './page.js';
import { BACKDROP_SCALE, PANEL, chapterEmblem, chapterHue, pictureForWord, sceneFor, sceneLayout, tellBeat, type BookPicture } from './pictures.js';
import { chapterWords, type BookChapter, type BookDialogue, type BookLesson, type BookPair, type BookPart, type BookWord } from './road-book.js';
import { INK, MARGIN, PAGE, Press, TEXT, blend, type Line, type Span, type Type } from './sheet.js';

/** The colours a chapter's pages are painted in, from its hue: a band across the page, a card behind a picture, the hill of a scene. */
const tones = (hue: HueSteps): { band: string; card: string; hill: string } => ({ band: hue.wash, card: hue.tint, hill: blend(hue.wash, hue.base, 0.3) });

// ───────────────────────────────────────────────────────────── the opening page

function openerSheet(press: Press, c: BookChapter, places: Places): Sheet {
  const hue = hueOf(c);
  const tone = tones(hue);
  return {
    furniture: null,
    draw: (page: number): void => {
      const doc = press.doc;
      const summary = press.para(c.summary, TEXT.w, T.body);
      const entries: Array<{ mark: string; ku: string; en: string; key: string }> = [
        ...c.parts.map((p) => ({ mark: String(p.position), ku: p.titleKu, en: p.titleEn, key: `${c.number}:part${p.position}` })),
        ...(c.tale ? [{ mark: '', ku: c.tale.title, en: 'Hamo’s story', key: `${c.number}:tale` }] : []),
      ];
      const below = 84 + summary.height + entries.length * 16.5 + 22;
      // the land the chapter is set in fills what the words leave of the page
      const band = Math.max(150, Math.min(262, PAGE.h - MARGIN.bottom - below + 4));
      doc.save().rect(0, 0, PAGE.w, band).fill(tone.band).restore();
      // far mountains in the chapter's colour, a step from its sky, then the hill everyone stands on
      const ridge = (x: number, y: number): [number, number] => [PAGE.w * x, band - y];
      const far: Array<[number, number]> = [[0, 104], [0.1, 118], [0.22, 132], [0.3, 124], [0.42, 140], [0.54, 120], [0.64, 110], [0.76, 128], [0.86, 116], [1, 100]];
      const range = doc.save().moveTo(...ridge(0, 0)).lineTo(...ridge(0, 104));
      for (let i = 1; i < far.length; i++) {
        const [x0, y0] = far[i - 1]!;
        const [x1, y1] = far[i]!;
        range.quadraticCurveTo(...ridge((x0 + x1) / 2 + 0.01, (y0 + y1) / 2 + 6), ...ridge(x1, y1));
      }
      range.lineTo(...ridge(1, 0)).fill(blend(tone.band, hue.base, 0.14)).restore();
      doc
        .save()
        .moveTo(0, band - 34)
        .bezierCurveTo(PAGE.w * 0.3, band - 66, PAGE.w * 0.62, band - 16, PAGE.w, band - 48)
        .lineTo(PAGE.w, band)
        .lineTo(0, band)
        .fill(tone.hill)
        .restore();
      // the landmark stands on the hill and casts the hill's own shade, not the path's green
      const size = Math.min(196, band - 28);
      const shade = blend(tone.hill, hue.deep, 0.16);
      drawPicture(press, chapterEmblem(c.number), PAGE.w / 2 - size / 2 + 30, band - size - 4, size, hue, shade);
      const host = castArt(press, c.land.host, c.land.host === 'hamo' ? 'proud' : 'smiling', 'full');
      const hh = Math.min(124, band - 50);
      const hw = (hh * host.w) / host.h;
      const deer = castArt(press, 'hevalo', c.number % 2 === 1 ? 'caught' : 'innocent', 'full');
      const dh = hh * 0.74;
      const dw = (dh * deer.w) / deer.h;
      // each of them stands on their own shadow, falling to the lower right as every shadow in the book does
      doc.save().ellipse(64 + hw * 0.56, band - 4, hw * 0.42, 3.4).fill(shade).restore();
      doc.save().ellipse(PAGE.w - 74 + dw * 0.56, band - 2.4, dw * 0.44, 2.8).fill(shade).restore();
      press.place(host, 64, band - hh - 3, hw);
      press.place(deer, PAGE.w - 74, band - dh - 1, dw);
      press.line(String(c.number), TEXT.x, 22, heavy(48, hue.deep));
      const level = label(hue.deep, 7);
      const lw = press.measure(c.cefr, level.font, level.size, level.tracking) + 16;
      press.box(PAGE.w - TEXT.x - lw, 32, lw, 17, 8.5, INK.card);
      press.line(c.cefr, PAGE.w - TEXT.x - lw, 32 + 8.5 - level.lead / 2, level, 'center', lw);

      let y = band + 15;
      press.line(c.titleKu, TEXT.x, y, heavy(29, INK.ink));
      press.line(c.titleEn, TEXT.x, y + 35, displayItalic(13, hue.deep));
      y += 59;
      press.set(summary.lines, TEXT.x, y, T.body);
      y += summary.height + 11;
      press.line('IN THIS CHAPTER', TEXT.x, y, label(hue.deep));
      press.rule(TEXT.x, y + 12, TEXT.w, hue.wash, 0.9);
      y += 18.5;
      for (const e of entries) {
        if (e.mark) {
          press.disc(TEXT.x + 6.5, y + 6.2, 6.5, hue.wash);
          press.line(e.mark, TEXT.x, y + 1.5, { font: 'bold', size: 7, color: hue.deep, lead: 9.4 }, 'center', 13);
        } else press.place(castArt(press, 'hamo', 'telling'), TEXT.x - 0.5, y - 1, 14);
        const w = press.line(e.ku, TEXT.x + 20, y, T.kurdish);
        const ew = press.line(e.en, TEXT.x + 20 + w + 6, y + 1.6, T.english);
        const at = places.get(e.key);
        const number = display(8.6, INK.ink);
        const pw = at === undefined ? 0 : press.measure(String(at), number.font, number.size);
        if (at !== undefined) press.line(String(at), TEXT.x, y + 1.2, number, 'right', TEXT.w);
        press.dots(TEXT.x + 20 + w + 6 + ew + 6, y + 10, TEXT.w - (20 + w + 6 + ew + 6) - pw - 6, INK.line);
        y += 16.5;
      }
      // the opening page has no head, but it has its number, and the apple whole
      footOf(press, page, 0);
    },
  };
}

// ───────────────────────────────────────────────────────────── a part: its name and its grammar

/** A part's opening band: its number and its name, with its English beside the name, or under it where one line will not hold both. */
function partHead(press: Press, c: BookChapter, p: BookPart): Block {
  const hue = hueOf(c);
  const tag = label(hue.deep, 5.8);
  const part = `PART ${p.position} OF ${c.parts.length}`;
  const english = displayItalic(9.6, hue.deep);
  const room = TEXT.w - 40 - 11 - press.measure(part, tag.font, tag.size, tag.tracking) - 12;
  const enW = press.measure(p.titleEn, english.font, english.size);
  // the name as large as the line allows beside its English
  let size = 15;
  const wide = (): number => press.measure(p.titleKu, display(size).font, size) + 8 + enW;
  while (size > 13 && wide() > room) size -= 0.5;
  const beside = wide() <= room;
  return {
    height: 36,
    gap: 22,
    keep: true,
    section: p.titleKu,
    anchor: `${c.number}:part${p.position}`,
    draw: (y) => {
      press.box(TEXT.x, y, TEXT.w, 36, 10, tones(hue).band);
      press.box(TEXT.x + 5, y + 5, 26, 26, 7, INK.card);
      press.line(String(p.position), TEXT.x + 5, y + 18 - heavy(16, hue.deep).lead / 2, heavy(16, hue.deep), 'center', 26);
      const title = display(size);
      if (beside) {
        const w = press.line(p.titleKu, TEXT.x + 40, y + 18 - title.lead / 2 - 0.5, title);
        press.line(p.titleEn, TEXT.x + 40 + w + 8, y + 18 - 5.4, english);
      } else {
        press.line(p.titleKu, TEXT.x + 40, y + 3.4, title);
        press.line(p.titleEn, TEXT.x + 40, y + 20.6, { ...english, size: 8.8 });
      }
      press.line(part, TEXT.x, y + 13.5, tag, 'right', TEXT.w - 11);
    },
  };
}

/** How a grammar note's marks are set: what it puts in bold is Kurdish to remember, what it puts in italics is Kurdish said. */
function noteSpans(spans: readonly MarkSpan[]): Span[] {
  return spans.map((s) => ({ text: s.text, ...(s.bold ? { font: 'semi' as const } : s.italic ? { font: 'italic' as const } : {}) }));
}

/**
 * A part's grammar, as a note in the margin of the road: a card with the
 * hue's bar down its side. It is set a paragraph at a time, so a long note
 * can run on over a page break (never leaving one of its paragraphs alone),
 * and each piece draws its own stretch of the card.
 */
function grammarNote(press: Press, c: BookChapter, p: BookPart): Block[] {
  if (p.grammarMd.trim() === '') return [];
  const hue = hueOf(c);
  const inner = TEXT.w - 26;
  const rows: Array<{ lines: Line[]; bullet: boolean; height: number }> = [];
  for (const block of parseMarkdown(p.grammarMd)) {
    const items = block.type === 'bullets' ? block.items : block.type === 'paragraph' || block.type === 'heading' ? [block.spans] : [[{ text: block.text }]];
    for (const spans of items) {
      const bullet = block.type === 'bullets';
      const para = press.para(noteSpans(spans), inner - (bullet ? 10 : 0), T.note);
      rows.push({ lines: para.lines, bullet, height: para.height + 3 });
    }
  }
  const blocks: Block[] = rows.map((row, i) => {
    const first = i === 0;
    const last = i === rows.length - 1;
    const head = first ? 19.5 : 0;
    const height = head + row.height + (last ? 2 : 0);
    return {
      height,
      gap: first ? 8 : 0,
      draw: (y) => {
        // each piece is a stretch of the one card: rounded where the card begins and ends, square where it runs on
        const top = first ? 0 : 9;
        const bottom = last ? 0 : 9;
        press.within(TEXT.x, y, TEXT.w, height, 0, () => {
          press.box(TEXT.x, y - top, TEXT.w, height + top + bottom, 9, INK.card);
          press.box(TEXT.x, y - top, 4, height + top + bottom, 2, hue.base);
        });
        if (first) press.line('GRAMMAR', TEXT.x + 14, y + 7, label(hue.deep));
        if (row.bullet) press.disc(TEXT.x + 17, y + head + T.note.lead / 2, 1.5, hue.base);
        press.set(row.lines, TEXT.x + 14 + (row.bullet ? 10 : 0), y + head, T.note);
      },
    };
  });
  // the opening paragraph may stand alone under its label; what follows it is a list, and never ends on one line
  if (blocks.length > 2) blocks[blocks.length - 2]!.keep = true;
  else if (blocks.length === 2) blocks[0]!.keep = true;
  return blocks;
}

// ───────────────────────────────────────────────────────────── a lesson: its scene

/**
 * The colours a scene is painted in, from its chapter's hue: by day its wash
 * and a hill of it; at dusk a warmer sky over land gone dark; by night the
 * hue's deep shade; in the snow white land under the wash, with mountains a
 * little darker than the sky so they still show.
 */
function sceneColours(hue: HueSteps, setting: BookSetting): { sky: string; ground: string; light: string; far?: string } {
  switch (setting) {
    case 'day':
      return { sky: hue.wash, ground: tones(hue).hill, light: INK.card };
    case 'dusk':
      return { sky: blend(DUSK_GLOW, hue.wash, 0.38), ground: blend(hue.deep, DUSK_LAND, 0.3), light: '#fff4d6', far: blend(hue.base, hue.deep, 0.4) };
    case 'night':
      return { sky: hue.deep, ground: blend(hue.deep, '#000000', 0.35), light: hue.wash };
    case 'snow':
      return { sky: hue.wash, ground: '#ffffff', light: '#ffffff', far: blend(hue.wash, hue.base, 0.32) };
  }
}

/** The warm of a sky at sunset, which a dusk sky takes most of whatever the chapter's hue, and the dark the land goes as the sun sets. */
const DUSK_GLOW = '#f6b26b';
const DUSK_LAND = '#2b1f2e';

/** A lesson's scene, drawn: the sky and the land in the chapter's colours, who is in it, and the things the beat names, each where `sceneLayout` puts it. */
function drawScene(press: Press, c: BookChapter, lesson: BookLesson, x: number, y: number, side: 'left' | 'right'): void {
  const hue = hueOf(c);
  const scene = sceneFor(lesson.beat, lesson.words);
  const layout = sceneLayout(scene, side);
  const colours = sceneColours(hue, scene.setting);
  // the sun or the moon, and what the sky keeps clear of, on the backdrop's own canvas
  const k = BACKDROP_SCALE;
  const orb = layout.orb ? { x: layout.orb.x / k, y: layout.orb.y / k, r: layout.orb.r / k, full: layout.orb.full } : null;
  const clear = layout.clear.map((b) => ({ x: b.x / k, y: b.y / k, w: b.w / k, h: b.h / k }));
  // each scene's sky is its own: its stars, its clouds and its poplars are placed from the lesson's own key
  const key = `backdrop|${chapterHue(c.number)}|${lesson.key}|${scene.setting}|${JSON.stringify(orb)}|${JSON.stringify(clear)}`;
  const backdrop = press.art(key, BOOK_BACKDROP.w, BOOK_BACKDROP.h, () => bookBackdropSvg({ setting: scene.setting, ...colours, orb, clear, seed: lesson.key }));
  press.within(x, y, PANEL.w, PANEL.h, PANEL.r, () => {
    press.place(backdrop, x, y, PANEL.w + 1);
    for (const p of layout.props) drawPicture(press, p.picture, x + p.box.x, y + p.box.y, p.box.w, hue);
    for (const who of layout.cast) press.place(castArt(press, who.who, who.pose), x + who.box.x, y + who.box.y, who.box.w);
  });
}

/** How many lines of a beat a scene has room for beside its drawing. */
const BEAT_LINES = 3;

/** A lesson's opening: its scene, its name, the beat told beside it, and the line to say after Hamo. */
function lessonStrip(press: Press, c: BookChapter, lesson: BookLesson, follows: boolean): Block {
  const hue = hueOf(c);
  const side = lesson.position % 2 === 1 ? 'left' : 'right';
  const tw = TEXT.w - PANEL.w - 11;
  const title = display(11.4);
  const tag = label(hue.deep, 5.8);
  const tagW = press.measure(lesson.focus.toUpperCase(), tag.font, tag.size, tag.tracking);
  const kuW = press.measure(lesson.titleKu, title.font, title.size);
  const enW = press.measure(lesson.titleEn, 'italic', 8.2);
  // the English name beside the Kurdish when the line has room, and under it when not
  const beside = kuW + 7 + enW + 8 + tagW <= tw;
  const head = beside ? 14.5 : 24.5;
  let max = 240;
  let beat = press.para(tellBeat(lesson.beat, max), tw, T.caption);
  while (beat.lines.length > BEAT_LINES && max > 90) {
    max -= 12;
    beat = press.para(tellBeat(lesson.beat, max), tw, T.caption);
  }
  const say: Type = { font: 'semi', size: 8.4, color: hue.deep, lead: 10.6 };
  const bubble = lesson.say ? press.para(lesson.say, tw - 18, say, 3) : null;
  const bubbleH = bubble ? bubble.height + 6.4 : 0;
  const textH = head + beat.height + (bubble ? 3.6 + bubbleH : 0);
  const height = Math.max(PANEL.h, textH);
  return {
    height,
    gap: 12,
    keep: follows,
    draw: (y) => {
      const px = side === 'left' ? TEXT.x : TEXT.x + TEXT.w - PANEL.w;
      const tx = side === 'left' ? TEXT.x + PANEL.w + 11 : TEXT.x;
      const py = y + (height - PANEL.h) / 2;
      drawScene(press, c, lesson, px, py, side);
      // the lesson's number on the corner of its scene, where the scene's layout keeps it clear
      const badge = sceneLayout(sceneFor(lesson.beat, lesson.words), side).badge;
      press.disc(px + badge.x, py + badge.y, badge.r, INK.card);
      press.line(String(lesson.position), px + badge.x - 7, py + badge.y - 4.7, { font: 'bold', size: 7.2, color: hue.deep, lead: 9.4 }, 'center', 14);
      const top = y + Math.max(0, (height - textH) / 2);
      press.line(lesson.titleKu, tx, top - 1.5, title);
      if (beside) press.line(lesson.titleEn, tx + kuW + 7, top + 2, { ...T.english, size: 8.2 });
      else press.line(lesson.titleEn, tx, top + 12.4, { ...T.english, size: 8.2 });
      press.line(lesson.focus.toUpperCase(), tx, top + 2.4, tag, 'right', tw);
      press.set(beat.lines, tx, top + head, T.caption);
      if (bubble) {
        const by = top + head + beat.height + 3.6;
        const bw = Math.min(tw, Math.max(...bubble.lines.map((l) => l.width)) + 18);
        const bx = side === 'left' ? tx : tx + tw - bw;
        press.bubble(bx, by, bw, bubbleH, hue.wash, { side, at: Math.min(9, bubbleH / 2) });
        press.set(bubble.lines, bx + 9, by + 3.2, say);
      }
    },
  };
}

// ───────────────────────────────────────────────────────────── a lesson: its words and its lines

/** The small mark of a noun's gender. */
function genderMark(press: Press, gender: BookWord['gender'], x: number, y: number, hue: HueSteps): void {
  if (!gender) return;
  const text = gender === 'mf' ? 'm/f' : gender;
  const type: Type = { font: 'bold', size: 5.8, color: hue.deep, lead: 8 };
  const w = press.measure(text, type.font, type.size) + 6;
  press.box(x, y, w, 8.6, 4.3, hue.wash);
  press.line(text, x, y + 0.5, type, 'center', w);
}

/**
 * A lesson's new words. Most are cards, three across: each with its picture
 * where it has one, its gender where it has one, and its meaning. A word
 * whose meaning takes explaining (a phrase learnt whole, an ending) is set
 * across the page under them instead, so no card has to stand four lines
 * tall beside two short ones.
 */
function wordRows(press: Press, c: BookChapter, lesson: BookLesson): Block[] {
  const hue = hueOf(c);
  const cols = 3;
  const gutter = 8;
  const cw = (TEXT.w - gutter * (cols - 1)) / cols;
  const made = lesson.words.map((w) => {
    const picture = pictureForWord(w);
    const tw = cw - (picture ? 40 : 6);
    const name = press.para(w.ku, tw - (w.gender ? 20 : 0), T.word);
    const gloss = press.para(w.en, tw, T.gloss);
    return { w, picture, name, gloss, long: name.lines.length > 1 || gloss.lines.length > 2, height: Math.max(picture ? 34 : 0, name.height + gloss.height + 3) };
  });
  // the pictured words first, so their row is a row of pictures
  const cards = [...made.filter((x) => x.picture && !x.long), ...made.filter((x) => !x.picture && !x.long)];
  const rows: Block[] = [];
  for (let i = 0; i < cards.length; i += cols) {
    const row = cards.slice(i, i + cols);
    const height = Math.max(...row.map((x) => x.height));
    rows.push({
      height,
      gap: i === 0 ? 7 : 4,
      draw: (y) => {
        row.forEach((cell, k) => {
          const x = TEXT.x + k * (cw + gutter);
          let tx = x + 5;
          if (cell.picture) {
            press.box(x, y, 34, 34, 9, tones(hue).card);
            drawPicture(press, cell.picture, x + 2, y + 2, 30, hue);
            tx = x + 40;
          } else press.box(x, y + 2, 1.6, height - 4.5, 0.8, hue.wash);
          const top = y + (cell.picture ? Math.max(0, (34 - cell.name.height - cell.gloss.height) / 2 - 1) : 1);
          press.set(cell.name.lines, tx, top, T.word);
          genderMark(press, cell.w.gender, tx + (cell.name.lines[0]?.width ?? 0) + 4, top + 1.8, hue);
          press.set(cell.gloss.lines, tx, top + cell.name.height + 0.5, T.gloss);
        });
      },
    });
  }
  const kw = 112;
  made
    .filter((x) => x.long)
    .forEach((cell, i) => {
      const name = press.para(cell.w.ku, kw - (cell.w.gender ? 22 : 4), T.word);
      const gloss = press.para(cell.w.en, TEXT.w - kw - 8, T.gloss);
      const height = Math.max(name.height, gloss.height + 2) + 1;
      rows.push({
        height,
        gap: i === 0 ? (cards.length > 0 ? 5 : 7) : 2.5,
        draw: (y) => {
          press.box(TEXT.x, y + 2, 1.6, height - 4, 0.8, hue.wash);
          press.set(name.lines, TEXT.x + 5, y, T.word);
          genderMark(press, cell.w.gender, TEXT.x + 5 + (name.lines[0]?.width ?? 0) + 4, y + 1.8, hue);
          press.set(gloss.lines, TEXT.x + kw + 4, y + 2, T.gloss);
        },
      });
    });
  return rows;
}

/**
 * Kurdish beside its English, as the book always sets the two: Kurdish on
 * the left, its meaning on the right. How the width is shared between them
 * is whichever of a few splits takes the least room for these lines, so
 * short lines sit on one row and long ones do not wrap more than they must.
 */
function pairColumns(press: Press, pairs: ReadonlyArray<{ ku: string; en: string | null }>, width: number): { kw: number; rows: Array<{ ku: Line[]; en: Line[]; height: number }> } {
  const gutter = 10;
  let best: { kw: number; rows: Array<{ ku: Line[]; en: Line[]; height: number }>; total: number } | null = null;
  for (const share of [0.57, 0.5, 0.62, 0.66]) {
    const kw = (width - gutter) * share;
    const ew = width - gutter - kw;
    const rows = pairs.map((p) => {
      const ku = press.wrap(p.ku, kw, T.kurdish);
      const en = p.en ? press.wrap(p.en, ew, T.english) : [];
      return { ku, en, height: Math.max(ku.length * T.kurdish.lead, en.length * T.english.lead + 1.6) };
    });
    const total = rows.reduce((a, r) => a + r.height, 0);
    if (!best || total < best.total - 0.01) best = { kw: kw + gutter, rows, total };
  }
  return best!;
}

/** Lines to read aloud, each beside what it means. */
function pairRows(press: Press, c: BookChapter, pairs: readonly BookPair[]): Block[] {
  const hue = hueOf(c);
  const set = pairColumns(press, pairs, TEXT.w - 9);
  const rows: Block[] = set.rows.map((row, i) => ({
    height: row.height,
    gap: i === 0 ? 7 : 2.5,
    draw: (y) => {
      press.box(TEXT.x, y + 1.5, 2.2, row.height - 2.5, 1.1, hue.base);
      press.set(row.ku, TEXT.x + 9, y, T.kurdish);
      press.set(row.en, TEXT.x + 9 + set.kw, y + 1.6, T.english);
    },
  }));
  return keepList(rows);
}

/** A conversation: who says what, beside what it means, and the question the lesson asks about it. */
function dialogueRows(press: Press, c: BookChapter, dialogue: BookDialogue): Block[] {
  const hue = hueOf(c);
  const tagW = 30;
  const set = pairColumns(press, dialogue.lines.map((l) => ({ ku: l.text, en: l.en })), TEXT.w - tagW);
  const blocks: Block[] = [
    {
      height: 13,
      gap: 9,
      keep: true,
      draw: (y) => {
        const w = press.line('CONVERSATION', TEXT.x, y + 2.6, label(hue.deep));
        const tw = dialogue.title ? press.line(dialogue.title, TEXT.x + w + 8, y - 0.8, display(10)) + 8 : 0;
        press.rule(TEXT.x + w + 8 + tw, y + 7.4, TEXT.w - w - 8 - tw, hue.wash, 0.9);
      },
    },
  ];
  const lines: Block[] = dialogue.lines.map((l, i) => {
    const row = set.rows[i]!;
    return {
      height: row.height,
      gap: i === 0 ? 4 : 2.2,
      draw: (y) => {
        press.line(l.who.toUpperCase(), TEXT.x, y + 2.8, label(l.learner ? INK.violet : hue.deep, 5.6));
        press.set(row.ku, TEXT.x + tagW, y, T.kurdish);
        press.set(row.en, TEXT.x + tagW + set.kw, y + 1.6, T.english);
      },
    };
  });
  keepList(lines);
  if (dialogue.question) {
    const q = dialogue.question;
    const type: Type = { ...T.caption, color: INK.ink };
    const spans: Span[] = [{ text: `${q.prompt}  `, font: 'semi' }, ...q.options.flatMap((o, k): Span[] => [{ text: `${'abcdef'[k]}`, font: 'bold', color: hue.deep }, { text: ` ${o}${k < q.options.length - 1 ? '   ' : ''}` }])];
    const para = press.para(spans, TEXT.w - tagW, type);
    // the question stays with the last line of what it asks about
    if (lines.length > 0) lines[lines.length - 1]!.keep = true;
    lines.push({
      height: para.height + 1,
      gap: 5,
      draw: (y) => {
        press.disc(TEXT.x + 7, y + 5.4, 5.6, hue.wash);
        press.line('?', TEXT.x + 1.4, y + 0.8, { font: 'bold', size: 7.4, color: hue.deep, lead: 9.4 }, 'center', 11.2);
        press.set(para.lines, TEXT.x + tagW, y, type);
      },
    });
  }
  return [...blocks, ...lines];
}

// ───────────────────────────────────────────────────────────── the story

/** The things a story names that there is a drawing of, for the band over it. */
function storyProps(c: BookChapter): BookPicture[] {
  const english = c.tale?.english.join(' ') ?? '';
  return sceneFor(english).props.filter((p) => p.kind !== 'figure').slice(0, 3);
}

function taleBlocks(press: Press, c: BookChapter): Block[] {
  const tale = c.tale;
  if (!tale) return [];
  const hue = hueOf(c);
  const blocks: Block[] = [];
  const props = storyProps(c);
  blocks.push({
    height: 54,
    gap: 24,
    keep: true,
    section: 'Hamo’s story',
    anchor: `${c.number}:tale`,
    draw: (y) => {
      press.box(TEXT.x, y, TEXT.w, 54, 12, tones(hue).band);
      press.within(TEXT.x, y, TEXT.w, 54, 12, () => {
        press.place(castArt(press, 'hamo', 'telling'), TEXT.x + TEXT.w - 60, y + 2, 58);
        props.forEach((p, i) => drawPicture(press, p, TEXT.x + TEXT.w - 96 - i * 33, y + 20 - (i % 2) * 4, 31, hue));
      });
      press.line('HAMO’S STORY', TEXT.x + 14, y + 10, label(hue.deep));
      let size = 18;
      while (size > 11 && press.measure(tale.title, 'display', size) > TEXT.w - 84 - props.length * 33) size -= 0.5;
      press.line(tale.title, TEXT.x + 14, y + 22, display(size));
    },
  });
  const kw = TEXT.w * 0.585;
  const ew = TEXT.w - kw - 14;
  const rows: Block[] = tale.paragraphs.map((text, i) => {
    const ku = press.para(text, kw, T.tale);
    const en = tale.english[i] ? press.para(tale.english[i]!, ew, T.taleEnglish) : null;
    const height = Math.max(ku.height, (en?.height ?? 0) + 2.4);
    return {
      height,
      gap: i === 0 ? 11 : 8,
      draw: (y) => {
        press.set(ku.lines, TEXT.x, y, T.tale);
        if (en) press.set(en.lines, TEXT.x + kw + 14, y + 2.4, T.taleEnglish);
      },
    };
  });
  // each row is a whole paragraph beside its English, so any of them may open or close a page
  blocks.push(...rows);
  if (tale.glossary.length > 0) {
    const spans: Span[] = tale.glossary.flatMap((g, i): Span[] => [{ text: g.term, font: 'semi' }, { text: ` ${g.en}${i < tale.glossary.length - 1 ? '   ·   ' : ''}`, font: 'italic', color: INK.soft }]);
    const para = press.para(spans, TEXT.w - 44, T.note);
    blocks.push({
      height: para.height,
      gap: 9,
      draw: (y) => {
        press.line('WORDS', TEXT.x, y + 2.2, label(hue.deep));
        press.set(para.lines, TEXT.x + 44, y, T.note);
      },
    });
  }
  if (tale.questions.length > 0) {
    blocks.push({
      height: 13,
      gap: 14,
      keep: true,
      draw: (y) => {
        const w = press.line('QUESTIONS ABOUT THE STORY', TEXT.x, y + 2.6, label(hue.deep));
        press.rule(TEXT.x + w + 8, y + 7.4, TEXT.w - w - 8, hue.wash, 0.9);
      },
    });
    const cols = 2;
    const cw = (TEXT.w - 14) / cols;
    const prompt: Type = { font: 'semi', size: 8.4, color: INK.ink, lead: 10.6 };
    const option: Type = { font: 'body', size: 8.1, color: INK.ink, lead: 10.3 };
    const cells = tale.questions.map((q, i) => {
      // the question in Kurdish, and what it asks in English running on after it
      const ku = press.para([{ text: q.prompt }, ...(q.promptEn ? [{ text: `  ${q.promptEn}`, font: 'italic' as const, color: INK.soft }] : [])], cw - 15, prompt);
      const options = press.para(q.options.flatMap((o, k): Span[] => [{ text: 'abcdef'[k]!, font: 'bold', color: hue.deep }, { text: ` ${o}${k < q.options.length - 1 ? '   ' : ''}` }]), cw - 15, option);
      return { i, ku, options, height: ku.height + options.height + 1.5 };
    });
    const made: Block[] = [];
    for (let i = 0; i < cells.length; i += cols) {
      const row = cells.slice(i, i + cols);
      made.push({
        height: Math.max(...row.map((x) => x.height)),
        gap: i === 0 ? 6 : 5.5,
        draw: (y) => {
          row.forEach((cell, k) => {
            const x = TEXT.x + k * (cw + 14);
            press.line(String(cell.i + 1), x, y - 0.4, display(9.2, hue.deep));
            press.set(cell.ku.lines, x + 15, y, prompt);
            press.set(cell.options.lines, x + 15, y + cell.ku.height + 0.8, option);
          });
        },
      });
    }
    blocks.push(...made);
  }
  return blocks;
}

// ───────────────────────────────────────────────────────────── practice

/** The heading of one kind of task in a chapter's practice. */
function taskHead(press: Press, hue: HueSteps, letter: string, title: string, hint: string): Block {
  return {
    height: 16,
    gap: 13,
    keep: true,
    draw: (y) => {
      press.disc(TEXT.x + 7, y + 7.5, 7, hue.deep);
      press.line(letter, TEXT.x, y + 2.6, { font: 'bold', size: 7.4, color: '#ffffff', lead: 9.8 }, 'center', 14);
      const w = press.line(title, TEXT.x + 20, y + 1, display(10.4));
      press.line(hint, TEXT.x + 20 + w + 8, y + 3.2, T.english);
    },
  };
}

/** A fixed, fair shuffle of a list's order: the same every time, and never the order it came in. */
export function shuffled<T>(list: readonly T[], turn: number): T[] {
  const n = list.length;
  if (n < 3) return [...list].reverse();
  // a step that shares no factor with the length visits every place once
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let step = (Math.abs(Math.floor(turn)) % (n - 1)) + 2;
  while (gcd(step, n) !== 1) step += 1;
  return Array.from({ length: n }, (_, i) => list[(i * step + 1) % n]!);
}

function practiceBlocks(press: Press, c: BookChapter, places: Places): Block[] {
  const hue = hueOf(c);
  const pr = c.practice;
  const blocks: Block[] = [];
  if (pr.match.length + pr.gaps.length + pr.replies.length + pr.toKurdish.length + pr.pictures.length + pr.alone.length === 0) return [];
  blocks.push({
    height: 40,
    gap: 24,
    keep: true,
    section: 'With a pencil',
    anchor: `${c.number}:practice`,
    draw: (y) => {
      press.box(TEXT.x, y, TEXT.w, 40, 12, tones(hue).band);
      drawPicture(press, { kind: 'word', id: 'pen' }, TEXT.x + TEXT.w - 48, y + 2, 36, hue);
      press.line('With a pencil', TEXT.x + 14, y + 4.5, display(16));
      const at = places.get('answers');
      press.line(at === undefined ? 'The answers are at the back.' : `Cover the pages before this one. The answers are on page ${at}.`, TEXT.x + 14, y + 24.5, { ...T.english, color: hue.deep });
    },
  });
  let letter = 0;
  const next = (): string => 'ABCDEF'[letter++]!;
  const inset = 20;
  const number: Type = { font: 'bold', size: 7.4, color: hue.deep, lead: 10 };

  if (pr.match.length >= 4) {
    blocks.push(taskHead(press, hue, next(), 'Join them up', 'draw a line from each word to its meaning'));
    const english: Type = { ...T.english, size: 8.3 };
    // two groups side by side, each with its meanings in another order; one under the other where a side would be too narrow for its words
    const half = Math.ceil(pr.match.length / 2);
    const widest = (group: readonly BookPair[]): number => Math.max(...group.map((m) => press.measure(m.ku, T.kurdish.font, T.kurdish.size))) + Math.max(...group.map((m) => press.measure(m.en, english.font, english.size))) + 18;
    const pairs = [pr.match.slice(0, half), pr.match.slice(half)];
    const across = pairs.every((group) => group.length === 0 || widest(group) + 26 <= (TEXT.w - inset - 14) / 2);
    const groups = (across ? pairs : [pr.match]).map((group, g) => ({ group, right: shuffled(group, c.number + g) }));
    const gw = across ? (TEXT.w - inset - 14) / 2 : Math.min(TEXT.w - inset, widest(pr.match) + 90);
    const rows: Block[] = Array.from({ length: across ? half : pr.match.length }, (_, i) => ({
      height: 12.4,
      gap: i === 0 ? 6 : 1.6,
      draw: (y: number) => {
        groups.forEach(({ group, right }, g) => {
          if (i >= group.length) return;
          const x = TEXT.x + inset + g * (gw + 14);
          const kw = Math.max(...group.map((m) => press.measure(m.ku, T.kurdish.font, T.kurdish.size))) + 9;
          const ew = Math.max(...right.map((m) => press.measure(m.en, english.font, english.size))) + 9;
          press.line(group[i]!.ku, x, y, T.kurdish);
          press.disc(x + kw, y + 6.2, 1.7, hue.base);
          press.disc(x + gw - ew, y + 6.2, 1.7, hue.base);
          press.line(right[i]!.en, x + gw - ew + 8, y + 0.8, english);
        });
      },
    }));
    blocks.push(...keepList(rows));
  }

  if (pr.gaps.length > 0) {
    blocks.push(taskHead(press, hue, next(), 'Fill the gap', 'each word in the box goes in one line'));
    const bank = [...new Set(pr.gaps.map((g) => g.answer))].sort((a, b) => a.localeCompare(b, 'ku'));
    const chip: Type = { font: 'semi', size: 8.3, color: hue.deep, lead: 10.8 };
    const widths = bank.map((b) => press.measure(b, chip.font, chip.size) + 14);
    blocks.push({
      height: 16,
      gap: 6,
      keep: true,
      draw: (y) => {
        let x = TEXT.x + inset;
        bank.forEach((b, i) => {
          press.box(x, y, widths[i]!, 16, 8, hue.wash);
          press.line(b, x, y + 2.6, chip, 'center', widths[i]!);
          x += widths[i]! + 6;
        });
      },
    });
    const gap = 40;
    const rows: Block[] = pr.gaps.map((g, i) => {
      const [before = '', after = ''] = g.text.split('___');
      // a line too long for the page gives its gap a line break before it rather than run off the edge
      const room = TEXT.w - inset - 14;
      const bw = press.measure(before, T.kurdish.font, T.kurdish.size);
      const aw = press.measure(after, T.kurdish.font, T.kurdish.size);
      const fits = bw + gap + 4 + aw <= room;
      const wrapped = fits ? null : press.para(`${before}________${after}`, room, T.kurdish);
      const cue = g.cue ? press.para(g.cue, room, T.gloss, 1) : null;
      return {
        height: (wrapped ? wrapped.height : 12.6) + (cue ? cue.height : 0),
        gap: i === 0 ? 6 : 3.6,
        draw: (y: number) => {
          press.line(`${i + 1}`, TEXT.x + inset, y + 1, number);
          const tx = TEXT.x + inset + 14;
          if (wrapped) press.set(wrapped.lines, tx, y, T.kurdish);
          else {
            press.line(before, tx, y, T.kurdish);
            press.dots(tx + bw + 1, y + 10.6, gap, INK.soft);
            press.line(after, tx + bw + gap + 3, y, T.kurdish);
          }
          if (cue) press.set(cue.lines, tx, y + (wrapped ? wrapped.height : 12.6) - 0.6, T.gloss);
        },
      };
    });
    blocks.push(...keepList(rows));
  }

  if (pr.replies.length > 0) {
    blocks.push(taskHead(press, hue, next(), 'What do you say?', 'Hamo speaks; write your answer'));
    const say: Type = { font: 'semi', size: 8.5, color: hue.deep, lead: 10.8 };
    const rows: Block[] = pr.replies.map((r, i) => {
      const text = press.para(r.say, TEXT.w * 0.5, say, 3);
      const bw = Math.max(...text.lines.map((l) => l.width)) + 16;
      const bh = text.height + 7;
      const cue = r.cue ? press.para(r.cue, TEXT.w - inset - 3 - bw - 12, T.gloss, 2) : null;
      return {
        height: bh + 15,
        gap: i === 0 ? 6 : 4.5,
        draw: (y: number) => {
          press.place(castArt(press, 'hamo', 'telling'), TEXT.x + 1, y - 1, 16);
          press.bubble(TEXT.x + inset + 3, y, bw, bh, hue.wash, { side: 'left', at: 8 });
          press.set(text.lines, TEXT.x + inset + 11, y + 3.5, say);
          if (cue) press.set(cue.lines, TEXT.x + inset + 3 + bw + 8, y + (bh - cue.height) / 2, T.gloss);
          press.line('YOU', TEXT.x + inset + 3, y + bh + 4.6, label(INK.violet, 5.6));
          press.dots(TEXT.x + inset + 24, y + bh + 11.4, TEXT.w - inset - 28, INK.soft);
        },
      };
    });
    blocks.push(...keepList(rows));
  }

  if (pr.toKurdish.length > 0) {
    blocks.push(taskHead(press, hue, next(), 'Put it into Kurdish', 'write it, then say it'));
    const type: Type = { ...T.note, font: 'italic' };
    const rows: Block[] = pr.toKurdish.map((t, i) => {
      const text = press.para(t.en, TEXT.w - inset - 18, type);
      return {
        height: text.height + 13,
        gap: i === 0 ? 5 : 2.5,
        draw: (y: number) => {
          press.line(`${i + 1}`, TEXT.x + inset, y + 1.2, number);
          press.set(text.lines, TEXT.x + inset + 14, y, type);
          press.dots(TEXT.x + inset + 14, y + text.height + 10, TEXT.w - inset - 18, INK.soft);
        },
      };
    });
    blocks.push(...keepList(rows));
  }

  const drawn = pr.pictures.filter((p) => Object.hasOwn(WORD_PICTURES, p.picture));
  if (drawn.length >= 3) {
    blocks.push(taskHead(press, hue, next(), 'Name the pictures', 'in Kurdish, of course'));
    const cw = (TEXT.w - inset) / Math.max(drawn.length, 5);
    blocks.push({
      height: 58,
      gap: 7,
      // where the task lands is noted, so the chapter's pictures at its end do not name these on the same page
      anchor: `${c.number}:pictures`,
      draw: (y) => {
        drawn.forEach((p, i) => {
          const x = TEXT.x + inset + i * cw;
          press.box(x + (cw - 40) / 2, y, 40, 40, 10, tones(hue).card);
          drawPicture(press, { kind: 'word', id: p.picture as keyof typeof WORD_PICTURES }, x + (cw - 34) / 2, y + 3, 34, hue);
          press.line(`${i + 1}`, x + (cw - 40) / 2 - 2, y - 2.5, number);
          press.dots(x + 5, y + 54, cw - 10, INK.soft);
        });
      },
    });
  }

  if (pr.alone.length > 0) {
    blocks.push(taskHead(press, hue, next(), 'No English this time', 'Hevalo ate it. Read these aloud all the same'));
    const rows: Block[] = pr.alone.map((line, i) => {
      const text = press.para(line, TEXT.w - inset - 14, T.kurdish);
      return {
        height: text.height,
        gap: i === 0 ? 6 : 3,
        draw: (y: number) => {
          press.disc(TEXT.x + inset + 4, y + 6, 1.7, hue.base);
          press.set(text.lines, TEXT.x + inset + 14, y, T.kurdish);
        },
      };
    });
    blocks.push(...keepList(rows));
  }
  return blocks;
}

// ───────────────────────────────────────────────────────────── how a chapter ends

/**
 * How a chapter ends: its stamp, cancelled, and its own line about Hevalo
 * and his apples. `small` is the same with a smaller stamp, for a chapter
 * whose last page has just that much room left.
 */
function endBlock(press: Press, c: BookChapter, places: Places, small = false): Block {
  const hue = hueOf(c);
  const w = small ? 62 : 88;
  const h = (w * STAMP.h) / STAMP.w;
  const tw = TEXT.w - w - 44;
  const gag = c.gag;
  const say: Type = { font: 'semi', size: small ? 8.6 : 9.2, color: hue.deep, lead: small ? 11 : 12 };
  const line = gag ? press.para(gag.ku, tw - 44, say, 3) : null;
  const meaning = gag ? press.para(gag.en, tw - 26, T.english, 3) : null;
  const height = h + (small ? 22 : 30);
  return {
    height,
    gap: small ? 20 : 26,
    draw: (y) => {
      const x = TEXT.x + 14;
      drawStamp(press, x, y + (small ? 12 : 15), w, c, { glow: 0.5, cancelled: true });
      const tx = x + w + 30;
      press.line(`CHAPTER ${c.number} IS YOURS`, tx, y + (small ? 8 : 12), label(hue.deep));
      press.line(c.titleKu, tx, y + (small ? 17.5 : 22.5), display(small ? 15 : 18));
      const at = places.get('passport');
      const note = press.para(`Cancel its stamp in your passport${at === undefined ? '' : ` on page ${at}`}, then turn the page.`, tw, T.caption);
      const ny = y + (small ? 37 : 46);
      press.set(note.lines, tx, ny, T.caption);
      if (line && meaning) {
        const by = ny + note.height + (small ? 6 : 9);
        const bw = Math.min(tw - 26, Math.max(...line.lines.map((l) => l.width)) + 18);
        press.place(castArt(press, 'hamo', 'laughing'), tx - 2, by - 3, 22);
        press.bubble(tx + 25, by, bw, line.height + 8, hue.wash, { side: 'left', at: 9 });
        press.set(line.lines, tx + 34, by + 4, say);
        press.set(meaning.lines, tx + 25, by + line.height + 11, T.english);
      }
      const core = small ? 28 : 36;
      press.place(appleArt(press, BOOK_APPLE_BITES), TEXT.x + TEXT.w - core - 4, y + height - core - 6, core);
    },
  };
}

/**
 * What stands at the foot of a page that ends early: Hevalo's tracks leading
 * on, or one of the two of them up to something, and a line about it.
 */
const ASIDES: ReadonlyArray<readonly [who: 'tracks' | 'hevalo' | 'hamo', pose: string, line: string]> = [
  ['tracks', '', 'This way. There may be apples.'],
  ['hevalo', 'innocent', 'It was like that when he found it.'],
  ['hamo', 'asleep', 'Five minutes, says Hamo.'],
  ['tracks', '', 'Hevalo has gone on ahead.'],
  ['hevalo', 'caught', 'Nobody saw that. Turn the page.'],
  ['hevalo', 'asleep', 'Shh. He is dreaming of an orchard.'],
  ['tracks', '', 'Mind the hoofprints.'],
  ['hevalo', 'curious', 'Is the next page made of apples? He would like to know.'],
  ['hamo', 'proud', 'A moustache like this takes time. So does Kurdish.'],
  ['tracks', '', 'Somebody was here. Somebody with hooves.'],
  ['hevalo', 'munching', 'He is not hungry, he says.'],
  ['hevalo', 'pleased', 'On you go. Hamo is putting the kettle on.'],
];

/**
 * What fills the space a page of the chapter has left over. On its last
 * page, the chapter in pictures: every word of it that has a drawing, to
 * cover and name — but not the ones "Name the pictures" asks for, when that
 * task is on the same page (`asked` says which page it is on), or they would
 * be its answers. On a page that only ends a little early, one of the asides
 * above, a different one each time.
 */
function chapterFiller(press: Press, c: BookChapter, asked: () => number): Filler {
  const hue = hueOf(c);
  const seen = new Set<string>();
  const pictured: Array<{ picture: BookPicture; ku: string }> = [];
  for (const w of chapterWords(c)) {
    const picture = pictureForWord(w);
    if (!picture || picture.kind === 'cast' || picture.kind === 'figure') continue;
    const key = JSON.stringify(picture);
    if (seen.has(key)) continue;
    seen.add(key);
    pictured.push({ picture, ku: w.ku });
  }
  // each chapter starts somewhere else in the asides, and takes them in turn from there
  let turn = c.number * 5;
  return (y, height, last, index) => {
    if (!last) {
      if (height < 62) return;
      const [who, pose, line] = ASIDES[turn++ % ASIDES.length]!;
      const mid = y + height / 2 + 4;
      if (who === 'tracks') {
        const prints = squareArt(press, 'spot|hoofprints', () => bookSpotSvg({ spot: 'hoofprints' }));
        for (let i = 0; i < 4; i++) press.place(prints, PAGE.w / 2 - 82 + i * 41, mid - 22 + (i % 2) * 3, 30, { turn: 62 });
        press.line(line, TEXT.x, mid + 15, T.english, 'center', TEXT.w);
        return;
      }
      // a little round portrait, as the people of the road have theirs
      const r = 21;
      const cy = mid - 8;
      press.disc(PAGE.w / 2, cy, r, tones(hue).band);
      press.within(PAGE.w / 2 - r, cy - r, r * 2, r * 2, r, () => press.place(castArt(press, who, pose), PAGE.w / 2 - r + 2, cy - r + 4.5, r * 2 - 4));
      press.line(line, TEXT.x, cy + r + 5, T.english, 'center', TEXT.w);
      return;
    }
    const per = 7;
    const cell = { w: TEXT.w / per, h: 50 };
    const task = new Set(asked() === index ? c.practice.pictures.map((p) => p.picture) : []);
    const fresh = pictured.filter((p) => !(p.picture.kind === 'word' && task.has(p.picture.id)));
    const rows = Math.min(Math.ceil(fresh.length / per), Math.floor((height - 36) / cell.h));
    if (rows < 1 || fresh.length < 3) return;
    const shown = fresh.slice(0, rows * per);
    // set at the foot of the page, so the stamp above keeps its air
    const top = y + height - rows * cell.h - 16;
    const w = press.line(`CHAPTER ${c.number} IN PICTURES`, TEXT.x, top - 4, label(hue.deep));
    const hint = press.line('cover the words, then name them', TEXT.x + w + 8, top - 5.6, T.english);
    press.rule(TEXT.x + w + hint + 16, top + 1, TEXT.w - w - hint - 16, hue.wash, 0.9);
    const name: Type = { font: 'semi', size: 7.6, color: INK.ink, lead: 9.6 };
    shown.forEach((p, i) => {
      const x = TEXT.x + (i % per) * cell.w;
      const cy = top + 12 + Math.floor(i / per) * cell.h;
      press.box(x + (cell.w - 32) / 2, cy, 32, 32, 9, tones(hue).card);
      drawPicture(press, p.picture, x + (cell.w - 28) / 2, cy + 2, 28, hue);
      let size = name.size;
      while (size > 5.4 && press.measure(p.ku, name.font, size) > cell.w - 2) size -= 0.3;
      press.line(p.ku, x, cy + 33.5, { ...name, size }, 'center', cell.w);
    });
  };
}

// ───────────────────────────────────────────────────────────── the chapter

/** Everything of a chapter after its opening page, as one run of blocks. */
function chapterBlocks(press: Press, c: BookChapter, places: Places): Block[] {
  const blocks: Block[] = [];
  for (const p of c.parts) {
    blocks.push(partHead(press, c, p), ...grammarNote(press, c, p));
    for (const lesson of p.lessons) {
      const rest = [...wordRows(press, c, lesson), ...pairRows(press, c, lesson.sentences), ...(lesson.dialogue ? dialogueRows(press, c, lesson.dialogue) : [])];
      blocks.push(lessonStrip(press, c, lesson, rest.length > 0), ...rest);
    }
  }
  blocks.push(...taleBlocks(press, c), ...practiceBlocks(press, c, places));
  if (blocks.length > 0) blocks[0]!.gap = 0;
  // the stamp at its full size, unless that would send it to a page of its own when a smaller one would end the chapter here
  const full = endBlock(press, c, places);
  const small = endBlock(press, c, places, true);
  const pages = paginate([...blocks, full], TEXT.room);
  const before = pages.at(-2);
  const alone = pages.at(-1)?.from === blocks.length && before !== undefined;
  return [...blocks, alone && before.used + small.gap + small.height <= TEXT.room ? small : full];
}

/**
 * A chapter's pages, and where its parts, its story and its practice begin,
 * counted from its opening page (0). The apple in the corner loses a bite
 * every few pages, and is a core on the chapter's last.
 */
export function chapterSheets(press: Press, c: BookChapter, places: Places): { sheets: Sheet[]; anchors: Array<[string, number]> } {
  const anchors: Array<[string, number]> = [[`${c.number}:opener`, 0]];
  // the page of the run that "Name the pictures" is on, for the chapter's pictures at its end to keep clear of
  let pictures = -1;
  const noted = (anchor: string, index: number): void => {
    anchors.push([anchor, index + 1]);
    if (anchor === `${c.number}:pictures`) pictures = index;
  };
  const run = runSheets(press, chapterBlocks(press, c, places), (_, section) => ({ chapter: c, section, bites: 0 }), noted, chapterFiller(press, c, () => pictures));
  const total = run.length + 1;
  run.forEach((sheet, i) => {
    if (sheet.furniture) sheet.furniture.bites = Math.min(BOOK_APPLE_BITES, Math.floor(((i + 1) * (BOOK_APPLE_BITES + 1)) / total));
  });
  return { sheets: [openerSheet(press, c, places), ...run], anchors };
}
