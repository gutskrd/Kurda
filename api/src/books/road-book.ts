/**
 * The Hevalo book: the Kurmanji Road on paper, chapter by chapter, as a downloadable PDF.
 *
 * Chapter content comes from the course's seed files (content/lessons/road and content/stories/road.json), gathered
 * into a plain outline (`roadBookChapters`) that pdf.ts lays out. A chapter has four parts; a part has its grammar note
 * and four lessons; a lesson has its scene (the plan's beat, in the book's own hand-written words where available), new
 * words, Hamo's line to repeat, a few sentences to read aloud with their meaning, and its conversation. Then Hamo's
 * story with English and questions, and pencil practice with answers at the back.
 *
 * Every exercise kind contributes (`lessonOf`, `practiceOf`), and no Kurdish is written here: every word and line is
 * taken from the files.
 *
 * Pure: the routes decide which chapters a learner may have (online ones only), and the caller reads the files.
 */
import { LATIN_LETTERS, PATH_LANDS, type PathLand } from '@kurda/shared';

/** The parts of the course files the book reads, as loose as the files themselves. */
export interface BookPlanUnit {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  story: string;
  /** the book's own opening paragraph for the chapter, from book-beats.json, where it has one */
  bookStory?: unknown;
  skills: Array<{
    position: number;
    titleKu: string;
    titleEn: string;
    grammar?: string;
    grammarMd?: string;
    lessons: Array<{
      key: string;
      position?: number;
      titleKu: string;
      titleEn: string;
      focus?: string;
      beat?: string;
      /**
       * The beat as the book tells it beside the lesson's drawing, written to fit there: from
       * content/lessons/road/book-beats.json (see `withBookBeats`), or the plan's own.
       */
      bookBeat?: string;
      new: Array<{ ku: string; en: string; pos?: string; gender?: string }>;
    }>;
  }>;
}

export interface BookPlan {
  /** everyone and every place the road names, each with a few words on who or what it is */
  names?: Array<{ name: string; kind: string; en: string; forms?: string[] }>;
  units: BookPlanUnit[];
}

interface BookExercise {
  position: number;
  type: string;
  payload: Record<string, unknown>;
}

export interface BookUnitDoc {
  units: Array<{
    position: number;
    skills: Array<{
      position: number;
      lessons: Array<{ key?: string; position: number; exercises: BookExercise[] }>;
    }>;
  }>;
}

export interface BookStory {
  slug: string;
  title: string;
  body: string;
  translations?: { en?: string };
  glossary?: Array<{ term: string; meanings: { en: string } }>;
  questions?: Array<{ promptEn?: string | null; prompt: string; options: string[]; correctIndex: number }>;
}

export interface BookWord {
  ku: string;
  en: string;
  /** masculine, feminine, or either (a neighbour, a teacher), where the plan says */
  gender: 'm' | 'f' | 'mf' | null;
  /** what kind of word the plan says it is: noun, verb, num … */
  pos: string | null;
  /** the picture the lessons themselves show for it (the right card of a "pick the picture" item), when they do */
  picture: string | null;
}

export interface BookLine {
  /** who says it, as the book names them: a character, or "You" for the learner */
  who: string;
  learner: boolean;
  text: string;
  en: string | null;
}

export interface BookDialogue {
  title: string | null;
  lines: BookLine[];
  /** what the lesson asks about it afterwards, in English; the answer waits at the back */
  question: { prompt: string; options: string[]; answer: number } | null;
}

/** A Kurdish line with what it means. */
export interface BookPair {
  ku: string;
  en: string;
}

export interface BookLesson {
  key: string;
  /** its place in its part, from 1 */
  position: number;
  titleKu: string;
  titleEn: string;
  /** what the lesson is for, in the plan's word: meet, build, talk or review */
  focus: string;
  /**
   * The lesson's scene in English as the book prints and draws it: the book's own telling where there is one, else the
   * plan's beat.
   */
  beat: string;
  words: BookWord[];
  /** the line to say out loud, in the speech bubble beside the scene */
  say: string | null;
  /** what the bubble's line means, where the course gives it */
  sayEn: string | null;
  /** a few of the lesson's lines with their meaning, to read aloud */
  sentences: BookPair[];
  dialogue: BookDialogue | null;
}

export interface BookPart {
  position: number;
  titleKu: string;
  titleEn: string;
  /** what the part teaches, in a line */
  grammar: string;
  grammarMd: string;
  lessons: BookLesson[];
}

