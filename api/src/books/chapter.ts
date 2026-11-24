/**
 * One chapter of the book, set: its opening page under its landmark, then one run of blocks. For each of its four
 * parts: the grammar note and four lessons, each opening with its scene (a drawing composed from the plan's beat, the
 * beat beside it, and Hamo's line in a speech bubble), then new words with pictures, lines to read aloud with their
 * English, and the conversation. Then Hamo's story with questions, pencil practice, and the chapter's cancelled stamp.
 *
 * The chapter wears its hue throughout, and the corner apple loses a bite every few pages until only the core is left.
 */
import { BOOK_APPLE_BITES, BOOK_BACKDROP, WORD_PICTURES, bookBackdropSvg, parseMarkdown, type BookPose, type BookSetting, type CharacterId, type HueSteps, type Span as MarkSpan } from '@kurda/shared';
import { keepList, paginate } from './flow.js';
import { T, castArt, display, displayItalic, drawPicture, drawStamp, footOf, heavy, hueOf, label, runSheets, STAMP, type Block, type Filler, type Places, type Sheet } from './page.js';
import { PANEL, chapterEmblem, chapterHue, lessonScene, pictureForWord, sceneFor, sceneLayout, tellBeat, type BookPicture } from './pictures.js';
import { chapterWords, type BookChapter, type BookDialogue, type BookLesson, type BookPair, type BookPart, type BookWord } from './road-book.js';
import { INK, MARGIN, PAGE, Press, TEXT, blend, type Line, type Span, type Type } from './sheet.js';

/** The colours a chapter's pages are painted in, from its hue: a band across the page, a card behind a picture, the hill of a scene. */
const tones = (hue: HueSteps): { band: string; card: string; hill: string } => ({ band: hue.wash, card: hue.tint, hill: blend(hue.wash, hue.base, 0.3) });

// ───────────────────────────────────────────────────────────── the opening page

/**
 * Who stands at the landmark on an opening page where it is not the road's own host for that land: Hamo, in his own
 * chapters.
 */
const OPENER_HOST: Readonly<Record<number, CharacterId>> = { 4: 'hamo', 6: 'hamo', 8: 'hamo' };

/** How Hevalo stands at each chapter's landmark, by chapter: the face of what the chapter does to him, from his own book poses. */
const OPENER_DEER: readonly BookPose<'hevalo'>[] = ['curious', 'pleased', 'munching', 'caught', 'innocent', 'curious', 'pleased', 'innocent', 'curious', 'pleased', 'curious', 'innocent'];

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
      // the one soft hill everyone stands on, under an open sky, so the landmark is the whole picture
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
      const who = OPENER_HOST[c.number] ?? c.land.host;
      const host = castArt(press, who, who === 'hamo' ? 'proud' : 'smiling', 'full');
      // the two of them stand a step in front of the landmark, and are drawn to its scale: a person a little taller than its door
      const hh = Math.min(124, band - 50, size * 0.44);
      const hw = (hh * host.w) / host.h;
      const deer = castArt(press, 'hevalo', OPENER_DEER[(c.number - 1) % OPENER_DEER.length]!, 'full');
      const dh = hh * 0.74;
      const dw = (dh * deer.w) / deer.h;
      const hx = 74 + (124 - hh) * 0.3;
      const dx = PAGE.w - 70 - dw * 0.35;
      // each of them stands on their own shadow, falling to the lower right as every shadow in the book does
      doc.save().ellipse(hx + hw * 0.56, band - 4, hw * 0.42, 3.4).fill(shade).restore();
      doc.save().ellipse(dx + dw * 0.56, band - 2.4, dw * 0.44, 2.8).fill(shade).restore();
      press.place(host, hx, band - hh - 3, hw);
      press.place(deer, dx, band - dh - 1, dw);
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

/**
 * How a grammar note's marks are set: bold is Kurdish to remember, italics Kurdish said. A separator dot stays at the
 * end of the line with the form before it, so no line opens on one.
 */
function noteSpans(spans: readonly MarkSpan[]): Span[] {
  return spans.map((s) => ({ text: s.text.replace(/ ·(?= )/g, '\u00a0·'), ...(s.bold ? { font: 'semi' as const } : s.italic ? { font: 'italic' as const } : {}) }));
}

