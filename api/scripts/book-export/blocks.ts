/**
 * The words of each page of the Hevalo book as a reader takes them in, for screen readers, search and the book's text
 * view on the web: headings, labels, speakers and lines, each piece marked Kurmanji or English. The press's runs
 * (capture.ts) arrive in reading order and are put together in steps:
 *
 *  1. The running head and the page number go; a line a full page runs down beside the number stays.
 *  2. Runs on one baseline make a line, with a space where a run starts more than 0.15 em past the one before it,
 *     which a change of face otherwise loses.
 *  3. One `set` call is one paragraph, and so are lines set one by one in the same type, lined up alike, a lead apart.
 *  4. Small spaced capitals are labels, read in sentence case; a label just left of a Kurmanji line is its speaker.
 *  5. Each piece's language comes from what the chapters say, else the book's type, else which language its words
 *     are found in, else the face, else letters only Kurmanji has; a word is never split between languages.
 *  6. What stands side by side on one baseline is one row, read left to right; number badges are left out, since they
 *     say nothing the words do not.
 */
import { MARGIN, PAGE, TEXT, type FontKey } from '../../src/books/sheet.js';
import type { BookChapter, BookName } from '../../src/books/road-book.js';
import { AUTHOR, FRIENDS, LETTER } from '../../src/books/prose.js';
import type { TextRun } from './capture.js';

export type Lang = 'ku' | 'en';

export interface TextSpan {
  lang: Lang;
  text: string;
}

export interface TextBlock {
  kind: 'heading' | 'speaker' | 'label' | 'text';
  spans: TextSpan[];
}

export interface PageText {
  n: number;
  blocks: TextBlock[];
}

/** What the book is known to say in each language, and the words each uses. */
export interface Lexicon {
  ku: Set<string>;
  en: Set<string>;
  /** words met only in the Kurmanji, and words met only in the English */
  kuWords: Set<string>;
  enWords: Set<string>;
  /** words the book always capitalises, even inside a sentence: names, and the names of languages */
  proper: Set<string>;
}

/** Text compared as a reader sees it: one kind of space, and composed letters. */
const clean = (text: string): string => text.normalize('NFC').replace(/\s+/g, ' ').trim();

const wordsOf = (text: string): string[] => clean(text).toLocaleLowerCase('ku').match(/\p{L}+/gu) ?? [];

/** Everything the chapters say in Kurmanji and in English, the people of the road, and the book's own English prose. */
export function lexiconOf(chapters: readonly BookChapter[], people: readonly BookName[] = []): Lexicon {
  const ku: string[] = [];
  const en: string[] = [];
  const add = (list: string[], ...texts: Array<string | null | undefined>): void => {
    for (const t of texts) if (t && t.trim() !== '') list.push(clean(t));
  };
  for (const c of chapters) {
    add(ku, c.titleKu, c.gag?.ku);
    add(en, c.titleEn, c.summary, c.gag?.en);
    for (const p of c.parts) {
      add(ku, p.titleKu);
      add(en, p.titleEn);
      for (const l of p.lessons) {
        add(ku, l.titleKu, l.say);
        add(en, l.titleEn, l.beat);
        for (const w of l.words) {
          add(ku, w.ku);
          add(en, w.en);
        }
        for (const s of l.sentences) {
          add(ku, s.ku);
          add(en, s.en);
        }
        if (l.dialogue) {
          add(ku, l.dialogue.title);
          for (const line of l.dialogue.lines) {
            add(ku, line.text);
            add(en, line.en);
          }
          if (l.dialogue.question) add(en, l.dialogue.question.prompt, ...l.dialogue.question.options);
        }
      }
    }
    if (c.tale) {
      add(ku, c.tale.title, ...c.tale.paragraphs);
      add(en, ...c.tale.english);
      for (const g of c.tale.glossary) {
        add(ku, g.term);
        add(en, g.en);
      }
      for (const q of c.tale.questions) {
        add(ku, q.prompt, ...q.options);
        add(en, q.promptEn);
      }
    }
    const pr = c.practice;
    for (const m of [...pr.match, ...pr.toKurdish]) {
      add(ku, m.ku);
      add(en, m.en);
    }
    for (const g of pr.gaps) add(ku, g.text, g.answer);
    for (const r of pr.replies) add(ku, r.say, r.answer);
    add(ku, ...pr.pictures.map((p) => p.ku), ...pr.alone);
  }
  for (const p of people) add(en, p.en);
  add(en, ...LETTER.map((spans) => spans.map((s) => s.text).join('')), ...Object.values(FRIENDS), ...AUTHOR.paragraphs);

    // A word belongs to a language the book says it in three times as often as the other, since the English glosses
    // quote Kurmanji words ("tu … dixwî: you eat").
  const count = (texts: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const w of texts.flatMap(wordsOf)) counts.set(w, (counts.get(w) ?? 0) + 1);
    return counts;
  };
  const kuCounts = count(ku);
  const enCounts = count(en);
  const kuWords = new Set([...kuCounts].filter(([w, n]) => n >= 3 * (enCounts.get(w) ?? 0)).map(([w]) => w));
  const enWords = new Set([...enCounts].filter(([w, n]) => n >= 3 * (kuCounts.get(w) ?? 0)).map(([w]) => w));
  // a word met inside a sentence with a capital, and never without one
  const capital = new Map<string, boolean>();
  for (const text of [...ku, ...en]) {
    (text.match(/\p{L}+/gu) ?? []).forEach((word, i) => {
      const key = word.toLocaleLowerCase('ku');
      const upper = word !== key && word.charAt(0) === word.charAt(0).toLocaleUpperCase('ku') && word.slice(1) === word.slice(1).toLocaleLowerCase('ku');
      if (!upper) capital.set(key, false);
      else if (i > 0 && !capital.has(key)) capital.set(key, true);
    });
  }
  const proper = new Set([...capital].filter(([, always]) => always).map(([word]) => word));
  return { ku: new Set(ku), en: new Set(en), kuWords, enWords, proper };
}