/** A chapter's practice, one kind of task from each kind of exercise the lessons set. */
export interface BookPractice {
  /** words to join to their meanings with a line (the lessons' matching pairs) */
  match: BookPair[];
  /** lines with a word left out, and the word (the lessons' "which word is missing"); `cue` is the lesson's own hint */
  gaps: Array<{ text: string; answer: string; cue: string | null }>;
  /** what Hamo says, and what to answer (the lessons' "what do you say back") */
  replies: Array<{ say: string; answer: string; cue: string | null }>;
  /** English to put into Kurdish (the lessons' translating and writing) */
  toKurdish: BookPair[];
  /** pictures to name (the lessons' "pick the picture"): a word picture's id, and its word */
  pictures: Array<{ picture: string; ku: string }>;
  /** lines the lessons only say aloud, with no English beside them: to read alone */
  alone: string[];
}

export interface BookChapter {
  number: number;
  cefr: string;
  titleKu: string;
  titleEn: string;
  /** what happens in the chapter, in English */
  summary: string;
  land: PathLand;
  parts: BookPart[];
  tale: {
    title: string;
    paragraphs: string[];
    english: string[];
    glossary: Array<{ term: string; en: string }>;
    questions: Array<{ prompt: string; promptEn: string | null; options: string[]; answer: number }>;
  } | null;
  practice: BookPractice;
  /** the chapter's own line about Hevalo and his apples, for the page it ends on */
  gag: BookPair | null;
}

const PARAGRAPH = /\n\s*\n/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** A fair spread of at most `max` of `list`, starting from the first, the same every time. */
export function spread<T>(list: readonly T[], max: number): T[] {
  if (max <= 0) return [];
  if (list.length <= max) return [...list];
  const step = list.length / max;
  return Array.from({ length: max }, (_, i) => list[Math.floor(i * step)]!);
}

/** The right option of a choice, when it has one. */
function rightOption(p: Record<string, unknown>): string | null {
  return typeof p.correctIndex === 'number' ? str(strings(p.options)[p.correctIndex]) : null;
}

/** A small number from a text, the same on every machine: what the book deals a question's options by. */
function tally(text: string): number {
  let sum = 0;
  for (const ch of text) sum = (sum * 31 + ch.codePointAt(0)!) % 9973;
  return sum;
}

/**
 * A question's options as printed. The files put the right one first (the app shuffles each time); a book is dealt
 * once, so the right one moves to a place derived from `by` and the answers are not all "a".
 */
export function dealt(options: readonly string[], right: number, by: string): { options: string[]; answer: number } {
  const others = options.filter((_, i) => i !== right);
  const answer = options.length === 0 ? 0 : tally(by) % options.length;
  return { options: [...others.slice(0, answer), options[right]!, ...others.slice(answer)], answer };
}

/** A lesson's conversation, as the book prints it. */
function dialogueOf(exercises: readonly BookExercise[]): BookDialogue | null {
  const conv = exercises.find((e) => e.type === 'conversation');
  if (!conv) return null;
  const p = conv.payload;
  const speakers = Array.isArray(p.speakers) ? p.speakers : [];
  const lines = (Array.isArray(p.lines) ? p.lines : []).flatMap((l): BookLine[] => {
    if (!isRecord(l) || typeof l.text !== 'string' || typeof l.speaker !== 'number') return [];
    const part = speakers[l.speaker];
    const learner = isRecord(part) && part.learner === true;
    const who = learner ? 'You' : isRecord(part) && typeof part.name === 'string' ? part.name : 'Hamo';
    return [{ who, learner, text: l.text, en: str(l.en) }];
  });
  if (lines.length === 0) return null;
  const prompt = str(p.prompt);
  const options = strings(p.options);
  const right = typeof p.correctIndex === 'number' && p.correctIndex >= 0 && p.correctIndex < options.length ? p.correctIndex : -1;
  const question = prompt && options.length > 1 && right >= 0 ? { prompt, ...dealt(options, right, `${str(p.id) ?? ''}|${prompt}`) } : null;
  return { title: str(p.title), lines, question };
}

/**
 * What each Kurdish line of the course means, wherever an item gives it: a line to put into English or into Kurdish, a
 * choice of its meaning, or a line of a conversation. A line said out loud is printed with its English from here.
 */