/**
 * A part's grammar as a margin card with the hue's bar down its side. Set a paragraph at a time so a long note can
 * break across pages (never leaving a paragraph alone), each piece drawing its own stretch of the card.
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
  // a short note is one card and is never split; a longer one may leave its opening paragraph under its label, but never ends on one line
  if (blocks.length <= 4) for (const b of blocks) b.keep = true;
  else blocks[blocks.length - 2]!.hold = true;
  // and the note goes over with the part's first lesson, so a part never opens at the foot of a page with its lessons overleaf
  blocks[blocks.length - 1]!.keep = true;
  return blocks;
}

// ───────────────────────────────────────────────────────────── a lesson: its scene

/**
 * A scene's colours from its chapter's hue: by day its wash and a hill of it; at dusk a warmer sky over dark land; at
 * night the hue's deep shade; in snow white land under the wash, with mountains a little darker than the sky.
 */
function sceneColours(hue: HueSteps, setting: BookSetting): { sky: string; ground: string; light: string; far?: string } {
  switch (setting) {
    case 'day':
      return { sky: hue.wash, ground: tones(hue).hill, light: INK.card };
    case 'dusk':
      return { sky: blend(DUSK_GLOW, hue.wash, 0.38), ground: blend(hue.deep, DUSK_LAND, 0.3), light: '#fff4d6', far: blend(hue.base, hue.deep, 0.4) };
    case 'night':
      // a night sky is navy whatever the chapter's hue, which only tinges it, so a green chapter's night is not a green sky; the moon is cream
      return { sky: blend(NIGHT_SKY, hue.deep, 0.2), ground: blend(NIGHT_LAND, hue.deep, 0.16), light: MOON };
    case 'snow':
      return { sky: hue.wash, ground: '#ffffff', light: '#ffffff', far: blend(hue.wash, hue.base, 0.32) };
  }
}

/** The warm of a sky at sunset, which a dusk sky takes most of whatever the chapter's hue, and the dark the land goes as the sun sets. */
const DUSK_GLOW = '#f6b26b';
const DUSK_LAND = '#2b1f2e';
/** The navy of a night sky and the darker land under it, and the cream of the moon and the stars. */
const NIGHT_SKY = '#1f2550';
const NIGHT_LAND = '#121631';
const MOON = '#fbf0d0';

/**
 * Draw a lesson's scene: the hand-composed one (or the one its printed text makes), its sky, land or room in the
 * chapter's colours, then everything from farthest to nearest where `sceneLayout` puts it. People are drawn whole, to
 * the waist or head and shoulders as the shot says, turned into the scene; a landmark casts the ground's shade.
 */
function drawScene(press: Press, c: BookChapter, lesson: BookLesson, x: number, y: number, side: 'left' | 'right'): void {
  const hue = hueOf(c);
  const scene = lessonScene(lesson);
  const layout = sceneLayout(scene, side);
  const colours = sceneColours(hue, scene.setting);
  // each scene's sky is its own: its stars, its clouds and its poplars are placed from the lesson's own key
  const key = `backdrop|${chapterHue(c.number)}|${lesson.key}|${JSON.stringify(layout.backdrop)}`;
  const backdrop = press.art(key, BOOK_BACKDROP.w, BOOK_BACKDROP.h, () => bookBackdropSvg({ ...colours, ...layout.backdrop, seed: lesson.key }));
  const shade = blend(colours.ground, '#000000', 0.12);
  press.within(x, y, PANEL.w, PANEL.h, PANEL.r, () => {
    press.place(backdrop, x, y, PANEL.w + 1);
    for (const part of layout.parts) {
      if (part.kind === 'cast') press.place(castArt(press, part.who, part.pose, part.crop), x + part.box.x, y + part.box.y, part.box.w, { flip: part.flip });
      else drawPicture(press, part.picture, x + part.box.x, y + part.box.y, part.box.w, hue, shade);
    }
  });
}

/** How many lines of a beat a scene has room for beside its drawing. */
const BEAT_LINES = 3;

