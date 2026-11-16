/**
 * The Hevalo book from the road's own files: what a chapter holds, lesson by
 * lesson; that every kind of exercise gives it something and nothing Kurdish
 * in it is the book's own invention; the word list's Kurdish order, the
 * alphabet and the people; and a PDF that is one — of the chapters asked for
 * and only those, far shorter than the book it replaces, small and quick.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dealt, kurdishCompare, roadBookAlphabet, roadBookCast, roadBookChapters, roadBookWordList, spread, type BookChapter } from './road-book.js';
import { renderRoadBook } from './pdf.js';
import { loadRoadBookSources } from './sources.js';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const pagesOf = (pdf: Buffer): number => pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

/** Every Kurdish line an outline would have the book print, with where it is from. */
function kurdishOf(chapters: readonly BookChapter[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const c of chapters) {
    out.push([`${c.number}`, c.titleKu]);
    if (c.gag) out.push([`${c.number} gag`, c.gag.ku]);
    for (const p of c.parts) {
      out.push([`${c.number}.${p.position}`, p.titleKu]);
      for (const l of p.lessons) {
        out.push([l.key, l.titleKu]);
        if (l.say) out.push([`${l.key} say`, l.say]);
        for (const w of l.words) out.push([`${l.key} word`, w.ku]);
        for (const s of l.sentences) out.push([`${l.key} line`, s.ku]);
        for (const d of l.dialogue?.lines ?? []) out.push([`${l.key} talk`, d.text]);
      }
    }
    for (const text of c.tale ? [c.tale.title, ...c.tale.paragraphs, ...c.tale.questions.flatMap((q) => [q.prompt, ...q.options]), ...c.tale.glossary.map((g) => g.term)] : []) out.push([`${c.number} tale`, text]);
    const pr = c.practice;
    for (const text of [...pr.match.map((m) => m.ku), ...pr.gaps.flatMap((g) => [g.text, g.answer]), ...pr.replies.flatMap((r) => [r.say, r.answer]), ...pr.toKurdish.map((t) => t.ku), ...pr.pictures.map((x) => x.ku), ...pr.alone]) {
      out.push([`${c.number} practice`, text]);
    }
  }
  return out;
}