function meaningsOf(docs: ReadonlyMap<number, BookUnitDoc>): Map<string, string> {
  const out = new Map<string, string>();
  const add = (ku: string | null, en: string | null): void => {
    if (ku && en && !out.has(ku)) out.set(ku, en);
  };
  for (const doc of docs.values()) {
    for (const skill of doc.units[0]?.skills ?? []) {
      for (const lesson of skill.lessons) {
        for (const e of lesson.exercises) {
          const p = e.payload;
          if (p.ask === 'to-kurdish') add(str(strings(p.accepted)[0]), str(p.prompt));
          else if (p.ask === 'choose-kurdish') add(rightOption(p), str(p.prompt));
          else if (e.type === 'conversation') for (const l of Array.isArray(p.lines) ? p.lines : []) if (isRecord(l)) add(str(l.text), str(l.en));
        }
        for (const pair of pairsOf(lesson.exercises)) add(pair.ku, pair.en);
      }
    }
  }
  return out;
}

/**
 * A lesson's Kurdish lines with their meanings: items asking for the English of something Hamo says (a choice whose
 * right option is its English, or a translation into English).
 */
function pairsOf(exercises: readonly BookExercise[]): BookPair[] {
  const out: BookPair[] = [];
  const seen = new Set<string>();
  for (const e of exercises) {
    const p = e.payload;
    const meaning = e.type === 'multiple_choice' && p.ask === 'meaning';
    if (!meaning && !(e.type === 'translate' && p.ask === 'to-english')) continue;
    const ku = str(p.say);
    const en = meaning ? rightOption(p) : str(strings(p.accepted)[0]);
    if (!ku || !en || seen.has(ku)) continue;
    seen.add(ku);
    out.push({ ku, en });
  }
  return out;
}

const genderOf = (g: string | undefined): BookWord['gender'] => (g === 'm' || g === 'f' || g === 'mf' ? g : null);
const sorted = (exercises: readonly BookExercise[]): BookExercise[] => [...exercises].sort((a, b) => a.position - b.position);
const wordsIn = (text: string): number => text.trim().split(/\s+/).length;

/** How many lines a lesson gives to read aloud: a lesson with a conversation is read as that. */
const READ_ALOUD = 2;

/** A line as it is compared with a word card: in lower case, without the stop, mark or dots it ends on. */
const bareLine = (text: string): string => text.toLowerCase().trim().replace(/[\s.!?…]+$/u, '');

/**
 * One lesson from the plan and its exercises. "Pick the picture" ties a word to its picture; the repeat line is Hamo's
 * line; "what does it mean" and translations into English are the read-aloud lines; the conversation is printed whole
 * with its question. Other kinds go to the chapter's practice (`practiceOf`).
 */