/** A lesson's opening: its scene, its name, the beat told beside it, and the line to say out loud with what it means. */
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
  // the beat as the book tells it, whole; only a beat written for the app alone, too long for the lines here, is told shorter by machine
  let beat = press.para(lesson.beat, tw, T.caption);
  for (let max = 240; beat.lines.length > BEAT_LINES && max > 90; max -= 12) beat = press.para(tellBeat(lesson.beat, max), tw, T.caption);
  const say: Type = { font: 'semi', size: 8.4, color: hue.deep, lead: 10.6 };
  // the line to say in even lines, so a bubble never ends on one word under a long line
  const bubble = lesson.say ? press.para(lesson.say, tw - 18, say, 3, true) : null;
  const bubbleH = bubble ? bubble.height + 6.4 : 0;
  // what the line means, small under its bubble, as the chapter's closing line has it
  const means = bubble && lesson.sayEn ? press.para(lesson.sayEn, tw - 9, T.english, 2) : null;
  const meansH = means ? means.height + 2.4 : 0;
  const textH = head + beat.height + (bubble ? 3.6 + bubbleH + meansH : 0);
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
      const badge = sceneLayout(lessonScene(lesson), side).badge;
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
        if (means) press.set(means.lines, side === 'left' ? tx + 9 : tx, by + bubbleH + 2.4, T.english, side === 'left' ? 'left' : 'right', tw - 9);
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
 * A lesson's new words. Most are cards, three across (two across when there are four, so none is alone on a row), each
 * with its picture, gender and meaning, a row's words on one line. A word whose meaning needs explaining (a phrase, an
 * ending) is set across the page instead, its meaning in the lesson's English column (`en`, from `englishColumn`), or
 * under it when the word runs that far. The rows are a list, so the last never heads a page alone.
 */
function wordRows(press: Press, c: BookChapter, lesson: BookLesson, en: number): Block[] {
  const hue = hueOf(c);
  const gutter = 8;
  const widthOf = (cols: number): number => (TEXT.w - gutter * (cols - 1)) / cols;
  const measured = (w: BookWord, cw: number): { w: BookWord; picture: BookPicture | null; name: { lines: Line[]; height: number }; gloss: { lines: Line[]; height: number } } => {
    const picture = pictureForWord(w);
    const tw = cw - (picture ? 40 : 6);
    return { w, picture, name: press.para(w.ku, tw - (w.gender ? 20 : 0), T.word), gloss: press.para(w.en, tw, T.gloss) };
  };
  // which words are cards is settled at three across, so a word does not change places with the count
  const made = lesson.words.map((w) => {
    const cell = measured(w, widthOf(3));
    return { ...cell, long: cell.name.lines.length > 1 || cell.gloss.lines.length > 2 };
  });
  // the pictured words first, so their row is a row of pictures
  const short = [...made.filter((x) => x.picture && !x.long), ...made.filter((x) => !x.picture && !x.long)];
  const cols = short.length === 4 ? 2 : 3;
  const cw = widthOf(cols);
  const cards = cols === 3 ? short : short.map((x) => measured(x.w, cw));
  const rows: Block[] = [];
  for (let i = 0; i < cards.length; i += cols) {
    const row = cards.slice(i, i + cols);
    const pictured = row.some((x) => x.picture);
    const text = Math.max(...row.map((x) => x.name.height + x.gloss.height));
    const height = Math.max(pictured ? 34 : 0, text + 3);
    const lift = pictured ? Math.max(0, (34 - text) / 2 - 1) : 1;
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
          const top = y + lift;
          press.set(cell.name.lines, tx, top, T.word);
          genderMark(press, cell.w.gender, tx + (cell.name.lines[0]?.width ?? 0) + 4, top + 1.8, hue);
          press.set(cell.gloss.lines, tx, top + cell.name.height + 0.5, T.gloss);
        });
      },
    });
  }
  made
    .filter((x) => x.long)
    .forEach((cell, i) => {
      const mark = cell.w.gender ? 22 : 0;
      const name = press.para(cell.w.ku, TEXT.w - 5 - mark, T.word);
      const reach = 5 + Math.max(...name.lines.map((l) => l.width)) + mark;
      const beside = name.lines.length === 1 && reach + 10 <= en;
      const gloss = press.para(cell.w.en, beside ? TEXT.w - en : TEXT.w - 5, T.gloss);
      const height = beside ? Math.max(name.height, gloss.height + 2) + 1 : name.height + gloss.height + 2;
      rows.push({
        height,
        gap: i === 0 ? (cards.length > 0 ? 5 : 7) : 2.5,
        draw: (y) => {
          press.box(TEXT.x, y + 2, 1.6, height - 4, 0.8, hue.wash);
          press.set(name.lines, TEXT.x + 5, y, T.word);
          genderMark(press, cell.w.gender, TEXT.x + 5 + (name.lines[0]?.width ?? 0) + 4, y + 1.8, hue);
          if (beside) press.set(gloss.lines, TEXT.x + en, y + 2, T.gloss);
          else press.set(gloss.lines, TEXT.x + 5, y + name.height + 0.5, T.gloss);
        },
      });
    });
  keepList(rows);
  // a last row of a single word (a card on its own, or a word set across the page) never opens a page by itself, however much room that costs the page before
  const single = made.some((x) => x.long) || cards.length % cols === 1;
  if (single && rows.length > 1) rows[rows.length - 2]!.keep = true;
  return rows;
}