/** The faces headings are set in; the italic sets subtitles and signatures, which are not headings. */
const HEADING_FACES: ReadonlySet<FontKey> = new Set(['display', 'heavy']);

/** Runs this close together (in points) stand on one baseline. */
const SAME_LINE = 0.5;

/** A page's own number, at its foot. */
const isFolio = (r: TextRun, page: number): boolean => r.text === String(page) && r.y > PAGE.h - MARGIN.bottom;

/** A piece of a paragraph: its runs' text, with what stood between them, and the face it is in. */
interface Piece {
  run: TextRun;
  text: string;
  /** what goes before it: a space, or nothing when it runs on from the piece before */
  before: string;
}

interface Paragraph {
  pieces: Piece[];
  first: TextRun;
  via: TextRun['via'];
}

/** The runs of one call as lines, and the lines as one string of pieces. */
function piecesOf(runs: readonly TextRun[], startsBefore: string): Piece[] {
  const lines: TextRun[][] = [];
  for (const run of runs) {
    const line = lines.find((l) => Math.abs(l[0]!.y - run.y) <= SAME_LINE);
    if (line) line.push(run);
    else lines.push([run]);
  }
  const pieces: Piece[] = [];
  lines.forEach((line, i) => {
    line.forEach((run, k) => {
      const prev = line[k - 1];
      const before = k > 0 ? (run.x - (prev!.x + prev!.width) > 0.15 * run.size ? ' ' : '') : i > 0 ? ' ' : startsBefore;
      pieces.push({ run, text: run.text, before });
    });
  });
  return pieces;
}

/** Where a line stands to be lined up with another: its left edge, its middle or its right edge, as it was set. */
const anchorOf = (r: TextRun): number => (r.align === 'center' ? r.x + r.width / 2 : r.align === 'right' ? r.x + r.width : r.x);

/** Two lines set one by one that are one paragraph: the same type, lined up alike, one lead apart. */
function continues(prev: Paragraph, next: TextRun): boolean {
  if (prev.via !== 'line' || next.via !== 'line') return false;
  const last = prev.pieces.at(-1)!.run;
  return (
    last.font === next.font &&
    last.size === next.size &&
    last.lead === next.lead &&
    last.tracking === next.tracking &&
    last.align === next.align &&
    Math.abs(anchorOf(last) - anchorOf(next)) <= 0.5 &&
    Math.abs(next.y - last.y - last.lead) <= 0.5
  );
}