function lessonOf(
  plan: BookPlanUnit['skills'][number]['lessons'][number],
  index: number,
  exercises: readonly BookExercise[],
  context: { taken?: ReadonlySet<string>; grammar?: string; meanings?: ReadonlyMap<string, string> } = {},
): BookLesson {
  const taken = context.taken ?? new Set<string>();
  const grammar = context.grammar ?? '';
  const pictures = new Map<string, string>();
  for (const e of exercises) {
    if (e.type !== 'multiple_choice' || e.payload.ask !== 'picture') continue;
    const word = str(e.payload.prompt);
    const right = rightOption(e.payload);
    if (word && right && !pictures.has(word)) pictures.set(word, right);
  }
  const dialogue = dialogueOf(exercises);
  const spoken = new Set(dialogue?.lines.map((l) => l.text) ?? []);
  const carded = new Set(plan.new.map((w) => bareLine(w.ku)));
  // the lines this lesson teaches first: those with one of its new words in them
  const teaches = (text: string): boolean => plan.new.some((w) => text.toLowerCase().includes(w.ku.toLowerCase().split(/[\s/,(]/)[0]!.replace(/[!?.…]+$/u, '')));
  const ranked = <T>(list: readonly T[], text: (t: T) => string): T[] => [...list.filter((t) => teaches(text(t))), ...list.filter((t) => !teaches(text(t)))];
  // a line of one word is on the page already, as a word; a line of the conversation is in the conversation; a line
  // that is one of the lesson's own new sayings is on its word card just above; and a line the chapter prints elsewhere
  // (`taken`) is printed once, so other lines are read instead
  const fresh = ranked(
    pairsOf(exercises).filter((s) => !spoken.has(s.ku) && !taken.has(s.ku) && !carded.has(bareLine(s.ku))),
    (s) => s.ku,
  );
  // the bubble: a line to say that is new to the chapter, not a grammar note's example, not a reply that opens on a bare
  // "No." or "Yes.", and not one the conversation below says; failing those, a fresh line of the lesson's own
  const opensOnAnswer = (t: string): boolean => /^(Na|Erê|Belê)[.!,]\s+\S+\s+\S+\s+\S+/u.test(t);
  const sayings = ranked(
    exercises.filter((e) => e.type === 'speaking').map((e) => str(e.payload.reference) ?? str(e.payload.prompt)).filter((t): t is string => t !== null),
    (t) => t,
  );
  const fits = (t: string): boolean => !taken.has(t) && !grammar.includes(t) && !opensOnAnswer(t) && !carded.has(bareLine(t));
  const own = sayings.find((t) => fits(t) && !spoken.has(t)) ?? null;
  const borrowed = own === null && !dialogue ? (fresh.find((s) => wordsIn(s.ku) > 1 && fits(s.ku)) ?? null) : null;
  const say = own ?? borrowed?.ku ?? null;
  const rest = fresh.filter((s) => s.ku !== say);
  const whole = rest.filter((s) => wordsIn(s.ku) > 1);
  return {
    key: plan.key,
    position: plan.position ?? index + 1,
    titleKu: plan.titleKu,
    titleEn: plan.titleEn,
    focus: plan.focus ?? '',
    // the plan's beat is written for the app and runs longer than the lines beside the drawing; the book's own telling fits them whole
    beat: str(plan.bookBeat) ?? plan.beat ?? '',
    words: plan.new.map((w) => ({ ku: w.ku, en: w.en, gender: genderOf(w.gender), pos: w.pos ?? null, picture: pictures.get(w.ku) ?? null })),
    say,
    sayEn: say === null ? null : (borrowed?.en ?? context.meanings?.get(say) ?? null),
    sentences: dialogue ? [] : (whole.length >= READ_ALOUD ? whole : rest).slice(0, READ_ALOUD),
    dialogue,
  };
}

/** A word and its meaning spelt so nearly alike that one gives the other away: a loanword beside its English (doktor and doctor, plan and plan, trên and train). */
export function givesAway(pair: BookPair): boolean {
  const plain = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const ku = plain(pair.ku);
  // the English's first meaning is the one a learner would match it by
  return pair.en.split(/[,;(]/).map(plain).some((en) => {
    if (en === ku) return true;
    // short words are too few letters to judge by: ez and I, av and a, are not alike
    if (Math.min(en.length, ku.length) < 4) return false;
    return editDistance(ku, en) <= 2;
  });
}

/** How many letters must be put in, taken out or changed to turn one word into the other. */
function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next.push(Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)));
    row = next;
  }
  return row[b.length]!;
}

/** How much of each kind of task a chapter's practice holds. */
const PRACTICE = { match: 8, gaps: 6, replies: 4, toKurdish: 4, pictures: 6, alone: 3 } as const;

/**
 * The fewest lines a gap task is worth: with one or two, the word box gives the answers away. A chapter with fewer gets
 * that many extra lines to put into Kurdish instead.
 */
const GAPS_AT_LEAST = 3;

/**
 * A chapter's practice from all its lessons' exercises: matching pairs, missing words (from choices or writing),
 * replies, English to put into Kurdish (translating, writing or choosing), pictures to name, and say-aloud lines to
 * read alone. Only right answers are taken; wrong options stay in the app.
 */