/** How far in a lesson's Kurdish lines start (`READ`), and its conversation's lines after the speaker's name (`SAID`); and the space before the English. */
const READ = 9;
const SAID = 30;
const PAIR_GUTTER = 10;

/** One line of Kurdish beside its English: the Kurdish from `left` up to the gutter before `en`, the English from `en` to the right edge. */
function pairRow(press: Press, pair: { ku: string; en: string | null }, left: number, en: number): { ku: Line[]; en: Line[]; height: number } {
  const ku = press.wrap(pair.ku, en - PAIR_GUTTER - left, T.kurdish);
  const english = pair.en ? press.wrap(pair.en, TEXT.w - en, T.english) : [];
  return { ku, en: english, height: Math.max(ku.length * T.kurdish.lead, english.length * T.english.lead + 1.6) };
}

/**
 * Where a lesson's English column starts, from the left of the measure. One column serves all the lesson's lines
 * (read-aloud, conversation and long words) so meanings line up; it is whichever of a few positions takes the least
 * room for these lines.
 */
function englishColumn(press: Press, lesson: BookLesson): number {
  const lines: Array<[{ ku: string; en: string | null }, number]> = [
    ...lesson.sentences.map((p): [BookPair, number] => [p, READ]),
    ...(lesson.dialogue?.lines ?? []).map((l): [{ ku: string; en: string | null }, number] => [{ ku: l.text, en: l.en }, SAID]),
  ];
  let best = { en: 208, total: Infinity };
  for (const en of [208, 196, 220, 184, 232]) {
    const total = lines.reduce((sum, [pair, left]) => sum + pairRow(press, pair, left, en).height, 0);
    if (total < best.total - 0.01) best = { en, total };
  }
  return best.en;
}

/** Lines to read aloud, each beside what it means. */
function pairRows(press: Press, c: BookChapter, pairs: readonly BookPair[], en: number): Block[] {
  const hue = hueOf(c);
  const rows: Block[] = pairs.map((pair, i) => {
    const row = pairRow(press, pair, READ, en);
    return {
      height: row.height,
      gap: i === 0 ? 7 : 2.5,
      draw: (y) => {
        press.box(TEXT.x, y + 1.5, 2.2, row.height - 2.5, 1.1, hue.base);
        press.set(row.ku, TEXT.x + READ, y, T.kurdish);
        press.set(row.en, TEXT.x + en, y + 1.6, T.english);
      },
    };
  });
  return keepList(rows);
}

/**
 * A question's options as spans run on after it: each letter held to its first word by a no-break space, and an em
 * space between options, so a letter never ends a line alone.
 */
function optionSpans(options: readonly string[], hue: HueSteps): Span[] {
  return options.flatMap((o, k): Span[] => [...(k > 0 ? [{ text: '\u2003' }] : []), { text: 'abcdef'[k]!, font: 'bold', color: hue.deep }, { text: `\u00a0${o}` }]);
}