/** A run that carries on the word before it, on the same baseline where it stopped, as the alphabet colours a letter ("a" and "v" are "av"). */
function runsOn(prev: Paragraph, next: TextRun): boolean {
  const last = prev.pieces.at(-1)!.run;
  return Math.abs(next.y - last.y) <= SAME_LINE && Math.abs(next.x - (last.x + last.width)) <= 0.15 * next.size;
}

/** Small spaced capitals: what the book names a part of the page with. */
const isCapitals = (text: string): boolean => /\p{L}/u.test(text) && text === text.toLocaleUpperCase('ku');

/** "PART 1 OF 4" as "Part 1 of 4"; "HAMO’S STORY" as "Hamo’s story", "INTO KURDISH" as "Into Kurdish": names keep their capital. */
export function sentenceCase(text: string, proper: ReadonlySet<string> = new Set()): string {
  const lower = text
    .toLocaleLowerCase('ku')
    .replace(/\p{L}+/gu, (word) => (proper.has(word) ? word.charAt(0).toLocaleUpperCase('ku') + word.slice(1) : word));
  const at = lower.search(/\p{L}/u);
  return at < 0 ? lower : lower.slice(0, at) + lower.charAt(at).toLocaleUpperCase('ku') + lower.slice(at + 1);
}

/** The language of a piece of text in a face, by the steps in the header. */
export function languageOf(text: string, run: Pick<TextRun, 'font' | 'typeKey' | 'setIn'>, lexicon: Lexicon): Lang {
  const said = clean(text);
  if (lexicon.ku.has(said) && !lexicon.en.has(said)) return 'ku';
  if (lexicon.en.has(said) && !lexicon.ku.has(said)) return 'en';
  if (run.typeKey === 'kurdish' || run.typeKey === 'word' || run.typeKey === 'tale') return 'ku';
    // The book's prose and captions are English, whatever Kurmanji they quote (marked by sentence below).
  if (run.typeKey === 'body' || run.typeKey === 'caption') return 'en';
    // A grammar note sets Kurdish to remember in bold and Kurdish said in italics, and explains in its own face.
  if (run.setIn === 'note') return run.font === 'semi' || run.font === 'italic' ? 'ku' : 'en';
  if (run.typeKey === 'english' || run.typeKey === 'taleEnglish' || run.typeKey === 'gloss') return 'en';
  const words = wordsOf(said);
  const ku = words.filter((w) => lexicon.kuWords.has(w)).length;
  // an English plural counts as its singular ("answers"), where Kurmanji does not have the word
  const en = words.filter((w) => lexicon.enWords.has(w) || (!lexicon.kuWords.has(w) && w.endsWith('s') && lexicon.enWords.has(w.slice(0, -1)))).length;
  if (ku !== en) return ku > en ? 'ku' : 'en';
  if (run.font === 'semi') return 'ku';
  if (run.font === 'italic') return 'en';
  return /[êîûçş]/iu.test(said) ? 'ku' : 'en';
}

/** Whether a character is part of a word (a letter, or a mark on one). */
const isLetter = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{M}]/u.test(c);

/**
 * A paragraph's spans, one per run of a language, never splitting a word: a word across pieces in different languages
 * (the alphabet's "b", "e", "d") takes the language it is known in, else that of most of its letters, else its first piece's.
 */
function spansOf(paragraph: Paragraph, lexicon: Lexicon, recase: boolean): TextSpan[] {
  const whole = clean(paragraph.pieces.map((p) => p.before + p.text).join(''));
  // a paragraph the chapters have word for word is in their language throughout
  const all = lexicon.ku.has(whole) && !lexicon.en.has(whole) ? 'ku' : lexicon.en.has(whole) && !lexicon.ku.has(whole) ? 'en' : null;
  let text = '';
  const langs: Lang[] = [];
  let previous: Lang | null = null;
  for (const piece of paragraph.pieces) {
    const lang = all ?? languageOf(piece.text, piece.run, lexicon);
    // a space between two languages belongs to neither: it stays with the first
    text += piece.before;
    for (let i = 0; i < piece.before.length; i++) langs.push(previous ?? lang);
    text += piece.text;
    for (let i = 0; i < piece.text.length; i++) langs.push(lang);
    previous = lang;
  }
  for (const word of text.matchAll(/[\p{L}\p{M}]+/gu)) {
    const from = word.index;
    const to = from + word[0].length;
    const own = langs.slice(from, to);
    if (own.every((l) => l === own[0])) continue;
    const key = word[0].toLocaleLowerCase('ku');
    const ku = own.filter((l) => l === 'ku').length;
    const lang: Lang = lexicon.kuWords.has(key) ? 'ku' : lexicon.enWords.has(key) ? 'en' : ku * 2 > own.length ? 'ku' : ku * 2 < own.length ? 'en' : own[0]!;
    langs.fill(lang, from, to);
  }
  const spans: TextSpan[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = spans.at(-1);
    if (last && last.lang === langs[i]) last.text += text[i];
    else spans.push({ lang: langs[i]!, text: text[i]! });
  }
  return spans
    .map((s, i) => ({ lang: s.lang, text: (i === 0 ? s.text.trimStart() : s.text).replace(/\s+/g, ' ') }))
    .map((s, i, list) => ({ ...s, text: recase && i === 0 ? sentenceCase(s.text, lexicon.proper) : i === list.length - 1 ? s.text.trimEnd() : s.text }))
    .filter((s) => s.text.trim() !== '');
}