function practiceOf(
  exercises: readonly BookExercise[],
  printed: ReadonlySet<string>,
  context: { words?: ReadonlySet<string>; before?: ReadonlySet<string>; earlierWords?: ReadonlySet<string> } = {},
): BookPractice {
  const words = context.words ?? new Set<string>();
  const before = context.before ?? new Set<string>();
  const earlierWords = context.earlierWords ?? new Set<string>();
  const match: BookPair[] = [];
  const gaps: BookPractice['gaps'] = [];
  const replies: BookPractice['replies'] = [];
  const toKurdish: BookPair[] = [];
  const pictures: BookPractice['pictures'] = [];
  const alone: string[] = [];
  const once = new Set<string>();
  const first = (key: string): boolean => (once.has(key) ? false : (once.add(key), true));
  for (const e of exercises) {
    const p = e.payload;
    if (e.type === 'match_pairs') {
      for (const pair of Array.isArray(p.pairs) ? p.pairs : []) {
        if (isRecord(pair) && typeof pair.left === 'string' && typeof pair.right === 'string' && first(`match|${pair.left}`)) match.push({ ku: pair.left, en: pair.right });
      }
    } else if (p.ask === 'missing') {
      const text = str(p.prompt);
      const answer = e.type === 'writing' ? str(strings(p.accepted)[0]) : rightOption(p);
      if (text && answer && text.includes('___') && first(`gap|${text}`)) gaps.push({ text, answer, cue: str(p.cue) });
    } else if (e.type === 'multiple_choice' && p.ask === 'reply') {
      const say = str(p.say) ?? str(p.prompt);
      const answer = rightOption(p);
      if (say && answer && first(`reply|${say}|${answer}`)) replies.push({ say, answer, cue: str(p.cue) });
    } else if (p.ask === 'to-kurdish' || p.ask === 'choose-kurdish') {
      const en = str(p.prompt);
      const ku = p.ask === 'choose-kurdish' ? rightOption(p) : str(strings(p.accepted)[0]);
      if (en && ku && first(`ku|${en}`)) toKurdish.push({ en, ku });
    } else if (e.type === 'multiple_choice' && p.ask === 'picture') {
      const ku = str(p.prompt);
      const picture = rightOption(p);
      if (ku && picture && first(`picture|${picture}`)) pictures.push({ picture, ku });
    } else if (e.type === 'listening') {
      const line = str(strings(p.accepted)[0]);
      // a line read alone is new to the page: not one printed whole, nor one inside a longer printed line (“Spas! …” says
      // it already), nor one an earlier chapter printed with its English
      if (line && ![...printed].some((p) => p.includes(line)) && !before.has(line) && first(`alone|${line}`)) alone.push(line);
    }
  }
  // the chapter's own words and lines come first: the units mix in many from earlier chapters for review
  const ownWord = (ku: string): boolean => words.has(ku.toLowerCase());
  const hasOwnWord = (line: string): boolean => line.toLowerCase().split(/[^a-zçêîşû]+/u).some((w) => w !== '' && words.has(w));
  const first_ = <T>(list: readonly T[], test: (t: T) => boolean): T[] => [...list.filter(test), ...list.filter((t) => !test(t))];
  const opensOnAnswer = (t: string): boolean => /^(Na|Erê|Belê)[.!,]\s/u.test(t);
  // a Kurdish line belongs to one task only, so no task's answer is printed in another
  const used = new Set<string>();
  const take = <T>(list: readonly T[], max: number, lines: (t: T) => string[]): T[] => {
    const out: T[] = [];
    for (const t of list) {
      if (out.length >= max) break;
      const ls = lines(t);
      if (ls.some((l) => used.has(l))) continue;
      ls.forEach((l) => used.add(l));
      out.push(t);
    }
    return out;
  };
  // what is joined with a line is a word and its meaning: a whole proverb is for reading, not for one end of a line;
  // and a word spelt nearly as its English (doktor, doctor) joins itself, so it teaches nothing there
  const fair = match.filter((m) => !givesAway(m));
  const short = fair.filter((m) => wordsIn(m.ku) <= 3 && m.ku.length <= 18 && m.en.length <= 26);
  const pairs = first_(short.length >= PRACTICE.match ? short : fair, (m) => ownWord(m.ku));
  const chosenGaps = gaps.length < GAPS_AT_LEAST ? [] : take(spread(first_(gaps, (g) => hasOwnWord(g.text)), gaps.length), PRACTICE.gaps, (g) => [g.text.replace('___', g.answer)]);
  // a reply with the lesson's own hint says what is going on
  const hinted = replies.filter((r) => r.cue !== null);
  const chosenReplies = take(first_(hinted.length >= PRACTICE.replies ? hinted : replies, (r) => hasOwnWord(r.say)), PRACTICE.replies, (r) => [r.say, r.answer]);
  // a sentence is a fairer thing to translate than one word, and a line the chapter has printed is one to bring back
  const few = chosenGaps.length === 0;
  const into = PRACTICE.toKurdish + (few ? GAPS_AT_LEAST : 0);
  const sentences = toKurdish.filter((t) => wordsIn(t.ku) > 1);
  const chosenInto = take(first_(first_(sentences.length >= into ? sentences : toKurdish, (t) => hasOwnWord(t.ku)), (t) => printed.has(t.ku)), into, (t) => [t.ku]);
  // a picture to name is a word of this chapter's; with fewer than three, the task is left out
  const ownPictures = pictures.filter((p) => !earlierWords.has(p.ku.toLowerCase()));
  const readable = alone.filter((l) => wordsIn(l) > 2 && !opensOnAnswer(l));
  return {
    match: take(pairs, PRACTICE.match, (m) => [m.ku]),
    gaps: chosenGaps,
    replies: chosenReplies,
    toKurdish: chosenInto,
    pictures: ownPictures.length >= 3 ? spread(ownPictures, PRACTICE.pictures) : [],
    alone: take(first_(readable, hasOwnWord), PRACTICE.alone, (l) => [l]),
  };
}