/** A conversation: who says what (named where the speaker changes), beside what it means, and the question the lesson asks about it. */
function dialogueRows(press: Press, c: BookChapter, dialogue: BookDialogue, en: number): Block[] {
  const hue = hueOf(c);
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
    const row = pairRow(press, { ku: l.text, en: l.en }, SAID, en);
    // a speaker who goes on is not named again, and a new speaker stands a little apart
    const turn = i === 0 || dialogue.lines[i - 1]!.who !== l.who;
    return {
      height: row.height,
      gap: i === 0 ? 4 : turn ? 3.2 : 2.2,
      draw: (y) => {
        if (turn) press.line(l.who.toUpperCase(), TEXT.x, y + 2.8, label(l.learner ? INK.violet : hue.deep, 5.6));
        press.set(row.ku, TEXT.x + SAID, y, T.kurdish);
        press.set(row.en, TEXT.x + en, y + 1.6, T.english);
      },
    };
  });
  keepList(lines);
  if (dialogue.question) {
    const q = dialogue.question;
    const type: Type = { ...T.caption, color: INK.ink };
    const spans: Span[] = [{ text: q.prompt, font: 'semi' }, { text: '\u2003' }, ...optionSpans(q.options, hue)];
    const para = press.para(spans, TEXT.w - SAID, type);
    // the question stays with the last line of what it asks about
    if (lines.length > 0) lines[lines.length - 1]!.hold = true;
    lines.push({
      height: para.height + 1,
      gap: 5,
      draw: (y) => {
        press.disc(TEXT.x + 7, y + 5.4, 5.6, hue.wash);
        press.line('?', TEXT.x + 1.4, y + 0.8, { font: 'bold', size: 7.4, color: hue.deep, lead: 9.4 }, 'center', 11.2);
        press.set(para.lines, TEXT.x + SAID, y, type);
      },
    });
  }
  return [...blocks, ...lines];
}

// ───────────────────────────────────────────────────────────── the story

/**
 * What the band over each chapter's story shows beside Hamo, chosen by hand, since a story's first-named things are
 * seldom what it is about. Chapters missing here get what their English names first.
 */
const TALE_PICTURES: Readonly<Record<number, readonly BookPicture[]>> = {
  1: [{ kind: 'word', id: 'tea' }, { kind: 'word', id: 'bread' }, { kind: 'word', id: 'apple' }],
  2: [{ kind: 'spot', spot: 'photo' }, { kind: 'spot', spot: 'moustache' }, { kind: 'word', id: 'tea' }],
  3: [{ kind: 'word', id: 'map' }, { kind: 'spot', spot: 'whiteGoat' }, { kind: 'spot', spot: 'walnutTree' }],
  4: [{ kind: 'word', id: 'basket' }, { kind: 'word', id: 'tea' }, { kind: 'word', id: 'sugar' }],
  5: [{ kind: 'word', id: 'bus' }, { kind: 'word', id: 'clock' }, { kind: 'spot', spot: 'calendar' }],
  6: [{ kind: 'word', id: 'book' }, { kind: 'spot', spot: 'photo' }, { kind: 'spot', spot: 'town' }],
  7: [{ kind: 'spot', spot: 'flute' }, { kind: 'word', id: 'fire' }, { kind: 'word', id: 'drum' }],
  8: [{ kind: 'word', id: 'honey' }, { kind: 'spot', spot: 'moustache' }, { kind: 'word', id: 'moon' }],
  9: [{ kind: 'word', id: 'donkey' }, { kind: 'word', id: 'heart' }, { kind: 'word', id: 'spring' }],
  10: [{ kind: 'spot', spot: 'doe' }, { kind: 'spot', spot: 'lake' }, { kind: 'spot', spot: 'flute' }],
  11: [{ kind: 'word', id: 'apple' }, { kind: 'sapling' }, { kind: 'spot', spot: 'stove' }],
  12: [{ kind: 'sapling' }, { kind: 'spot', spot: 'appleTree' }, { kind: 'word', id: 'basket' }],
};

/** The things a story turns on, for the band over it. */
function storyProps(c: BookChapter): readonly BookPicture[] {
  const chosen = TALE_PICTURES[c.number];
  if (chosen) return chosen;
  const english = c.tale?.english.join(' ') ?? '';
  return sceneFor(english).props.filter((p) => p.kind !== 'figure').slice(0, 3);
}