/** The alphabet's headings, a letter in its two cases ("Aa", "Çç"), and the word list's ("Ç"): Kurmanji letters, whatever they look like. */
const isLetterPair = (text: string): boolean => {
  const m = /^(\p{Lu})(\p{Ll})?$/u.exec(text);
  return m !== null && (m[2] === undefined || m[1]!.toLocaleLowerCase('ku') === m[2]);
};

/**
 * The chapters' Kurmanji sentences that can be found inside an English line: ones the English never says, of two or
 * more words with one only Kurmanji has, or a single Kurmanji-only word with a Kurmanji-only letter that is not a name.
 * Indexed by first word, longest first.
 */
const findable = new WeakMap<Lexicon, Map<string, string[]>>();
export function kurmanjiSentences(lexicon: Lexicon): Map<string, string[]> {
  const known = findable.get(lexicon);
  if (known) return known;
  const index = new Map<string, string[]>();
  for (const sentence of lexicon.ku) {
    if (lexicon.en.has(sentence)) continue;
    const words = wordsOf(sentence);
    if (words.length === 0) continue;
    const own = words.filter((w) => lexicon.kuWords.has(w));
    const fits =
      words.length >= 2 ? own.length > 0 : own.length === 1 && words[0]!.length >= 3 && /[çêîşû]/u.test(words[0]!) && !lexicon.proper.has(words[0]!);
    if (!fits) continue;
    const first = words[0]!;
        // Quoted inside a sentence, a sentence may lose its final mark ("Hevalo sêvê dixwe: your apple").
    const bare = sentence.replace(/[.!?…]+$/u, '');
    index.set(first, [...(index.get(first) ?? []), ...new Set([sentence, bare])]);
  }
  for (const list of index.values()) list.sort((a, b) => b.length - a.length);
  findable.set(lexicon, index);
  return index;
}

/** Where the chapters' Kurmanji sentences stand in an English text, whole words only, the longest first and never overlapping. */
export function kurmanjiWithin(text: string, lexicon: Lexicon): Array<{ from: number; to: number }> {
  const index = kurmanjiSentences(lexicon);
  const found: Array<{ from: number; to: number }> = [];
  for (const word of text.matchAll(/\p{L}+/gu)) {
    if (isLetter(text[word.index - 1])) continue;
    for (const sentence of index.get(word[0].toLocaleLowerCase('ku')) ?? []) {
      const to = word.index + sentence.length;
      const there = text.slice(word.index, to);
      // its first letter in either case: a sentence quoted, a word that starts a line ("Sêv → …")
      const same = there === sentence || (there.slice(1) === sentence.slice(1) && there.charAt(0).toLocaleLowerCase('ku') === sentence.charAt(0).toLocaleLowerCase('ku'));
      if (!same || (isLetter(sentence.at(-1)) && isLetter(text[to]))) continue;
      found.push({ from: word.index, to });
      break;
    }
  }
  found.sort((a, b) => b.to - b.from - (a.to - a.from));
  const kept: typeof found = [];
  for (const f of found) if (!kept.some((k) => f.from < k.to && k.from < f.to)) kept.push(f);
  return kept.sort((a, b) => a.from - b.from);
}