/**
 * The chapter's own line about Hevalo and his apples, printed where it ends beside Hamo: the shortest line naming both,
 * an exclamation before a plain one, else the shortest that has him eating or exclaiming. A line the chapter has not
 * printed comes first, and never one of the learner's own, since Hamo says it.
 */
function gagOf(pairs: readonly BookPair[], printed: ReadonlySet<string> = new Set(), learner: ReadonlySet<string> = new Set()): BookPair | null {
  const shortest = (list: readonly BookPair[]): BookPair | null => list.reduce<BookPair | null>((best, s) => (best === null || s.ku.length < best.ku.length ? s : best), null);
  const pick = (list: readonly BookPair[]): BookPair | null => {
    const his = list.filter((s) => s.ku.includes('Hevalo'));
    const apples = his.filter((s) => /sêv/i.test(s.ku));
    return shortest(apples.filter((s) => s.ku.includes('!'))) ?? shortest(apples) ?? shortest(his.filter((s) => /birçî|dixwe|xwar/i.test(s.ku))) ?? shortest(his.filter((s) => s.ku.includes('!')));
  };
  const his = pairs.filter((s) => !learner.has(s.ku));
  return pick(his.filter((s) => !printed.has(s.ku))) ?? pick(his);
}

/** The book's own telling of each lesson's beat, by lesson key, as content/lessons/road/book-beats.json has them. */
export type BookBeats = Readonly<Record<string, unknown>>;

/**
 * The plan with the book's own telling set beside each beat. Most plan beats run longer than the three lines a scene
 * has beside its drawing, and cutting them mechanically loses who speaks and what is drawn, so the book keeps
 * hand-written tellings in a file of its own (leaving the plan to the course writers). The plan passed in is not
 * changed; a lesson without a telling in `beats` keeps the plan's.
 */
export function withBookBeats(plan: BookPlan, beats: BookBeats): BookPlan {
  const own = (key: string): string | null => (Object.hasOwn(beats, key) ? str(beats[key]) : null);
  return {
    ...plan,
    units: plan.units.map((unit) => ({
      ...unit,
      // the chapter's opening paragraph is keyed by its unit alone ("u07"), its lessons' tellings by their lesson keys
      ...(own(`u${String(unit.number).padStart(2, '0')}`) ? { bookStory: own(`u${String(unit.number).padStart(2, '0')}`) } : {}),
      skills: unit.skills.map((skill) => ({
        ...skill,
        lessons: skill.lessons.map((lesson) => {
          const told = own(lesson.key);
          return told ? { ...lesson, bookBeat: told } : lesson;
        }),
      })),
    })),
  };
}

/**
 * The chapters asked for, in order, from the plan, unit files and stories. A chapter whose unit file is missing is left
 * out.
 */