describe('the Hevalo book', () => {
  it('gathers a chapter lesson by lesson: its scene, its words, the line to say, lines to read, its conversation', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const [one] = roadBookChapters(plan, docs, stories, [1]);
    expect(one).toMatchObject({ number: 1, titleKu: 'Silav', cefr: 'A1', land: { landmark: 'gate' } });
    expect(one!.parts.map((p) => p.titleKu)).toEqual(plan.units[0]!.skills.map((s) => s.titleKu));
    expect(one!.parts[0]!.grammarMd).toContain('Ez baş im');
    const lessons = one!.parts[0]!.lessons;
    expect(lessons.map((l) => [l.key, l.position, l.focus])).toEqual([
      ['u01s1l1', 1, 'meet'],
      ['u01s1l2', 2, 'build'],
      ['u01s1l3', 3, 'talk'],
      ['u01s1l4', 4, 'review'],
    ]);
    const first = lessons[0]!;
    expect(first.words.map((w) => w.ku)).toEqual(plan.units[0]!.skills[0]!.lessons[0]!.new.map((w) => w.ku));
    expect(first.beat).toBe(plan.units[0]!.skills[0]!.lessons[0]!.beat);
    // the lesson's "pick the picture" ties the apple to its drawing, and its line to repeat is the line to say
    expect(first.words.find((w) => w.ku === 'sêv')).toMatchObject({ gender: 'f', pos: 'noun', picture: 'apple' });
    expect(first.say).toBe('Ez sêvê dixwim.');
    // two of its lines to read aloud with what they mean: here the first is the line to say, whose meaning the lesson also asks
    expect(first.sentences).toEqual([
      { ku: 'Ez sêvê dixwim.', en: 'I’m eating the apple.' },
      { ku: 'Ez jî sêvekê dixwim.', en: 'I’m having an apple too.' },
    ]);
    // a lesson with a conversation is read as that: Hamo talking with the learner, who is "You" in the book
    const talk = lessons[2]!;
    expect(talk.sentences).toEqual([]);
    expect(talk.dialogue!.lines.slice(0, 2).map((l) => [l.who, l.learner, l.text, l.en])).toEqual([
      ['Hamo', false, 'Silav!', 'Hello!'],
      ['You', true, 'Silav!', 'Hello!'],
    ]);
    expect(talk.dialogue!.title).toBe('Tu çawa yî?');
    expect(one!.tale).toMatchObject({ title: 'Sêv tune!' });
    expect(one!.tale!.paragraphs).toHaveLength(one!.tale!.english.length);
    expect(one!.tale!.questions[0]).toMatchObject({ prompt: 'Hamo ji Kobaniyê ye, an ji Sêvanê?', promptEn: 'Where is Hamo from?', answer: 0 });
    // the chapter's own line about Hevalo and his apples, for the page it ends on
    expect(one!.gag).toEqual({ ku: 'Hevalo, sêva min!', en: 'Hevalo, my apple!' });
  });

  it('takes something from every kind of exercise the lessons set', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const chapters = roadBookChapters(plan, docs, stories, ALL);
    expect(chapters).toHaveLength(12);
    for (const c of chapters) {
      const lessons = c.parts.flatMap((p) => p.lessons);
      expect(lessons, `chapter ${c.number}`).toHaveLength(16);
      // speaking: a line to say in every lesson; meaning and translation: lines to read; conversation: one in every "talk" lesson
      expect(lessons.every((l) => l.say !== null && l.beat !== '')).toBe(true);
      expect(lessons.filter((l) => l.focus === 'talk').every((l) => l.dialogue !== null && l.dialogue.question !== null)).toBe(true);
      expect(lessons.filter((l) => !l.dialogue).every((l) => l.sentences.length === 2)).toBe(true);
      // matching pairs, missing words, replies, translating and writing, and listening: the chapter's practice
      expect(c.practice.match, `chapter ${c.number}`).toHaveLength(8);
      expect(c.practice.replies).toHaveLength(4);
      expect(c.practice.alone).toHaveLength(3);
      expect(c.practice.gaps.every((g) => g.text.includes('___') && !g.answer.includes(' '))).toBe(true);
      expect(c.gag?.ku).toContain('Hevalo');
    }
    // a chapter sets six gaps where its lessons have them; one with hardly any sets none, and more to put into Kurdish instead
    expect(chapters.map((c) => c.practice.gaps.length)).toEqual([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 0]);
    expect(chapters.map((c) => c.practice.toKurdish.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 7]);
    // "pick the picture": the pictures to name, in the chapters that have enough of them
    expect(chapters[0]!.practice.pictures.map((p) => [p.picture, p.ku])).toEqual([['apple', 'sêv'], ['tea', 'çay'], ['water', 'av'], ['bread', 'nan'], ['milk', 'şîr'], ['house', 'mal']]);
    // practice asks for nothing that is printed beside its answer in the chapter
    for (const c of chapters) {
      const printed = new Set(c.parts.flatMap((p) => p.lessons.flatMap((l) => [...l.sentences.map((s) => s.ku), ...(l.dialogue?.lines.map((d) => d.text) ?? [])])));
      expect(c.practice.toKurdish.filter((t) => printed.has(t.ku))).toEqual([]);
    }
  });

  it('prints no Kurdish of its own: every word and line is in the course files as written', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const dir = new URL('../../content/lessons/road/', import.meta.url);
    const files = [...readdirSync(dir).map((name) => new URL(name, dir)), new URL('../../content/stories/road.json', import.meta.url)];
    // the files as the book's lines would be found in them: JSON's own escapes undone
    const course = files.map((f) => readFileSync(f, 'utf8').replace(/\\n/g, '\n').replace(/\\"/g, '"')).join('\n');
    const strangers = kurdishOf(roadBookChapters(plan, docs, stories, ALL)).filter(([, text]) => !course.includes(text));
    expect(strangers).toEqual([]);
    // and the few Kurdish words the pages themselves are set with are the road's own: its name, its greeting, its two places, and the lines looked up for the first and last pages
    for (const own of ['Rêya Kurmancî', 'Silav!', 'Sêvan', 'Kobanî', 'Bi xêr hatî!', 'Rêya te vekirî be!', 'Bi xêr biçî!', 'sêv']) expect(course, own).toContain(own);
  });

  it('deals a question’s options once, so the answers at the back are not all the first', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    expect(dealt(['right', 'wrong', 'worse'], 0, 'a')).toEqual(dealt(['right', 'wrong', 'worse'], 0, 'a'));
    for (const by of ['a', 'b', 'c', 'roadu01s1l3a|Why?']) {
      const hand = dealt(['right', 'wrong', 'worse'], 0, by);
      expect(hand.options[hand.answer]).toBe('right');
      expect([...hand.options].sort()).toEqual(['right', 'worse', 'wrong']);
    }
    // in the files the right answer to a conversation's question is always the first
    const questions = roadBookChapters(plan, docs, stories, ALL).flatMap((c) => c.parts.flatMap((p) => p.lessons.flatMap((l) => (l.dialogue?.question ? [{ key: l.key, ...l.dialogue.question }] : []))));
    expect(questions).toHaveLength(62);
    const first = docs.get(1)!.units[0]!.skills[0]!.lessons[2]!.exercises.find((e) => e.type === 'conversation')!.payload as { options: string[]; correctIndex: number };
    expect(questions[0]!.options[questions[0]!.answer]).toBe(first.options[first.correctIndex]);
    const places = new Set(questions.map((q) => q.answer));
    expect(places.size).toBeGreaterThan(1);
    expect(questions.filter((q) => q.answer === 0).length).toBeLessThan(questions.length * 0.6);
  });

  it('spreads a choice fairly through a list, the same every time', () => {
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 4, 7]);
    expect(spread([1, 2, 3], 0)).toEqual([]);
  });

  it('lists every word once, in the Kurdish alphabet’s order', () => {
    expect(['ç', 'c', 'ê', 'e', 'z', 'a'].sort(kurdishCompare)).toEqual(['a', 'c', 'ç', 'e', 'ê', 'z']);
    const word = (ku: string, en: string): unknown => ({ ku, en, gender: 'f', pos: 'noun', picture: null });
    const list = roadBookWordList([
      { parts: [{ lessons: [{ words: [word('çay', 'tea'), word('cîran', 'neighbour')] }] }], number: 1 },
      { parts: [{ lessons: [{ words: [word('Çay', 'tea again')] }, { words: [word('av', 'water')] }] }], number: 2 },
    ] as never);
    expect(list.map((w) => [w.ku, w.chapter])).toEqual([
      ['av', 2],
      ['cîran', 1],
      ['çay', 1],
    ]);
  });

  it('shows each letter in a word the chapters teach, a pictured one first, and no word twice where it can help it', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const pictured = (w: { picture: string | null }): boolean => w.picture !== null;
    const one = roadBookAlphabet(roadBookChapters(plan, docs, stories, [1]), pictured);
    expect(one).toHaveLength(31);
    const taught = new Set(plan.units[0]!.skills.flatMap((s) => s.lessons.flatMap((l) => l.new.map((w) => w.ku))));
    for (const l of one) {
      if (!l.word) continue;
      // only words of the chapters asked for, and the letter is where the book will mark it
      expect(taught.has(l.word.ku), l.id).toBe(true);
      expect(l.word.ku.toLowerCase().slice(l.at, l.at + l.id.length)).toBe(l.id);
    }
    const by = new Map(one.map((l) => [l.id, l.word?.ku ?? null]));
    // "s" has silav before sêv, but the apple has a picture; "c" begins no word of chapter 1 and is in none
    expect(by.get('s')).toBe('sêv');
    expect(by.get('a')).toBe('av');
    expect(by.get('c')).toBeNull();
    // a letter no word begins with is shown inside one: the apple is s's already, so ê takes another word, and so does v
    expect(by.get('ê')).toBe('erê');
    expect(by.get('v')).toBe('ev');
    // and only where every word with the letter is taken does one show two letters
    expect(by.get('z')).toBe('ez');
    const all = roadBookAlphabet(roadBookChapters(plan, docs, stories, ALL), pictured);
    expect(all.every((l) => l.word !== null)).toBe(true);
    expect(new Set(all.map((l) => l.word!.ku)).size).toBe(31);
  });

  it('names the people of the chapters asked for, and nobody from further up the road', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const cast = (chapters: number[]): string[] => roadBookCast(plan, roadBookChapters(plan, docs, stories, chapters)).map((p) => p.name);
    expect(cast([1])).toEqual(['Hamo', 'Hevalo']);
    expect(cast([1, 2])).toEqual(expect.arrayContaining(['Nazê', 'Baran', 'Hêvî', 'Şemsê', 'Ibrahîm', 'Edûl', 'Bozo', 'Şêro']));
    expect(cast([1, 2])).not.toContain('Zerê');
    const all = cast(ALL);
    expect(all).toEqual(expect.arrayContaining(['Xezal', 'Lorîn', 'Mîrza', 'Azad', 'Bişar', 'Zerê']));
    // places are not people, and what Hamo calls Xezal at the end is not another person
    expect(all).not.toContain('Kobanî');
    expect(all).not.toContain('Xezo');
  });

  it('prints a PDF of the chapters asked for, and only those', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const chapters = roadBookChapters(plan, docs, stories, [3]);
    const pdf = await renderRoadBook({ chapters, characters: plan.characters, people: roadBookCast(plan, chapters) });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // the pages before the chapters, one chapter of thirteen or so pages, the answers and the word list
    expect(pagesOf(pdf)).toBeGreaterThan(20);
    expect(pagesOf(pdf)).toBeLessThan(34);
    expect(pdf.length).toBeLessThan(1_500_000);
    expect(pdf.toString('latin1')).toMatch(/\/Title \d+ 0 R/);
  }, 30_000);

  it('prints the whole road far shorter than the 239 pages it used to take, small enough to send and quick to make', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const chapters = roadBookChapters(plan, docs, stories, ALL);
    const started = performance.now();
    const pdf = await renderRoadBook({ chapters, characters: plan.characters, people: roadBookCast(plan, chapters) });
    const took = performance.now() - started;
    expect(pagesOf(pdf)).toBeGreaterThan(150);
    expect(pagesOf(pdf)).toBeLessThan(200);
    expect(pdf.length).toBeLessThan(8_000_000);
    // a few seconds on a server; the limit is loose because test machines are not
    expect(took).toBeLessThan(30_000);
  }, 60_000);
});