/** An English span split where it holds the chapters' Kurmanji. */
function splitKurmanji(span: TextSpan, lexicon: Lexicon): TextSpan[] {
  if (span.lang !== 'en') return [span];
  const out: TextSpan[] = [];
  let at = 0;
  for (const { from, to } of kurmanjiWithin(span.text, lexicon)) {
    if (from > at) out.push({ lang: 'en', text: span.text.slice(at, from) });
    out.push({ lang: 'ku', text: span.text.slice(from, to) });
    at = to;
  }
  if (at < span.text.length) out.push({ lang: 'en', text: span.text.slice(at) });
  return out;
}

/** Spans of one language run together, and none left empty. */
function joinSpans(spans: readonly TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    if (s.text === '') continue;
    const last = out.at(-1);
    if (last && last.lang === s.lang) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** A block as it was found on the page: where it starts and where its last line stands. */
interface Item {
  block: TextBlock;
  first: TextRun;
  last: TextRun;
}

/** Runs this close together (in points) stand side by side on one row, though set in different sizes. */
const SAME_ROW = 2;

/** Only figures: a number, a page number, numbers in a row. */
const isFigures = (text: string): boolean => /\d/.test(text) && /^[\d\s.,·–-]+$/u.test(text);

/** What a block is when it is one of the book's small marks: a badge's number or letter, a question mark, a gender, or bare figures. */
function markOf(item: Item): 'number' | 'letter' | 'question' | 'gender' | 'figures' | null {
  const text = blockText(item.block).trim();
  if (item.first.font === 'bold' || item.first.font === 'heavy') {
    if (/^\d{1,3}$/.test(text)) return 'number';
    if (/^\p{Lu}$/u.test(text)) return 'letter';
    if (text === '?') return 'question';
    if (/^(f|m|n|pl)$/.test(text)) return 'gender';
  }
  return isFigures(text) ? 'figures' : null;
}

/**
 * One row's pieces as one block, joined by " · ", with a gender as "(f)" and no question mark. A sentence with a gap
 * is set as two halves with a line between them, so the gap reads as "…".
 */
function rowBlock(items: readonly Item[]): TextBlock {
  const spans: TextSpan[] = [];
  items.forEach((item, i) => {
    const mark = markOf(item);
    if (mark === 'question') return;
    if (mark === 'gender' && i > 0) {
      spans.push({ lang: 'en', text: ` (${blockText(item.block).trim()})` });
      return;
    }
    const prev = items[i - 1];
    const gap = prev !== undefined && mark === null && (/\s$/.test(prev.last.text) || /^\s/.test(item.first.text));
    if (gap) spans.push({ lang: 'en', text: /^[.!?,;:]/.test(blockText(item.block)) ? ' …' : ' … ' });
    else if (spans.length > 0) spans.push({ lang: 'en', text: ' · ' });
    // a number or a letter before what it numbers is neither language's
    spans.push(...(mark === 'number' || mark === 'letter' ? [{ lang: 'en' as Lang, text: blockText(item.block).trim() }] : item.block.spans));
  });
  const words = items.filter((item) => markOf(item) === null);
  const kind: TextBlock['kind'] = words.length === 1 ? words[0]!.block.kind : words.every((item) => item.block.kind === 'label') ? 'label' : 'text';
  return { kind: kind === 'speaker' ? 'text' : kind, spans: joinSpans(spans) };
}

/** The items of a page in rows: those side by side on one baseline, each starting where the one before it ends. */
function rowsOf(items: readonly Item[]): Item[][] {
  const rows: Item[][] = [];
  for (const item of items) {
    const row = rows.at(-1);
    const prev = row?.at(-1);
    if (row && prev && Math.abs(item.first.y - prev.last.y) <= SAME_ROW && item.first.x >= prev.last.x + prev.last.width - 1) row.push(item);
    else rows.push([item]);
  }
  return rows;
}

/** One page's runs, as the blocks a reader takes in. */
export function pageBlocks(all: readonly TextRun[], page: number, lexicon: Lexicon): TextBlock[] {
  let runs = all.filter((r) => r.page === page);
    // The foot holds only the number and a drawing, while a full page may run its last line down beside it.
  if (runs.some((r) => isFolio(r, page))) runs = runs.filter((r) => r.y >= TEXT.top && !isFolio(r, page));

  // the calls, in the order they were made; lines set one by one join the paragraph they continue
  const paragraphs: Paragraph[] = [];
  const byCall = new Map<number, TextRun[]>();
  for (const r of runs) byCall.set(r.call, [...(byCall.get(r.call) ?? []), r]);
  for (const call of [...byCall.keys()].sort((a, b) => a - b)) {
    const list = byCall.get(call)!;
    const prev = paragraphs.at(-1);
    if (prev && runsOn(prev, list[0]!)) prev.pieces.push(...piecesOf(list, ''));
    else if (prev && continues(prev, list[0]!)) prev.pieces.push(...piecesOf(list, ' '));
    else paragraphs.push({ pieces: piecesOf(list, ''), first: list[0]!, via: list[0]!.via });
  }

  const items: Item[] = [];
  paragraphs.forEach((p, i) => {
    const r = p.first;
    const text = clean(p.pieces.map((x) => x.before + x.text).join(''));
    if (text === '') return;
    const tracked = r.tracking > 0 && isCapitals(text);
    const digits = isFigures(text);
    let kind: TextBlock['kind'] = tracked || (digits && HEADING_FACES.has(r.font) && r.size >= 12) ? 'label' : HEADING_FACES.has(r.font) && r.size >= 12 ? 'heading' : 'text';
    const spans = kind === 'heading' && isLetterPair(text) ? [{ lang: 'ku' as Lang, text }] : spansOf(p, lexicon, tracked);
    if (spans.length === 0) return;
    if (tracked) {
      // a label just left of a Kurmanji line, on its baseline, names who says it
      const next = paragraphs[i + 1];
      const last = p.pieces.at(-1)!.run;
      if (next && Math.abs(next.first.y - r.y) <= SAME_LINE && next.first.x > last.x + last.width && next.first.typeKey === 'kurdish') {
        kind = 'speaker';
        spans[spans.length - 1]!.text += ':';
      }
    }
    const runsIn = p.pieces.map((x) => x.run);
    const lastLine = runsIn.reduce((a, b) => (b.y > a.y + SAME_LINE || (Math.abs(b.y - a.y) <= SAME_LINE && b.x > a.x) ? b : a));
    items.push({ block: { kind, spans: joinSpans(spans.flatMap((s) => splitKurmanji(s, lexicon))) }, first: r, last: lastLine });
  });

  // rows: a heading keeps its block, a speaker stays before the line, the badges go
  const rowItems: Item[] = [];
  for (const row of rowsOf(items)) {
    const words = row.filter((item) => markOf(item) === null);
    if (words.length === 0) continue;
    const headings = row.filter((item) => item.block.kind === 'heading');
    const lead = headings.length > 0 ? headings : row[0]!.block.kind === 'speaker' ? [row[0]!] : [];
    for (const item of lead) rowItems.push(item);
    const rest = row.filter((item) => !lead.includes(item) && !(headings.length > 0 && markOf(item) !== null));
    if (rest.some((item) => markOf(item) === null)) rowItems.push({ block: rowBlock(rest), first: rest[0]!.first, last: rest.at(-1)!.last });
  }

  // a word card's English, set under the word, joins it
  const blocks: TextBlock[] = [];
  let card: Item | null = null;
  for (const item of rowItems) {
    const gloss =
      card !== null &&
      item.first.typeKey === 'gloss' &&
      Math.abs(item.first.x - card.first.x) <= 1 &&
      item.first.y > card.last.y + SAME_ROW &&
      item.first.y - card.last.y <= 2 * card.last.lead;
    if (gloss) {
      const last = blocks.at(-1)!;
      last.spans = joinSpans([...last.spans, { lang: 'en', text: ' · ' }, ...item.block.spans]);
      last.kind = 'text';
      card = null;
      continue;
    }
    blocks.push({ kind: item.block.kind, spans: item.block.spans.map((s) => ({ ...s })) });
    card = item.first.typeKey === 'word' ? item : null;
  }
  return blocks;
}

/** Every page of the book, as blocks. */
export function bookText(runs: readonly TextRun[], pageCount: number, lexicon: Lexicon): PageText[] {
  return Array.from({ length: pageCount }, (_, i) => ({ n: i + 1, blocks: pageBlocks(runs, i + 1, lexicon) }));
}

/** A block's text, its languages run together. */
export const blockText = (block: TextBlock): string => block.spans.map((s) => s.text).join('');