export function roadBookChapters(plan: BookPlan, docs: ReadonlyMap<number, BookUnitDoc>, stories: readonly BookStory[], chapters: readonly number[]): BookChapter[] {
  const out: BookChapter[] = [];
  const meanings = meaningsOf(docs);
  // what the chapters before have printed and taught, so a chapter's practice works on its own
  const printedBefore = new Set<string>();
  const wordsBefore = new Set<string>();
  for (const n of [...new Set(chapters)].sort((a, b) => a - b)) {
    const unit = plan.units.find((u) => u.number === n);
    const doc = docs.get(n)?.units[0];
    if (!unit || !doc) continue;
    const everything: BookExercise[] = [];
    const lines: BookPair[] = [];
    const exercisesOf = (skill: number, lesson: BookPlanUnit['skills'][number]['lessons'][number], i: number): BookExercise[] => {
      const files = doc.skills.find((s) => s.position === skill)?.lessons ?? [];
      const file = files.find((l) => l.key === lesson.key) ?? files.find((l) => l.position === (lesson.position ?? i + 1));
      return sorted(file?.exercises ?? []);
    };
    // every line the chapter's conversations say, so that no lesson prints one again to read aloud or in a bubble
    const taken = new Set(unit.skills.flatMap((skill) => skill.lessons.flatMap((lesson, i) => dialogueOf(exercisesOf(skill.position, lesson, i))?.lines.map((l) => l.text) ?? [])));
    const parts: BookPart[] = unit.skills.map((skill) => {
      const lessons = skill.lessons.map((lesson, i) => {
        const exercises = exercisesOf(skill.position, lesson, i);
        everything.push(...exercises);
        lines.push(...pairsOf(exercises));
        const made = lessonOf(lesson, i, exercises, { taken, grammar: skill.grammarMd ?? '', meanings });
        for (const l of made.dialogue?.lines ?? []) if (l.en) lines.push({ ku: l.text, en: l.en });
        for (const t of [...made.sentences.map((x) => x.ku), ...(made.say ? [made.say] : [])]) taken.add(t);
        return made;
      });
      return { position: skill.position, titleKu: skill.titleKu, titleEn: skill.titleEn, grammar: skill.grammar ?? '', grammarMd: skill.grammarMd ?? '', lessons };
    });

    const story = stories.find((s) => s.slug.startsWith(`road-${String(n).padStart(2, '0')}-`));
    const tale = story
      ? {
          title: story.title,
          paragraphs: story.body.split(PARAGRAPH).map((p) => p.trim()).filter(Boolean),
          english: (story.translations?.en ?? '').split(PARAGRAPH).map((p) => p.trim()),
          glossary: (story.glossary ?? []).map((g) => ({ term: g.term, en: g.meanings.en })),
          questions: (story.questions ?? []).map((q) => ({ prompt: q.prompt, promptEn: q.promptEn ?? null, options: q.options, answer: q.correctIndex })),
        }
      : null;

    // the chapter's own words, whole and word by word (Bi xêr hatî! teaches xêr and hatî)
    const taught = parts.flatMap((p) => p.lessons.flatMap((l) => l.words.map((w) => w.ku.toLowerCase())));
    const ownWords = new Set([...taught, ...taught.flatMap((ku) => ku.split(/[^a-zçêîşû]+/u).filter((w) => w.length > 1))]);
    // what the chapter's pages print, which its practice brings back rather than repeats beside the question
    const learnerLines = new Set(parts.flatMap((p) => p.lessons.flatMap((l) => l.dialogue?.lines.filter((d) => d.learner).map((d) => d.text) ?? [])));
    const printed = new Set(parts.flatMap((p) => p.lessons.flatMap((l) => [...l.sentences.map((s) => s.ku), ...(l.dialogue?.lines.map((d) => d.text) ?? []), ...(l.say ? [l.say] : [])])));
    out.push({
      number: n,
      cefr: unit.cefr,
      titleKu: unit.titleKu,
      titleEn: unit.titleEn,
      summary: str(unit.bookStory) ?? unit.story,
      land: PATH_LANDS[(n - 1) % PATH_LANDS.length]!,
      parts,
      tale,
      practice: practiceOf(everything, printed, { words: ownWords, before: printedBefore, earlierWords: wordsBefore }),
      gag: gagOf(lines, printed, learnerLines),
    });
    const made = out[out.length - 1]!;
    for (const line of [...printed, ...made.practice.alone, ...made.practice.toKurdish.map((t) => t.ku)]) printedBefore.add(line);
    for (const ku of taught) wordsBefore.add(ku);
  }
  return out;
}

/** Every word of a chapter, in the order it is taught. */
export function chapterWords(chapter: Pick<BookChapter, 'parts'>): BookWord[] {
  return chapter.parts.flatMap((p) => p.lessons.flatMap((l) => l.words));
}

/**
 * Every word the chapters teach in Kurdish alphabetical order, each with the chapter it first appears in: the book's
 * word list.
 */