/** Kurdish quoted in the book's own marks: the stories that quote in «guillemets» are set in “quotation marks”, as the lessons and the other stories are. */
const quoted = (text: string): string => text.replace(/«\s*/g, '“').replace(/\s*»/g, '”');

/**
 * A question's options under it: on one line an em space apart when they fit; else two columns or one per line, each
 * with its letter, so a long option is not mistaken for the next.
 */
function optionList(press: Press, options: readonly string[], width: number, type: Type, hue: HueSteps): { height: number; draw: (x: number, y: number) => void } {
  const inline = press.para(optionSpans(options, hue), width, type);
  if (inline.lines.length <= 1) return { height: inline.height, draw: (x, y) => press.set(inline.lines, x, y, type) };
  const letter: Type = { ...type, font: 'bold', color: hue.deep };
  // two to a line, in two columns, where every option fits half the line; otherwise one to a line
  const half = (width - 8) / 2;
  if (options.every((o) => press.measure(o, type.font, type.size) <= half - 9)) {
    return {
      height: Math.ceil(options.length / 2) * type.lead,
      draw: (x, y) =>
        options.forEach((o, k) => {
          const [ox, oy] = [x + (k % 2) * (half + 8), y + Math.floor(k / 2) * type.lead];
          press.line('abcdef'[k]!, ox, oy, letter);
          press.line(o, ox + 9, oy, type);
        }),
    };
  }
  const each = options.map((o) => press.para(o, width - 9, type));
  return {
    height: each.reduce((h, p) => h + p.height, 0),
    draw: (x, y) => {
      let at = y;
      each.forEach((p, k) => {
        press.line('abcdef'[k]!, x, at, letter);
        press.set(p.lines, x + 9, at, type);
        at += p.height;
      });
    },
  };
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
    const ku = press.para(quoted(text), kw, T.tale);
    const en = tale.english[i] ? press.para(quoted(tale.english[i]!), ew, T.taleEnglish) : null;
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
    // each word held to the first word of its meaning, and the words an em space apart round the dot between them
    const spans: Span[] = tale.glossary.flatMap((g, i): Span[] => [
      ...(i > 0 ? [{ text: '\u00a0·\u2003', font: 'italic' as const, color: INK.soft }] : []),
      { text: quoted(g.term), font: 'semi' },
      { text: `\u00a0${g.en}`, font: 'italic', color: INK.soft },
    ]);
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
      const ku = press.para([{ text: quoted(q.prompt) }, ...(q.promptEn ? [{ text: `\u2002${quoted(q.promptEn)}`, font: 'italic' as const, color: INK.soft }] : [])], cw - 15, prompt);
      const options = optionList(press, q.options.map(quoted), cw - 15, option, hue);
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
            cell.options.draw(x + 15, y + cell.ku.height + 0.8);
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
    // practice always opens a page, so "the pages before this one" are pages and not half of this one
    fresh: true,
    section: 'With a pencil',
    anchor: `${c.number}:practice`,
    draw: (y) => {
      press.box(TEXT.x, y, TEXT.w, 40, 12, tones(hue).band);
      // the notebook with its pencil: what the reader works with here, and not a pen
      drawPicture(press, { kind: 'spot', spot: 'notebook' }, TEXT.x + TEXT.w - 48, y + 2, 36, hue);
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
    // a word and its meaning are joined by a line across the page, so the task is never split by a page turn
    rows.forEach((row, i) => (row.keep = i < rows.length - 1));
    blocks.push(...rows);
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
            // punctuation after the gap closes up to the dots, as it would to the word written there
            press.line(after, tx + bw + gap + (/^[,.;:!?…”)]/.test(after) ? 0.5 : 3), y, T.kurdish);
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
 * How a chapter ends: its cancelled stamp and its line about Hevalo and his apples (the page's corner apple is a core by
 * now). `small` uses a smaller stamp for a nearly full last page; `drop` is how far down its page the block starts when
 * it stands alone.
 */
function endBlock(press: Press, c: BookChapter, places: Places, small = false, drop = 0): Block {
  const hue = hueOf(c);
  const w = small ? 62 : 88;
  const h = (w * STAMP.h) / STAMP.w;
  const x = TEXT.x + 14;
  const tx = x + w + 30;
  const tw = TEXT.w - w - 44;
  const gag = c.gag;
  const say: Type = { font: 'semi', size: small ? 8.6 : 9.2, color: hue.deep, lead: small ? 11 : 12 };
  const line = gag ? press.para(gag.ku, tw - 44, say, 3) : null;
  const meaning = gag ? press.para(gag.en, tw - 26, T.english, 3) : null;
  const at = places.get('passport');
  const note = press.para(`Cancel its stamp in your passport${at === undefined ? '' : ` on page ${at}`}.`, tw, T.caption);
  // where the words go, from the top of the block: the note, then Hamo's bubble and what it means under it
  const ny = small ? 37 : 46;
  const by = ny + note.height + (small ? 6 : 9);
  const bw = line ? Math.min(tw - 26, Math.max(...line.lines.map((l) => l.width)) + 18) : 0;
  const my = by + (line?.height ?? 0) + 11;
  const words = line && meaning ? my + meaning.height : ny + note.height;
  const height = drop + Math.max(h + (small ? 22 : 30), words + 4);
  return {
    height,
    gap: small ? 20 : 26,
    draw: (top) => {
      const y = top + drop;
      // on paper a stamp's light is a faint halo: a strong glow prints as a coloured blur
      drawStamp(press, x, y + (small ? 12 : 15), w, c, { glow: 0.2, cancelled: true });
      press.line(`CHAPTER ${c.number} IS YOURS`, tx, y + (small ? 8 : 12), label(hue.deep));
      press.line(c.titleKu, tx, y + (small ? 17.5 : 22.5), display(small ? 15 : 18));
      press.set(note.lines, tx, y + ny, T.caption);
      if (line && meaning) {
        press.place(castArt(press, 'hamo', 'laughing'), tx - 2, y + by - 3, 22);
        press.bubble(tx + 25, y + by, bw, line.height + 8, hue.wash, { side: 'left', at: 9 });
        press.set(line.lines, tx + 34, y + by + 4, say);
        press.set(meaning.lines, tx + 25, y + my, T.english);
      }
    },
  };
}

/** The chapter's pictures at the end of its last page: a row of seven or more, or none. */
const STRIP = { per: 7, cell: 50, gap: 22, least: 7 } as const;

/** How many rows of `count` pictures fit in `room` points, if they make at least one full row. */
const stripRows = (count: number, room: number): number => (count < STRIP.least ? 0 : Math.max(0, Math.min(Math.ceil(count / STRIP.per), Math.floor((room - 10) / STRIP.cell))));

/** How tall the chapter's pictures stand in `rows` rows: the heading over them and the rows. */
const stripHeight = (rows: number): number => rows * STRIP.cell + 10;

/**
 * Every word of a chapter that has a drawing, to show and name at its end, except those "Name the pictures" asks for,
 * which would give its answers away.
 */
export function chapterPictures(c: BookChapter): Array<{ picture: BookPicture; ku: string }> {
  const asked = new Set(c.practice.pictures.map((p) => p.picture));
  const seen = new Set<string>();
  const pictured: Array<{ picture: BookPicture; ku: string }> = [];
  for (const w of chapterWords(c)) {
    const picture = pictureForWord(w);
    if (!picture || picture.kind === 'cast' || picture.kind === 'figure') continue;
    if (picture.kind === 'word' && asked.has(picture.id)) continue;
    const key = JSON.stringify(picture);
    if (seen.has(key)) continue;
    seen.add(key);
    pictured.push({ picture, ku: w.ku });
  }
  return pictured;
}

/**
 * What fills the last page's leftover space: under the stamp, the chapter in pictures (when they make a row of at least
 * seven). A page that ends early elsewhere is left plain.
 */
function chapterFiller(press: Press, c: BookChapter): Filler {
  const hue = hueOf(c);
  const pictured = chapterPictures(c);
  return (y, height, last) => {
    if (!last) return;
    const rows = stripRows(pictured.length, height - STRIP.gap);
    if (rows < 1) return;
    const shown = pictured.slice(0, rows * STRIP.per);
    const cell = TEXT.w / STRIP.per;
    // set a fixed space under the stamp, so the two read as one ending and not as two things at either end of the page
    const top = y + STRIP.gap;
    const w = press.line(`CHAPTER ${c.number} IN PICTURES`, TEXT.x, top, label(hue.deep));
    const hint = press.line('cover the words, then name them', TEXT.x + w + 8, top - 1.6, T.english);
    press.rule(TEXT.x + w + hint + 16, top + 5, TEXT.w - w - hint - 16, hue.wash, 0.9);
    const name: Type = { font: 'semi', size: 7.6, color: INK.ink, lead: 9.6 };
    shown.forEach((p, i) => {
      const row = Math.floor(i / STRIP.per);
      // a last row that is not full stands in the middle under the full ones
      const inRow = Math.min(STRIP.per, shown.length - row * STRIP.per);
      const x = TEXT.x + ((STRIP.per - inRow) / 2 + (i % STRIP.per)) * cell;
      const cy = top + 16 + row * STRIP.cell;
      press.box(x + (cell - 32) / 2, cy, 32, 32, 9, tones(hue).card);
      drawPicture(press, p.picture, x + (cell - 28) / 2, cy + 2, 28, hue);
      let size = name.size;
      while (size > 5.4 && press.measure(p.ku, name.font, size) > cell - 2) size -= 0.3;
      press.line(p.ku, x, cy + 33.5, { ...name, size }, 'center', cell);
    });
  };
}

// ───────────────────────────────────────────────────────────── the chapter

/**
 * A lesson's blocks: its scene with its name, its word rows, and its lines (read-aloud and conversation). The scene
 * never ends a page without its first word row, and the last word row holds to the first lines.
 */
export function lessonBlocks(press: Press, c: BookChapter, lesson: BookLesson): { strip: Block; words: Block[]; lines: Block[] } {
  const en = englishColumn(press, lesson);
  const words = wordRows(press, c, lesson, en);
  const lines = [...pairRows(press, c, lesson.sentences, en), ...(lesson.dialogue ? dialogueRows(press, c, lesson.dialogue, en) : [])];
  if (words.length > 0 && lines.length > 0) words[words.length - 1]!.hold = true;
  return { strip: lessonStrip(press, c, lesson, words.length + lines.length > 0), words, lines };
}

/** Everything of a chapter after its opening page, as one run of blocks. */
export function chapterBlocks(press: Press, c: BookChapter, places: Places): Block[] {
  const blocks: Block[] = [];
  for (const p of c.parts) {
    blocks.push(partHead(press, c, p), ...grammarNote(press, c, p));
    for (const lesson of p.lessons) {
      const { strip, words, lines } = lessonBlocks(press, c, lesson);
      blocks.push(strip, ...words, ...lines);
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
  if (!alone) return [...blocks, full];
  if (before.used + small.gap + small.height <= TEXT.room) return [...blocks, small];
  // on a page of its own the stamp and the chapter's pictures under it stand together, a little above the middle of the page
  const rows = stripRows(chapterPictures(c).length, TEXT.room - full.height - STRIP.gap);
  const stands = full.height + (rows > 0 ? STRIP.gap + stripHeight(rows) : 0);
  return [...blocks, endBlock(press, c, places, false, Math.max(0, (TEXT.room - stands) * 0.42))];
}

/**
 * A chapter's pages and where its parts, story and practice begin, counted from its opening page (0). The corner apple
 * loses a bite every few pages and is a core on the last.
 */
export function chapterSheets(press: Press, c: BookChapter, places: Places): { sheets: Sheet[]; anchors: Array<[string, number]> } {
  const anchors: Array<[string, number]> = [[`${c.number}:opener`, 0]];
  const noted = (anchor: string, index: number): void => void anchors.push([anchor, index + 1]);
  const blocks = chapterBlocks(press, c, places);
  const run = runSheets(press, blocks, (_, section) => ({ chapter: c, section, bites: 0 }), noted, chapterFiller(press, c));
  const total = run.length + 1;
  run.forEach((sheet, i) => {
    if (sheet.furniture) sheet.furniture.bites = Math.min(BOOK_APPLE_BITES, Math.floor(((i + 1) * (BOOK_APPLE_BITES + 1)) / total));
  });
  return { sheets: [openerSheet(press, c, places), ...run], anchors };
}