export function roadBookWordList(chapters: ReadonlyArray<Pick<BookChapter, 'parts' | 'number'>>): Array<BookWord & { chapter: number }> {
  const seen = new Set<string>();
  const out: Array<BookWord & { chapter: number }> = [];
  for (const c of chapters) {
    for (const w of chapterWords(c)) {
      // a word is listed once, the first time it is met, however it is written: Were! and were / werin, both "come", are one
      // entry; but wî "his" and wî / wê / wan "that" are two, and so are na "no" and na- "not"
      const first = (text: string, letters: RegExp): string => text.split(/[/,;(]/)[0]!.toLowerCase().replace(letters, '').trim();
      const key = `${first(w.ku, /[^a-zçêîşû -]/g)}|${first(w.en, /[^a-z ]/g).split(' ').find((x) => x !== '' && x !== 'to') ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...w, chapter: c.number });
    }
  }
  return out.sort((a, b) => kurdishCompare(a.ku, b.ku));
}

/** The Kurmancî alphabet's order: c after b, ç after c, ê after e, î after i, ş after s, û after u. */
const ORDER = 'abcçdeêfghiîjklmnopqrsştuûvwxyz';

export function kurdishCompare(a: string, b: string): number {
  const rank = (ch: string): number => {
    const i = ORDER.indexOf(ch);
    // a space comes before every letter, so a phrase is listed by its first word: bi lez before bira, e / ye before ez
    if (ch === ' ') return -1;
    return i >= 0 ? i : ORDER.length + ch.charCodeAt(0);
  };
  const x = a.toLowerCase().replace(/[^a-zçêîşû ]/g, '');
  const y = b.toLowerCase().replace(/[^a-zçêîşû ]/g, '');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = rank(x[i]!) - rank(y[i]!);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** A letter of the alphabet with the word of the book that shows it. */
export interface BookLetter {
  /** the lowercase letter */
  id: string;
  upper: string;
  /** a word these chapters teach with the letter in it, or null when they teach none */
  word: BookWord | null;
  /** where in the word the letter is, from 0: the book marks it */
  at: number;
}

/** A plain word for a letter to be shown in: one word, written in letters only, and not a piece of grammar. */
const plainWord = (w: BookWord): boolean => /^[a-zçêîşû]+$/i.test(w.ku) && w.pos !== 'cop' && w.pos !== 'particle';

/**
 * The alphabet, each letter with a word from these chapters: the first taught word starting with it (pictured words
 * before unpictured, per `pictured`); for a letter no word starts with, one containing it, preferring one no other
 * letter shows. Only taught words, so a one-chapter book shows nothing from later chapters.
 */
export function roadBookAlphabet(chapters: ReadonlyArray<Pick<BookChapter, 'parts'>>, pictured: (word: BookWord) => boolean): BookLetter[] {
  const words = chapters.flatMap((c) => chapterWords(c)).filter(plainWord);
  // the letters that begin a word take theirs first, so a letter found only inside words is not left with one already shown
  const taken = new Set<string>();
  const chosen = new Map<string, BookWord>();
  const begins = (id: string): BookWord[] => words.filter((w) => w.ku.toLowerCase().startsWith(id));
  for (const letter of LATIN_LETTERS) {
    const own = begins(letter.id);
    const word = own.find(pictured) ?? own[0];
    if (!word) continue;
    chosen.set(letter.id, word);
    taken.add(word.ku);
  }
  for (const letter of LATIN_LETTERS) {
    if (chosen.has(letter.id)) continue;
    const inside = words.filter((w) => w.ku.toLowerCase().includes(letter.id));
    const fresh = inside.filter((w) => !taken.has(w.ku));
    const word = fresh.find(pictured) ?? fresh[0] ?? inside.find(pictured) ?? inside[0];
    if (!word) continue;
    chosen.set(letter.id, word);
    taken.add(word.ku);
  }
  return LATIN_LETTERS.map((letter) => {
    const word = chosen.get(letter.id) ?? null;
    return { id: letter.id, upper: letter.upper, word, at: word ? word.ku.toLowerCase().indexOf(letter.id) : -1 };
  });
}

/** Someone the road names, with the plan's few words on who they are. */
export interface BookName {
  name: string;
  kind: string;
  en: string;
}

/**
 * The people and animals of these chapters, in the plan's order: everyone the plan names who appears in the chapters'
 * scenes, lines or stories. Places, and people of chapters not asked for, are left out.
 */
export function roadBookCast(plan: BookPlan, chapters: readonly BookChapter[]): BookName[] {
  const text = chapters
    .flatMap((c) => [
      c.summary,
      ...(c.tale ? [c.tale.title, ...c.tale.paragraphs] : []),
      ...c.parts.flatMap((p) => p.lessons.flatMap((l) => [l.beat, l.say ?? '', ...l.sentences.map((s) => s.ku), ...(l.dialogue?.lines.map((d) => d.text) ?? [])])),
    ])
    .join('\n');
  return (plan.names ?? [])
    // an entry that only says what someone is called by another is not a person of its own
    .filter((who) => (who.kind === 'person' || who.kind === 'animal') && !/^what /.test(who.en))
    .filter((who) => [who.name, ...(who.forms ?? [])].some((form) => new RegExp(`(^|[^\\p{L}])${form}($|[^\\p{L}])`, 'u').test(text)))
    .map(({ name, kind, en }) => ({ name, kind, en }));
}
